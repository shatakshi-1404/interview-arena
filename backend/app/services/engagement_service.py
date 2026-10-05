from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models.analytics import Notification, PerformanceMetric as PM
from app.models.user import User
from app.schemas.engagement import (
    LeaderboardEntry,
    LeaderboardResponse,
    NotificationList,
    NotificationOut,
    ProfileUpdate,
)

POINTS = {"EASY": 10, "MEDIUM": 20, "HARD": 30}
SCORING = (
    "10, 20 or 30 points for the first correct answer to each Easy, Medium or Hard question, counted in the "
    "period it happened. Re-solving a question never earns points again."
)


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def list(self, user: User, limit: int = 30) -> NotificationList:
        items = self.db.scalars(
            select(Notification).where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)).all()
        unread = self.db.scalar(
            select(func.count()).select_from(Notification)
            .where(Notification.user_id == user.id, Notification.is_read.is_(False))) or 0
        return NotificationList(
            unread_count=unread,
            items=[NotificationOut(id=n.id, title=n.title, body=n.body, is_read=n.is_read,
                                   created_at=n.created_at) for n in items])

    def mark_read(self, user: User, notification_id: int) -> NotificationList:
        n = self.db.scalar(select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id))
        if n is None:
            raise NotFound("Notification not found")
        n.is_read = True
        self.db.commit()
        return self.list(user)

    def mark_all_read(self, user: User) -> NotificationList:
        self.db.execute(update(Notification).where(
            Notification.user_id == user.id, Notification.is_read.is_(False)).values(is_read=True))
        self.db.commit()
        return self.list(user)


class ProfileService:
    def __init__(self, db: Session):
        self.db = db

    def update(self, user: User, body: ProfileUpdate) -> User:
        changes = body.model_dump(exclude_unset=True)
        if changes.get("name") is not None:
            user.name = changes["name"]
        if changes.get("show_on_leaderboard") is not None:
            user.show_on_leaderboard = changes["show_on_leaderboard"]
        self.db.commit()
        return user


# ----------------------------------------------------------- leaderboard
def period_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    """Calendar week (Monday 00:00 UTC) or calendar month. Returns [start, end)."""
    midnight = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        start = midnight - timedelta(days=midnight.weekday())
        return start, start + timedelta(days=7)
    start = midnight.replace(day=1)
    return start, (start + timedelta(days=32)).replace(day=1)


def public_name(name: str) -> str:
    parts = name.split()
    if not parts:
        return "Anonymous"
    if len(parts) == 1:
        return parts[0][:30]
    return f"{parts[0][:30]} {parts[-1][0].upper()}."


def rank_rows(rows: list[dict]) -> list[dict]:
    """Rows share a rank when points and problems tie; display order inside a tie is accuracy, then id."""
    ordered = sorted(rows, key=lambda r: (-r["points"], -r["problems"], -(r["accuracy"] or 0.0), r["user_id"]))
    out: list[dict] = []
    for i, r in enumerate(ordered):
        tie = i > 0 and (r["points"], r["problems"]) == (ordered[i - 1]["points"], ordered[i - 1]["problems"])
        out.append({**r, "rank": out[-1]["rank"] if tie else i + 1})
    return out


class LeaderboardService:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user: User, period: str, limit: int) -> LeaderboardResponse:
        start, end = period_bounds(period, datetime.now(UTC))

        # First correct answer per (user, question): the only event that earns points.
        fs = (
            select(
                PM.user_id.label("user_id"),
                PM.question_id.label("question_id"),
                func.min(PM.created_at).label("first_at"),
                func.min(PM.difficulty).label("difficulty"),
            )
            .where(PM.is_correct.is_(True))
            .group_by(PM.user_id, PM.question_id)
            .subquery("fs")
        )
        points = case(
            (fs.c.difficulty == "EASY", POINTS["EASY"]),
            (fs.c.difficulty == "MEDIUM", POINTS["MEDIUM"]),
            (fs.c.difficulty == "HARD", POINTS["HARD"]),
            else_=0,
        )
        rows = self.db.execute(
            select(User.id, User.name, func.count().label("problems"), func.sum(points).label("points"))
            .select_from(fs)
            .join(User, User.id == fs.c.user_id)
            .where(fs.c.first_at >= start, fs.c.first_at < end,
                   User.show_on_leaderboard.is_(True), User.is_active.is_(True))
            .group_by(User.id, User.name)
        ).all()

        accuracy: dict[int, float | None] = {}
        ids = [r.id for r in rows]
        if ids:
            for uid, n, ok in self.db.execute(
                select(PM.user_id, func.count(), func.sum(case((PM.is_correct.is_(True), 1), else_=0)))
                .where(PM.user_id.in_(ids), PM.created_at >= start, PM.created_at < end)
                .group_by(PM.user_id)
            ):
                accuracy[uid] = round(int(ok) / n * 100, 1) if n else None

        ranked = rank_rows([
            {"user_id": r.id, "name": r.name, "problems": int(r.problems), "points": int(r.points),
             "accuracy": accuracy.get(r.id)} for r in rows
        ])

        def entry(r: dict) -> LeaderboardEntry:
            return LeaderboardEntry(rank=r["rank"], name=public_name(r["name"]), problems=r["problems"],
                                    accuracy=r["accuracy"], points=r["points"], is_you=r["user_id"] == user.id)

        return LeaderboardResponse(
            period=period, period_start=start, period_end=end, opted_in=user.show_on_leaderboard,
            participants=len(ranked), entries=[entry(r) for r in ranked[:limit]],
            me=next((entry(r) for r in ranked if r["user_id"] == user.id), None), scoring=SCORING)
