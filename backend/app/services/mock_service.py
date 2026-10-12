import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, Conflict, NotFound
from app.ml import interview as I
from app.models.attempt import Attempt, AttemptMode, AttemptStatus
from app.models.user import User
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.performance_repository import PerformanceRepository
from app.sandbox.runner import CodeRunner
from app.schemas.assessment import AttemptState, BreakdownItem
from app.schemas.mock import (
    DurationOption,
    FocusArea,
    LevelOption,
    MockOptions,
    MockReport,
    MockStart,
    Pace,
    RoleOption,
)
from app.services.attempt_service import AttemptService

DISCLAIMER = (
    "This report reflects your performance in this practice session. "
    "It does not predict interview or hiring outcomes."
)


class MockInterviewService:
    def __init__(self, db: Session, runner: CodeRunner, *, ml_enabled: bool, coding_available: bool):
        self.db = db
        self.attempts = AttemptService(db, runner)
        self.perf = PerformanceRepository(db)
        self.ml_enabled = ml_enabled
        self.coding_available = coding_available

    def _types(self) -> set[str]:
        types = {"MCQ", "SQL"}
        if self.ml_enabled:
            types.add("SHORT_ANSWER")
        if self.coding_available:
            types.add("CODING")
        return types

    # ---------------------------------------------------------------- options
    def options(self) -> MockOptions:
        order = ["MCQ", "SHORT_ANSWER", "SQL", "CODING"]
        return MockOptions(
            roles=[RoleOption(key=k, label=r.label, focus=I.role_focus(k)) for k, r in I.ROLES.items()],
            levels=[LevelOption(key=k, label=lv.label, description=lv.description) for k, lv in I.LEVELS.items()],
            durations=[DurationOption(minutes=m, questions=I.question_count(m)) for m in I.DURATIONS],
            includes=[t for t in order if t in self._types()],
        )

    # ------------------------------------------------------------------ start
    def _in_progress_id(self, user_id: int) -> int | None:
        return self.db.scalar(select(Attempt.id).where(
            Attempt.user_id == user_id, Attempt.mode == AttemptMode.MOCK_INTERVIEW,
            Attempt.status == AttemptStatus.IN_PROGRESS))

    def start(self, user: User, cfg: MockStart) -> AttemptState:
        self.attempts.expire_overdue(user.id)
        existing = self._in_progress_id(user.id)
        if existing:
            raise Conflict(f"You already have a mock interview in progress (attempt {existing}). "
                           "Resume it or submit it first.")

        selected = I.select_questions(
            self.perf.candidates(include_coding=self.coding_available),
            role=cfg.role, level=cfg.level, count=I.question_count(cfg.duration_minutes),
            events=self.perf.events(user.id), focus_weak=cfg.focus_weak_topics,
            allowed_types=self._types(), rng=random.Random())
        if len(selected) < I.MIN_QUESTIONS:
            raise AppError("Not enough published questions to build this interview yet.", 409)

        role, level = I.ROLES[cfg.role], I.LEVELS[cfg.level]
        now = datetime.now(UTC)
        attempt = Attempt(
            user_id=user.id, assessment_id=None, mode=AttemptMode.MOCK_INTERVIEW,
            status=AttemptStatus.IN_PROGRESS, started_at=now,
            deadline=now + timedelta(minutes=cfg.duration_minutes),
            meta={
                "title": f"{role.label} mock interview ({level.label})",
                "role": cfg.role, "level": cfg.level, "duration_minutes": cfg.duration_minutes,
                "focus_weak_topics": cfg.focus_weak_topics,
                "questions": [{"question_id": s.candidate.id, "position": i, "points": s.points}
                              for i, s in enumerate(selected)],
            })
        self.db.add(attempt)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflict("You already have a mock interview in progress. Resume it or submit it first.")
        return self.attempts.state(user, attempt.id)

    def current(self, user: User) -> AttemptState | None:
        self.attempts.expire_overdue(user.id)
        attempt_id = self._in_progress_id(user.id)
        return self.attempts.state(user, attempt_id) if attempt_id else None

    # ----------------------------------------------------------------- report
    def report(self, user: User, attempt_id: int) -> MockReport:
        attempt = AssessmentRepository(self.db).get_attempt(attempt_id, user.id)
        if attempt is None or attempt.mode != AttemptMode.MOCK_INTERVIEW:
            raise NotFound("Mock interview not found")
        result = self.attempts.result(user, attempt_id)  # 409 while still in progress
        meta = attempt.meta or {}
        role_key, level_key = meta.get("role", ""), meta.get("level", "")
        duration = int(meta.get("duration_minutes", 0))

        acc: dict[str, list[float]] = {}  # type -> [correct, total, earned, max]
        for q in result.questions:
            if not q.graded:
                continue
            a = acc.setdefault(q.question_type.value, [0, 0, 0.0, 0.0])
            a[0] += 1 if q.is_correct else 0
            a[1] += 1
            a[2] += q.points_earned or 0.0
            a[3] += q.points
        by_type = [
            BreakdownItem(key=k, correct=int(a[0]), total=int(a[1]), points_earned=round(a[2], 2),
                          points_max=a[3], percentage=round(a[2] / a[3] * 100, 1) if a[3] else 0.0)
            for k, a in sorted(acc.items(), key=lambda kv: I.TYPE_ORDER.get(kv[0], 9))
        ]

        strengths, focus = I.analyse_categories([b.model_dump() for b in result.by_category])
        steps = [f"Practice {f['label']}: {f['reason']}" for f in focus[:2]]
        unanswered = result.total_questions - result.answered_count
        if unanswered:
            steps.append(f"You left {unanswered} question(s) unanswered; try practicing under time pressure.")
        if result.ungraded_count:
            steps.append(f"{result.ungraded_count} answer(s) could not be auto-graded and are not in your score.")
        if not steps:
            steps.append("Try a higher level or a longer interview to stretch your range.")

        taken = result.time_taken_seconds or 0
        return MockReport(
            attempt_id=attempt.id, title=meta.get("title", "Mock interview"),
            role=role_key, role_label=I.ROLES[role_key].label if role_key in I.ROLES else role_key,
            level=level_key, level_label=I.LEVELS[level_key].label if level_key in I.LEVELS else level_key,
            duration_minutes=duration, status=result.status, percentage=result.percentage,
            band=I.performance_band(result.percentage), by_type=by_type, strengths=strengths,
            focus_areas=[FocusArea(**f) for f in focus],
            pace=Pace(minutes_allowed=duration, minutes_used=round(taken / 60, 1),
                      seconds_per_answered=round(taken / result.answered_count, 1)
                      if taken and result.answered_count else None),
            next_steps=steps, disclaimer=DISCLAIMER, result=result)
