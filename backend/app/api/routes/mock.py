from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_mock_service
from app.models.user import User
from app.schemas.assessment import AttemptState
from app.schemas.mock import MockOptions, MockReport, MockStart
from app.services.mock_service import MockInterviewService

router = APIRouter(prefix="/api/mock-interviews", tags=["mock-interviews"])


@router.get("/options", response_model=MockOptions)
def options(_: User = Depends(get_current_user), svc: MockInterviewService = Depends(get_mock_service)):
    return svc.options()


@router.get("/current", response_model=AttemptState | None)
def current(user: User = Depends(get_current_user), svc: MockInterviewService = Depends(get_mock_service)):
    """The in-progress interview, or null. Answer/submit it through /api/attempts/{id}/…"""
    return svc.current(user)


@router.post("/start", response_model=AttemptState, status_code=status.HTTP_201_CREATED)
def start(body: MockStart, user: User = Depends(get_current_user),
          svc: MockInterviewService = Depends(get_mock_service)):
    return svc.start(user, body)


@router.get("/{attempt_id}/report", response_model=MockReport)
def report(attempt_id: int, user: User = Depends(get_current_user),
           svc: MockInterviewService = Depends(get_mock_service)):
    return svc.report(user, attempt_id)
