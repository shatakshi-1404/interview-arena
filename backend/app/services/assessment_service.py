from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, Conflict, NotFound
from app.models.analytics import AdminAuditLog
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.question import Question
from app.models.user import User
from app.repositories.assessment_repository import AssessmentRepository
from app.sandbox.runner import CodeRunner
from app.schemas.assessment import (
    AssessmentAdminDetail,
    AssessmentCreate,
    AssessmentDetail,
    AssessmentQuestionAdmin,
    AssessmentQuestionIn,
    AssessmentSummary,
    AssessmentUpdate,
)
from app.schemas.question import Page
from app.services.attempt_service import AttemptService


def to_summary(a: Assessment, in_progress_id: int | None = None, best: float | None = None) -> AssessmentSummary:
    return AssessmentSummary(
        id=a.id,
        title=a.title,
        description=a.description,
        duration_minutes=a.duration_minutes,
        difficulty=a.difficulty,
        is_published=a.is_published,
        question_count=len(a.questions),
        total_points=sum(aq.points for aq in a.questions),
        categories=sorted({aq.question.category for aq in a.questions}, key=lambda c: c.value),
        in_progress_attempt_id=in_progress_id,
        best_percentage=best,
    )


class AssessmentService:
    """Learner-facing reads. Starting/answering/submitting lives in AttemptService."""

    def __init__(self, db: Session, runner: CodeRunner):
        self.repo = AssessmentRepository(db)
        self.attempts = AttemptService(db, runner)
        self.user_id_cache = None

    def list(self, user: User, page: int, page_size: int) -> Page[AssessmentSummary]:
        self.attempts.expire_overdue(user.id)  # so "in progress" and "best score" are accurate
        items, total = self.repo.list(page, page_size)
        in_progress, best = self.repo.user_stats(user.id, [a.id for a in items])
        return Page[AssessmentSummary](
            items=[to_summary(a, in_progress.get(a.id), best.get(a.id)) for a in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get(self, user: User, assessment_id: int) -> AssessmentDetail:
        a = self.repo.get(assessment_id)
        if a is None:
            raise NotFound("Assessment not found")
        in_progress, best = self.repo.user_stats(user.id, [a.id])
        base = to_summary(a, in_progress.get(a.id), best.get(a.id))
        return AssessmentDetail(
            **base.model_dump(),
            category_counts=dict(Counter(aq.question.category.value for aq in a.questions)),
            type_counts=dict(Counter(aq.question.question_type.value for aq in a.questions)),
        )


class AdminAssessmentService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AssessmentRepository(db)

    def _audit(self, admin: User, action: str, assessment_id: int, details: dict | None = None) -> None:
        self.db.add(
            AdminAuditLog(
                admin_id=admin.id, action=action, entity_type="assessment", entity_id=assessment_id, details=details
            )
        )

    def _detail(self, a: Assessment) -> AssessmentAdminDetail:
        return AssessmentAdminDetail(
            **to_summary(a).model_dump(),
            created_at=a.created_at,
            updated_at=a.updated_at,
            attempt_count=self.repo.attempt_count(a.id),
            questions=[
                AssessmentQuestionAdmin(
                    question_id=aq.question_id,
                    position=aq.position,
                    points=aq.points,
                    title=aq.question.title,
                    category=aq.question.category,
                    difficulty=aq.question.difficulty,
                    question_type=aq.question.question_type,
                )
                for aq in a.questions
            ],
        )

    def _check_questions(self, items: list[AssessmentQuestionIn]) -> None:
        ids = [i.question_id for i in items]
        if not ids:
            return
        found = set(
            self.db.scalars(select(Question.id).where(Question.id.in_(ids), Question.is_published.is_(True)))
        )
        missing = sorted(set(ids) - found)
        if missing:
            raise AppError(f"Unknown or unpublished question ids: {missing}", 422)

    def _build_items(self, items: list[AssessmentQuestionIn]) -> list[AssessmentQuestion]:
        return [AssessmentQuestion(question_id=i.question_id, position=n, points=i.points) for n, i in enumerate(items)]

    def list(self, page: int, page_size: int) -> Page[AssessmentSummary]:
        items, total = self.repo.list(page, page_size, include_unpublished=True)
        return Page[AssessmentSummary](
            items=[to_summary(a) for a in items], total=total, page=page, page_size=page_size
        )

    def get(self, assessment_id: int) -> AssessmentAdminDetail:
        a = self.repo.get(assessment_id, include_unpublished=True)
        if a is None:
            raise NotFound("Assessment not found")
        return self._detail(a)

    def create(self, admin: User, data: AssessmentCreate) -> AssessmentAdminDetail:
        if data.is_published and not data.questions:
            raise AppError("A published assessment needs at least one question", 422)
        self._check_questions(data.questions)
        a = Assessment(
            title=data.title,
            description=data.description,
            duration_minutes=data.duration_minutes,
            difficulty=data.difficulty,
            is_published=data.is_published,
            created_by=admin.id,
        )
        a.questions = self._build_items(data.questions)
        self.repo.add(a)
        self._audit(admin, "CREATE", a.id, {"title": a.title, "questions": len(data.questions)})
        self.db.commit()
        return self._detail(self.repo.get(a.id, include_unpublished=True))

    def update(self, admin: User, assessment_id: int, data: AssessmentUpdate) -> AssessmentAdminDetail:
        a = self.repo.get(assessment_id, include_unpublished=True)
        if a is None:
            raise NotFound("Assessment not found")
        changes = data.model_dump(exclude_unset=True)

        if data.questions is not None:
            if self.repo.attempt_count(a.id) > 0:
                raise Conflict(
                    "This assessment already has attempts, so its question list cannot change. "
                    "Create a new assessment instead."
                )
            self._check_questions(data.questions)
            a.questions.clear()
            self.db.flush()  # delete old rows first: (assessment_id, position) is unique
            a.questions.extend(self._build_items(data.questions))

        for f in ("title", "description", "duration_minutes", "difficulty", "is_published"):
            if f in changes and changes[f] is not None:
                setattr(a, f, changes[f])
        if a.is_published and not a.questions:
            raise AppError("A published assessment needs at least one question", 422)

        self.db.flush()
        self._audit(admin, "UPDATE", a.id, {"fields": sorted(changes)})
        self.db.commit()
        return self._detail(self.repo.get(a.id, include_unpublished=True))

    def delete(self, admin: User, assessment_id: int) -> None:
        a = self.repo.get(assessment_id, include_unpublished=True)
        if a is None:
            raise NotFound("Assessment not found")
        if self.repo.attempt_count(a.id) > 0:
            raise Conflict("This assessment has attempts. Unpublish it instead (PATCH is_published=false).")
        title = a.title
        self.db.delete(a)
        self._audit(admin, "DELETE", assessment_id, {"title": title})
        self.db.commit()
