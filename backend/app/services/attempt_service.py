import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFound
from app.models.assessment import Assessment
from app.models.attempt import Attempt, AttemptMode, AttemptStatus, Submission, UserAnswer
from app.models.question import QuestionType
from app.models.user import User
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.question_repository import QuestionRepository
from app.sandbox.runner import CodeRunner
from app.schemas.assessment import (
    AnswerSave,
    AttemptQuestion,
    AttemptResult,
    AttemptState,
    AttemptSummary,
    BreakdownItem,
    ResultQuestion,
    SaveAck,
    SavedAnswer,
)
from app.schemas.execution import RunResponse
from app.services.grading import AnswerData, grade_answer, validate_answer
from app.services.metrics import record_answer_metric
from app.services.question_service import to_detail

logger = logging.getLogger(__name__)

GRACE_SECONDS = 5  # network slack for the client's own auto-submit at 00:00


def _is_answered(ans: UserAnswer) -> bool:
    return bool(ans.selected_option_ids) or bool(ans.text_answer and ans.text_answer.strip())


@dataclass
class _Acc:
    correct: int = 0
    total: int = 0
    earned: float = 0.0
    max: float = 0.0

    def item(self, key: str) -> BreakdownItem:
        pct = round(self.earned / self.max * 100, 1) if self.max else 0.0
        return BreakdownItem(
            key=key, correct=self.correct, total=self.total, points_earned=round(self.earned, 2),
            points_max=self.max, percentage=pct,
        )


class AttemptService:
    def __init__(self, db: Session, runner: CodeRunner):
        self.db = db
        self.runner = runner
        self.assessments = AssessmentRepository(db)
        self.questions = QuestionRepository(db)

    # ----------------------------------------------------------- helpers
    def _expired(self, attempt: Attempt) -> bool:
        return bool(attempt.deadline) and datetime.now(UTC) > attempt.deadline + timedelta(seconds=GRACE_SECONDS)

    def _assessment(self, attempt: Attempt) -> Assessment:
        a = self.assessments.get(attempt.assessment_id, include_unpublished=True) if attempt.assessment_id else None
        if a is None:
            raise AppError("The assessment for this attempt no longer exists", 409)
        return a

    def _load(self, user: User, attempt_id: int, *, for_update: bool = False) -> Attempt:
        attempt = self.assessments.get_attempt(attempt_id, user.id, for_update=for_update)
        if attempt is None:
            raise NotFound("Attempt not found")  # 404 (not 403) so ids cannot be probed
        return attempt

    def _remaining(self, attempt: Attempt) -> int:
        if attempt.status != AttemptStatus.IN_PROGRESS or not attempt.deadline:
            return 0
        return max(0, int((attempt.deadline - datetime.now(UTC)).total_seconds()))

    # ------------------------------------------------------------- start
    def start(self, user: User, assessment_id: int) -> AttemptState:
        a = self.assessments.get(assessment_id)
        if a is None:
            raise NotFound("Assessment not found")
        if not a.questions:
            raise AppError("This assessment has no questions", 409)
        self.expire_overdue(user.id)
        attempt = self.assessments.in_progress_attempt(user.id, assessment_id)
        if attempt is None:
            now = datetime.now(UTC)
            attempt = Attempt(
                user_id=user.id,
                assessment_id=a.id,
                mode=AttemptMode.ASSESSMENT,
                status=AttemptStatus.IN_PROGRESS,
                started_at=now,
                deadline=now + timedelta(minutes=a.duration_minutes),
            )
            self.db.add(attempt)
            try:
                self.db.commit()
            except IntegrityError:
                # A concurrent request started the same assessment first: join that attempt instead.
                self.db.rollback()
                attempt = self.assessments.in_progress_attempt(user.id, assessment_id)
                a = self.assessments.get(assessment_id)
                if attempt is None or a is None:
                    raise
            else:
                attempt = self.assessments.get_attempt(attempt.id, user.id)
        return self._state(attempt, a)

    # ------------------------------------------------------------- state
    def state(self, user: User, attempt_id: int) -> AttemptState:
        attempt = self._load(user, attempt_id, for_update=True)
        a = self._assessment(attempt)
        if attempt.status == AttemptStatus.IN_PROGRESS and self._expired(attempt):
            self._finalize(attempt, a, AttemptStatus.EXPIRED)
            self.db.commit()
        return self._state(attempt, a)

    def _state(self, attempt: Attempt, a: Assessment) -> AttemptState:
        live = attempt.status == AttemptStatus.IN_PROGRESS
        return AttemptState(
            attempt_id=attempt.id,
            assessment_id=attempt.assessment_id,
            title=a.title,
            status=attempt.status,
            started_at=attempt.started_at,
            deadline=attempt.deadline,
            server_time=datetime.now(UTC),
            remaining_seconds=self._remaining(attempt),
            questions=[
                AttemptQuestion(position=aq.position, points=aq.points, question=to_detail(aq.question))
                for aq in a.questions
            ]
            if live
            else [],
            answers=[
                SavedAnswer(
                    question_id=x.question_id,
                    selected_option_ids=x.selected_option_ids,
                    text_answer=x.text_answer,
                    language=(x.feedback or {}).get("language"),
                    time_taken_seconds=x.time_taken_seconds,
                )
                for x in attempt.answers
            ]
            if live
            else [],
        )

    # ---------------------------------------------------------- autosave
    def save_answer(self, user: User, attempt_id: int, question_id: int, payload: AnswerSave) -> SaveAck:
        attempt = self._load(user, attempt_id, for_update=True)
        if attempt.status != AttemptStatus.IN_PROGRESS:
            raise AppError("This attempt has already been submitted", 409)
        a = self._assessment(attempt)
        if self._expired(attempt):
            self._finalize(attempt, a, AttemptStatus.EXPIRED)
            self.db.commit()
            raise AppError("Time is up. Your attempt was submitted automatically.", 409)

        aq = next((x for x in a.questions if x.question_id == question_id), None)
        if aq is None:
            raise NotFound("Question is not part of this assessment")
        q = aq.question
        is_mcq = q.question_type == QuestionType.MCQ
        data = AnswerData(
            selected_option_ids=payload.selected_option_ids if is_mcq else None,
            text=None if is_mcq else payload.text_answer,
            language=payload.language,
        )
        existing = next((x for x in attempt.answers if x.question_id == question_id), None)

        if data.is_blank:  # clearing an answer
            if existing is not None:
                attempt.answers.remove(existing)  # delete-orphan
        else:
            validate_answer(q, data)
            if existing is None:
                existing = UserAnswer(attempt_id=attempt.id, question_id=question_id)
                attempt.answers.append(existing)
            existing.selected_option_ids = sorted(set(data.selected_option_ids or [])) or None
            existing.text_answer = data.text
            existing.feedback = {"language": data.language} if data.language else None
            existing.time_taken_seconds = payload.time_taken_seconds
            existing.answered_at = datetime.now(UTC)
        self.db.commit()
        return SaveAck(saved_at=datetime.now(UTC), remaining_seconds=self._remaining(attempt))

    # ------------------------------------------------------------ submit
    def submit(self, user: User, attempt_id: int) -> AttemptResult:
        attempt = self._load(user, attempt_id, for_update=True)
        a = self._assessment(attempt)
        if attempt.status == AttemptStatus.IN_PROGRESS:  # already finished -> idempotent
            self._finalize(attempt, a, AttemptStatus.EXPIRED if self._expired(attempt) else AttemptStatus.SUBMITTED)
            self.db.commit()
        return self._result(attempt, a)

    def result(self, user: User, attempt_id: int) -> AttemptResult:
        attempt = self._load(user, attempt_id, for_update=True)
        a = self._assessment(attempt)
        if attempt.status == AttemptStatus.IN_PROGRESS:
            if not self._expired(attempt):
                raise AppError("This attempt is still in progress", 409)
            self._finalize(attempt, a, AttemptStatus.EXPIRED)
            self.db.commit()
        return self._result(attempt, a)

    def list_attempts(self, user: User) -> list[AttemptSummary]:
        self.expire_overdue(user.id)
        return [
            AttemptSummary(
                attempt_id=at.id,
                assessment_id=at.assessment_id,
                assessment_title=title,
                mode=at.mode,
                status=at.status,
                started_at=at.started_at,
                submitted_at=at.submitted_at,
                percentage=round(at.score / at.max_score * 100, 1) if at.max_score and at.score is not None else None,
            )
            for at, title in self.assessments.list_attempts(user.id)
        ]

    def expire_overdue(self, user_id: int) -> None:
        cutoff = datetime.now(UTC) - timedelta(seconds=GRACE_SECONDS)
        for attempt_id in self.assessments.overdue_attempt_ids(user_id, cutoff):
            attempt = self.assessments.get_attempt(attempt_id, user_id, for_update=True)
            if attempt is None or attempt.status != AttemptStatus.IN_PROGRESS or not attempt.assessment_id:
                continue
            a = self.assessments.get(attempt.assessment_id, include_unpublished=True)
            if a is not None:
                self._finalize(attempt, a, AttemptStatus.EXPIRED)
            self.db.commit()

    # ---------------------------------------------------------- finalize
    def _finalize(self, attempt: Attempt, a: Assessment, status: AttemptStatus) -> None:
        now = datetime.now(UTC)
        answers = {x.question_id: x for x in attempt.answers}
        score = 0.0
        max_score = 0.0

        for aq in a.questions:
            q = aq.question
            ans = answers.get(q.id)
            if ans is None or not _is_answered(ans):
                max_score += aq.points  # unanswered counts as 0
                continue

            data = AnswerData(ans.selected_option_ids, ans.text_answer, (ans.feedback or {}).get("language"))
            try:
                grade = grade_answer(q, data, self.runner)
            except AppError:
                logger.exception("Grading failed for question %s in attempt %s", q.id, attempt.id)
                grade = None

            if grade is None:  # answered but cannot be graded: excluded from the maximum, flagged in the report
                ans.is_correct = None
                ans.score = None
                continue

            max_score += aq.points
            score += aq.points * grade.score
            ans.is_correct = grade.is_correct
            ans.score = grade.score
            ans.feedback = {
                **({"language": data.language} if data.language else {}),
                **({"run": grade.run.model_dump(mode="json")} if grade.run else {}),
            } or None

            if grade.submission_status is not None:
                sub = Submission(
                    user_id=attempt.user_id,
                    question_id=q.id,
                    attempt_id=attempt.id,
                    language=data.language or "sql",
                    code=data.text or "",
                    status=grade.submission_status,
                    runtime_ms=grade.runtime_ms,
                    memory_kb=grade.memory_kb,
                    passed_tests=grade.passed_tests,
                    total_tests=grade.total_tests,
                    attempt_number=self.questions.count_user_answers(attempt.user_id, q.id) + 1,
                    result_detail=grade.run.model_dump(mode="json") if grade.run else None,
                )
                self.db.add(sub)
                self.db.flush()
                ans.submission_id = sub.id

            record_answer_metric(
                self.db,
                user_id=attempt.user_id,
                question=q,
                attempt_id=attempt.id,
                score=grade.score,
                is_correct=grade.is_correct,
                time_taken_seconds=ans.time_taken_seconds,
                attempts_count=self.questions.count_user_answers(attempt.user_id, q.id) + 1,
            )

        attempt.score = round(score, 4)
        attempt.max_score = max_score
        attempt.status = status
        attempt.submitted_at = min(now, attempt.deadline) if (status == AttemptStatus.EXPIRED and attempt.deadline) else now

    # ------------------------------------------------------------ report
    def _result(self, attempt: Attempt, a: Assessment) -> AttemptResult:
        answers = {x.question_id: x for x in attempt.answers}
        by_cat: dict[str, _Acc] = {}
        by_diff: dict[str, _Acc] = {}
        rows: list[ResultQuestion] = []
        answered_count = ungraded = 0

        for aq in a.questions:
            q = aq.question
            ans = answers.get(q.id)
            answered = ans is not None and _is_answered(ans)
            graded = (not answered) or ans.score is not None
            score = (ans.score if answered else 0.0) if graded else None
            earned = aq.points * score if score is not None else None
            answered_count += 1 if answered else 0
            ungraded += 0 if graded else 1

            if graded:
                correct = bool(answered and ans.is_correct)
                for acc in (by_cat.setdefault(q.category.value, _Acc()), by_diff.setdefault(q.difficulty.value, _Acc())):
                    acc.total += 1
                    acc.correct += 1 if correct else 0
                    acc.earned += earned or 0.0
                    acc.max += aq.points

            is_mcq = q.question_type == QuestionType.MCQ
            run_raw = (ans.feedback or {}).get("run") if ans else None
            rows.append(
                ResultQuestion(
                    question_id=q.id,
                    position=aq.position,
                    title=q.title,
                    category=q.category,
                    difficulty=q.difficulty,
                    question_type=q.question_type,
                    points=aq.points,
                    answered=answered,
                    graded=graded,
                    is_correct=(bool(ans.is_correct) if (answered and graded) else (False if graded else None)),
                    score=score,
                    points_earned=earned,
                    selected_option_ids=ans.selected_option_ids if ans else None,
                    correct_option_ids=sorted(o.id for o in q.options if o.is_correct) if is_mcq else None,
                    text_answer=ans.text_answer if ans else None,
                    explanation=q.explanation,
                    time_taken_seconds=ans.time_taken_seconds if ans else None,
                    run=RunResponse.model_validate(run_raw) if run_raw else None,
                )
            )

        max_score = attempt.max_score or 0.0
        score = attempt.score or 0.0
        taken = (
            int((attempt.submitted_at - attempt.started_at).total_seconds()) if attempt.submitted_at else None
        )
        return AttemptResult(
            attempt_id=attempt.id,
            assessment_id=attempt.assessment_id,
            assessment_title=a.title,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            time_taken_seconds=taken,
            score=score,
            max_score=max_score,
            percentage=round(score / max_score * 100, 1) if max_score else 0.0,
            total_questions=len(a.questions),
            answered_count=answered_count,
            ungraded_count=ungraded,
            by_category=[acc.item(k) for k, acc in sorted(by_cat.items())],
            by_difficulty=[acc.item(k) for k, acc in sorted(by_diff.items())],
            questions=rows,
        )
