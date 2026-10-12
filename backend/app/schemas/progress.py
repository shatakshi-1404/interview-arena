import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from app.models.question import Category, Difficulty, QuestionType

ReadinessStatus = Literal["READY_TO_SCORE", "INSUFFICIENT_DATA", "DISABLED"]


class DayPoint(BaseModel):
    date: dt.date
    answered: int
    correct: int
    accuracy: float | None
    average_score: float | None


class WeekPoint(BaseModel):
    week_start: dt.date
    answered: int
    correct: int
    accuracy: float | None


class TopicBrief(BaseModel):
    key: str
    label: str
    accuracy: float


class DifficultyStat(BaseModel):
    difficulty: str
    attempts: int
    correct: int
    accuracy: float | None
    avg_time_seconds: float | None


class ReadinessSummary(BaseModel):
    status: ReadinessStatus
    score: float | None = None
    category: str | None = None
    answered: int = 0
    needed: int = 10


class ProgressOverview(BaseModel):
    current_streak: int
    longest_streak: int
    problems_solved: int
    total_answered: int
    accuracy: float | None  # percent
    average_score: float | None  # percent (partial credit included)
    avg_solve_time_seconds: float | None
    consistency: float | None  # 0..1
    weakest_topic: TopicBrief | None
    readiness: ReadinessSummary
    performance_over_time: list[DayPoint]  # last 30 days
    weekly: list[WeekPoint]  # last 8 weeks
    by_difficulty: list[DifficultyStat]


class TopicStat(BaseModel):
    key: str
    label: str
    attempts: int
    correct: int
    accuracy: float | None
    recent_accuracy: float | None
    trend_points: float | None  # recent minus previous accuracy, in percentage points
    avg_time_seconds: float | None
    last_practiced: dt.datetime | None
    readiness_score: float | None = None
    confidence: str | None = None


class WeakTopicOut(BaseModel):
    category: Category
    label: str
    attempts: int
    accuracy: float
    recent_accuracy: float
    severity: float
    reasons: list[str]


class TopicsResponse(BaseModel):
    categories: list[TopicStat]  # always all 8, including never-practiced ones
    tags: list[TopicStat]  # up to 30 most-practiced tags, for a finer heatmap
    weak_topics: list[WeakTopicOut]


class ActivityResponse(BaseModel):
    days: list[DayPoint]
    current_streak: int
    longest_streak: int
    active_days: int
    total_answered: int


class ModelInfo(BaseModel):
    type: str
    trained_on: str
    validated_against_real_outcomes: bool
    version: str


class ReadinessTopic(BaseModel):
    category: Category
    label: str
    score: float | None
    attempts: int
    confidence: str


class ReadinessDetail(BaseModel):
    status: ReadinessStatus
    answered: int = 0
    needed: int = 10
    score: float | None = None
    category: str | None = None
    rubric_category: str | None = None
    probabilities: dict[str, float] = Field(default_factory=dict)
    drivers: list[dict] = Field(default_factory=list)
    topics: list[ReadinessTopic] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[WeakTopicOut] = Field(default_factory=list)
    recent_improvement: dict | None = None
    next_steps: list[str] = Field(default_factory=list)
    disclaimer: str
    model: ModelInfo


class RecQuestion(BaseModel):
    id: int
    title: str
    category: Category
    difficulty: Difficulty
    question_type: QuestionType


class RecommendationOut(BaseModel):
    id: int
    priority: int
    reason: str
    created_at: dt.datetime
    question: RecQuestion


class RecommendationList(BaseModel):
    enabled: bool
    items: list[RecommendationOut]
