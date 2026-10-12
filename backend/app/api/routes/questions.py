from fastapi import APIRouter, Depends

from app.api.deps import (
    get_current_user,
    limit_by_user,
    get_pagination,
    get_practice_service,
    get_question_filters,
    get_question_service,
)
from app.models.user import User
from app.repositories.question_repository import QuestionFilters
from app.schemas.execution import RunResponse
from app.schemas.question import Page, QuestionDetail, QuestionMeta, QuestionSummary, SubmitRequest, SubmitResult
from app.services.practice_service import PracticeService
from app.services.question_service import QuestionService

router = APIRouter(prefix="/api/questions", tags=["questions"])
submit_limit = limit_by_user("submit", 60, 60)
run_limit = limit_by_user("run", 30, 60)


# NOTE: /meta is declared before /{question_id} so it is not parsed as an id.
@router.get("/meta", response_model=QuestionMeta)
def meta(_: User = Depends(get_current_user), svc: QuestionService = Depends(get_question_service)):
    return svc.meta()


@router.get("", response_model=Page[QuestionSummary])
def list_questions(
    filters: QuestionFilters = Depends(get_question_filters),
    pagination: tuple[int, int] = Depends(get_pagination),
    user: User = Depends(get_current_user),
    svc: QuestionService = Depends(get_question_service),
):
    page, page_size = pagination
    return svc.list(user.id, filters, page, page_size)


@router.get("/{question_id}", response_model=QuestionDetail)
def get_question(
    question_id: int,
    user: User = Depends(get_current_user),
    svc: QuestionService = Depends(get_question_service),
):
    return svc.get_detail(user.id, question_id)


@router.post("/{question_id}/run", response_model=RunResponse)
def run_answer(
    question_id: int,
    body: SubmitRequest,
    user: User = Depends(run_limit),
    svc: PracticeService = Depends(get_practice_service),
):
    """Dry run for SQL/CODING questions. Nothing is stored. Coding runs sample tests only."""
    return svc.run(user, question_id, body)


@router.post("/{question_id}/submit", response_model=SubmitResult)
def submit_answer(
    question_id: int,
    body: SubmitRequest,
    user: User = Depends(submit_limit),
    svc: PracticeService = Depends(get_practice_service),
):
    return svc.submit(user, question_id, body)
