from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.analytics import PerformanceMetric
from app.models.question import Category, Difficulty, Question, QuestionTag, QuestionType


@dataclass
class QuestionFilters:
    category: Category | None = None
    difficulty: Difficulty | None = None
    question_type: QuestionType | None = None
    tag: str | None = None
    search: str | None = None


class QuestionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, question_id: int, *, include_unpublished: bool = False) -> Question | None:
        stmt = (
            select(Question)
            .where(Question.id == question_id)
            .options(
                selectinload(Question.tags),
                selectinload(Question.options),
                selectinload(Question.test_cases),
                selectinload(Question.sql_challenge),
                selectinload(Question.reference_answer),
            )
            .execution_options(populate_existing=True)  # always reflect the DB, never stale session state
        )
        if not include_unpublished:
            stmt = stmt.where(Question.is_published.is_(True))
        return self.db.scalar(stmt)

    def list(
        self, filters: QuestionFilters, page: int, page_size: int, *, include_unpublished: bool = False
    ) -> tuple[list[Question], int]:
        conds = []
        if not include_unpublished:
            conds.append(Question.is_published.is_(True))
        if filters.category:
            conds.append(Question.category == filters.category)
        if filters.difficulty:
            conds.append(Question.difficulty == filters.difficulty)
        if filters.question_type:
            conds.append(Question.question_type == filters.question_type)
        if filters.tag:
            conds.append(Question.tags.any(QuestionTag.tag == filters.tag.strip().lower()))
        if filters.search:
            conds.append(Question.title.icontains(filters.search.strip(), autoescape=True))

        base = select(Question).where(*conds)
        total = self.db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = self.db.scalars(
            base.options(selectinload(Question.tags))
            .order_by(Question.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
        return list(items), total

    def add(self, question: Question) -> None:
        self.db.add(question)
        self.db.flush()

    def delete(self, question: Question) -> None:
        self.db.delete(question)
        self.db.flush()

    def user_status_map(self, user_id: int, question_ids: list[int]) -> dict[int, str]:
        if not question_ids:
            return {}
        rows = self.db.execute(
            select(PerformanceMetric.question_id, func.bool_or(PerformanceMetric.is_correct))
            .where(PerformanceMetric.user_id == user_id, PerformanceMetric.question_id.in_(question_ids))
            .group_by(PerformanceMetric.question_id)
        ).all()
        return {qid: ("SOLVED" if solved else "ATTEMPTED") for qid, solved in rows}

    def category_counts(self) -> dict[Category, int]:
        rows = self.db.execute(
            select(Question.category, func.count())
            .where(Question.is_published.is_(True))
            .group_by(Question.category)
        ).all()
        return {cat: n for cat, n in rows}

    def count_user_answers(self, user_id: int, question_id: int) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(PerformanceMetric)
                .where(PerformanceMetric.user_id == user_id, PerformanceMetric.question_id == question_id)
            )
            or 0
        )
