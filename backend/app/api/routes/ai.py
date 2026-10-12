from fastapi import APIRouter, Depends

from app.api.deps import get_ai_service, get_current_user, limit_by_user
from app.models.user import User
from app.schemas.ai import AiFeedbackOut, AiStatus, HintOut, HintRequest
from app.services.ai_service import AiService

router = APIRouter(prefix="/api", tags=["ai"])
ai_limit = limit_by_user("ai", 12, 60)


@router.get("/ai/status", response_model=AiStatus)
def ai_status(user: User = Depends(get_current_user), svc: AiService = Depends(get_ai_service)):
    return svc.status(user)


@router.post("/questions/{question_id}/hint", response_model=HintOut)
def hint(
    question_id: int,
    body: HintRequest | None = None,
    user: User = Depends(ai_limit),
    svc: AiService = Depends(get_ai_service),
):
    """A hint that never reveals the answer. Calling again escalates from a nudge to an outline (3 levels)."""
    return svc.hint(user, question_id, body.draft if body else None)


@router.post("/questions/{question_id}/ai-feedback", response_model=AiFeedbackOut)
def ai_feedback(
    question_id: int,
    user: User = Depends(ai_limit),
    svc: AiService = Depends(get_ai_service),
):
    """LLM comments on your latest submitted short answer, next to the deterministic TF-IDF evaluation."""
    return svc.feedback(user, question_id)
