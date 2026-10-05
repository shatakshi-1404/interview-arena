import pytest

from app.models.analytics import PerformanceMetric
from app.models.question import Category, Difficulty, QuestionType
from app.services.achievement_service import AchievementService
from datetime import UTC, datetime, timedelta

from tests.conftest import TestSession, auth_header
from tests.test_assessments import create_assessment, save, start
from tests.test_progress_api import add_metric
from tests.test_questions import create_q


@pytest.fixture
def learner(make_user):
    d = make_user(email="learner@example.com")
    return d["user"]["id"], auth_header(d["tokens"]["access_token"])


def correct_ids(q):
    return [o["id"] for o in q["options"] if o["is_correct"]]


def solve(client, h, q):
    r = client.post(f"/api/questions/{q['id']}/submit", json={"selected_option_ids": correct_ids(q)}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def codes(resp):
    return sorted(a["code"] for a in resp["new_achievements"])


def bulk(uid, q, n, correct):
    with TestSession() as db:
        db.add_all([PerformanceMetric(
            user_id=uid, question_id=q["id"], category=Category(q["category"]),
            difficulty=Difficulty(q["difficulty"]), question_type=QuestionType(q["question_type"]),
            score=1.0 if correct else 0.0, is_correct=correct, attempts_count=1) for _ in range(n)])
        db.commit()


def test_catalog_before_any_activity(client, learner):
    _, h = learner
    items = client.get("/api/achievements", headers=h).json()
    assert [a["code"] for a in items] == ["FIRST_10", "SQL_BEGINNER", "STREAK_7", "QUESTIONS_100", "GRAPH_EXPLORER"]
    assert all(not a["earned"] and a["progress"] == 0 and a["earned_at"] is None for a in items)
    assert client.get("/api/achievements").status_code == 401


def test_first_10_awarded_once_with_notification(client, admin_h, learner):
    uid, h = learner
    qs = [create_q(client, admin_h, title=f"Practice {i}") for i in range(10)]
    for q in qs[:9]:
        bulk(uid, q, 1, True)
    res = solve(client, h, qs[9])
    assert codes(res) == ["FIRST_10"]

    notes = client.get("/api/notifications", headers=h).json()
    assert notes["unread_count"] == 1 and "First 10 Problems" in notes["items"][0]["title"]
    first10 = next(a for a in client.get("/api/achievements", headers=h).json() if a["code"] == "FIRST_10")
    assert first10["earned"] and first10["earned_at"] and first10["progress"] == 10

    assert codes(solve(client, h, qs[9])) == []  # nothing new, nothing duplicated
    assert client.get("/api/notifications", headers=h).json()["unread_count"] == 1


def test_sql_beginner_and_partial_progress(client, admin_h, learner):
    _, h = learner
    qs = [create_q(client, admin_h, title=f"SQL part {i}", category="SQL") for i in range(3)]
    assert codes(solve(client, h, qs[0])) == []
    sql = next(a for a in client.get("/api/achievements", headers=h).json() if a["code"] == "SQL_BEGINNER")
    assert (sql["progress"], sql["target"], sql["earned"]) == (1, 3, False)
    solve(client, h, qs[1])
    assert codes(solve(client, h, qs[2])) == ["SQL_BEGINNER"]


def test_graph_explorer_uses_tags(client, admin_h, learner):
    _, h = learner
    a = create_q(client, admin_h, title="Graph one", tags=["graphs"])
    b = create_q(client, admin_h, title="Graph two", tags=["BFS"])
    c = create_q(client, admin_h, title="Not a graph", tags=["arrays"])
    solve(client, h, c)
    assert codes(solve(client, h, a)) == []
    assert codes(solve(client, h, b)) == ["GRAPH_EXPLORER"]


def test_seven_day_streak(client, admin_h, learner):
    uid, h = learner
    q = create_q(client, admin_h, title="Daily one")
    for days_ago in range(1, 7):
        add_metric(uid, q, correct=False, when=datetime.now(UTC) - timedelta(days=days_ago))
    assert codes(solve(client, h, q)) == ["STREAK_7"]


def test_hundred_questions(client, admin_h, learner):
    uid, h = learner
    q = create_q(client, admin_h, title="Grind")
    bulk(uid, q, 99, False)
    assert codes(solve(client, h, q)) == ["QUESTIONS_100"]


def test_achievements_are_per_user(client, admin_h, learner, make_user):
    uid, h = learner
    qs = [create_q(client, admin_h, title=f"Q {i}", category="SQL") for i in range(3)]
    for q in qs:
        solve(client, h, q)
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert not any(a["earned"] for a in client.get("/api/achievements", headers=other).json())
    assert client.get("/api/notifications", headers=other).json()["items"] == []


def test_assessments_award_achievements_too(client, admin_h, learner):
    _, h = learner
    qs = [create_q(client, admin_h, title=f"SQL assessment {i}", category="SQL") for i in range(3)]
    aid = start(client, h, create_assessment(client, admin_h, [(q, 1) for q in qs]))["attempt_id"]
    for q in qs:
        save(client, h, aid, q["id"], selected_option_ids=correct_ids(q))
    client.post(f"/api/attempts/{aid}/submit", headers=h)
    titles = [n["title"] for n in client.get("/api/notifications", headers=h).json()["items"]]
    assert any("SQL Beginner" in t for t in titles)


def test_achievement_failure_never_breaks_a_submission(client, admin_h, learner, monkeypatch):
    _, h = learner
    q = create_q(client, admin_h, title="Resilient")

    def boom(self, user_id):
        raise RuntimeError("achievement bug")

    monkeypatch.setattr(AchievementService, "evaluate", boom)
    res = solve(client, h, q)
    assert res["is_correct"] is True and res["new_achievements"] == []


def test_notifications_read_flow_and_privacy(client, admin_h, learner, make_user):
    uid, h = learner
    for i in range(3):
        solve(client, h, create_q(client, admin_h, title=f"Sql {i}", category="SQL"))
    notes = client.get("/api/notifications", headers=h).json()
    assert notes["unread_count"] == 1
    nid = notes["items"][0]["id"]

    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert client.post(f"/api/notifications/{nid}/read", headers=other).status_code == 404
    assert client.post(f"/api/notifications/{nid}/read", headers=h).json()["unread_count"] == 0
    assert client.post("/api/notifications/read-all", headers=h).json()["items"][0]["is_read"] is True
    assert client.post("/api/notifications/999999/read", headers=h).status_code == 404
