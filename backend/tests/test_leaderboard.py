from datetime import UTC, datetime, timedelta

import pytest

from app.services.engagement_service import period_bounds, public_name, rank_rows
from tests.conftest import auth_header
from tests.test_progress_api import add_metric
from tests.test_questions import create_q


def h(data):
    return auth_header(data["tokens"]["access_token"])


# ------------------------------------------------------------ pure helpers
def test_period_bounds():
    thu = datetime(2026, 10, 1, 12, 30, tzinfo=UTC)
    assert period_bounds("weekly", thu) == (datetime(2026, 9, 28, tzinfo=UTC), datetime(2026, 10, 5, tzinfo=UTC))
    assert period_bounds("monthly", thu) == (datetime(2026, 10, 1, tzinfo=UTC), datetime(2026, 11, 1, tzinfo=UTC))
    dec = datetime(2026, 12, 15, tzinfo=UTC)
    assert period_bounds("monthly", dec)[1] == datetime(2027, 1, 1, tzinfo=UTC)
    monday = datetime(2026, 9, 28, 0, 0, 1, tzinfo=UTC)
    assert period_bounds("weekly", monday)[0] == datetime(2026, 9, 28, tzinfo=UTC)


def test_public_names_never_expose_full_names():
    assert public_name("Ada Lovelace") == "Ada L."
    assert public_name("  grace   brewster   hopper ") == "grace H."
    assert public_name("Madonna") == "Madonna"
    assert public_name("   ") == "Anonymous"


def test_ties_share_a_rank():
    rows = [
        {"user_id": 3, "name": "c", "problems": 2, "points": 30, "accuracy": 50.0},
        {"user_id": 1, "name": "a", "problems": 3, "points": 60, "accuracy": 80.0},
        {"user_id": 2, "name": "b", "problems": 2, "points": 30, "accuracy": 100.0},
        {"user_id": 4, "name": "d", "problems": 1, "points": 10, "accuracy": None},
    ]
    ranked = rank_rows(rows)
    assert [(r["user_id"], r["rank"]) for r in ranked] == [(1, 1), (2, 2), (3, 2), (4, 4)]


# --------------------------------------------------------------------- API
def test_requires_auth_and_valid_period(client, user_h):
    assert client.get("/api/leaderboard").status_code == 401
    assert client.get("/api/leaderboard", params={"period": "daily"}, headers=user_h).status_code == 422
    assert client.get("/api/leaderboard", params={"limit": 0}, headers=user_h).status_code == 422


def test_ranking_points_and_privacy(client, admin_h, make_user):
    ada = make_user(email="ada@example.com", name="Ada Lovelace")
    grace = make_user(email="grace@example.com", name="Grace Hopper")
    linus = make_user(email="linus@example.com", name="Linus Torvalds")
    easy = create_q(client, admin_h, title="Easy one", difficulty="EASY")
    medium = create_q(client, admin_h, title="Medium one", difficulty="MEDIUM")
    hard = create_q(client, admin_h, title="Hard one", difficulty="HARD")
    now = datetime.now(UTC)

    for q in (easy, medium, hard):
        add_metric(ada["user"]["id"], q, correct=True, when=now)
    add_metric(ada["user"]["id"], easy, correct=False, when=now)
    add_metric(ada["user"]["id"], easy, correct=True, when=now)  # a repeat earns nothing
    for q in (easy, medium):
        add_metric(grace["user"]["id"], q, correct=True, when=now)
    for q in (easy, medium, hard):
        add_metric(linus["user"]["id"], q, correct=True, when=now)
    assert client.patch("/api/users/me", json={"show_on_leaderboard": False}, headers=h(linus)).status_code == 200

    for period in ("weekly", "monthly"):
        r = client.get("/api/leaderboard", params={"period": period}, headers=h(ada))
        body = r.json()
        assert [(e["rank"], e["name"], e["points"], e["problems"], e["accuracy"]) for e in body["entries"]] == [
            (1, "Ada L.", 60, 3, 80.0), (2, "Grace H.", 30, 2, 100.0)]
        assert body["participants"] == 2 and body["opted_in"] is True
        assert body["me"]["rank"] == 1 and body["me"]["is_you"] is True
        assert "Linus" not in r.text and "@" not in r.text and "user_id" not in r.text

    grace_view = client.get("/api/leaderboard", headers=h(grace)).json()
    assert [e["is_you"] for e in grace_view["entries"]] == [False, True] and grace_view["me"]["rank"] == 2

    linus_view = client.get("/api/leaderboard", headers=h(linus)).json()
    assert linus_view["opted_in"] is False and linus_view["me"] is None and linus_view["participants"] == 2

    assert client.patch("/api/users/me", json={"show_on_leaderboard": True}, headers=h(linus)).status_code == 200
    assert client.get("/api/leaderboard", headers=h(ada)).json()["participants"] == 3


def test_resolving_an_old_question_does_not_farm_points(client, admin_h, make_user):
    dan = make_user(email="dan@example.com", name="Dan Farmer")
    q = create_q(client, admin_h, title="Old one")
    add_metric(dan["user"]["id"], q, correct=True, when=datetime.now(UTC) - timedelta(days=40))
    add_metric(dan["user"]["id"], q, correct=True, when=datetime.now(UTC))
    for period in ("weekly", "monthly"):
        body = client.get("/api/leaderboard", params={"period": period}, headers=h(dan)).json()
        assert body["entries"] == [] and body["me"] is None


def test_limit_keeps_my_row(client, admin_h, make_user):
    q = create_q(client, admin_h, title="Shared one")
    users = [make_user(email=f"u{i}@example.com", name=f"User {i}") for i in range(3)]
    for i, u in enumerate(users):
        for k in range(3 - i):  # u0 solves 3 questions, u1 2, u2 1
            add_metric(u["user"]["id"], create_q(client, admin_h, title=f"Q {i}-{k}"), correct=True,
                       when=datetime.now(UTC))
    body = client.get("/api/leaderboard", params={"limit": 1}, headers=h(users[2])).json()
    assert len(body["entries"]) == 1 and body["participants"] == 3 and body["me"]["rank"] == 3


def test_profile_update(client, user_h):
    r = client.patch("/api/users/me", json={"name": "  Ada Byron  "}, headers=user_h)
    assert r.status_code == 200 and r.json()["name"] == "Ada Byron"
    assert client.get("/api/auth/me", headers=user_h).json()["name"] == "Ada Byron"
    assert client.patch("/api/users/me", json={"name": "A"}, headers=user_h).status_code == 422
    assert client.patch("/api/users/me", json={}, headers=user_h).status_code == 200
    assert client.patch("/api/users/me", json={"name": "Valid Name"}).status_code == 401
