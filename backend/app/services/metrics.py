from sqlalchemy.orm import Session

from app.models.analytics import PerformanceMetric
from app.models.question import Question


def record_answer_metric(
    db: Session,
    *,
    user_id: int,
    question: Question,
    attempt_id: int | None,
    score: float,
    is_correct: bool,
    time_taken_seconds: int | None,
    attempts_count: int,
) -> PerformanceMetric:
    """One row per answered question. Every analytic and ML feature is derived from these rows."""
    metric = PerformanceMetric(
        user_id=user_id,
        question_id=question.id,
        attempt_id=attempt_id,
        category=question.category,
        difficulty=question.difficulty,
        question_type=question.question_type,
        score=score,
        is_correct=is_correct,
        time_taken_seconds=time_taken_seconds,
        attempts_count=attempts_count,
    )
    db.add(metric)
    return metric
