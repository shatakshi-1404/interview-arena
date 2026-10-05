from collections.abc import Callable

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.database import get_db
from app.core.email import EmailSender, get_email_sender
from app.core.errors import Forbidden, Unauthorized
from app.core.ratelimit import RateLimited, get_limiter
from app.models.question import Category, Difficulty, QuestionType
from app.models.user import Role, User
from app.repositories.question_repository import QuestionFilters
from app.repositories.user_repository import UserRepository
from app.sandbox.runner import CodeRunner, get_code_runner
from app.services.achievement_service import AchievementService
from app.services.admin_dashboard_service import AdminDashboardService
from app.services.assessment_service import AdminAssessmentService, AssessmentService
from app.services.attempt_service import AttemptService
from app.services.auth_service import AuthService
from app.services.engagement_service import LeaderboardService, NotificationService, ProfileService
from app.services.mock_service import MockInterviewService
from app.services.performance_service import PerformanceService
from app.services.practice_service import PracticeService
from app.services.question_service import AdminQuestionService, QuestionService

bearer_scheme = HTTPBearer(auto_error=False)


# ----------------------------------------------------------------- auth
def get_auth_service(
    db: Session = Depends(get_db),
    email_sender: EmailSender = Depends(get_email_sender),
) -> AuthService:
    return AuthService(db, email_sender)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise Unauthorized("Not authenticated")
    payload = security.decode_token(creds.credentials, security.ACCESS)
    user = UserRepository(db).get_by_id(int(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized("Account unavailable")
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    """Server-side authorization. Usage: Depends(require_roles(Role.ADMIN))."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden()
        return user

    return checker


require_admin = require_roles(Role.ADMIN)


# ------------------------------------------------------------- services
def get_question_service(db: Session = Depends(get_db)) -> QuestionService:
    return QuestionService(db)


def get_admin_question_service(db: Session = Depends(get_db)) -> AdminQuestionService:
    return AdminQuestionService(db)


def get_practice_service(
    db: Session = Depends(get_db), runner: CodeRunner = Depends(get_code_runner)
) -> PracticeService:
    return PracticeService(db, runner)


def get_assessment_service(
    db: Session = Depends(get_db), runner: CodeRunner = Depends(get_code_runner)
) -> AssessmentService:
    return AssessmentService(db, runner)


def get_attempt_service(
    db: Session = Depends(get_db), runner: CodeRunner = Depends(get_code_runner)
) -> AttemptService:
    return AttemptService(db, runner)


def get_admin_assessment_service(db: Session = Depends(get_db)) -> AdminAssessmentService:
    return AdminAssessmentService(db)


def get_performance_service(db: Session = Depends(get_db)) -> PerformanceService:
    return PerformanceService(
        db, ml_enabled=settings.ML_ENABLED, coding_available=settings.CODE_RUNNER != "disabled"
    )


def get_mock_service(
    db: Session = Depends(get_db), runner: CodeRunner = Depends(get_code_runner)
) -> MockInterviewService:
    return MockInterviewService(
        db, runner, ml_enabled=settings.ML_ENABLED, coding_available=settings.CODE_RUNNER != "disabled"
    )


def get_achievement_service(db: Session = Depends(get_db)) -> AchievementService:
    return AchievementService(db)


def get_notification_service(db: Session = Depends(get_db)) -> NotificationService:
    return NotificationService(db)


def get_leaderboard_service(db: Session = Depends(get_db)) -> LeaderboardService:
    return LeaderboardService(db)


def get_profile_service(db: Session = Depends(get_db)) -> ProfileService:
    return ProfileService(db)


def get_admin_dashboard_service(db: Session = Depends(get_db)) -> AdminDashboardService:
    return AdminDashboardService(db)


# --------------------------------------------------- shared query params
def get_question_filters(
    category: Category | None = None,
    difficulty: Difficulty | None = None,
    question_type: QuestionType | None = None,
    tag: str | None = Query(None, max_length=50),
    q: str | None = Query(None, max_length=100, description="Title search"),
) -> QuestionFilters:
    return QuestionFilters(category, difficulty, question_type, tag, q)


def get_pagination(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> tuple[int, int]:
    return page, page_size


def get_tz_offset(tz_offset_minutes: int = Query(0, ge=-840, le=840)) -> int:
    """Minutes east of UTC (India = 330). Used so days and streaks roll over at the user's midnight."""
    return tz_offset_minutes


def limit_by_user(name: str, limit: int, window_seconds: int) -> Callable[[User], User]:
    """Like get_current_user, but also enforces `limit` requests per `window_seconds` per user."""
    limiter = get_limiter(name, limit, window_seconds)

    def dependency(user: User = Depends(get_current_user)) -> User:
        if settings.RATE_LIMIT_ENABLED:
            retry = limiter.hit(str(user.id))
            if retry:
                raise RateLimited(retry)
        return user

    return dependency
