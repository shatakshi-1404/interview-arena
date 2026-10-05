from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.main import app
from app.models.analytics import PerformanceMetric
from app.models.attempt import Attempt
from app.sandbox.runner import get_code_runner
from tests.conftest import TestSession, auth_header
from tests.test_code_questions import CODING, ScriptedRunner
from tests.test_questions import create_q
from tests.test_short_answer import SHORT

CATS = ["DSA", "SQL", "DBMS", "OS", "CN", "OOP", "PROGRAMMING", "SYSTEM_DESIGN"]
DIFFS = ["EASY", "MEDIUM", "HARD"]


def make_pool(client, admin_h, n=8):
    return [create_q(client, admin_h, title=f"Pool question {i}", category=CATS[i % 8], difficulty=DIFFS[i % 3])
            for i in range(n)]


def start_mock(client, h, **over):
    body = {"role": "BACKEND_ENGINEER", "level": "INTERMEDIATE", "duration_minutes": 15}
    body.update(over)
    return client.post("/api/mock-interviews/start", json=body, headers=h)


def option_ids(pool, qid, correct):
    q = next(x for x in pool if x["id"] == qid)
    return [o["id"] for o in q["options"] if o["is_correct"] == correct]


def answer_all(client, h, pool, state, *, correct):
    for item in state["questions"]:
        qid = item["question"]["id"]
        ids = option_ids(pool, qid, correct)[:1]
        r = client.put(f"/api/attempts/{state['attempt_id']}/answers/{qid}",
                       json={"selected_option_ids": ids}, headers=h)
        assert r.status_code == 200, r.text


def test_requires_auth(client):
    assert client.get("/api/mock-interviews/options").status_code == 401
    assert client.post("/api/mock-interviews/start", json={}).status_code == 401


def test_options(client, user_h):
    body = client.get("/api/mock-interviews/options", headers=user_h).json()
    assert {r["key"] for r in body["roles"]} == {
        "BACKEND_ENGINEER", "FULL_STACK_ENGINEER", "SOFTWARE_ENGINEER", "DATA_ENGINEER"}
    assert [(d["minutes"], d["questions"]) for d in body["durations"]] == [(15, 5), (30, 10), (45, 15), (60, 20)]
    assert body["includes"] == ["MCQ", "SHORT_ANSWER", "SQL"]  # coding is not offered while the runner is disabled
    assert len(body["roles"][0]["focus"]) == 3


def test_validation(client, user_h):
    assert start_mock(client, user_h, duration_minutes=20).status_code == 422
    assert start_mock(client, user_h, role="CEO").status_code == 422
    assert start_mock(client, user_h, level="GOD").status_code == 422


def test_not_enough_questions(client, admin_h, user_h):
    make_pool(client, admin_h, 2)
    assert start_mock(client, user_h).status_code == 409


def test_full_flow_and_report(client, admin_h, user_h):
    pool = make_pool(client, admin_h)
    r = start_mock(client, user_h)
    assert r.status_code == 201, r.text
    state = r.json()
    assert state["mode"] == "MOCK_INTERVIEW" and state["title"].startswith("Backend Engineer mock interview")
    assert state["config"]["role"] == "BACKEND_ENGINEER" and "questions" not in state["config"]
    assert [q["position"] for q in state["questions"]] == [0, 1, 2, 3, 4]
    assert 800 < state["remaining_seconds"] <= 900
    assert "is_correct" not in str(state) and "explanation" not in str(state)

    again = start_mock(client, user_h)
    assert again.status_code == 409 and "in progress" in again.json()["detail"]
    aid = state["attempt_id"]
    assert client.get("/api/mock-interviews/current", headers=user_h).json()["attempt_id"] == aid
    assert client.get(f"/api/mock-interviews/{aid}/report", headers=user_h).status_code == 409  # not finished

    answer_all(client, user_h, pool, state, correct=True)
    done = client.post(f"/api/attempts/{aid}/submit", headers=user_h).json()
    assert done["status"] == "SUBMITTED" and done["percentage"] == 100.0

    rep = client.get(f"/api/mock-interviews/{aid}/report", headers=user_h).json()
    assert rep["percentage"] == 100.0 and rep["band"] == "Strong"
    assert (rep["role_label"], rep["level_label"], rep["duration_minutes"]) == ("Backend Engineer", "Intermediate", 15)
    assert rep["focus_areas"] == [] and rep["by_type"][0]["key"] == "MCQ"
    assert rep["pace"]["minutes_allowed"] == 15 and rep["result"]["answered_count"] == 5
    assert "does not predict" in rep["disclaimer"]

    assert client.get("/api/mock-interviews/current", headers=user_h).json() is None
    history = client.get("/api/attempts", headers=user_h).json()
    assert history[0]["mode"] == "MOCK_INTERVIEW" and "Backend Engineer" in history[0]["assessment_title"]
    with TestSession() as db:
        assert db.query(PerformanceMetric).filter_by(attempt_id=aid).count() == 5
    assert start_mock(client, user_h).status_code == 201  # a new interview can start once the last one is done


def test_wrong_answers_produce_focus_areas(client, admin_h, user_h):
    pool = make_pool(client, admin_h)
    state = start_mock(client, user_h).json()
    answer_all(client, user_h, pool, state, correct=False)
    client.post(f"/api/attempts/{state['attempt_id']}/submit", headers=user_h)
    rep = client.get(f"/api/mock-interviews/{state['attempt_id']}/report", headers=user_h).json()
    assert rep["percentage"] == 0.0 and rep["band"] == "Needs more practice"
    assert rep["focus_areas"] and all("You answered 0 of" in f["reason"] for f in rep["focus_areas"])
    assert rep["strengths"] == [] and rep["next_steps"][0].startswith("Practice ")


def test_unanswered_questions_are_reported(client, admin_h, user_h):
    make_pool(client, admin_h)
    aid = start_mock(client, user_h).json()["attempt_id"]
    client.post(f"/api/attempts/{aid}/submit", headers=user_h)
    rep = client.get(f"/api/mock-interviews/{aid}/report", headers=user_h).json()
    assert rep["percentage"] == 0.0 and any("left 5 question(s) unanswered" in s for s in rep["next_steps"])


def test_interviews_are_private_and_mode_checked(client, admin_h, user_h, make_user):
    make_pool(client, admin_h)
    aid = start_mock(client, user_h).json()["attempt_id"]
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert client.get(f"/api/attempts/{aid}", headers=other).status_code == 404
    assert client.get(f"/api/mock-interviews/{aid}/report", headers=other).status_code == 404
    assert client.get("/api/mock-interviews/current", headers=other).json() is None

    from tests.test_assessments import create_assessment
    from tests.test_assessments import start as start_assessment
    q = create_q(client, admin_h, title="Assessment only")
    assessment_attempt = start_assessment(client, other, create_assessment(client, admin_h, [(q, 1)]))["attempt_id"]
    client.post(f"/api/attempts/{assessment_attempt}/submit", headers=other)
    assert client.get(f"/api/mock-interviews/{assessment_attempt}/report", headers=other).status_code == 404


def test_expired_interview_is_finalized_automatically(client, admin_h, user_h):
    pool = make_pool(client, admin_h)
    state = start_mock(client, user_h).json()
    aid = state["attempt_id"]
    first = state["questions"][0]["question"]["id"]
    client.put(f"/api/attempts/{aid}/answers/{first}",
               json={"selected_option_ids": option_ids(pool, first, True)}, headers=user_h)
    with TestSession() as db:
        db.query(Attempt).filter_by(id=aid).update({"deadline": datetime.now(UTC) - timedelta(minutes=5)})
        db.commit()
    assert client.get("/api/mock-interviews/current", headers=user_h).json() is None
    rep = client.get(f"/api/mock-interviews/{aid}/report", headers=user_h).json()
    assert rep["status"] == "EXPIRED" and rep["result"]["answered_count"] == 1 and rep["percentage"] > 0


def test_coding_only_when_a_runner_is_enabled(client, admin_h, user_h, monkeypatch):
    make_pool(client, admin_h, 12)
    create_q(client, admin_h, **CODING)
    types = lambda s: {q["question"]["question_type"] for q in s["questions"]}  # noqa: E731
    first = start_mock(client, user_h, duration_minutes=30).json()
    assert "CODING" not in types(first)
    client.post(f"/api/attempts/{first['attempt_id']}/submit", headers=user_h)

    monkeypatch.setattr(settings, "CODE_RUNNER", "scripted")
    app.dependency_overrides[get_code_runner] = lambda: ScriptedRunner([True])
    assert "CODING" in client.get("/api/mock-interviews/options", headers=user_h).json()["includes"]
    second = start_mock(client, user_h, duration_minutes=30).json()
    assert "CODING" in types(second)


def test_short_answer_only_when_ml_is_enabled(client, admin_h, user_h, monkeypatch):
    make_pool(client, admin_h, 12)
    create_q(client, admin_h, **SHORT)
    types = lambda s: {q["question"]["question_type"] for q in s["questions"]}  # noqa: E731
    with_ml = start_mock(client, user_h, duration_minutes=30).json()
    assert "SHORT_ANSWER" in types(with_ml)
    client.post(f"/api/attempts/{with_ml['attempt_id']}/submit", headers=user_h)

    monkeypatch.setattr(settings, "ML_ENABLED", False)
    assert "SHORT_ANSWER" not in client.get("/api/mock-interviews/options", headers=user_h).json()["includes"]
    without_ml = start_mock(client, user_h, duration_minutes=30).json()
    assert "SHORT_ANSWER" not in types(without_ml)
