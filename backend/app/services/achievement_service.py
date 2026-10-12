import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.sqlutil import utc_day
from app.ml import features as F
from app.models.analytics import Achievement, Notification, PerformanceMetric as PM, UserAchievement
from app.models.question import Category, QuestionTag
from app.schemas.engagement import AchievementOut, NewAchievement

logger = logging.getLogger(__name__)

GRAPH_TAGS = {"graphs", "graph", "bfs", "dfs", "shortest-path"}


@dataclass(frozen=True)
class Definition:
    code: str
    name: str
    description: str
    metric: str
    target: int


DEFINITIONS = (
    Definition("FIRST_10", "First 10 Problems", "Solve 10 different questions.", "solved", 10),
    Definition("SQL_BEGINNER", "SQL Beginner", "Solve 3 different SQL questions.", "solved_sql", 3),
    Definition("STREAK_7", "7 Day Streak", "Practice on 7 days in a row.", "best_streak", 7),
    Definition("QUESTIONS_100", "100 Questions", "Answer 100 questions.", "answered", 100),
    Definition("GRAPH_EXPLORER", "Graph Explorer",
               "Solve 2 different graph questions (graphs, BFS, DFS, shortest path).", "solved_graph", 2),
)


class AchievementService:
    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------------- metrics
    def _metrics(self, user_id: int) -> dict[str, int]:
        db, mine = self.db, PM.user_id == user_id
        answered = db.scalar(select(func.count()).select_from(PM).where(mine)) or 0
        solved = db.scalar(
            select(func.count(func.distinct(PM.question_id))).where(mine, PM.is_correct.is_(True))) or 0
        solved_sql = db.scalar(
            select(func.count(func.distinct(PM.question_id))).where(
                mine, PM.is_correct.is_(True), PM.category == Category.SQL)) or 0
        solved_graph = db.scalar(
            select(func.count(func.distinct(PM.question_id)))
            .select_from(PM)
            .join(QuestionTag, QuestionTag.question_id == PM.question_id)
            .where(mine, PM.is_correct.is_(True), QuestionTag.tag.in_(GRAPH_TAGS))) or 0
        days = set(db.scalars(select(utc_day(PM.created_at)).where(mine).distinct()))
        _, best = F.streaks(days, datetime.now(UTC).date())
        return {"answered": answered, "solved": solved, "solved_sql": solved_sql,
                "solved_graph": solved_graph, "best_streak": best}

    # ---------------------------------------------------------------- catalog
    def ensure_catalog(self) -> dict[str, Achievement]:
        rows = {a.code: a for a in self.db.scalars(select(Achievement))}
        missing = [d for d in DEFINITIONS if d.code not in rows]
        for d in missing:
            a = Achievement(code=d.code, name=d.name, description=d.description)
            self.db.add(a)
            rows[d.code] = a
        if missing:
            self.db.flush()
        return rows

    # --------------------------------------------------------------- evaluate
    def evaluate(self, user_id: int) -> list[NewAchievement]:
        self.db.flush()  # make this request's new metric rows visible (the session does not autoflush)
        catalog = self.ensure_catalog()
        earned = set(self.db.scalars(
            select(Achievement.code)
            .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
            .where(UserAchievement.user_id == user_id)))
        pending = [d for d in DEFINITIONS if d.code not in earned]
        if not pending:
            return []
        metrics = self._metrics(user_id)
        new: list[NewAchievement] = []
        for d in pending:
            if metrics[d.metric] >= d.target:
                self.db.add(UserAchievement(user_id=user_id, achievement_id=catalog[d.code].id))
                self.db.add(Notification(
                    user_id=user_id, title=f"Achievement unlocked: {d.name}", body=d.description))
                new.append(NewAchievement(code=d.code, name=d.name, description=d.description))
        self.db.flush()
        return new

    def evaluate_safely(self, user_id: int) -> list[NewAchievement]:
        """Never lets an achievement problem fail the answer that triggered it."""
        try:
            with self.db.begin_nested():
                return self.evaluate(user_id)
        except Exception:
            logger.exception("Achievement evaluation failed for user %s", user_id)
            return []

    # ------------------------------------------------------------------ read
    def list_for_user(self, user_id: int) -> list[AchievementOut]:
        earned = dict(self.db.execute(
            select(Achievement.code, UserAchievement.earned_at)
            .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
            .where(UserAchievement.user_id == user_id)).all())
        metrics = self._metrics(user_id)
        return [
            AchievementOut(
                code=d.code, name=d.name, description=d.description, target=d.target,
                progress=d.target if d.code in earned else min(metrics[d.metric], d.target),
                earned=d.code in earned, earned_at=earned.get(d.code))
            for d in DEFINITIONS
        ]
