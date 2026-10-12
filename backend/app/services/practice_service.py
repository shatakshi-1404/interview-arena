from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, NotFound
from app.models.attempt import Attempt, AttemptMode, AttemptStatus, Submission, UserAnswer
from app.models.question import Question, QuestionType
from app.models.user import User
from app.repositories.question_repository import QuestionRepository
from app.sandbox.runner import CodeRunner
from app.schemas.execution import RunResponse
from app.schemas.question import SubmitRequest, SubmitResult
from app.services.achievement_service import AchievementService
from app.services.grading import (
    AnswerData,
    GradeResult,
    grade_code,
    grade_mcq,
    grade_short_answer,
    grade_sql,
    validate_answer,
)
from app.services.metrics import record_answer_metric


def _answer(q: Question, p: SubmitRequest) -> AnswerData:
    if q.question_type == QuestionType.MCQ:
        return AnswerData(selected_option_ids=p.selected_option_ids)
    if q.question_type == QuestionType.SHORT_ANSWER:
        return AnswerData(text=p.text_answer)
    language = "sql" if q.question_type == QuestionType.SQL else p.language
    return AnswerData(text=p.code, language=language)


class PracticeService:
    """Single-question practice. Assessments reuse the same graders (services/grading.py)."""

    def __init__(self, db: Session, runner: CodeRunner):
        self.db = db
        self.runner = runner
        self.repo = QuestionRepository(db)

    def _get(self, question_id: int) -> Question:
        q = self.repo.get(question_id)
        if q is None:
            raise NotFound("Question not found")
        return q

    def _grade(self, q: Question, a: AnswerData) -> GradeResult:
        if q.question_type == QuestionType.MCQ:
            return grade_mcq(q, a.selected_option_ids)
        if q.question_type == QuestionType.SQL:
            return grade_sql(q, a.text or "")
        if q.question_type == QuestionType.SHORT_ANSWER:
            return grade_short_answer(q, a.text or "")
        return grade_code(q, a.text or "", a.language or "", self.runner)

    # ------------------------------------------------------------------ run
    def run(self, user: User, question_id: int, payload: SubmitRequest) -> RunResponse:
        q = self._get(question_id)
        if q.question_type not in (QuestionType.SQL, QuestionType.CODING):
            raise AppError("Only SQL and coding questions can be run", 422)
        a = _answer(q, payload)
        validate_answer(q, a)
        if q.question_type == QuestionType.SQL:
            g = grade_sql(q, a.text or "")
        else:
            g = grade_code(q, a.text or "", a.language or "", self.runner, samples_only=True)
        assert g.run is not None
        return g.run

    # --------------------------------------------------------------- submit
    def submit(self, user: User, question_id: int, payload: SubmitRequest) -> SubmitResult:
        q = self._get(question_id)
        if q.question_type == QuestionType.SHORT_ANSWER and not settings.ML_ENABLED:
            raise AppError("Short-answer evaluation is disabled on this server", 503)

        a = _answer(q, payload)
        validate_answer(q, a)
        grade = self._grade(q, a)  # may raise 503 (no runner): nothing is stored in that case

        attempt_number = self.repo.count_user_answers(user.id, q.id) + 1
        now = datetime.now(UTC)
        is_mcq = q.question_type == QuestionType.MCQ
        is_short = q.question_type == QuestionType.SHORT_ANSWER

        attempt = Attempt(
            user_id=user.id,
            mode=AttemptMode.PRACTICE,
            status=AttemptStatus.SUBMITTED,
            submitted_at=now,
            score=grade.score,
            max_score=1.0,
        )
        self.db.add(attempt)
        self.db.flush()

        submission_id = None
        if grade.submission_status is not None:
            sub = Submission(
                user_id=user.id,
                question_id=q.id,
                attempt_id=attempt.id,
                language=a.language or "sql",
                code=a.text or "",
                status=grade.submission_status,
                runtime_ms=grade.runtime_ms,
                memory_kb=grade.memory_kb,
                passed_tests=grade.passed_tests,
                total_tests=grade.total_tests,
                attempt_number=attempt_number,
                result_detail=grade.run.model_dump(mode="json") if grade.run else None,
            )
            self.db.add(sub)
            self.db.flush()
            submission_id = sub.id

        feedback = {
            **({"language": a.language} if a.language else {}),
            **({"evaluation": grade.evaluation} if grade.evaluation else {}),
        }
        self.db.add(
            UserAnswer(
                attempt_id=attempt.id,
                question_id=q.id,
                selected_option_ids=sorted(set(a.selected_option_ids or [])) if is_mcq else None,
                text_answer=None if is_mcq else a.text,
                submission_id=submission_id,
                is_correct=grade.is_correct,
                score=grade.score,
                feedback=feedback or None,
                time_taken_seconds=payload.time_taken_seconds,
            )
        )
        record_answer_metric(
            self.db,
            user_id=user.id,
            question=q,
            attempt_id=attempt.id,
            score=grade.score,
            is_correct=grade.is_correct,
            time_taken_seconds=payload.time_taken_seconds,
            attempts_count=attempt_number,
        )
        new_achievements = AchievementService(self.db).evaluate_safely(user.id)
        self.db.commit()

        return SubmitResult(
            attempt_id=attempt.id,
            question_id=q.id,
            question_type=q.question_type,
            is_correct=grade.is_correct,
            score=grade.score,
            attempt_number=attempt_number,
            correct_option_ids=sorted(o.id for o in q.options if o.is_correct) if is_mcq else None,
            # for SQL/coding the explanation may contain the solution: reveal it only once solved
            explanation=q.explanation if (is_mcq or is_short or grade.is_correct) else None,
            submission_id=submission_id,
            status=grade.submission_status.value if grade.submission_status else None,
            run=grade.run,
            evaluation=grade.evaluation,
            new_achievements=new_achievements,
            model_answer=q.reference_answer.model_answer if (is_short and q.reference_answer) else None,
        )
