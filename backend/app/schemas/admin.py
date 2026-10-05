import datetime as dt
from typing import Any

from pydantic import BaseModel, model_validator

from app.models.attempt import SubmissionStatus
from app.models.user import Role


class CountItem(BaseModel):
    key: str
    count: int


class UserStats(BaseModel):
    total: int
    active: int
    admins: int
    new_last_7_days: int
    new_last_30_days: int


class ActivityStats(BaseModel):
    daily_active: int
    weekly_active: int
    monthly_active: int


class QuestionStats(BaseModel):
    total: int
    published: int
    by_category: list[CountItem]
    by_type: list[CountItem]
    by_difficulty: list[CountItem]


class AssessmentStats(BaseModel):
    total: int
    published: int
    attempts_total: int


class AttemptStats(BaseModel):
    last_30_days_by_mode: list[CountItem]
    assessments_completed: int
    mock_interviews_completed: int


class SubmissionStats(BaseModel):
    total: int
    last_24_hours: int
    by_status: list[CountItem]


class DailyAnswers(BaseModel):
    date: dt.date
    answered: int
    correct: int


class CategoryAccuracy(BaseModel):
    key: str
    label: str
    answered: int
    accuracy: float


class PlatformStats(BaseModel):
    generated_at: dt.datetime
    users: UserStats
    activity: ActivityStats
    questions: QuestionStats
    assessments: AssessmentStats
    attempts: AttemptStats
    submissions: SubmissionStats
    answers_per_day: list[DailyAnswers]
    overall_accuracy: float | None
    lowest_accuracy_categories: list[CategoryAccuracy]


class AdminUserOut(BaseModel):
    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    show_on_leaderboard: bool
    created_at: dt.datetime
    answered: int
    last_active: dt.datetime | None


class AdminUserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _something(self):
        if self.role is None and self.is_active is None:
            raise ValueError("Provide role and/or is_active")
        return self


class AdminSubmissionOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    question_id: int
    question_title: str
    language: str
    status: SubmissionStatus
    runtime_ms: int | None
    passed_tests: int | None
    total_tests: int | None
    attempt_number: int
    created_at: dt.datetime


class AdminSubmissionDetail(AdminSubmissionOut):
    code: str
    result_detail: dict[str, Any] | None


class AuditLogOut(BaseModel):
    id: int
    admin_id: int | None
    admin_name: str | None
    action: str
    entity_type: str
    entity_id: int | None
    details: dict[str, Any] | None
    created_at: dt.datetime


class AdminCategoryOut(BaseModel):
    key: str
    label: str
    total: int
    published: int
    by_difficulty: dict[str, int]
    by_type: dict[str, int]
