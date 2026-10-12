from datetime import datetime

from pydantic import BaseModel, Field

from app.models.question import Category, Difficulty, QuestionType
from app.schemas.question import QuestionAdminDetail


class AiStatus(BaseModel):
    enabled: bool
    daily_limit: int
    used_today: int


class HintRequest(BaseModel):
    draft: str | None = Field(default=None, max_length=4000)  # what the learner has so far (optional)


class HintOut(BaseModel):
    hint: str
    level: int  # 1 nudge .. 3 outline; repeated calls escalate
    max_level: int = 3
    model: str


class AiFeedbackBody(BaseModel):
    summary: str = Field(max_length=600)
    strengths: list[str] = Field(default_factory=list, max_length=3)
    gaps: list[str] = Field(default_factory=list, max_length=3)
    next_step: str = Field(default="", max_length=400)


class AiFeedbackOut(BaseModel):
    """The deterministic TF-IDF evaluation and the LLM's comments are returned side by side.
    The score is always the TF-IDF one; the LLM text is advisory."""

    tfidf: dict | None
    ai: AiFeedbackBody
    model: str
    cached: bool
    created_at: datetime


class GenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=200)
    category: Category
    difficulty: Difficulty
    question_type: QuestionType
    count: int = Field(default=3, ge=1, le=5)


class SkippedDraft(BaseModel):
    title: str
    reason: str


class GenerateResult(BaseModel):
    model: str
    drafts: list[QuestionAdminDetail]
    skipped: list[SkippedDraft]
