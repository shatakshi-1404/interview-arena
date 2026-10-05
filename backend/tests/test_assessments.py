from app.models.analytics import PerformanceMetric
from app.models.assessment import Assessment
from app.models.attempt import Attempt
from datetime import UTC, datetime, timedelta

from tests.conftest import TestSession, auth_header
from tests.test_questions import correct_and_wrong_ids, create_q
from tests.test_sql_questions import BAD, GOOD, SQL_EXTRA

SHORT = dict(
    title="Explain deadlock",
    question_type="SHORT_ANSWER",
    options=[],
    reference_answer={
        "model_answer": "Circular wait among processes.",
        "concepts": [{"concept": "circular wait", "keywords": ["circular wait"], "weight": 1}],
    },
)


def create_assessment(client, admin_h, items, **over):
    body = {
        "title": "Backend Basics",
        "description": "d",
        "duration_minutes": 30,
        "difficulty": "MEDIUM",
        "is_published": True,
        "questions": [{"question_id": q["id"], "points": p} for q, p in items],
    }
    body.update(over)
    r = client.post("/api/admin/assessments", json=body, headers=admin_h)
    assert r.status_code == 201, r.text
    return r.json()


def start(client, h, assessment):
    r = client.post(f"/api/assessments/{assessment['id']}/start", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def save(client, h, attempt_id, qid, **body):
    return client.put(f"/api/attempts/{attempt_id}/answers/{qid}", json=body, headers=h)


# --------------------------------------------------------------- admin
def test_admin_assessment_rules(client, admin_h, user_h):
    q = create_q(client, admin_h)
    body = {"title": "Empty one", "duration_minutes": 10, "difficulty": "EASY", "is_published": True, "questions": []}
    assert client.post("/api/admin/assessments", json=body, headers=admin_h).status_code == 422
    assert client.post("/api/admin/assessments", json=body, headers=user_h).status_code == 403
    ghost = {**body, "questions": [{"question_id": 9999}]}
    assert client.post("/api/admin/assessments", json=ghost, headers=admin_h).status_code == 422
    dup = {**body, "questions": [{"question_id": q["id"]}, {"question_id": q["id"]}]}
    assert client.post("/api/admin/assessments", json=dup, headers=admin_h).status_code == 422


def test_unpublished_assessment_hidden_from_users(client, admin_h, user_h):
    q = create_q(client, admin_h)
    a = create_assessment(client, admin_h, [(q, 1)], is_published=False)
    assert client.get("/api/assessments", headers=user_h).json()["total"] == 0
    assert client.get(f"/api/assessments/{a['id']}", headers=user_h).status_code == 404
    assert client.post(f"/api/assessments/{a['id']}/start", headers=user_h).status_code == 404


def test_question_list_is_replaceable_until_first_attempt(client, admin_h, user_h):
    q1, q2 = create_q(client, admin_h, title="First one"), create_q(client, admin_h, title="Second one")
    a = create_assessment(client, admin_h, [(q1, 1)])
    r = client.patch(
        f"/api/admin/assessments/{a['id']}",
        json={"questions": [{"question_id": q2["id"], "points": 2}, {"question_id": q1["id"], "points": 1}]},
        headers=admin_h,
    )
    assert r.status_code == 200, r.text
    assert [x["question_id"] for x in r.json()["questions"]] == [q2["id"], q1["id"]]

    start(client, user_h, a)
    locked = client.patch(f"/api/admin/assessments/{a['id']}", json={"questions": [{"question_id": q1["id"]}]}, headers=admin_h)
    assert locked.status_code == 409
    assert client.delete(f"/api/admin/assessments/{a['id']}", headers=admin_h).status_code == 409
    assert client.patch(f"/api/admin/assessments/{a['id']}", json={"title": "Renamed"}, headers=admin_h).status_code == 200


# --------------------------------------------------------- learner flow
def test_full_flow_scoring_breakdown_and_metrics(client, admin_h, make_user):
    learner = make_user(email="learner@example.com")
    h = auth_header(learner["tokens"]["access_token"])
    q1 = create_q(client, admin_h, title="DSA one", category="DSA")
    q2 = create_q(client, admin_h, title="OS one", category="OS")
    q3 = create_q(client, admin_h, **SQL_EXTRA)
    a = create_assessment(client, admin_h, [(q1, 1), (q2, 2), (q3, 3)])

    st = start(client, h, a)
    assert st["status"] == "IN_PROGRESS" and 0 < st["remaining_seconds"] <= 1800
    assert [x["question"]["id"] for x in st["questions"]] == [q1["id"], q2["id"], q3["id"]]
    assert "is_correct" not in str(st) and "solution_query" not in str(st) and "explanation" not in str(st)
    assert start(client, h, a)["attempt_id"] == st["attempt_id"]  # idempotent

    aid = st["attempt_id"]
    c1, _ = correct_and_wrong_ids(q1)
    _, w2 = correct_and_wrong_ids(q2)
    assert save(client, h, aid, q1["id"], selected_option_ids=c1, time_taken_seconds=12).status_code == 200
    assert save(client, h, aid, q2["id"], selected_option_ids=w2[:1]).status_code == 200
    assert save(client, h, aid, q3["id"], text_answer=BAD).status_code == 200
    assert save(client, h, aid, q3["id"], text_answer=GOOD).status_code == 200  # autosave overwrites

    again = client.get(f"/api/attempts/{aid}", headers=h).json()
    assert {x["question_id"] for x in again["answers"]} == {q1["id"], q2["id"], q3["id"]}

    res = client.post(f"/api/attempts/{aid}/submit", headers=h).json()
    assert res["status"] == "SUBMITTED"
    assert res["score"] == 4.0 and res["max_score"] == 6.0 and res["percentage"] == 66.7
    cats = {x["key"]: x for x in res["by_category"]}
    assert cats["DSA"]["correct"] == 1 and cats["OS"]["correct"] == 0 and cats["SQL"]["correct"] == 1
    by_q = {x["question_id"]: x for x in res["questions"]}
    assert by_q[q1["id"]]["correct_option_ids"] == c1 and by_q[q1["id"]]["explanation"]
    assert by_q[q3["id"]]["run"]["sql"]["correct"] is True

    # idempotent: a second submit returns the same report and does not duplicate metrics
    assert client.post(f"/api/attempts/{aid}/submit", headers=h).json()["score"] == 4.0
    with TestSession() as db:
        assert db.query(PerformanceMetric).filter_by(attempt_id=aid).count() == 3
    assert client.get(f"/api/attempts/{aid}", headers=h).json()["questions"] == []  # finished: use /result
    assert client.get("/api/attempts", headers=h).json()[0]["percentage"] == 66.7
    assert client.get("/api/assessments", headers=h).json()["items"][0]["best_percentage"] == 66.7


def test_save_validation_and_clearing(client, admin_h, user_h):
    q1, q2 = create_q(client, admin_h, title="In one"), create_q(client, admin_h, title="Not in")
    a = create_assessment(client, admin_h, [(q1, 1)])
    aid = start(client, user_h, a)["attempt_id"]
    assert save(client, user_h, aid, q1["id"], selected_option_ids=[999999]).status_code == 422
    assert save(client, user_h, aid, q2["id"], selected_option_ids=[1]).status_code == 404
    c1, _ = correct_and_wrong_ids(q1)
    save(client, user_h, aid, q1["id"], selected_option_ids=c1)
    save(client, user_h, aid, q1["id"])  # empty body clears
    assert client.get(f"/api/attempts/{aid}", headers=user_h).json()["answers"] == []


def test_attempts_are_private(client, admin_h, user_h, make_user):
    q = create_q(client, admin_h)
    aid = start(client, user_h, create_assessment(client, admin_h, [(q, 1)]))["attempt_id"]
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    for call in (
        client.get(f"/api/attempts/{aid}", headers=other),
        client.post(f"/api/attempts/{aid}/submit", headers=other),
        client.get(f"/api/attempts/{aid}/result", headers=other),
        save(client, other, aid, q["id"], selected_option_ids=[1]),
    ):
        assert call.status_code == 404


def test_result_unavailable_while_in_progress(client, admin_h, user_h):
    q = create_q(client, admin_h)
    aid = start(client, user_h, create_assessment(client, admin_h, [(q, 1)]))["attempt_id"]
    assert client.get(f"/api/attempts/{aid}/result", headers=user_h).status_code == 409


# ------------------------------------------------------------- timing
def _expire(attempt_id):
    with TestSession() as db:
        db.query(Attempt).filter_by(id=attempt_id).update({"deadline": datetime.now(UTC) - timedelta(minutes=5)})
        db.commit()


def test_timeout_autosubmits_using_saved_answers(client, admin_h, user_h):
    q1, q2 = create_q(client, admin_h, title="Time one"), create_q(client, admin_h, title="Time two")
    a = create_assessment(client, admin_h, [(q1, 1), (q2, 2)])
    aid = start(client, user_h, a)["attempt_id"]
    c1, _ = correct_and_wrong_ids(q1)
    save(client, user_h, aid, q1["id"], selected_option_ids=c1)

    _expire(aid)
    late = save(client, user_h, aid, q2["id"], selected_option_ids=[1])
    assert late.status_code == 409 and "Time is up" in late.json()["detail"]

    res = client.get(f"/api/attempts/{aid}/result", headers=user_h).json()
    assert res["status"] == "EXPIRED"
    assert res["answered_count"] == 1 and res["score"] == 1.0 and res["max_score"] == 3.0
    assert client.post(f"/api/attempts/{aid}/submit", headers=user_h).json()["status"] == "EXPIRED"


def test_state_and_listing_lazily_expire(client, admin_h, user_h):
    q = create_q(client, admin_h)
    a = create_assessment(client, admin_h, [(q, 1)])
    aid = start(client, user_h, a)["attempt_id"]
    _expire(aid)
    assert client.get("/api/assessments", headers=user_h).json()["items"][0]["in_progress_attempt_id"] is None
    assert client.get(f"/api/attempts/{aid}", headers=user_h).json()["status"] == "EXPIRED"
    # a fresh attempt can now be started
    assert start(client, user_h, a)["attempt_id"] != aid


def test_submit_within_grace_is_not_expired(client, admin_h, user_h):
    q = create_q(client, admin_h)
    aid = start(client, user_h, create_assessment(client, admin_h, [(q, 1)]))["attempt_id"]
    with TestSession() as db:
        db.query(Attempt).filter_by(id=aid).update({"deadline": datetime.now(UTC) - timedelta(seconds=1)})
        db.commit()
    assert client.post(f"/api/attempts/{aid}/submit", headers=user_h).json()["status"] == "SUBMITTED"


# ------------------------------------------------------------ ungraded
def test_ungradable_answers_are_flagged_and_excluded(client, admin_h, user_h):
    q1 = create_q(client, admin_h, title="Graded one")
    q2 = create_q(client, admin_h, **SHORT)
    aid = start(client, user_h, create_assessment(client, admin_h, [(q1, 1), (q2, 2)]))["attempt_id"]
    c1, _ = correct_and_wrong_ids(q1)
    save(client, user_h, aid, q1["id"], selected_option_ids=c1)
    save(client, user_h, aid, q2["id"], text_answer="Processes wait in a circular wait.")
    res = client.post(f"/api/attempts/{aid}/submit", headers=user_h).json()
    assert res["ungraded_count"] == 1 and res["max_score"] == 1.0 and res["percentage"] == 100.0
    short = next(x for x in res["questions"] if x["question_id"] == q2["id"])
    assert short["answered"] is True and short["graded"] is False and short["score"] is None
    with TestSession() as db:
        assert db.query(PerformanceMetric).filter_by(attempt_id=aid).count() == 1
