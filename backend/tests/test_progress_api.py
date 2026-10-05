from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import settings
from app.models.analytics import PerformanceMetric
from app.models.question import Category, Difficulty, QuestionType
from tests.conftest import TestSession, auth_header
from tests.test_questions import correct_and_wrong_ids, create_q


def add_metric(user_id, q, *, correct, when, tt=None):
    with TestSession() as db:
        db.add(PerformanceMetric(
            user_id=user_id, question_id=q["id"], category=Category(q["category"]),
            difficulty=Difficulty(q["difficulty"]), question_type=QuestionType(q["question_type"]),
            score=1.0 if correct else 0.0, is_correct=correct, time_taken_seconds=tt,
            attempts_count=1, created_at=when,
        ))
        db.commit()


@pytest.fixture
def learner(make_user):
    data = make_user(email="learner@example.com")
    return data["user"]["id"], auth_header(data["tokens"]["access_token"])


def seed_two_days(client, admin_h, uid):
    """Yesterday: q1 ok, q2 ok, q3 wrong. Today: q1 ok, q2 wrong, q3 ok."""
    qs = [create_q(client, admin_h, title=f"DSA question {i}") for i in (1, 2, 3)]
    now = datetime.now(UTC)
    for q, ok in zip(qs, (True, True, False)):
        add_metric(uid, q, correct=ok, when=now - timedelta(hours=24))
    for q, ok in zip(qs, (True, False, True)):
        add_metric(uid, q, correct=ok, when=now)
    return qs


def test_progress_requires_auth(client):
    for path in ("/api/progress", "/api/progress/topics", "/api/progress/activity",
                 "/api/progress/readiness", "/api/recommendations"):
        assert client.get(path).status_code == 401


def test_empty_overview(client, learner):
    _, h = learner
    body = client.get("/api/progress", headers=h).json()
    assert body["total_answered"] == 0 and body["accuracy"] is None and body["weakest_topic"] is None
    assert body["current_streak"] == 0 and body["readiness"]["status"] == "INSUFFICIENT_DATA"
    assert len(body["performance_over_time"]) == 30 and len(body["weekly"]) == 8


def test_overview_numbers(client, admin_h, learner):
    uid, h = learner
    seed_two_days(client, admin_h, uid)
    body = client.get("/api/progress", headers=h).json()
    assert body["total_answered"] == 6 and body["accuracy"] == 66.7 and body["average_score"] == 66.7
    assert body["problems_solved"] == 3
    assert body["current_streak"] == 2 and body["longest_streak"] == 2
    assert body["weakest_topic"]["key"] == "DSA"
    assert body["performance_over_time"][-1]["answered"] == 3 and body["performance_over_time"][-1]["correct"] == 2
    assert body["readiness"]["status"] == "INSUFFICIENT_DATA" and body["readiness"]["answered"] == 6
    easy = next(d for d in body["by_difficulty"] if d["difficulty"] == "EASY")
    assert easy["attempts"] == 6


def test_data_is_private_per_user(client, admin_h, learner, make_user):
    uid, _ = learner
    seed_two_days(client, admin_h, uid)
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert client.get("/api/progress", headers=other).json()["total_answered"] == 0


def test_topics_and_activity(client, admin_h, learner):
    uid, h = learner
    seed_two_days(client, admin_h, uid)
    topics = client.get("/api/progress/topics", headers=h).json()
    assert len(topics["categories"]) == 8
    dsa = next(c for c in topics["categories"] if c["key"] == "DSA")
    sql = next(c for c in topics["categories"] if c["key"] == "SQL")
    assert dsa["attempts"] == 6 and dsa["accuracy"] == 66.7 and sql["attempts"] == 0 and sql["accuracy"] is None
    assert next(t for t in topics["tags"] if t["key"] == "searching")["attempts"] == 6

    act = client.get("/api/progress/activity", params={"days": 7}, headers=h).json()
    assert len(act["days"]) == 7 and act["active_days"] == 2 and act["total_answered"] == 6
    assert client.get("/api/progress/activity", params={"days": 2}, headers=h).status_code == 422


def test_readiness_detail_after_enough_answers(client, admin_h, learner):
    uid, h = learner
    qs = seed_two_days(client, admin_h, uid)
    for q in qs * 2:
        add_metric(uid, q, correct=True, when=datetime.now(UTC))
    body = client.get("/api/progress/readiness", headers=h).json()
    assert body["status"] == "READY_TO_SCORE" and body["category"] in ("Needs Practice", "Developing", "Interview Ready")
    assert 0 <= body["score"] <= 100 and len(body["topics"]) == 8 and len(body["drivers"]) == 3
    assert body["model"]["validated_against_real_outcomes"] is False
    assert "not a prediction" in body["disclaimer"]
    assert body["next_steps"]


# ------------------------------------------------------- recommendations
def make_pool(client, admin_h):
    wrong_five = [create_q(client, admin_h, title=f"DSA practice {i}") for i in range(5)]
    fresh_dsa = create_q(client, admin_h, title="DSA fresh one")
    sql = create_q(client, admin_h, title="SQL starter", category="SQL")
    return wrong_five, fresh_dsa, sql


def test_recommendations_flow(client, admin_h, learner):
    uid, h = learner
    wrong_five, fresh, sql = make_pool(client, admin_h)
    now = datetime.now(UTC) - timedelta(hours=2)
    for i, q in enumerate(wrong_five):
        add_metric(uid, q, correct=(i == 4), when=now + timedelta(minutes=i))  # 1 of 5 right -> 20%

    recs = client.get("/api/recommendations", headers=h).json()
    assert recs["enabled"] is True and recs["items"]
    first = recs["items"][0]
    assert first["priority"] == 1 and first["question"]["category"] == "DSA"
    assert "Your recent DSA accuracy is 20%." in first["reason"]
    ids = [r["question"]["id"] for r in recs["items"]]
    assert wrong_five[4]["id"] not in ids  # solved questions are never recommended
    assert sql["id"] in ids  # untouched category is offered too
    assert client.get("/api/recommendations", headers=h).json() == recs  # served from storage, stable

    dismissed = client.post(f"/api/recommendations/{first['id']}/dismiss", headers=h).json()
    assert first["question"]["id"] not in [r["question"]["id"] for r in dismissed["items"]]
    assert client.post("/api/recommendations/999999/dismiss", headers=h).status_code == 404


def test_new_answers_refresh_recommendations(client, admin_h, learner):
    uid, h = learner
    wrong_five, fresh, sql = make_pool(client, admin_h)
    for i, q in enumerate(wrong_five):
        add_metric(uid, q, correct=False, when=datetime.now(UTC) - timedelta(hours=2, minutes=-i))
    before = [r["question"]["id"] for r in client.get("/api/recommendations", headers=h).json()["items"]]
    assert sql["id"] in before

    correct, _ = correct_and_wrong_ids(sql)  # solve it through the real submission flow
    assert client.post(f"/api/questions/{sql['id']}/submit", json={"selected_option_ids": correct}, headers=h).status_code == 200
    after = [r["question"]["id"] for r in client.get("/api/recommendations", headers=h).json()["items"]]
    assert sql["id"] not in after


def test_new_user_gets_baseline(client, admin_h, learner):
    _, h = learner
    create_q(client, admin_h, title="Only question")
    items = client.get("/api/recommendations", headers=h).json()["items"]
    assert len(items) == 1 and items[0]["reason"].startswith("Start here")


def test_recommendations_are_private(client, admin_h, learner, make_user):
    uid, h = learner
    wrong_five, _, _ = make_pool(client, admin_h)
    for q in wrong_five:
        add_metric(uid, q, correct=False, when=datetime.now(UTC) - timedelta(hours=2))
    rec_id = client.get("/api/recommendations", headers=h).json()["items"][0]["id"]
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert client.post(f"/api/recommendations/{rec_id}/dismiss", headers=other).status_code == 404


# ----------------------------------------------------------- ML switched off
def test_platform_still_works_with_ml_disabled(client, admin_h, learner, monkeypatch):
    uid, h = learner
    seed_two_days(client, admin_h, uid)
    monkeypatch.setattr(settings, "ML_ENABLED", False)

    overview = client.get("/api/progress", headers=h).json()
    assert overview["accuracy"] == 66.7 and overview["current_streak"] == 2  # analytics unaffected
    assert overview["readiness"]["status"] == "DISABLED"
    topics = client.get("/api/progress/topics", headers=h).json()
    assert topics["weak_topics"] == [] and topics["categories"][0]["attempts"] == 6
    assert client.get("/api/progress/readiness", headers=h).json()["status"] == "DISABLED"
    assert client.get("/api/recommendations", headers=h).json() == {"enabled": False, "items": []}
