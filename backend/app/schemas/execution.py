from typing import Any

from pydantic import BaseModel

from app.models.attempt import SubmissionStatus
from app.models.question import QuestionType


class ResultTable(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    truncated: bool = False


class SqlRunDetail(BaseModel):
    correct: bool
    expected: ResultTable | None = None
    actual: ResultTable | None = None


class CaseResult(BaseModel):
    """Input/expected/actual are filled only for sample cases; hidden cases expose pass/fail only."""

    index: int
    is_sample: bool
    passed: bool
    input_data: str | None = None
    expected_output: str | None = None
    actual_output: str | None = None
    error: str | None = None
    runtime_ms: int | None = None


class CodeRunDetail(BaseModel):
    passed: int
    total: int
    cases: list[CaseResult]
    compile_error: str | None = None


class RunResponse(BaseModel):
    question_id: int
    question_type: QuestionType
    status: SubmissionStatus
    runtime_ms: int | None = None
    message: str | None = None
    sql: SqlRunDetail | None = None
    code: CodeRunDetail | None = None
