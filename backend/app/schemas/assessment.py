from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.attempt import AttemptMode, AttemptStatus
from app.models.question import Category, Difficulty, QuestionType
from app.schemas.execution import RunResponse
from app.schemas.question import QuestionDetail


# ------------------------------------------------------------------ admin input
class AssessmentQuestionIn(BaseModel):
    question_id: int
    points: int = Field(default=1, ge=1, le=100)


def _unique(v):
    if v is not None and len({q.question_id for q in v}) != len(v):
        raise ValueError("A question can only appear once in an assessment")
    return v


class AssessmentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    duration_minutes: int = Field(gt=0, le=480)
    difficulty: Difficulty
    is_published: bool = False
    questions: list[AssessmentQuestionIn] = Field(default_factory=list, max_length=100)

    _u = field_validator("questions")(_unique)


class AssessmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    duration_minutes: int | None = Field(default=None, gt=0, le=480)
    difficulty: Difficulty | None = None
    is_published: bool | None = None
    questions: list[AssessmentQuestionIn] | None = Field(default=None, max_length=100)

    _u = field_validator("questions")(_unique)


# ----------------------------------------------------------------------- output
class AssessmentSummary(BaseModel):
    id: int
    title: str
    description: str
    duration_minutes: int
    difficulty: Difficulty
    is_published: bool
    question_count: int
    total_points: int
    categories: list[Category]
    in_progress_attempt_id: int | None = None
    best_percentage: float | None = None


class AssessmentDetail(AssessmentSummary):
    category_counts: dict[str, int]
    type_counts: dict[str, int]


class AssessmentQuestionAdmin(BaseModel):
    question_id: int
    position: int
    points: int
    title: str
    category: Category
    difficulty: Difficulty
    question_type: QuestionType


class AssessmentAdminDetail(AssessmentSummary):
    created_at: datetime
    updated_at: datetime
    attempt_count: int
    questions: list[AssessmentQuestionAdmin]


# ------------------------------------------------------------------- attempts
class AttemptQuestion(BaseModel):
    position: int
    points: int
    question: QuestionDetail


class SavedAnswer(BaseModel):
    question_id: int
    selected_option_ids: list[int] | None = None
    text_answer: str | None = None
    language: str | None = None
    time_taken_seconds: int | None = None


class AttemptState(BaseModel):
    """For a finished attempt, questions/answers are empty: fetch /result instead."""

    attempt_id: int
    assessment_id: int | None
    title: str
    status: AttemptStatus
    started_at: datetime
    deadline: datetime | None
    server_time: datetime
    remaining_seconds: int
    questions: list[AttemptQuestion]
    answers: list[SavedAnswer]
    mode: AttemptMode = AttemptMode.ASSESSMENT
    config: dict | None = None  # mock interviews: role, level, duration_minutes, title (never the question list)


class AnswerSave(BaseModel):
    selected_option_ids: list[int] | None = None
    text_answer: str | None = Field(default=None, max_length=50000)
    language: str | None = Field(default=None, max_length=20)
    time_taken_seconds: int | None = Field(default=None, ge=0, le=21600)


class SaveAck(BaseModel):
    saved_at: datetime
    remaining_seconds: int


class BreakdownItem(BaseModel):
    key: str
    correct: int
    total: int
    points_earned: float
    points_max: float
    percentage: float


class ResultQuestion(BaseModel):
    question_id: int
    position: int
    title: str
    category: Category
    difficulty: Difficulty
    question_type: QuestionType
    points: int
    answered: bool
    graded: bool
    is_correct: bool | None
    score: float | None  # 0..1
    points_earned: float | None
    selected_option_ids: list[int] | None = None
    correct_option_ids: list[int] | None = None
    text_answer: str | None = None
    explanation: str | None = None
    time_taken_seconds: int | None = None
    run: RunResponse | None = None
    evaluation: dict | None = None
    model_answer: str | None = None


class AttemptResult(BaseModel):
    attempt_id: int
    assessment_id: int | None
    assessment_title: str
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    time_taken_seconds: int | None
    score: float
    max_score: float
    percentage: float
    total_questions: int
    answered_count: int
    ungraded_count: int
    by_category: list[BreakdownItem]
    by_difficulty: list[BreakdownItem]
    questions: list[ResultQuestion]


class AttemptSummary(BaseModel):
    attempt_id: int
    assessment_id: int | None
    assessment_title: str | None
    mode: AttemptMode
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    percentage: float | None
