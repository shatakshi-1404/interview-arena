import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class NewAchievement(BaseModel):
    code: str
    name: str
    description: str


class AchievementOut(NewAchievement):
    target: int
    progress: int
    earned: bool
    earned_at: dt.datetime | None = None


class NotificationOut(BaseModel):
    id: int
    title: str
    body: str
    is_read: bool
    created_at: dt.datetime


class NotificationList(BaseModel):
    unread_count: int
    items: list[NotificationOut]


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    show_on_leaderboard: bool | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v


class LeaderboardEntry(BaseModel):
    rank: int
    name: str  # "Ada L." only; never an email or id
    problems: int
    accuracy: float | None
    points: int
    is_you: bool


class LeaderboardResponse(BaseModel):
    period: Literal["weekly", "monthly"]
    period_start: dt.datetime
    period_end: dt.datetime
    opted_in: bool
    participants: int
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None
    scoring: str
