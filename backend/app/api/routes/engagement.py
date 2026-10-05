from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.api.deps import (
    get_achievement_service,
    get_current_user,
    get_leaderboard_service,
    get_notification_service,
    get_profile_service,
)
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.engagement import AchievementOut, LeaderboardResponse, NotificationList, ProfileUpdate
from app.services.achievement_service import AchievementService
from app.services.engagement_service import LeaderboardService, NotificationService, ProfileService

router = APIRouter(prefix="/api", tags=["engagement"])


@router.get("/achievements", response_model=list[AchievementOut])
def achievements(user: User = Depends(get_current_user),
                 svc: AchievementService = Depends(get_achievement_service)):
    return svc.list_for_user(user.id)


@router.get("/notifications", response_model=NotificationList)
def notifications(user: User = Depends(get_current_user),
                  svc: NotificationService = Depends(get_notification_service)):
    return svc.list(user)


@router.post("/notifications/read-all", response_model=NotificationList)
def read_all(user: User = Depends(get_current_user),
             svc: NotificationService = Depends(get_notification_service)):
    return svc.mark_all_read(user)


@router.post("/notifications/{notification_id}/read", response_model=NotificationList)
def read_one(notification_id: int, user: User = Depends(get_current_user),
             svc: NotificationService = Depends(get_notification_service)):
    return svc.mark_read(user, notification_id)


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    period: Literal["weekly", "monthly"] = "weekly",
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    svc: LeaderboardService = Depends(get_leaderboard_service),
):
    return svc.get(user, period, limit)


@router.patch("/users/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user),
              svc: ProfileService = Depends(get_profile_service)):
    """Change display name or leaderboard participation."""
    return svc.update(user, body)
