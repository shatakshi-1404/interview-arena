import pytest

from app.models.analytics import AdminAuditLog, PerformanceMetric
from tests.conftest import TestSession, auth_header


def mcq_payload(**over):
    p = {
        "title": "Binary search complexity",
        "description": "What is the time complexity of binary search?",
        "category": "DSA",
        "difficulty": "EASY",
        "question_type": "MCQ",
        "time_limit": 60,
        "tags": ["Searching", "binary-search", " searching "],
        "explanation": "It halves the range every step.",
        "options": [
            {"text": "O(n)", "is_correct": False},
            {"text": "O(log n)", "is_correct": True},
            {"text": "O(1)", "is_correct": False},
        ],
    }
    p.update(over)
    return p


@pytest.fixture
def admin_h(make_admin):
    return auth_header(make_admin()["tokens"]["access_token"])


@pytest.fixture
def user_h(make_user):
    return auth_header(make_user()["tokens"]["access_token"])


def create_q(client, admin_h, **over):
    r = client.post("/api/admin/questions", json=mcq_payload(**over), headers=admin_h)
    assert r.status_code == 201, r.text
    return r.json()


def correct_and_wrong_ids(q):
    correct = [o["id"] for o in q["options"] if o["is_correct"]]
    wrong = [o["id"] for o in q["options"] if not o["is_correct"]]
    return correct, wrong


# ------------------------------------------------------------ admin create
def test_admin_creates_question_and_normalizes_tags(client, admin_h):
    q = create_q(client, admin_h)
    assert q["tags"] == ["binary-search", "searching"]
    assert [o["position"] for o in q["options"]] == [0, 1, 2]


def test_regular_user_cannot_create(client, user_h):
    r = client.post("/api/admin/questions", json=mcq_payload(), headers=user_h)
    assert r.status_code == 403


def test_mcq_needs_a_correct_option(client, admin_h):
    opts = [{"text": "a", "is_correct": False}, {"text": "b", "is_correct": False}]
    r = client.post("/api/admin/questions", json=mcq_payload(options=opts), headers=admin_h)
    assert r.status_code == 422


def test_mcq_needs_two_options(client, admin_h):
    r = client.post(
        "/api/admin/questions",
        json=mcq_payload(options=[{"text": "only", "is_correct": True}]),
        headers=admin_h,
    )
    assert r.status_code == 422


def test_coding_question_needs_test_cases(client, admin_h):
    payload = mcq_payload(question_type="CODING", options=[], starter_code={"python": "def f(): pass"})
    r = client.post("/api/admin/questions", json=payload, headers=admin_h)
    assert r.status_code == 422


def test_options_not_allowed_on_non_mcq(client, admin_h):
    payload = mcq_payload(
        question_type="CODING",
        starter_code={"python": "def f(): pass"},
        test_cases=[{"input_data": "1", "expected_output": "1", "is_sample": True}],
    )
    r = client.post("/api/admin/questions", json=payload, headers=admin_h)
    assert r.status_code == 422  # still carries MCQ options


# ----------------------------------------------------------- user reading
def test_user_detail_does_not_leak_answers(client, admin_h, user_h):
    q = create_q(client, admin_h)
    r = client.get(f"/api/questions/{q['id']}", headers=user_h)
    assert r.status_code == 200
    body = r.json()
    assert "is_correct" not in r.text
    assert "explanation" not in body and "test_cases" not in body
    assert len(body["options"]) == 3


def test_questions_require_auth(client):
    assert client.get("/api/questions").status_code == 401


def test_unpublished_hidden_from_users_but_visible_to_admin(client, admin_h, user_h):
    q = create_q(client, admin_h, is_published=False)
    assert client.get(f"/api/questions/{q['id']}", headers=user_h).status_code == 404
    assert client.get("/api/questions", headers=user_h).json()["total"] == 0
    assert client.get("/api/admin/questions", headers=admin_h).json()["total"] == 1
    assert client.post(f"/api/questions/{q['id']}/submit", json={"selected_option_ids": [1]}, headers=user_h).status_code == 404


def test_filters_search_and_pagination(client, admin_h, user_h):
    create_q(client, admin_h, title="Binary search complexity", category="DSA")
    create_q(client, admin_h, title="Filtering groups", category="SQL", tags=["having"])
    create_q(client, admin_h, title="LEFT JOIN semantics", category="SQL", difficulty="MEDIUM")

    def get(**params):
        return client.get("/api/questions", params=params, headers=user_h).json()

    assert get(category="SQL")["total"] == 2
    assert get(category="SQL", difficulty="MEDIUM")["total"] == 1
    assert get(q="join")["total"] == 1
    assert get(tag="HAVING")["total"] == 1
    page = get(page_size=2)
    assert len(page["items"]) == 2 and page["total"] == 3
    assert len(get(page=2, page_size=2)["items"]) == 1
    assert client.get("/api/questions", params={"page_size": 1000}, headers=user_h).status_code == 422


def test_meta_counts(client, admin_h, user_h):
    create_q(client, admin_h)
    meta = client.get("/api/questions/meta", headers=user_h).json()
    counts = {c["value"]: c["count"] for c in meta["categories"]}
    assert counts["DSA"] == 1 and counts["SQL"] == 0


# ------------------------------------------------------------- submission
def test_submit_correct_and_wrong(client, admin_h, user_h):
    q = create_q(client, admin_h)
    correct, wrong = correct_and_wrong_ids(q)

    bad = client.post(f"/api/questions/{q['id']}/submit", json={"selected_option_ids": wrong[:1]}, headers=user_h)
    assert bad.status_code == 200
    assert bad.json()["is_correct"] is False and bad.json()["score"] == 0.0
    assert bad.json()["correct_option_ids"] == correct
    assert bad.json()["explanation"] == "It halves the range every step."

    good = client.post(f"/api/questions/{q['id']}/submit", json={"selected_option_ids": correct}, headers=user_h)
    assert good.json()["is_correct"] is True and good.json()["score"] == 1.0


def test_submit_validation(client, admin_h, user_h):
    q = create_q(client, admin_h)
    url = f"/api/questions/{q['id']}/submit"
    assert client.post(url, json={}, headers=user_h).status_code == 422
    assert client.post(url, json={"selected_option_ids": []}, headers=user_h).status_code == 422
    assert client.post(url, json={"selected_option_ids": [999999]}, headers=user_h).status_code == 422


def test_non_mcq_submission_not_implemented_yet(client, admin_h, user_h):
    payload = mcq_payload(
        question_type="CODING",
        options=[],
        starter_code={"python": "def solve(): pass"},
        test_cases=[{"input_data": "1", "expected_output": "1", "is_sample": True}],
    )
    q = create_q_raw(client, admin_h, payload)
    r = client.post(f"/api/questions/{q['id']}/submit", json={"code": "x", "language": "python"}, headers=user_h)
    assert r.status_code == 501


def create_q_raw(client, admin_h, payload):
    r = client.post("/api/admin/questions", json=payload, headers=admin_h)
    assert r.status_code == 201, r.text
    return r.json()


def test_attempts_and_metrics_are_recorded(client, admin_h, make_user):
    user = make_user(email="learner@example.com")
    h = auth_header(user["tokens"]["access_token"])
    q = create_q(client, admin_h)
    correct, wrong = correct_and_wrong_ids(q)
    url = f"/api/questions/{q['id']}/submit"

    first = client.post(url, json={"selected_option_ids": wrong[:1], "time_taken_seconds": 20}, headers=h).json()
    second = client.post(url, json={"selected_option_ids": correct, "time_taken_seconds": 12}, headers=h).json()
    assert (first["attempt_number"], second["attempt_number"]) == (1, 2)

    with TestSession() as db:
        rows = db.query(PerformanceMetric).filter_by(user_id=user["user"]["id"]).order_by(PerformanceMetric.id).all()
    assert [r.is_correct for r in rows] == [False, True]
    assert [r.attempts_count for r in rows] == [1, 2]
    assert rows[0].category.value == "DSA" and rows[0].time_taken_seconds == 20


def test_user_status_in_list(client, admin_h, user_h):
    q = create_q(client, admin_h)
    correct, wrong = correct_and_wrong_ids(q)
    url = f"/api/questions/{q['id']}/submit"

    def status():
        return client.get("/api/questions", headers=user_h).json()["items"][0]["user_status"]

    assert status() is None
    client.post(url, json={"selected_option_ids": wrong[:1]}, headers=user_h)
    assert status() == "ATTEMPTED"
    client.post(url, json={"selected_option_ids": correct}, headers=user_h)
    assert status() == "SOLVED"


# --------------------------------------------------------- update / delete
def test_admin_update_replaces_options_and_logs(client, admin_h):
    q = create_q(client, admin_h)
    new_opts = [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": False}]
    r = client.patch(
        f"/api/admin/questions/{q['id']}",
        json={"difficulty": "HARD", "options": new_opts, "tags": ["x"]},
        headers=admin_h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["difficulty"] == "HARD" and body["tags"] == ["x"]
    assert [o["text"] for o in body["options"]] == ["A", "B"]

    with TestSession() as db:
        actions = [a.action for a in db.query(AdminAuditLog).order_by(AdminAuditLog.id)]
    assert actions == ["CREATE", "UPDATE"]


def test_update_cannot_break_question_shape(client, admin_h):
    q = create_q(client, admin_h)
    r = client.patch(
        f"/api/admin/questions/{q['id']}",
        json={"options": [{"text": "A", "is_correct": False}, {"text": "B", "is_correct": False}]},
        headers=admin_h,
    )
    assert r.status_code == 422
    still = client.get(f"/api/admin/questions/{q['id']}", headers=admin_h).json()
    assert len(still["options"]) == 3  # failed update changed nothing


def test_update_unknown_question_404(client, admin_h):
    assert client.patch("/api/admin/questions/999", json={"title": "Hello"}, headers=admin_h).status_code == 404


def test_delete_question(client, admin_h, user_h):
    q = create_q(client, admin_h)
    assert client.delete(f"/api/admin/questions/{q['id']}", headers=user_h).status_code == 403
    assert client.delete(f"/api/admin/questions/{q['id']}", headers=admin_h).status_code == 204
    assert client.get(f"/api/questions/{q['id']}", headers=user_h).status_code == 404
    with TestSession() as db:
        actions = [a.action for a in db.query(AdminAuditLog).order_by(AdminAuditLog.id)]
    assert actions == ["CREATE", "DELETE"]


def test_detail_flags_multi_answer_questions(client, admin_h, user_h):
    single = create_q(client, admin_h, title="Single answer")
    multi = create_q(client, admin_h, title="Multi answer", options=[
        {"text": "a", "is_correct": True}, {"text": "b", "is_correct": True}, {"text": "c", "is_correct": False}])
    assert client.get(f"/api/questions/{single['id']}", headers=user_h).json()["multiple_answers"] is False
    assert client.get(f"/api/questions/{multi['id']}", headers=user_h).json()["multiple_answers"] is True
