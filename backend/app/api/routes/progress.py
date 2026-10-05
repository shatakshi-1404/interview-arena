from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_performance_service, get_tz_offset
from app.models.user import User
from app.schemas.progress import (
    ActivityResponse,
    ProgressOverview,
    ReadinessDetail,
    RecommendationList,
    TopicsResponse,
)
from app.services.performance_service import PerformanceService

router = APIRouter(prefix="/api", tags=["progress"])


@router.get("/progress", response_model=ProgressOverview)
def overview(
    tz: int = Depends(get_tz_offset),
    user: User = Depends(get_current_user),
    svc: PerformanceService = Depends(get_performance_service),
):
    return svc.overview(user, tz)


@router.get("/progress/topics", response_model=TopicsResponse)
def topics(user: User = Depends(get_current_user), svc: PerformanceService = Depends(get_performance_service)):
    return svc.topics(user)


@router.get("/progress/activity", response_model=ActivityResponse)
def activity(
    days: int = Query(90, ge=7, le=365),
    tz: int = Depends(get_tz_offset),
    user: User = Depends(get_current_user),
    svc: PerformanceService = Depends(get_performance_service),
):
    return svc.activity(user, days, tz)


@router.get("/progress/readiness", response_model=ReadinessDetail)
def readiness_detail(user: User = Depends(get_current_user), svc: PerformanceService = Depends(get_performance_service)):
    return svc.readiness(user)


@router.get("/recommendations", response_model=RecommendationList)
def recommendations(user: User = Depends(get_current_user), svc: PerformanceService = Depends(get_performance_service)):
    """Served from storage; regenerated only after new answers, an unpublished question or a dismissal."""
    return svc.recommendations(user)


@router.post("/recommendations/{rec_id}/dismiss", response_model=RecommendationList)
def dismiss(rec_id: int, user: User = Depends(get_current_user), svc: PerformanceService = Depends(get_performance_service)):
    return svc.dismiss(user, rec_id)
