from typing import Literal

from pydantic import BaseModel

from app.models.attempt import AttemptStatus
from app.models.question import Category
from app.schemas.assessment import AttemptResult, BreakdownItem


class MockStart(BaseModel):
    role: Literal["BACKEND_ENGINEER", "FULL_STACK_ENGINEER", "SOFTWARE_ENGINEER", "DATA_ENGINEER"]
    level: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"]
    duration_minutes: Literal[15, 30, 45, 60]
    focus_weak_topics: bool = True


class RoleOption(BaseModel):
    key: str
    label: str
    focus: list[str]


class LevelOption(BaseModel):
    key: str
    label: str
    description: str


class DurationOption(BaseModel):
    minutes: int
    questions: int


class MockOptions(BaseModel):
    roles: list[RoleOption]
    levels: list[LevelOption]
    durations: list[DurationOption]
    includes: list[str]  # question types this server can actually put in an interview


class FocusArea(BaseModel):
    category: Category
    label: str
    reason: str


class Pace(BaseModel):
    minutes_allowed: int
    minutes_used: float
    seconds_per_answered: float | None


class MockReport(BaseModel):
    attempt_id: int
    title: str
    role: str
    role_label: str
    level: str
    level_label: str
    duration_minutes: int
    status: AttemptStatus
    percentage: float
    band: str
    by_type: list[BreakdownItem]
    strengths: list[str]
    focus_areas: list[FocusArea]
    pace: Pace
    next_steps: list[str]
    disclaimer: str
    result: AttemptResult
