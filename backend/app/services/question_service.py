from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, Conflict, NotFound
from app.models.analytics import AdminAuditLog
from app.models.question import (
    Category,
    CodingTestCase,
    Difficulty,
    McqOption,
    Question,
    QuestionTag,
    QuestionType,
    ReferenceAnswer,
    SqlChallenge,
)
from app.models.user import User
from app.sandbox import sql_eval
from app.repositories.question_repository import QuestionFilters, QuestionRepository
from app.schemas.question import (
    CategoryCount,
    CodingTestCaseAdmin,
    OptionAdmin,
    OptionPublic,
    Page,
    QuestionAdminDetail,
    QuestionCreate,
    QuestionDetail,
    QuestionMeta,
    QuestionSummary,
    QuestionUpdate,
    ReferenceAnswerIn,
    SampleTestCase,
    SqlChallengeIn,
)

# ------------------------------------------------------------------ mappers


def _tags(q: Question) -> list[str]:
    return sorted(t.tag for t in q.tags)


def to_summary(q: Question, status: str | None = None) -> QuestionSummary:
    return QuestionSummary(
        id=q.id,
        title=q.title,
        category=q.category,
        difficulty=q.difficulty,
        question_type=q.question_type,
        time_limit=q.time_limit,
        tags=_tags(q),
        is_published=q.is_published,
        created_at=q.created_at,
        user_status=status,
    )


def to_detail(q: Question, status: str | None = None) -> QuestionDetail:
    return QuestionDetail(
        **to_summary(q, status).model_dump(),
        description=q.description,
        starter_code=q.starter_code,
        examples=q.examples,
        constraints=q.constraints,
        options=[OptionPublic(id=o.id, text=o.text) for o in q.options],
        sample_test_cases=[
            SampleTestCase(input_data=t.input_data, expected_output=t.expected_output)
            for t in q.test_cases
            if t.is_sample
        ],
        multiple_answers=sum(1 for o in q.options if o.is_correct) > 1,
    )


def to_admin_detail(q: Question) -> QuestionAdminDetail:
    return QuestionAdminDetail(
        **to_summary(q).model_dump(),
        description=q.description,
        starter_code=q.starter_code,
        examples=q.examples,
        constraints=q.constraints,
        explanation=q.explanation,
        created_by=q.created_by,
        updated_at=q.updated_at,
        options=[
            OptionAdmin(id=o.id, text=o.text, is_correct=o.is_correct, position=o.position)
            for o in q.options
        ],
        test_cases=[
            CodingTestCaseAdmin(
                id=t.id, input_data=t.input_data, expected_output=t.expected_output, is_sample=t.is_sample
            )
            for t in q.test_cases
        ],
        sql_challenge=(
            SqlChallengeIn(
                schema_sql=q.sql_challenge.schema_sql,
                seed_sql=q.sql_challenge.seed_sql,
                solution_query=q.sql_challenge.solution_query,
                order_matters=q.sql_challenge.order_matters,
            )
            if q.sql_challenge
            else None
        ),
        reference_answer=(
            ReferenceAnswerIn(model_answer=q.reference_answer.model_answer, concepts=q.reference_answer.concepts)
            if q.reference_answer
            else None
        ),
    )


# --------------------------------------------------- building & validation

_SCALARS = (
    "title", "description", "category", "difficulty", "time_limit", "starter_code",
    "examples", "constraints", "explanation", "is_published",
)
_NULLABLE = {"time_limit", "starter_code", "examples", "constraints", "explanation"}


def apply_payload(q: Question, d: dict) -> None:
    """Copy a (partial) payload dict onto a Question. Nested collections replace the old ones."""
    for f in _SCALARS:
        if f in d and (d[f] is not None or f in _NULLABLE):
            setattr(q, f, d[f])

    if d.get("tags") is not None:
        wanted = set(d["tags"])
        existing = {t.tag: t for t in q.tags}
        # keep rows that survive, add only new ones: avoids unique-constraint clashes on flush
        q.tags = [t for tag, t in existing.items() if tag in wanted] + [
            QuestionTag(tag=tag) for tag in sorted(wanted - existing.keys())
        ]
    if d.get("options") is not None:
        q.options = [
            McqOption(text=o["text"], is_correct=o["is_correct"], position=i)
            for i, o in enumerate(d["options"])
        ]
    if d.get("test_cases") is not None:
        q.test_cases = [CodingTestCase(**t) for t in d["test_cases"]]
    if d.get("sql_challenge") is not None:
        if q.sql_challenge:
            for k, v in d["sql_challenge"].items():
                setattr(q.sql_challenge, k, v)
        else:
            q.sql_challenge = SqlChallenge(**d["sql_challenge"])
    if d.get("reference_answer") is not None:
        ra = d["reference_answer"]
        if q.reference_answer:
            q.reference_answer.model_answer = ra["model_answer"]
            q.reference_answer.concepts = ra["concepts"]
        else:
            q.reference_answer = ReferenceAnswer(model_answer=ra["model_answer"], concepts=ra["concepts"])


def validate_question_shape(q: Question) -> None:
    """Each question type must carry exactly the data it needs. Runs on create and update."""
    t = q.question_type
    problems: list[str] = []

    if t == QuestionType.MCQ:
        if len(q.options) < 2:
            problems.append("MCQ needs at least 2 options")
        if not any(o.is_correct for o in q.options):
            problems.append("MCQ needs at least 1 correct option")
    elif q.options:
        problems.append("Options are only allowed on MCQ questions")

    if t == QuestionType.CODING:
        if not q.starter_code:
            problems.append("CODING needs starter_code")
        if not q.test_cases:
            problems.append("CODING needs test cases")
        elif not any(tc.is_sample for tc in q.test_cases):
            problems.append("CODING needs at least one sample test case")
    elif q.test_cases or (q.starter_code and t != QuestionType.CODING):
        problems.append("Test cases and starter_code are only allowed on CODING questions")

    if t == QuestionType.SQL and q.sql_challenge is None:
        problems.append("SQL needs a sql_challenge (schema, seed data, solution query)")
    if t != QuestionType.SQL and q.sql_challenge is not None:
        problems.append("sql_challenge is only allowed on SQL questions")

    if t == QuestionType.SHORT_ANSWER and q.reference_answer is None:
        problems.append("SHORT_ANSWER needs a reference_answer")
    if t != QuestionType.SHORT_ANSWER and q.reference_answer is not None:
        problems.append("reference_answer is only allowed on SHORT_ANSWER questions")

    if problems:
        raise AppError("; ".join(problems), 422)


def verify_sql_challenge(q: Question) -> None:
    """The reference solution must run against the dataset and reproduce itself."""
    ch = q.sql_challenge
    if q.question_type != QuestionType.SQL or ch is None:
        return
    try:
        out = sql_eval.evaluate(
            schema_sql=ch.schema_sql,
            seed_sql=ch.seed_sql,
            solution_query=ch.solution_query,
            user_query=ch.solution_query,
            order_matters=ch.order_matters,
        )
    except sql_eval.MisconfiguredChallenge as e:
        raise AppError(f"SQL challenge is invalid: {e}", 422)
    if out.error or not out.correct:
        raise AppError(f"SQL challenge is invalid: {out.error or 'solution did not reproduce itself'}", 422)


def build_question(data: QuestionCreate, created_by: int | None) -> Question:
    q = Question(question_type=data.question_type, created_by=created_by)
    apply_payload(q, data.model_dump())
    validate_question_shape(q)
    verify_sql_challenge(q)
    return q


# ------------------------------------------------------------ read service


class QuestionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = QuestionRepository(db)

    def list(
        self,
        user_id: int | None,
        filters: QuestionFilters,
        page: int,
        page_size: int,
        *,
        include_unpublished: bool = False,
    ) -> Page[QuestionSummary]:
        items, total = self.repo.list(filters, page, page_size, include_unpublished=include_unpublished)
        statuses = self.repo.user_status_map(user_id, [q.id for q in items]) if user_id else {}
        return Page[QuestionSummary](
            items=[to_summary(q, statuses.get(q.id)) for q in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_detail(self, user_id: int, question_id: int) -> QuestionDetail:
        q = self.repo.get(question_id)
        if q is None:
            raise NotFound("Question not found")
        status = self.repo.user_status_map(user_id, [q.id]).get(q.id)
        return to_detail(q, status)

    def meta(self) -> QuestionMeta:
        counts = self.repo.category_counts()
        return QuestionMeta(
            categories=[CategoryCount(value=c, count=counts.get(c, 0)) for c in Category],
            difficulties=list(Difficulty),
            question_types=list(QuestionType),
        )


# ----------------------------------------------------------- admin service


class AdminQuestionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = QuestionRepository(db)
        self.reader = QuestionService(db)

    def _audit(self, admin: User, action: str, question_id: int | None, details: dict | None = None) -> None:
        self.db.add(
            AdminAuditLog(
                admin_id=admin.id, action=action, entity_type="question", entity_id=question_id, details=details
            )
        )

    def list(self, filters: QuestionFilters, page: int, page_size: int) -> Page[QuestionSummary]:
        return self.reader.list(None, filters, page, page_size, include_unpublished=True)

    def get(self, question_id: int) -> QuestionAdminDetail:
        q = self.repo.get(question_id, include_unpublished=True)
        if q is None:
            raise NotFound("Question not found")
        return to_admin_detail(q)

    def create(self, admin: User, data: QuestionCreate) -> QuestionAdminDetail:
        q = build_question(data, created_by=admin.id)
        self.repo.add(q)
        self._audit(admin, "CREATE", q.id, {"title": q.title, "type": q.question_type.value})
        self.db.commit()
        return to_admin_detail(self.repo.get(q.id, include_unpublished=True))

    def update(self, admin: User, question_id: int, data: QuestionUpdate) -> QuestionAdminDetail:
        q = self.repo.get(question_id, include_unpublished=True)
        if q is None:
            raise NotFound("Question not found")
        changes = data.model_dump(exclude_unset=True)
        apply_payload(q, changes)
        validate_question_shape(q)  # the merged result must still be a valid question
        if "sql_challenge" in changes:
            verify_sql_challenge(q)
        self.db.flush()
        self._audit(admin, "UPDATE", q.id, {"fields": sorted(changes)})
        self.db.commit()
        return to_admin_detail(self.repo.get(q.id, include_unpublished=True))

    def delete(self, admin: User, question_id: int) -> None:
        q = self.repo.get(question_id, include_unpublished=True)
        if q is None:
            raise NotFound("Question not found")
        title = q.title
        try:
            self.repo.delete(q)
            self._audit(admin, "DELETE", question_id, {"title": title})
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflict(
                "This question is part of an assessment. Remove it from the assessment, "
                "or unpublish it instead (PATCH is_published=false)."
            )
