from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.sqlutil import utc_day
from app.ml import recommender
from app.models.analytics import AdminAuditLog, PerformanceMetric as PM
from app.models.assessment import Assessment
from app.models.attempt import Attempt, AttemptMode, AttemptStatus, Submission, SubmissionStatus
from app.models.question import Category, Question
from app.models.user import Role, User
from app.repositories.user_repository import UserRepository
from app.schemas.admin import (
    ActivityStats,
    AdminCategoryOut,
    AdminSubmissionDetail,
    AdminSubmissionOut,
    AdminUserOut,
    AdminUserUpdate,
    AssessmentStats,
    AttemptStats,
    AuditLogOut,
    CategoryAccuracy,
    CountItem,
    DailyAnswers,
    PlatformStats,
    QuestionStats,
    SubmissionStats,
    UserStats,
)
from app.schemas.question import Page


class AdminDashboardService:
    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------------- helpers
    def _n(self, stmt) -> int:
        return self.db.scalar(stmt) or 0

    def _group(self, col, *where) -> list[CountItem]:
        rows = self.db.execute(select(col, func.count()).where(*where).group_by(col)).all()
        return sorted((CountItem(key=getattr(k, "value", str(k)), count=n) for k, n in rows), key=lambda i: i.key)

    # ------------------------------------------------------------------ stats
    def stats(self) -> PlatformStats:
        now = datetime.now(UTC)
        ago = lambda days: now - timedelta(days=days)  # noqa: E731
        users = select(func.count()).select_from(User)

        def active(days: int) -> int:
            return self._n(select(func.count(func.distinct(PM.user_id))).where(PM.created_at >= ago(days)))

        q = select(func.count()).select_from(Question)
        attempts = select(func.count()).select_from(Attempt)
        done = Attempt.status != AttemptStatus.IN_PROGRESS

        day = utc_day(PM.created_at)
        since = ago(13).replace(hour=0, minute=0, second=0, microsecond=0)
        per_day = {
            d: (n, int(ok)) for d, n, ok in self.db.execute(
                select(day, func.count(), func.sum(case((PM.is_correct.is_(True), 1), else_=0)))
                .where(PM.created_at >= since).group_by(day))
        }
        today = now.date()
        series = []
        for i in range(14):
            d = today - timedelta(days=13 - i)
            n, ok = per_day.get(d, (0, 0))
            series.append(DailyAnswers(date=d, answered=n, correct=ok))

        total = self._n(select(func.count()).select_from(PM))
        correct = self._n(select(func.count()).select_from(PM).where(PM.is_correct.is_(True)))

        cat_rows = self.db.execute(
            select(PM.category, func.count(), func.sum(case((PM.is_correct.is_(True), 1), else_=0)))
            .group_by(PM.category).having(func.count() >= 10)).all()
        lowest = sorted(
            (CategoryAccuracy(key=c.value, label=recommender.label(c.value), answered=n,
                              accuracy=round(int(ok) / n * 100, 1)) for c, n, ok in cat_rows),
            key=lambda c: (c.accuracy, c.key))[:3]

        return PlatformStats(
            generated_at=now,
            users=UserStats(
                total=self._n(users),
                active=self._n(users.where(User.is_active.is_(True))),
                admins=self._n(users.where(User.role == Role.ADMIN)),
                new_last_7_days=self._n(users.where(User.created_at >= ago(7))),
                new_last_30_days=self._n(users.where(User.created_at >= ago(30)))),
            activity=ActivityStats(daily_active=active(1), weekly_active=active(7), monthly_active=active(30)),
            questions=QuestionStats(
                total=self._n(q), published=self._n(q.where(Question.is_published.is_(True))),
                by_category=self._group(Question.category), by_type=self._group(Question.question_type),
                by_difficulty=self._group(Question.difficulty)),
            assessments=AssessmentStats(
                total=self._n(select(func.count()).select_from(Assessment)),
                published=self._n(select(func.count()).select_from(Assessment).where(Assessment.is_published.is_(True))),
                attempts_total=self._n(attempts.where(Attempt.mode == AttemptMode.ASSESSMENT))),
            attempts=AttemptStats(
                last_30_days_by_mode=self._group(Attempt.mode, Attempt.started_at >= ago(30)),
                assessments_completed=self._n(attempts.where(Attempt.mode == AttemptMode.ASSESSMENT, done)),
                mock_interviews_completed=self._n(attempts.where(Attempt.mode == AttemptMode.MOCK_INTERVIEW, done))),
            submissions=SubmissionStats(
                total=self._n(select(func.count()).select_from(Submission)),
                last_24_hours=self._n(select(func.count()).select_from(Submission).where(Submission.created_at >= ago(1))),
                by_status=self._group(Submission.status)),
            answers_per_day=series,
            overall_accuracy=round(correct / total * 100, 1) if total else None,
            lowest_accuracy_categories=lowest)

    # ------------------------------------------------------------------ users
    def _user_out(self, u: User, stats: dict[int, tuple[int, datetime | None]]) -> AdminUserOut:
        n, last = stats.get(u.id, (0, None))
        return AdminUserOut(id=u.id, name=u.name, email=u.email, role=u.role, is_active=u.is_active,
                            show_on_leaderboard=u.show_on_leaderboard, created_at=u.created_at,
                            answered=n, last_active=last)

    def _user_stats(self, ids: list[int]) -> dict[int, tuple[int, datetime | None]]:
        if not ids:
            return {}
        return {uid: (n, last) for uid, n, last in self.db.execute(
            select(PM.user_id, func.count(), func.max(PM.created_at)).where(PM.user_id.in_(ids)).group_by(PM.user_id))}

    def list_users(self, *, search: str | None, role: Role | None, is_active: bool | None,
                   page: int, page_size: int) -> Page[AdminUserOut]:
        conds = []
        if search and search.strip():
            s = search.strip()
            conds.append(or_(User.name.icontains(s, autoescape=True), User.email.icontains(s, autoescape=True)))
        if role is not None:
            conds.append(User.role == role)
        if is_active is not None:
            conds.append(User.is_active.is_(is_active))
        total = self._n(select(func.count()).select_from(User).where(*conds))
        users = self.db.scalars(select(User).where(*conds).order_by(User.id.desc())
                                .limit(page_size).offset((page - 1) * page_size)).all()
        stats = self._user_stats([u.id for u in users])
        return Page[AdminUserOut](items=[self._user_out(u, stats) for u in users], total=total,
                                  page=page, page_size=page_size)

    def update_user(self, admin: User, user_id: int, body: AdminUserUpdate) -> AdminUserOut:
        target = self.db.get(User, user_id)
        if target is None:
            raise NotFound("User not found")
        if target.id == admin.id and (body.role not in (None, Role.ADMIN) or body.is_active is False):
            raise Conflict("You cannot demote or deactivate your own account")

        changes: dict = {}
        if body.role is not None and body.role != target.role:
            changes["role"] = {"from": target.role.value, "to": body.role.value}
            target.role = body.role
        if body.is_active is not None and body.is_active != target.is_active:
            changes["is_active"] = {"from": target.is_active, "to": body.is_active}
            target.is_active = body.is_active
            if not body.is_active:
                UserRepository(self.db).revoke_all_refresh_tokens(target.id)  # access tokens die via is_active check
        if changes:
            self.db.add(AdminAuditLog(admin_id=admin.id, action="UPDATE", entity_type="user",
                                      entity_id=target.id, details=changes))
            self.db.commit()
        return self._user_out(target, self._user_stats([target.id]))

    # ------------------------------------------------------------ submissions
    def _submission_base(self):
        return (select(Submission, User.name, User.email, Question.title)
                .join(User, User.id == Submission.user_id)
                .join(Question, Question.id == Submission.question_id))

    @staticmethod
    def _submission_out(s: Submission, name: str, email: str, title: str) -> dict:
        return dict(id=s.id, user_id=s.user_id, user_name=name, user_email=email, question_id=s.question_id,
                    question_title=title, language=s.language, status=s.status, runtime_ms=s.runtime_ms,
                    passed_tests=s.passed_tests, total_tests=s.total_tests, attempt_number=s.attempt_number,
                    created_at=s.created_at)

    def list_submissions(self, *, status: SubmissionStatus | None, question_id: int | None, user_id: int | None,
                         language: str | None, page: int, page_size: int) -> Page[AdminSubmissionOut]:
        conds = []
        if status is not None:
            conds.append(Submission.status == status)
        if question_id is not None:
            conds.append(Submission.question_id == question_id)
        if user_id is not None:
            conds.append(Submission.user_id == user_id)
        if language:
            conds.append(Submission.language == language.lower())
        total = self._n(select(func.count()).select_from(Submission).where(*conds))
        rows = self.db.execute(self._submission_base().where(*conds)
                               .order_by(Submission.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
        return Page[AdminSubmissionOut](
            items=[AdminSubmissionOut(**self._submission_out(*r)) for r in rows],
            total=total, page=page, page_size=page_size)

    def get_submission(self, submission_id: int) -> AdminSubmissionDetail:
        row = self.db.execute(self._submission_base().where(Submission.id == submission_id)).first()
        if row is None:
            raise NotFound("Submission not found")
        s = row[0]
        return AdminSubmissionDetail(**self._submission_out(*row), code=s.code, result_detail=s.result_detail)

    # -------------------------------------------------------------- audit log
    def audit_log(self, *, entity_type: str | None, action: str | None,
                  page: int, page_size: int) -> Page[AuditLogOut]:
        conds = []
        if entity_type:
            conds.append(AdminAuditLog.entity_type == entity_type)
        if action:
            conds.append(AdminAuditLog.action == action.upper())
        total = self._n(select(func.count()).select_from(AdminAuditLog).where(*conds))
        rows = self.db.execute(
            select(AdminAuditLog, User.name).outerjoin(User, User.id == AdminAuditLog.admin_id)
            .where(*conds).order_by(AdminAuditLog.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
        return Page[AuditLogOut](
            items=[AuditLogOut(id=a.id, admin_id=a.admin_id, admin_name=name, action=a.action,
                               entity_type=a.entity_type, entity_id=a.entity_id, details=a.details,
                               created_at=a.created_at) for a, name in rows],
            total=total, page=page, page_size=page_size)

    # ------------------------------------------------------------- categories
    def categories(self) -> list[AdminCategoryOut]:
        """Categories are a fixed set (a DB enum); this is the content overview an admin needs per category."""
        rows = self.db.execute(
            select(Question.category, Question.difficulty, Question.question_type, Question.is_published, func.count())
            .group_by(Question.category, Question.difficulty, Question.question_type, Question.is_published)).all()
        agg: dict[str, dict] = defaultdict(lambda: {"total": 0, "published": 0,
                                                     "diff": defaultdict(int), "type": defaultdict(int)})
        for cat, diff, typ, published, n in rows:
            a = agg[cat.value]
            a["total"] += n
            a["published"] += n if published else 0
            a["diff"][diff.value] += n
            a["type"][typ.value] += n
        return [AdminCategoryOut(key=c.value, label=recommender.label(c.value), total=agg[c.value]["total"],
                                 published=agg[c.value]["published"], by_difficulty=dict(agg[c.value]["diff"]),
                                 by_type=dict(agg[c.value]["type"])) for c in Category]
