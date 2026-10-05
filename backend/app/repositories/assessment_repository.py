from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt, AttemptStatus
from app.models.question import Question

_FULL = (
    selectinload(Assessment.questions)
    .selectinload(AssessmentQuestion.question)
    .options(
        selectinload(Question.tags),
        selectinload(Question.options),
        selectinload(Question.test_cases),
        selectinload(Question.sql_challenge),
        selectinload(Question.reference_answer),
    )
)
_LIGHT = selectinload(Assessment.questions).selectinload(AssessmentQuestion.question)


class AssessmentRepository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------ assessments
    def get(self, assessment_id: int, *, include_unpublished: bool = False) -> Assessment | None:
        stmt = (
            select(Assessment)
            .where(Assessment.id == assessment_id)
            .options(_FULL)
            .execution_options(populate_existing=True)
        )
        if not include_unpublished:
            stmt = stmt.where(Assessment.is_published.is_(True))
        return self.db.scalar(stmt)

    def list(self, page: int, page_size: int, *, include_unpublished: bool = False):
        base = select(Assessment)
        if not include_unpublished:
            base = base.where(Assessment.is_published.is_(True))
        total = self.db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = self.db.scalars(
            base.options(_LIGHT).order_by(Assessment.id.desc()).limit(page_size).offset((page - 1) * page_size)
        ).all()
        return list(items), total

    def attempt_count(self, assessment_id: int) -> int:
        return (
            self.db.scalar(select(func.count()).select_from(Attempt).where(Attempt.assessment_id == assessment_id))
            or 0
        )

    def add(self, a: Assessment) -> None:
        self.db.add(a)
        self.db.flush()

    # --------------------------------------------------------------- attempts
    def get_attempt(self, attempt_id: int, user_id: int, *, for_update: bool = False) -> Attempt | None:
        stmt = (
            select(Attempt)
            .where(Attempt.id == attempt_id, Attempt.user_id == user_id)
            .options(selectinload(Attempt.answers))
            .execution_options(populate_existing=True)
        )
        if for_update:
            stmt = stmt.with_for_update()
        return self.db.scalar(stmt)

    def in_progress_attempt(self, user_id: int, assessment_id: int) -> Attempt | None:
        return self.db.scalar(
            select(Attempt)
            .where(
                Attempt.user_id == user_id,
                Attempt.assessment_id == assessment_id,
                Attempt.status == AttemptStatus.IN_PROGRESS,
            )
            .options(selectinload(Attempt.answers))
        )

    def overdue_attempt_ids(self, user_id: int, cutoff: datetime) -> list[int]:
        return list(
            self.db.scalars(
                select(Attempt.id).where(
                    Attempt.user_id == user_id,
                    Attempt.status == AttemptStatus.IN_PROGRESS,
                    Attempt.deadline.is_not(None),
                    Attempt.deadline < cutoff,
                )
            )
        )

    def user_stats(self, user_id: int, assessment_ids: list[int]) -> tuple[dict[int, int], dict[int, float]]:
        """(in-progress attempt id per assessment, best percentage per assessment)"""
        if not assessment_ids:
            return {}, {}
        rows = self.db.execute(
            select(Attempt.assessment_id, Attempt.id, Attempt.status, Attempt.score, Attempt.max_score).where(
                Attempt.user_id == user_id, Attempt.assessment_id.in_(assessment_ids)
            )
        ).all()
        in_progress: dict[int, int] = {}
        best: dict[int, float] = {}
        for aid, attempt_id, status, score, max_score in rows:
            if status == AttemptStatus.IN_PROGRESS:
                in_progress[aid] = attempt_id
            elif max_score and score is not None:
                best[aid] = max(best.get(aid, 0.0), round(score / max_score * 100, 1))
        return in_progress, best

    def list_attempts(self, user_id: int, limit: int = 50):
        return self.db.execute(
            select(Attempt, Assessment.title)
            .outerjoin(Assessment, Assessment.id == Attempt.assessment_id)
            .where(Attempt.user_id == user_id)
            .order_by(Attempt.started_at.desc())
            .limit(limit)
        ).all()
