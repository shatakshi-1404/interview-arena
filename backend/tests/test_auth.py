from tests.conftest import auth_header


def test_register_and_me(client, make_user):
    data = make_user()
    assert data["user"]["role"] == "USER"
    assert "password" not in data["user"] and "password_hash" not in data["user"]
    r = client.get("/api/auth/me", headers=auth_header(data["tokens"]["access_token"]))
    assert r.status_code == 200
    assert r.json()["email"] == "ada@example.com"


def test_duplicate_email_rejected(client, make_user):
    make_user()
    r = client.post(
        "/api/auth/register",
        json={"name": "Other", "email": "ADA@example.com", "password": "Passw0rdXY"},
    )
    assert r.status_code == 409


def test_weak_password_rejected(client):
    r = client.post(
        "/api/auth/register", json={"name": "Bob", "email": "bob@example.com", "password": "alllettersonly"}
    )
    assert r.status_code == 422


def test_login_success_and_failure(client, make_user):
    make_user()
    ok = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "Passw0rdXY"})
    assert ok.status_code == 200
    bad = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-pass1"})
    assert bad.status_code == 401
    missing = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "Passw0rdXY"})
    assert missing.status_code == 401
    assert bad.json()["detail"] == missing.json()["detail"]  # no user enumeration


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth_header("garbage")).status_code == 401


def test_refresh_rotates_and_detects_reuse(client, make_user):
    tokens = make_user()["tokens"]
    r1 = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r1.status_code == 200
    new_refresh = r1.json()["refresh_token"]
    # replaying the old token fails and revokes the whole family
    replay = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401
    after = client.post("/api/auth/refresh", json={"refresh_token": new_refresh})
    assert after.status_code == 401


def test_access_token_cannot_be_used_as_refresh(client, make_user):
    tokens = make_user()["tokens"]
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401


def test_logout_revokes_refresh_token(client, make_user):
    tokens = make_user()["tokens"]
    assert client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 200
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_password_reset_flow(client, make_user, email_sender):
    make_user()
    r = client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})
    assert r.status_code == 202
    assert len(email_sender.sent) == 1
    token = email_sender.sent[0][1].split("token=")[1]

    ok = client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPassw0rd9"})
    assert ok.status_code == 200
    assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "NewPassw0rd9"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "Passw0rdXY"}).status_code == 401
    # the same reset link cannot be used twice
    again = client.post("/api/auth/reset-password", json={"token": token, "new_password": "Another1Pass"})
    assert again.status_code == 401


def test_forgot_password_unknown_email_is_silent(client, email_sender):
    r = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 202
    assert email_sender.sent == []


def test_admin_route_forbidden_for_user(client, make_user):
    tokens = make_user()["tokens"]
    r = client.get("/api/admin/questions", headers=auth_header(tokens["access_token"]))
    assert r.status_code == 403


def test_admin_route_requires_auth(client):
    assert client.get("/api/admin/questions").status_code == 401


def test_admin_route_allowed_for_admin(client, make_admin):
    tokens = make_admin()["tokens"]
    r = client.get("/api/admin/questions", headers=auth_header(tokens["access_token"]))
    assert r.status_code == 200
    assert r.json()["total"] == 0
