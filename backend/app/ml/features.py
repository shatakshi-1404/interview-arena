"""Feature engineering and performance statistics. Pure Python: no DB, no HTTP, no ORM."""
from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

CATEGORIES = ("DSA", "SQL", "DBMS", "OS", "CN", "OOP", "PROGRAMMING", "SYSTEM_DESIGN")
DIFFICULTIES = ("EASY", "MEDIUM", "HARD")
DIFFICULTY_WEIGHT = {"EASY": 1.0, "MEDIUM": 2.0, "HARD": 3.0}
RECENT_WINDOW = 5  # "recent" = the last 5 answers in a group
MIN_TOPIC_ATTEMPTS = 3  # evidence needed before a topic can be called weak
COVERAGE_MIN_ATTEMPTS = 3  # attempts before a category counts as "covered"
DEFAULT_TIME_RATIO = 0.6  # used when no answer carried timing data


@dataclass(frozen=True)
class Event:
    """One answered question. Plain strings (not ORM enums) keep this module independent of the app."""

    question_id: int
    category: str
    difficulty: str
    question_type: str
    score: float  # 0..1
    is_correct: bool
    created_at: datetime
    time_taken_seconds: int | None = None
    time_limit: int | None = None
    tags: tuple[str, ...] = ()


def chronological(events: Iterable[Event]) -> list[Event]:
    return sorted(events, key=lambda e: e.created_at)  # stable: ties keep insertion order


# --------------------------------------------------------------- basic stats
def _rate(events: list[Event]) -> float | None:
    return sum(e.is_correct for e in events) / len(events) if events else None


def accuracy(events: Iterable[Event]) -> float | None:
    return _rate(list(events))


def mean_score(events: Iterable[Event]) -> float | None:
    ev = list(events)
    return sum(e.score for e in ev) / len(ev) if ev else None


def time_ratio(e: Event) -> float | None:
    """time taken / suggested time. 1.0 means exactly the suggested time."""
    if e.time_taken_seconds is None or not e.time_limit:
        return None
    return e.time_taken_seconds / e.time_limit


def median_time_ratio(events: Iterable[Event]) -> float | None:
    ratios = [r for r in (time_ratio(e) for e in events) if r is not None]
    return statistics.median(ratios) if ratios else None


def avg_time_seconds(events: Iterable[Event]) -> float | None:
    ts = [e.time_taken_seconds for e in events if e.time_taken_seconds is not None]
    return sum(ts) / len(ts) if ts else None


def smoothed_rate(successes: float, n: float, prior: float = 0.5, strength: float = 3.0) -> float:
    """Shrinks small samples toward `prior`, so 1/1 correct is not treated as 100% skill."""
    return (successes + prior * strength) / (n + strength)


def difficulty_weighted(events: Iterable[Event]) -> float | None:
    ev = list(events)
    total = sum(DIFFICULTY_WEIGHT[e.difficulty] for e in ev)
    return sum(DIFFICULTY_WEIGHT[e.difficulty] * e.score for e in ev) / total if total else None


def solved_question_ids(events: Iterable[Event]) -> set[int]:
    return {e.question_id for e in events if e.is_correct}


def attempted_question_ids(events: Iterable[Event]) -> set[int]:
    return {e.question_id for e in events}


def consistency(events: Iterable[Event], window: int = 5) -> float | None:
    """1.0 = steady performance across consecutive blocks of `window` answers; 0.0 = swings between extremes.
    Needs at least two complete blocks."""
    ev = chronological(events)
    blocks = [ev[i : i + window] for i in range(0, len(ev) - window + 1, window)]
    if len(blocks) < 2:
        return None
    means = [sum(e.score for e in b) / len(b) for b in blocks]
    return round(1 - min(1.0, 2 * statistics.pstdev(means)), 4)


# --------------------------------------------------------------- group stats
@dataclass(frozen=True)
class GroupStats:
    key: str
    attempts: int
    correct: int
    solved: int  # distinct questions answered correctly at least once
    accuracy: float
    smoothed_accuracy: float
    avg_score: float
    recent_accuracy: float
    recent_n: int
    previous_accuracy: float | None
    trend: float | None  # recent - previous accuracy (None until enough history)
    avg_time_ratio: float | None
    avg_time_seconds: float | None
    weighted_performance: float
    last_attempt: datetime


def _stats(key: str, evs: list[Event]) -> GroupStats:
    n = len(evs)
    correct = sum(e.is_correct for e in evs)
    recent = evs[-RECENT_WINDOW:]
    prev = evs[-3 * RECENT_WINDOW : -RECENT_WINDOW]
    recent_acc = _rate(recent) or 0.0
    prev_acc = _rate(prev) if len(prev) >= 3 else None
    trend = recent_acc - prev_acc if (prev_acc is not None and len(recent) >= 3) else None
    return GroupStats(
        key=key,
        attempts=n,
        correct=correct,
        solved=len(solved_question_ids(evs)),
        accuracy=correct / n,
        smoothed_accuracy=smoothed_rate(correct, n),
        avg_score=sum(e.score for e in evs) / n,
        recent_accuracy=recent_acc,
        recent_n=len(recent),
        previous_accuracy=prev_acc,
        trend=trend,
        avg_time_ratio=median_time_ratio(evs),
        avg_time_seconds=avg_time_seconds(evs),
        weighted_performance=difficulty_weighted(evs) or 0.0,
        last_attempt=evs[-1].created_at,
    )


def group_stats(events: Iterable[Event], key_fn: Callable[[Event], str | Iterable[str]]) -> dict[str, GroupStats]:
    """key_fn may return one key or several (e.g. an event's tags)."""
    buckets: dict[str, list[Event]] = defaultdict(list)
    for e in chronological(events):
        keys = key_fn(e)
        for k in (keys,) if isinstance(keys, str) else keys:
            buckets[k].append(e)
    return {k: _stats(k, v) for k, v in buckets.items()}


# --------------------------------------------------------- activity & streaks
@dataclass
class DayActivity:
    answered: int = 0
    correct: int = 0
    score_sum: float = 0.0


def local_day(dt: datetime, tz_offset_minutes: int = 0) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return (dt.astimezone(UTC) + timedelta(minutes=tz_offset_minutes)).date()


def daily_activity(events: Iterable[Event], tz_offset_minutes: int = 0) -> dict[date, DayActivity]:
    out: dict[date, DayActivity] = defaultdict(DayActivity)
    for e in events:
        d = out[local_day(e.created_at, tz_offset_minutes)]
        d.answered += 1
        d.correct += int(e.is_correct)
        d.score_sum += e.score
    return dict(out)


def streaks(active_days: set[date], today: date) -> tuple[int, int]:
    """(current, longest). The current streak stays alive if you practiced yesterday but not yet today."""
    current = 0
    cursor = today if today in active_days else today - timedelta(days=1)
    while cursor in active_days:
        current += 1
        cursor -= timedelta(days=1)
    longest = run = 0
    prev: date | None = None
    for d in sorted(active_days):
        run = run + 1 if (prev is not None and d - prev == timedelta(days=1)) else 1
        longest = max(longest, run)
        prev = d
    return current, longest


def daily_series(activity: dict[date, DayActivity], start: date, end: date) -> list[dict]:
    rows = []
    d = start
    while d <= end:
        a = activity.get(d)
        n = a.answered if a else 0
        rows.append(
            {
                "date": d,
                "answered": n,
                "correct": a.correct if a else 0,
                "accuracy": round(a.correct / n * 100, 1) if n else None,
                "average_score": round(a.score_sum / n * 100, 1) if n else None,
            }
        )
        d += timedelta(days=1)
    return rows


def weekly_series(activity: dict[date, DayActivity], today: date, weeks: int = 8) -> list[dict]:
    monday = today - timedelta(days=today.weekday())
    rows = []
    for i in range(weeks - 1, -1, -1):
        ws = monday - timedelta(days=7 * i)
        days = [activity.get(ws + timedelta(days=k)) for k in range(7)]
        answered = sum(a.answered for a in days if a)
        correct = sum(a.correct for a in days if a)
        rows.append(
            {
                "week_start": ws,
                "answered": answered,
                "correct": correct,
                "accuracy": round(correct / answered * 100, 1) if answered else None,
            }
        )
    return rows


def period_comparison(events: Iterable[Event], now: datetime, days: int = 14, min_events: int = 5) -> dict | None:
    """Accuracy over the last `days` vs the `days` before that. None when either side is too thin."""
    ev = list(events)
    cut1, cut0 = now - timedelta(days=days), now - timedelta(days=2 * days)
    recent = [e for e in ev if e.created_at >= cut1]
    prev = [e for e in ev if cut0 <= e.created_at < cut1]
    if len(recent) < min_events or len(prev) < min_events:
        return None
    r, p = accuracy(recent), accuracy(prev)
    return {
        "window_days": days,
        "recent_accuracy": round(r * 100, 1),
        "previous_accuracy": round(p * 100, 1),
        "change_points": round((r - p) * 100, 1),
    }


# ----------------------------------------------------------- model features
FEATURE_NAMES = (
    "accuracy",
    "recent_accuracy",
    "avg_time_ratio",
    "solved_score",
    "difficulty_weighted",
    "topic_coverage",
)


@dataclass(frozen=True)
class ReadinessFeatures:
    answered: int
    solved: int  # distinct questions solved
    accuracy: float
    recent_accuracy: float
    avg_time_ratio: float
    difficulty_weighted: float
    topic_coverage: float  # share of the 8 categories with >= COVERAGE_MIN_ATTEMPTS attempts

    def vector(self) -> list[float]:
        solved_score = min(1.0, math.log1p(self.solved) / math.log1p(100))
        return [
            self.accuracy,
            self.recent_accuracy,
            min(2.0, max(0.05, self.avg_time_ratio)),
            solved_score,
            self.difficulty_weighted,
            self.topic_coverage,
        ]


def readiness_features(events: Iterable[Event], recent_window: int = 20) -> ReadinessFeatures | None:
    ev = chronological(events)
    if not ev:
        return None
    ratio = median_time_ratio(ev)
    per_cat = Counter(e.category for e in ev)
    covered = sum(1 for c in CATEGORIES if per_cat.get(c, 0) >= COVERAGE_MIN_ATTEMPTS)
    return ReadinessFeatures(
        answered=len(ev),
        solved=len(solved_question_ids(ev)),
        accuracy=accuracy(ev) or 0.0,
        recent_accuracy=accuracy(ev[-recent_window:]) or 0.0,
        avg_time_ratio=ratio if ratio is not None else DEFAULT_TIME_RATIO,
        difficulty_weighted=difficulty_weighted(ev) or 0.0,
        topic_coverage=covered / len(CATEGORIES),
    )
