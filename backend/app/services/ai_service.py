from __future__ import annotations

import logging
import re
import time
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.guard import leaks_answer
from app.ai.llm import AiBadOutput, LlmClient, ai_enabled, extract_json
from app.core.config import settings
from app.core.errors import AppError, Conflict, NotFound
from app.models.ai import AiInteraction, AiKind
from app.models.analytics import AdminAuditLog
from app.models.assessment import AssessmentQuestion
from app.models.attempt import Attempt, AttemptMode, AttemptStatus, UserAnswer
from app.models.question import Question, QuestionType
from app.models.user import User
from app.repositories.question_repository import QuestionRepository
from app.sandbox import sql_eval
from app.sandbox.runner import CaseInput, CodeRunner, RunnerUnavailable
from app.schemas.ai import (
    AiFeedbackBody,
    AiFeedbackOut,
    AiStatus,
    GenerateRequest,
    GenerateResult,
    HintOut,
    SkippedDraft,
)
from app.schemas.question import (
    CodingTestCaseIn,
    ConceptIn,
    OptionIn,
    QuestionCreate,
    ReferenceAnswerIn,
    SqlChallengeIn,
)
from app.services.question_service import build_question, to_admin_detail

logger = logging.getLogger(__name__)
MAX_HINT_LEVEL = 3
MAX_HINT_CHARS = 900

CODING_STARTER = {
    "python": "import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: solve and print the answer\n\n\nmain()\n",
    "java": "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: solve and print the answer\n    }\n}\n",
}


def _start_of_today() -> datetime:
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


class AiService:
    def __init__(self, db: Session, llm: LlmClient, runner: CodeRunner | None = None):
        self.db = db
        self.llm = llm
        self.runner = runner
        self.questions = QuestionRepository(db)

    # ---------------------------------------------------------- limits
    def used_today(self, user_id: int) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(AiInteraction)
                .where(AiInteraction.user_id == user_id, AiInteraction.created_at >= _start_of_today())
            )
            or 0
        )

    def status(self, user: User) -> AiStatus:
        return AiStatus(
            enabled=ai_enabled(), daily_limit=settings.AI_DAILY_LIMIT_PER_USER, used_today=self.used_today(user.id)
        )

    def _check_quota(self, user: User) -> None:
        if self.used_today(user.id) >= settings.AI_DAILY_LIMIT_PER_USER:
            raise AppError(
                f"You have used your {settings.AI_DAILY_LIMIT_PER_USER} AI requests for today. They reset at midnight UTC.",
                429,
            )

    def _record(self, user: User, kind: AiKind, started: float, output: dict | None, **kw) -> AiInteraction:
        row = AiInteraction(
            user_id=user.id,
            kind=kind,
            model=self.llm.model[:100],
            output=output,
            latency_ms=int((time.perf_counter() - started) * 1000),
            **kw,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def _question(self, question_id: int) -> Question:
        q = self.questions.get(question_id)
        if q is None:
            raise NotFound("Question not found")
        return q

    def _in_live_exam(self, user_id: int, question_id: int) -> bool:
        """Hints and AI feedback are practice tools. They are refused for a question that is part of an
        assessment or mock interview the user is currently sitting."""
        live = self.db.scalars(
            select(Attempt).where(
                Attempt.user_id == user_id,
                Attempt.status == AttemptStatus.IN_PROGRESS,
                Attempt.mode != AttemptMode.PRACTICE,
            )
        ).all()
        for a in live:
            if a.assessment_id is not None and self.db.scalar(
                select(AssessmentQuestion.id).where(
                    AssessmentQuestion.assessment_id == a.assessment_id,
                    AssessmentQuestion.question_id == question_id,
                )
            ):
                return True
            if any(item.get("question_id") == question_id for item in (a.meta or {}).get("questions", [])):
                return True
        return False

    def _guard_exam(self, user: User, question_id: int) -> None:
        if self._in_live_exam(user.id, question_id):
            raise Conflict("AI help is turned off for questions in an assessment or mock interview you are taking.")

    # ------------------------------------------------------------ hints
    def hint(self, user: User, question_id: int, draft: str | None) -> HintOut:
        q = self._question(question_id)
        self._guard_exam(user, question_id)
        self._check_quota(user)
        prior = (
            self.db.scalar(
                select(func.count())
                .select_from(AiInteraction)
                .where(
                    AiInteraction.user_id == user.id,
                    AiInteraction.question_id == q.id,
                    AiInteraction.kind == AiKind.HINT,
                )
            )
            or 0
        )
        level = min(prior + 1, MAX_HINT_LEVEL)
        started = time.perf_counter()
        text = ""
        for strict in (False, True):  # one retry with a stricter instruction if the first hint leaks
            raw = self.llm.complete(
                system=prompts.HINT_SYSTEM,
                user=prompts.hint_user_prompt(q, level, draft, strict),
                max_tokens=400,
            )
            val = extract_json(raw).get("hint")
            if not isinstance(val, str) or not val.strip():
                raise AiBadOutput()
            text = val.strip()[:MAX_HINT_CHARS]
            if not leaks_answer(q, text):
                break
        else:
            logger.warning("Hint for question %s was rejected by the answer-leak guard twice", q.id)
            raise AppError("Could not produce a safe hint for this question right now. Try again.", 502)
        self._record(user, AiKind.HINT, started, {"hint": text}, question_id=q.id, level=level)
        self.db.commit()
        return HintOut(hint=text, level=level, model=self.llm.model)

    # --------------------------------------------------------- feedback
    def feedback(self, user: User, question_id: int) -> AiFeedbackOut:
        q = self._question(question_id)
        if q.question_type != QuestionType.SHORT_ANSWER or q.reference_answer is None:
            raise AppError("AI feedback is only available for short-answer questions", 422)
        self._guard_exam(user, question_id)
        ans = self.db.scalar(
            select(UserAnswer)
            .join(Attempt, Attempt.id == UserAnswer.attempt_id)
            .where(
                Attempt.user_id == user.id,
                UserAnswer.question_id == q.id,
                Attempt.status != AttemptStatus.IN_PROGRESS,
                UserAnswer.text_answer.is_not(None),
            )
            .order_by(UserAnswer.answered_at.desc(), UserAnswer.id.desc())
            .limit(1)
        )
        if ans is None or not (ans.text_answer or "").strip():
            raise AppError("Submit an answer first, then ask for AI feedback.", 409)
        tfidf = (ans.feedback or {}).get("evaluation")

        cached = self.db.scalar(
            select(AiInteraction).where(
                AiInteraction.user_id == user.id,
                AiInteraction.kind == AiKind.FEEDBACK,
                AiInteraction.user_answer_id == ans.id,
            )
        )
        if cached and cached.output:
            return AiFeedbackOut(
                tfidf=tfidf, ai=AiFeedbackBody(**cached.output), model=cached.model, cached=True,
                created_at=cached.created_at,
            )

        self._check_quota(user)
        started = time.perf_counter()
        raw = self.llm.complete(
            system=prompts.FEEDBACK_SYSTEM,
            user=prompts.feedback_user_prompt(q, ans.text_answer, tfidf),
            max_tokens=600,
        )
        try:
            body = AiFeedbackBody.model_validate(_clip_feedback(extract_json(raw)))
        except ValidationError:
            raise AiBadOutput()
        row = self._record(
            user, AiKind.FEEDBACK, started, body.model_dump(), question_id=q.id, user_answer_id=ans.id
        )
        self.db.commit()
        return AiFeedbackOut(tfidf=tfidf, ai=body, model=row.model, cached=False, created_at=row.created_at)

    # --------------------------------------------------------- generate
    def generate(self, admin: User, req: GenerateRequest) -> GenerateResult:
        if req.question_type == QuestionType.CODING and self.runner is None:
            raise AppError("Coding generation needs a code runner", 503)
        self._check_quota(admin)
        existing = list(self.db.scalars(select(Question.title).order_by(Question.id.desc()).limit(200)))
        started = time.perf_counter()
        raw = self.llm.complete(
            system=prompts.GENERATE_SYSTEM,
            user=prompts.generate_user_prompt(
                req.topic, req.category.value, req.difficulty.value, req.question_type.value, req.count, existing
            ),
            max_tokens=4000,
            temperature=0.7,
        )
        items = extract_json(raw).get("questions")
        if not isinstance(items, list) or not items:
            raise AiBadOutput()

        taken = {t.strip().lower() for t in existing}
        drafts: list[Question] = []
        skipped: list[SkippedDraft] = []
        for item in items[: req.count]:
            title = str(item.get("title", "(untitled)"))[:200] if isinstance(item, dict) else "(invalid item)"
            try:
                if not isinstance(item, dict):
                    raise ValueError("not an object")
                if title.strip().lower() in taken:
                    raise ValueError("a question with this title already exists")
                data = self._to_create(item, req)
                q = build_question(data, created_by=admin.id)  # same validation as a hand-written question
                if req.question_type == QuestionType.CODING:
                    self._verify_coding(item, q)
                q.ai_generated = True
                q.is_published = False
                self.questions.add(q)
                taken.add(title.strip().lower())
                drafts.append(q)
            except (ValueError, KeyError, TypeError, AttributeError, ValidationError, AppError) as e:
                skipped.append(SkippedDraft(title=title, reason=_reason(e)))

        row = self._record(
            admin, AiKind.GENERATE, started,
            {"topic": req.topic, "type": req.question_type.value, "created": [d.id for d in drafts],
             "skipped": [s.model_dump() for s in skipped]},
        )
        for d in drafts:
            self.db.add(AdminAuditLog(
                admin_id=admin.id, action="AI_GENERATE", entity_type="question", entity_id=d.id,
                details={"title": d.title, "model": row.model, "interaction_id": row.id},
            ))
        self.db.commit()
        return GenerateResult(
            model=self.llm.model,
            drafts=[to_admin_detail(self.questions.get(d.id, include_unpublished=True)) for d in drafts],
            skipped=skipped,
        )

    def _to_create(self, item: dict, req: GenerateRequest) -> QuestionCreate:
        common = dict(
            title=str(item.get("title", "")).strip(),
            description=str(item.get("description", "")).strip(),
            category=req.category,
            difficulty=req.difficulty,
            question_type=req.question_type,
            tags=[str(t) for t in (item.get("tags") or [])][:6],
            explanation=(str(item["explanation"]).strip() if item.get("explanation") else None),
            is_published=False,
        )
        t = req.question_type
        if t == QuestionType.MCQ:
            opts = [OptionIn(text=str(o["text"]).strip(), is_correct=bool(o.get("is_correct"))) for o in item["options"]]
            if len(opts) < 3 or len({o.text.lower() for o in opts}) != len(opts):
                raise ValueError("options must be at least 3 and distinct")
            return QuestionCreate(**common, time_limit=90, options=opts)
        if t == QuestionType.SHORT_ANSWER:
            ref = ReferenceAnswerIn(
                model_answer=str(item["model_answer"]).strip(),
                concepts=[
                    ConceptIn(
                        concept=str(c["concept"]), keywords=[str(k) for k in c["keywords"]],
                        weight=max(1, min(10, int(c.get("weight", 1)))),
                    )
                    for c in item["concepts"]
                ],
            )
            return QuestionCreate(**common, time_limit=300, reference_answer=ref)
        if t == QuestionType.SQL:
            schema, seed = str(item["schema_sql"]), str(item["seed_sql"])
            _check_dataset_sql(schema, seed)
            return QuestionCreate(
                **common, time_limit=600,
                sql_challenge=SqlChallengeIn(
                    schema_sql=schema, seed_sql=seed, solution_query=str(item["solution_query"]),
                    order_matters=bool(item.get("order_matters", False)),
                ),
            )
        cases = [
            CodingTestCaseIn(
                input_data=str(c["input_data"]), expected_output=str(c["expected_output"]),
                is_sample=bool(c.get("is_sample", False)),
            )
            for c in item["test_cases"]
        ]
        if len(cases) < 3:
            raise ValueError("a coding question needs at least 3 test cases")
        examples = [
            {k: str(v) for k, v in e.items() if k in ("input", "output", "explanation")}
            for e in (item.get("examples") or []) if isinstance(e, dict)
        ]
        return QuestionCreate(
            **common, time_limit=1200, starter_code=CODING_STARTER, examples=examples or None,
            constraints=(str(item["constraints"]) if item.get("constraints") else None), test_cases=cases,
        )

    def _verify_coding(self, item: dict, q: Question) -> None:
        """The model's expected outputs are only trusted if its own reference solution reproduces all of them."""
        code = item.get("reference_solution_python")
        if not isinstance(code, str) or not code.strip():
            raise ValueError("no reference solution to verify the test cases against")
        assert self.runner is not None
        try:
            res = self.runner.run(
                language="python", code=code,
                cases=[CaseInput(t.input_data, t.expected_output, t.is_sample) for t in q.test_cases],
                time_limit_ms=3000, memory_limit_mb=256,
            )
        except RunnerUnavailable as e:
            raise AppError(e.detail, 503)
        if not all(c.passed for c in res.cases) or res.compile_error:
            raise ValueError("the reference solution does not reproduce the generated test cases")


# ------------------------------------------------------------- helpers
def _clip_feedback(d: dict) -> dict:
    def lst(v):
        return [str(x)[:200] for x in v][:3] if isinstance(v, list) else []

    return {
        "summary": str(d.get("summary", ""))[:600],
        "strengths": lst(d.get("strengths")),
        "gaps": lst(d.get("gaps")),
        "next_step": str(d.get("next_step", ""))[:400],
    }


_ALLOWED_DDL = re.compile(r"^\s*(create\s+table|insert\s+into)\b", re.I)


def _check_dataset_sql(schema_sql: str, seed_sql: str) -> None:
    """LLM-written dataset SQL runs with the app's database role (inside a throwaway schema), so only plain
    CREATE TABLE / INSERT INTO statements are accepted."""
    for label, sql in (("schema_sql", schema_sql), ("seed_sql", seed_sql)):
        if len(sql) > 20000:
            raise ValueError(f"{label} is too long")
        try:
            blanked = sql_eval._blank(sql)
        except sql_eval.UnsafeQuery as e:
            raise ValueError(f"{label}: {e}")
        statements = [s for s in blanked.split(";") if s.strip()]
        if not statements or not all(_ALLOWED_DDL.match(s) for s in statements):
            raise ValueError(f"{label} may contain only CREATE TABLE and INSERT INTO statements")
        if re.search(r"\b(function|trigger|extension|server|copy|do|execute|pg_\w+)\b", blanked, re.I):
            raise ValueError(f"{label} uses a construct that is not allowed")


def _reason(e: Exception) -> str:
    if isinstance(e, ValidationError):
        first = e.errors()[0]
        return f"{'.'.join(str(p) for p in first['loc'])}: {first['msg']}"[:300]
    if isinstance(e, AppError):
        return e.detail[:300]
    if isinstance(e, KeyError):
        return f"missing field {e}"
    return str(e)[:300]

