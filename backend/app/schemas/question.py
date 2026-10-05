from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator

from app.models.question import Category, Difficulty, QuestionType
from app.schemas.engagement import NewAchievement
from app.schemas.execution import RunResponse

T = TypeVar("T")

ALLOWED_LANGUAGES = {"python", "java"}


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


def normalize_tags(tags: list[str] | None) -> list[str] | None:
    if tags is None:
        return None
    cleaned = {t.strip().lower() for t in tags if t.strip()}
    if any(len(t) > 50 for t in cleaned):
        raise ValueError("Tags must be 50 characters or fewer")
    return sorted(cleaned)


def check_starter_code(v: dict[str, str] | None) -> dict[str, str] | None:
    if v is not None and not set(v) <= ALLOWED_LANGUAGES:
        raise ValueError(f"starter_code languages must be within {sorted(ALLOWED_LANGUAGES)}")
    return v


# ---------------------------------------------------------------- input
class OptionIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    is_correct: bool = False


class CodingTestCaseIn(BaseModel):
    input_data: str
    expected_output: str
    is_sample: bool = False


class SqlChallengeIn(BaseModel):
    schema_sql: str = Field(min_length=1)
    seed_sql: str = Field(min_length=1)
    solution_query: str = Field(min_length=1)
    order_matters: bool = False


class ConceptIn(BaseModel):
    concept: str = Field(min_length=1, max_length=100)
    keywords: list[str] = Field(min_length=1)
    weight: int = Field(default=1, ge=1, le=10)


class ReferenceAnswerIn(BaseModel):
    model_answer: str = Field(min_length=1)
    concepts: list[ConceptIn] = Field(min_length=1)


class QuestionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=1)
    category: Category
    difficulty: Difficulty
    question_type: QuestionType
    time_limit: int | None = Field(default=None, gt=0, le=14400)  # seconds
    tags: list[str] = Field(default_factory=list, max_length=10)
    starter_code: dict[str, str] | None = None
    examples: list[dict] | None = None
    constraints: str | None = None
    explanation: str | None = None
    is_published: bool = True
    options: list[OptionIn] = Field(default_factory=list, max_length=10)
    test_cases: list[CodingTestCaseIn] = Field(default_factory=list, max_length=100)
    sql_challenge: SqlChallengeIn | None = None
    reference_answer: ReferenceAnswerIn | None = None

    _tags = field_validator("tags")(normalize_tags)
    _starter = field_validator("starter_code")(check_starter_code)


class QuestionUpdate(BaseModel):
    """PATCH body. question_type cannot be changed. Nested collections, when present, replace the old ones."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    category: Category | None = None
    difficulty: Difficulty | None = None
    time_limit: int | None = Field(default=None, gt=0, le=14400)
    tags: list[str] | None = Field(default=None, max_length=10)
    starter_code: dict[str, str] | None = None
    examples: list[dict] | None = None
    constraints: str | None = None
    explanation: str | None = None
    is_published: bool | None = None
    options: list[OptionIn] | None = Field(default=None, max_length=10)
    test_cases: list[CodingTestCaseIn] | None = Field(default=None, max_length=100)
    sql_challenge: SqlChallengeIn | None = None
    reference_answer: ReferenceAnswerIn | None = None

    _tags = field_validator("tags")(normalize_tags)
    _starter = field_validator("starter_code")(check_starter_code)


# --------------------------------------------------------------- output
class QuestionSummary(BaseModel):
    id: int
    title: str
    category: Category
    difficulty: Difficulty
    question_type: QuestionType
    time_limit: int | None
    tags: list[str]
    is_published: bool
    created_at: datetime
    user_status: Literal["SOLVED", "ATTEMPTED"] | None = None


class OptionPublic(BaseModel):
    id: int
    text: str


class SampleTestCase(BaseModel):
    input_data: str
    expected_output: str


class QuestionDetail(QuestionSummary):
    """What a learner sees. Contains no answers, explanations, hidden tests or SQL solutions."""

    description: str
    starter_code: dict[str, str] | None
    examples: list[dict] | None
    constraints: str | None
    options: list[OptionPublic]
    sample_test_cases: list[SampleTestCase]
    multiple_answers: bool = False


class OptionAdmin(BaseModel):
    id: int
    text: str
    is_correct: bool
    position: int


class CodingTestCaseAdmin(BaseModel):
    id: int
    input_data: str
    expected_output: str
    is_sample: bool


class QuestionAdminDetail(QuestionSummary):
    description: str
    starter_code: dict[str, str] | None
    examples: list[dict] | None
    constraints: str | None
    explanation: str | None
    created_by: int | None
    updated_at: datetime
    options: list[OptionAdmin]
    test_cases: list[CodingTestCaseAdmin]
    sql_challenge: SqlChallengeIn | None
    reference_answer: ReferenceAnswerIn | None


class CategoryCount(BaseModel):
    value: Category
    count: int


class QuestionMeta(BaseModel):
    categories: list[CategoryCount]
    difficulties: list[Difficulty]
    question_types: list[QuestionType]


# ----------------------------------------------------------- submission
class SubmitRequest(BaseModel):
    selected_option_ids: list[int] | None = None  # MCQ
    text_answer: str | None = Field(default=None, max_length=10000)  # SHORT_ANSWER (Phase 4)
    code: str | None = Field(default=None, max_length=50000)  # CODING / SQL (Phase 3)
    language: str | None = Field(default=None, max_length=20)
    time_taken_seconds: int | None = Field(default=None, ge=0, le=21600)


class SubmitResult(BaseModel):
    attempt_id: int
    question_id: int
    question_type: QuestionType
    is_correct: bool
    score: float  # 0..1
    attempt_number: int
    correct_option_ids: list[int] | None = None
    explanation: str | None = None
    submission_id: int | None = None
    status: str | None = None
    run: RunResponse | None = None
    evaluation: dict | None = None  # short-answer feedback
    model_answer: str | None = None  # short-answer only
    new_achievements: list[NewAchievement] = []
