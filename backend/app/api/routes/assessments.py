from fastapi import APIRouter, Depends

from app.api.deps import get_assessment_service, get_attempt_service, get_current_user, get_pagination
from app.models.user import User
from app.schemas.assessment import (
    AnswerSave,
    AssessmentDetail,
    AssessmentSummary,
    AttemptResult,
    AttemptState,
    AttemptSummary,
    SaveAck,
)
from app.schemas.question import Page
from app.services.assessment_service import AssessmentService
from app.services.attempt_service import AttemptService

router = APIRouter(prefix="/api/assessments", tags=["assessments"])
attempts_router = APIRouter(prefix="/api/attempts", tags=["attempts"])


@router.get("", response_model=Page[AssessmentSummary])
def list_assessments(
    pagination: tuple[int, int] = Depends(get_pagination),
    user: User = Depends(get_current_user),
    svc: AssessmentService = Depends(get_assessment_service),
):
    page, page_size = pagination
    return svc.list(user, page, page_size)


@router.get("/{assessment_id}", response_model=AssessmentDetail)
def get_assessment(
    assessment_id: int,
    user: User = Depends(get_current_user),
    svc: AssessmentService = Depends(get_assessment_service),
):
    return svc.get(user, assessment_id)


@router.post("/{assessment_id}/start", response_model=AttemptState)
def start_assessment(
    assessment_id: int,
    user: User = Depends(get_current_user),
    svc: AttemptService = Depends(get_attempt_service),
):
    """Idempotent: returns the in-progress attempt if one exists."""
    return svc.start(user, assessment_id)


@attempts_router.get("", response_model=list[AttemptSummary])
def my_attempts(user: User = Depends(get_current_user), svc: AttemptService = Depends(get_attempt_service)):
    return svc.list_attempts(user)


@attempts_router.get("/{attempt_id}", response_model=AttemptState)
def attempt_state(
    attempt_id: int, user: User = Depends(get_current_user), svc: AttemptService = Depends(get_attempt_service)
):
    return svc.state(user, attempt_id)


@attempts_router.put("/{attempt_id}/answers/{question_id}", response_model=SaveAck)
def save_answer(
    attempt_id: int,
    question_id: int,
    body: AnswerSave,
    user: User = Depends(get_current_user),
    svc: AttemptService = Depends(get_attempt_service),
):
    """Autosave. An empty body clears the saved answer."""
    return svc.save_answer(user, attempt_id, question_id, body)


@attempts_router.post("/{attempt_id}/submit", response_model=AttemptResult)
def submit_attempt(
    attempt_id: int, user: User = Depends(get_current_user), svc: AttemptService = Depends(get_attempt_service)
):
    return svc.submit(user, attempt_id)


@attempts_router.get("/{attempt_id}/result", response_model=AttemptResult)
def attempt_result(
    attempt_id: int, user: User = Depends(get_current_user), svc: AttemptService = Depends(get_attempt_service)
):
    return svc.result(user, attempt_id)
