import logging
from dataclasses import dataclass

from app.core.errors import AppError
from app.models.attempt import SubmissionStatus
from app.models.question import Question, QuestionType
from app.sandbox import sql_eval
from app.sandbox.runner import (
    ALLOWED_LANGUAGES,
    DEFAULT_MEMORY_LIMIT_MB,
    DEFAULT_TIME_LIMIT_MS,
    CaseInput,
    CaseOutcome,
    CodeRunner,
    RunnerUnavailable,
)
from app.schemas.execution import CaseResult, CodeRunDetail, ResultTable, RunResponse, SqlRunDetail
from app.services.scoring import score_mcq

logger = logging.getLogger(__name__)
DISPLAY_ROWS = 50


@dataclass
class AnswerData:
    selected_option_ids: list[int] | None = None
    text: str | None = None
    language: str | None = None

    @property
    def is_blank(self) -> bool:
        return not self.selected_option_ids and not (self.text and self.text.strip())


@dataclass
class GradeResult:
    score: float  # 0..1
    is_correct: bool
    run: RunResponse | None = None  # SQL / CODING detail, already safe to show the user
    submission_status: SubmissionStatus | None = None
    runtime_ms: int | None = None
    memory_kb: int | None = None
    passed_tests: int | None = None
    total_tests: int | None = None


def validate_answer(q: Question, a: AnswerData) -> None:
    t = q.question_type
    if t == QuestionType.MCQ:
        ids = set(a.selected_option_ids or [])
        if not ids:
            raise AppError("Select at least one option", 422)
        if not ids <= {o.id for o in q.options}:
            raise AppError("One or more selected options do not belong to this question", 422)
        return
    if not (a.text and a.text.strip()):
        raise AppError("Write an answer first", 422)
    if t == QuestionType.SQL and len(a.text) > sql_eval.MAX_QUERY_CHARS:
        raise AppError(f"Query is longer than {sql_eval.MAX_QUERY_CHARS} characters", 422)
    if t == QuestionType.CODING and a.language not in ALLOWED_LANGUAGES:
        raise AppError(f"language must be one of {sorted(ALLOWED_LANGUAGES)}", 422)


def grade_mcq(q: Question, selected_ids: list[int] | None) -> GradeResult:
    correct = {o.id for o in q.options if o.is_correct}
    is_correct, score = score_mcq(set(selected_ids or []), correct)
    return GradeResult(score=score, is_correct=is_correct)


def _table(t: sql_eval.Table | None) -> ResultTable | None:
    if t is None:
        return None
    return ResultTable(
        columns=t.columns, rows=t.rows[:DISPLAY_ROWS], truncated=t.truncated or len(t.rows) > DISPLAY_ROWS
    )


def grade_sql(q: Question, query: str) -> GradeResult:
    ch = q.sql_challenge
    if ch is None:
        raise AppError("This SQL question is misconfigured", 500)
    try:
        out = sql_eval.evaluate(
            schema_sql=ch.schema_sql,
            seed_sql=ch.seed_sql,
            solution_query=ch.solution_query,
            user_query=query,
            order_matters=ch.order_matters,
        )
    except sql_eval.MisconfiguredChallenge:
        logger.exception("SQL question %s is misconfigured", q.id)
        raise AppError("This SQL question is misconfigured. Please report it.", 500)

    if out.correct:
        status = SubmissionStatus.ACCEPTED
    elif out.timed_out:
        status = SubmissionStatus.TIME_LIMIT_EXCEEDED
    elif out.error:
        status = SubmissionStatus.RUNTIME_ERROR
    else:
        status = SubmissionStatus.WRONG_ANSWER

    run = RunResponse(
        question_id=q.id,
        question_type=q.question_type,
        status=status,
        runtime_ms=out.execution_ms,
        message=out.error or out.note,
        sql=SqlRunDetail(correct=out.correct, expected=_table(out.expected), actual=_table(out.actual)),
    )
    return GradeResult(
        score=1.0 if out.correct else 0.0,
        is_correct=out.correct,
        run=run,
        submission_status=status,
        runtime_ms=out.execution_ms,
    )


def grade_code(
    q: Question, code: str, language: str, runner: CodeRunner, *, samples_only: bool = False
) -> GradeResult:
    chosen = [t for t in q.test_cases if t.is_sample or not samples_only]
    inputs = [CaseInput(t.input_data, t.expected_output, t.is_sample) for t in chosen]
    res = runner.run(
        language=language,
        code=code,
        cases=inputs,
        time_limit_ms=DEFAULT_TIME_LIMIT_MS,
        memory_limit_mb=DEFAULT_MEMORY_LIMIT_MB,
    )
    outcomes = (list(res.cases) + [CaseOutcome(passed=False)] * len(chosen))[: len(chosen)]
    cases = [
        CaseResult(
            index=i,
            is_sample=t.is_sample,
            passed=o.passed,
            input_data=t.input_data if t.is_sample else None,
            expected_output=t.expected_output if t.is_sample else None,
            actual_output=o.actual_output if t.is_sample else None,
            error=o.error if t.is_sample else None,
            runtime_ms=o.runtime_ms,
        )
        for i, (t, o) in enumerate(zip(chosen, outcomes))
    ]
    passed = sum(1 for c in cases if c.passed)
    total = len(cases)
    is_correct = total > 0 and passed == total and res.status == SubmissionStatus.ACCEPTED
    run = RunResponse(
        question_id=q.id,
        question_type=q.question_type,
        status=res.status,
        runtime_ms=res.runtime_ms,
        message=(res.compile_error or "")[:2000] or None,
        code=CodeRunDetail(passed=passed, total=total, cases=cases, compile_error=(res.compile_error or None)),
    )
    return GradeResult(
        score=(passed / total) if total else 0.0,
        is_correct=is_correct,
        run=run,
        submission_status=res.status,
        runtime_ms=res.runtime_ms,
        memory_kb=res.memory_kb,
        passed_tests=passed,
        total_tests=total,
    )


def grade_answer(q: Question, a: AnswerData, runner: CodeRunner) -> GradeResult | None:
    """Used by assessments. Returns None when the answer cannot be graded (yet):
    CODING without an available runner, and SHORT_ANSWER until the Phase 4 evaluator exists."""
    t = q.question_type
    if t == QuestionType.MCQ:
        return grade_mcq(q, a.selected_option_ids)
    if t == QuestionType.SQL:
        return grade_sql(q, a.text or "")
    if t == QuestionType.CODING:
        try:
            return grade_code(q, a.text or "", a.language or "", runner)
        except RunnerUnavailable:
            return None
    return None
