from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.ml.features import Event
from app.ml.recommender import Candidate
from app.models.analytics import PerformanceMetric, Recommendation
from app.models.question import Question, QuestionTag, QuestionType


class PerformanceRepository:
    def __init__(self, db: Session):
        self.db = db

    def events(self, user_id: int, limit: int = 5000) -> list[Event]:
        """The user's most recent `limit` answers, oldest first."""
        rows = self.db.execute(
            select(PerformanceMetric, Question.time_limit)
            .join(Question, Question.id == PerformanceMetric.question_id)
            .where(PerformanceMetric.user_id == user_id)
            .order_by(PerformanceMetric.created_at.desc(), PerformanceMetric.id.desc())
            .limit(limit)
        ).all()
        rows.reverse()
        tags: dict[int, list[str]] = defaultdict(list)
        ids = {m.question_id for m, _ in rows}
        if ids:
            for qid, tag in self.db.execute(
                select(QuestionTag.question_id, QuestionTag.tag).where(QuestionTag.question_id.in_(ids))
            ):
                tags[qid].append(tag)
        return [
            Event(
                question_id=m.question_id,
                category=m.category.value,
                difficulty=m.difficulty.value,
                question_type=m.question_type.value,
                score=m.score,
                is_correct=m.is_correct,
                created_at=m.created_at,
                time_taken_seconds=m.time_taken_seconds,
                time_limit=limit_s,
                tags=tuple(sorted(tags[m.question_id])),
            )
            for m, limit_s in rows
        ]

    def candidates(self, *, include_coding: bool, limit: int = 3000) -> list[Candidate]:
        stmt = (
            select(Question)
            .where(Question.is_published.is_(True))
            .options(selectinload(Question.tags))
            .order_by(Question.id)
            .limit(limit)
        )
        if not include_coding:
            stmt = stmt.where(Question.question_type != QuestionType.CODING)
        return [
            Candidate(q.id, q.title, q.category.value, q.difficulty.value, q.question_type.value,
                      tuple(sorted(t.tag for t in q.tags)))
            for q in self.db.scalars(stmt)
        ]

    # ---- stored recommendations
    def active_recommendations(self, user_id: int) -> list[tuple[Recommendation, Question]]:
        return list(
            self.db.execute(
                select(Recommendation, Question)
                .join(Question, Question.id == Recommendation.question_id)
                .where(Recommendation.user_id == user_id, Recommendation.is_dismissed.is_(False))
                .order_by(Recommendation.priority)
            ).all()
        )

    def clear_active(self, user_id: int) -> None:
        self.db.execute(
            delete(Recommendation).where(Recommendation.user_id == user_id, Recommendation.is_dismissed.is_(False))
        )

    def recently_dismissed_question_ids(self, user_id: int, days: int = 7) -> set[int]:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        return set(
            self.db.scalars(
                select(Recommendation.question_id).where(
                    Recommendation.user_id == user_id,
                    Recommendation.is_dismissed.is_(True),
                    Recommendation.created_at > cutoff,
                )
            )
        )

    def get_recommendation(self, rec_id: int, user_id: int) -> Recommendation | None:
        return self.db.scalar(
            select(Recommendation).where(Recommendation.id == rec_id, Recommendation.user_id == user_id)
        )
