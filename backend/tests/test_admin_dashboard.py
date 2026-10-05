from datetime import UTC, datetime

import pytest

from tests.conftest import auth_header
from tests.test_progress_api import add_metric
from tests.test_questions import create_q
from tests.test_sql_questions import GOOD, SQL_EXTRA

ENDPOINTS = ["/api/admin/stats", "/api/admin/users", "/api/admin/submissions",
             "/api/admin/audit-log", "/api/admin/categories"]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_every_endpoint_enforces_admin(client, user_h, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=user_h).status_code == 403


def test_user_management_requires_admin(client, user_h):
    assert client.patch("/api/admin/users/1", json={"is_active": False}, headers=user_h).status_code == 403


def test_platform_stats(client, admin_h, make_user):
    u1 = make_user(email="u1@example.com")
    make_user(email="u2@example.com")
    q = create_q(client, admin_h, title="Stat question", category="DSA")
    for i in range(10):
        add_metric(u1["user"]["id"], q, correct=i < 3, when=datetime.now(UTC))

    s = client.get("/api/admin/stats", headers=admin_h).json()
    assert (s["users"]["total"], s["users"]["admins"], s["users"]["active"]) == (3, 1, 3)
    assert s["users"]["new_last_7_days"] == 3
    assert s["activity"] == {"daily_active": 1, "weekly_active": 1, "monthly_active": 1}
    assert s["questions"]["total"] == 1 and s["questions"]["by_category"] == [{"key": "DSA", "count": 1}]
    assert len(s["answers_per_day"]) == 14 and s["answers_per_day"][-1]["answered"] == 10
    assert s["answers_per_day"][-1]["correct"] == 3 and s["overall_accuracy"] == 30.0
    assert s["lowest_accuracy_categories"] == [{"key": "DSA", "label": "DSA", "answered": 10, "accuracy": 30.0}]


def test_user_list_filters_and_activity(client, admin_h, make_user):
    ada = make_user(email="ada@example.com", name="Ada Lovelace")
    make_user(email="grace@example.com", name="Grace Hopper")
    q = create_q(client, admin_h, title="Some question")
    add_metric(ada["user"]["id"], q, correct=True, when=datetime.now(UTC))

    everyone = client.get("/api/admin/users", headers=admin_h).json()
    assert everyone["total"] == 3
    by_email = {u["email"]: u for u in everyone["items"]}
    assert by_email["ada@example.com"]["answered"] == 1 and by_email["ada@example.com"]["last_active"]
    assert by_email["grace@example.com"]["answered"] == 0 and by_email["grace@example.com"]["last_active"] is None

    assert client.get("/api/admin/users", params={"search": "hopp"}, headers=admin_h).json()["total"] == 1
    assert client.get("/api/admin/users", params={"role": "ADMIN"}, headers=admin_h).json()["total"] == 1
    assert client.get("/api/admin/users", params={"page_size": 2}, headers=admin_h).json()["items"].__len__() == 2
    assert "password" not in client.get("/api/admin/users", headers=admin_h).text


def test_promote_and_deactivate_user(client, admin_h, make_user):
    u = make_user(email="target@example.com")
    uid, user_h = u["user"]["id"], auth_header(u["tokens"]["access_token"])

    promoted = client.patch(f"/api/admin/users/{uid}", json={"role": "ADMIN"}, headers=admin_h).json()
    assert promoted["role"] == "ADMIN"
    assert client.get("/api/admin/stats", headers=user_h).status_code == 200  # authorization is read from the DB
    client.patch(f"/api/admin/users/{uid}", json={"role": "USER"}, headers=admin_h)
    assert client.get("/api/admin/stats", headers=user_h).status_code == 403

    off = client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=admin_h)
    assert off.status_code == 200 and off.json()["is_active"] is False
    assert client.get("/api/auth/me", headers=user_h).status_code == 401  # existing access token stops working
    assert client.post("/api/auth/refresh", json={"refresh_token": u["tokens"]["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "target@example.com", "password": "Passw0rdXY"}).status_code == 401

    client.patch(f"/api/admin/users/{uid}", json={"is_active": True}, headers=admin_h)
    assert client.post("/api/auth/login", json={"email": "target@example.com", "password": "Passw0rdXY"}).status_code == 200

    log = client.get("/api/admin/audit-log", params={"entity_type": "user"}, headers=admin_h).json()
    assert log["total"] == 4 and log["items"][0]["admin_name"] == "Admin"
    assert log["items"][-1]["details"] == {"role": {"from": "USER", "to": "ADMIN"}}


def test_admin_cannot_lock_themselves_out(client, admin_h):
    me = client.get("/api/auth/me", headers=admin_h).json()["id"]
    assert client.patch(f"/api/admin/users/{me}", json={"role": "USER"}, headers=admin_h).status_code == 409
    assert client.patch(f"/api/admin/users/{me}", json={"is_active": False}, headers=admin_h).status_code == 409
    assert client.patch(f"/api/admin/users/{me}", json={"role": "ADMIN"}, headers=admin_h).status_code == 200
    assert client.patch(f"/api/admin/users/{me}", json={}, headers=admin_h).status_code == 422
    assert client.patch("/api/admin/users/999999", json={"is_active": False}, headers=admin_h).status_code == 404


def test_submissions_list_and_detail(client, admin_h, user_h):
    q = create_q(client, admin_h, **SQL_EXTRA)
    url = f"/api/questions/{q['id']}/submit"
    client.post(url, json={"code": "SELECT MAX(salary) FROM employees"}, headers=user_h)
    client.post(url, json={"code": GOOD}, headers=user_h)

    listing = client.get("/api/admin/submissions", headers=admin_h).json()
    assert listing["total"] == 2 and listing["items"][0]["status"] == "ACCEPTED"
    assert listing["items"][0]["user_email"] == "ada@example.com" and "code" not in listing["items"][0]
    wrong = client.get("/api/admin/submissions", params={"status": "WRONG_ANSWER"}, headers=admin_h).json()
    assert wrong["total"] == 1
    assert client.get("/api/admin/submissions", params={"language": "sql", "question_id": q["id"]},
                      headers=admin_h).json()["total"] == 2
    assert client.get("/api/admin/submissions", params={"status": "NOPE"}, headers=admin_h).status_code == 422

    detail = client.get(f"/api/admin/submissions/{listing['items'][0]['id']}", headers=admin_h).json()
    assert detail["code"] == GOOD and detail["result_detail"]["sql"]["correct"] is True
    assert client.get("/api/admin/submissions/999999", headers=admin_h).status_code == 404


def test_audit_log_records_content_changes(client, admin_h):
    q = create_q(client, admin_h, title="Audited")
    client.delete(f"/api/admin/questions/{q['id']}", headers=admin_h)
    log = client.get("/api/admin/audit-log", params={"entity_type": "question"}, headers=admin_h).json()
    assert [(e["action"], e["entity_id"]) for e in log["items"]] == [("DELETE", q["id"]), ("CREATE", q["id"])]
    assert client.get("/api/admin/audit-log", params={"action": "create"}, headers=admin_h).json()["total"] == 1


def test_category_overview(client, admin_h):
    create_q(client, admin_h, title="DSA easy", category="DSA", difficulty="EASY")
    create_q(client, admin_h, title="DSA hidden", category="DSA", difficulty="HARD", is_published=False)
    cats = {c["key"]: c for c in client.get("/api/admin/categories", headers=admin_h).json()}
    assert len(cats) == 8
    assert cats["DSA"]["total"] == 2 and cats["DSA"]["published"] == 1
    assert cats["DSA"]["by_difficulty"] == {"EASY": 1, "HARD": 1} and cats["DSA"]["by_type"] == {"MCQ": 2}
    assert cats["SQL"]["total"] == 0 and cats["SQL"]["label"] == "SQL"
