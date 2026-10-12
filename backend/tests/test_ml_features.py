from datetime import UTC, date, datetime, timedelta

from app.ml import features as F

BASE = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


def ev(i, correct=True, cat="DSA", diff="EASY", qid=None, score=None, tt=None, tl=None, tags=()):
    return F.Event(
        question_id=qid if qid is not None else i, category=cat, difficulty=diff, question_type="MCQ",
        score=score if score is not None else (1.0 if correct else 0.0), is_correct=correct,
        created_at=BASE + timedelta(minutes=i), time_taken_seconds=tt, time_limit=tl, tags=tags,
    )


def test_streak_alive_until_a_full_day_is_missed():
    days = {date(2026, 10, 1), date(2026, 9, 30), date(2026, 9, 29)}
    assert F.streaks(days, date(2026, 10, 1)) == (3, 3)
    assert F.streaks(days, date(2026, 10, 2)) == (3, 3)  # not practiced yet today: still alive
    assert F.streaks(days, date(2026, 10, 3)) == (0, 3)  # a full day missed


def test_longest_streak_spans_gaps():
    days = {date(2026, 9, d) for d in (1, 2, 3, 10, 11)}
    assert F.streaks(days, date(2026, 9, 11)) == (2, 3)
    assert F.streaks(set(), date(2026, 9, 11)) == (0, 0)


def test_timezone_offset_shifts_the_day():
    late_utc = datetime(2026, 10, 1, 20, 0, tzinfo=UTC)
    assert F.local_day(late_utc, 0) == date(2026, 10, 1)
    assert F.local_day(late_utc, 330) == date(2026, 10, 2)  # 01:30 IST the next morning


def test_group_stats_trend_needs_history():
    events = [ev(i, False) for i in range(5)] + [ev(i + 5, True) for i in range(5)]
    s = F.group_stats(events, lambda e: e.category)["DSA"]
    assert s.attempts == 10 and s.recent_accuracy == 1.0 and s.previous_accuracy == 0.0 and s.trend == 1.0
    short = F.group_stats([ev(i) for i in range(5)], lambda e: e.category)["DSA"]
    assert short.trend is None  # no earlier block to compare against


def test_group_stats_by_tags():
    events = [ev(0, tags=("arrays", "sorting")), ev(1, False, tags=("arrays",))]
    stats = F.group_stats(events, lambda e: e.tags)
    assert stats["arrays"].attempts == 2 and stats["sorting"].attempts == 1


def test_smoothing_does_not_overrate_tiny_samples():
    assert F.smoothed_rate(1, 1) < 0.7
    assert F.smoothed_rate(10, 10) > 0.85


def test_consistency():
    swing = [ev(i, True) for i in range(5)] + [ev(i + 5, False) for i in range(5)]
    steady = [ev(0), ev(1), ev(2), ev(3, False), ev(4, False), ev(5), ev(6), ev(7), ev(8, False), ev(9, False)]
    assert F.consistency(swing) == 0.0
    assert F.consistency(steady) == 1.0
    assert F.consistency([ev(i) for i in range(9)]) is None  # fewer than two full blocks


def test_difficulty_weighting_and_time_ratio():
    events = [ev(0, True, diff="EASY"), ev(1, False, diff="HARD")]
    assert F.difficulty_weighted(events) == 0.25  # (1*1 + 3*0) / 4
    timed = [ev(0, tt=30, tl=60), ev(1, tt=90, tl=60), ev(2, tt=60, tl=60), ev(3)]
    assert F.median_time_ratio(timed) == 1.0
    assert F.median_time_ratio([ev(0)]) is None


def test_readiness_features_coverage():
    events = [ev(i, cat=c) for c in ("DSA", "SQL", "OS") for i in range(3)]
    f = F.readiness_features(events)
    assert f.topic_coverage == 3 / 8 and f.answered == 9
    assert F.readiness_features([]) is None


def test_series_fill_gaps():
    act = F.daily_activity([ev(0, True), ev(1, False)], 0)
    series = F.daily_series(act, date(2026, 9, 30), date(2026, 10, 2))
    assert [r["answered"] for r in series] == [0, 2, 0]
    assert series[1]["accuracy"] == 50.0 and series[0]["accuracy"] is None
    weeks = F.weekly_series(act, date(2026, 10, 1), weeks=2)
    assert len(weeks) == 2 and weeks[-1]["answered"] == 2


def test_period_comparison_needs_both_windows():
    now = BASE + timedelta(days=30)
    recent = [F.Event(i, "DSA", "EASY", "MCQ", 1.0, True, now - timedelta(days=2, minutes=i)) for i in range(5)]
    older = [F.Event(10 + i, "DSA", "EASY", "MCQ", 0.0, False, now - timedelta(days=20, minutes=i)) for i in range(5)]
    cmp = F.period_comparison(recent + older, now)
    assert cmp["recent_accuracy"] == 100.0 and cmp["previous_accuracy"] == 0.0 and cmp["change_points"] == 100.0
    assert F.period_comparison(recent, now) is None
