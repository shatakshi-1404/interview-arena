from app.core.config import settings
from app.core.ratelimit import SlidingWindowLimiter
from tests.test_questions import create_q


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


# ----------------------------------------------------------------- the limiter
def test_blocks_after_the_limit_and_reports_when_to_retry():
    clock = FakeClock()
    lim = SlidingWindowLimiter(3, 60, clock)
    assert [lim.hit("a") for _ in range(3)] == [0, 0, 0]
    clock.t = 10
    assert lim.hit("a") == 50
    clock.t = 60
    assert lim.hit("a") == 0  # the window moved on


def test_blocked_requests_do_not_extend_the_block():
    clock = FakeClock()
    lim = SlidingWindowLimiter(3, 60, clock)
    for _ in range(3):
        lim.hit("a")
    clock.t = 30
    assert all(lim.hit("a") > 0 for _ in range(5))
    clock.t = 60
    assert lim.hit("a") == 0


def test_keys_are_independent_and_stale_keys_are_pruned():
    clock = FakeClock()
    lim = SlidingWindowLimiter(1, 60, clock)
    assert lim.hit("a") == 0 and lim.hit("b") == 0
    assert lim.hit("a") > 0
    assert lim.hit("b") > 0
    clock.t = 120
    lim.prune()
    assert lim.size() == 0


# ----------------------------------------------------------------------- API
def test_limits_are_off_by_default_in_tests(client):
    body = {"email": "nobody@example.com", "password": "wrong-pass1"}
    assert all(client.post("/api/auth/login", json=body).status_code == 401 for _ in range(15))


def test_login_is_limited_per_ip(client, make_user, monkeypatch):
    make_user()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    body = {"email": "ada@example.com", "password": "wrong-pass1"}
    assert all(client.post("/api/auth/login", json=body).status_code == 401 for _ in range(10))
    r = client.post("/api/auth/login", json=body)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1
    assert "Too many requests" in r.json()["detail"]
    # even correct credentials are held back while the window is full
    assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "Passw0rdXY"}).status_code == 429


def test_register_and_forgot_password_are_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    for i in range(10):
        r = client.post("/api/auth/register", json={"name": "User", "email": f"u{i}@example.com", "password": "Passw0rdXY"})
        assert r.status_code == 201
    assert client.post("/api/auth/register", json={"name": "User", "email": "u99@example.com", "password": "Passw0rdXY"}).status_code == 429
    for _ in range(5):
        assert client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"}).status_code == 202
    assert client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"}).status_code == 429


def test_run_is_limited_per_user(client, admin_h, user_h, make_user, monkeypatch):
    q = create_q(client, admin_h)  # MCQ: /run answers 422 immediately, which is cheap but still counts
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    url = f"/api/questions/{q['id']}/run"
    assert all(client.post(url, json={}, headers=user_h).status_code == 422 for _ in range(30))
    r = client.post(url, json={}, headers=user_h)
    assert r.status_code == 429 and "Retry-After" in r.headers

    from tests.conftest import auth_header
    other = auth_header(make_user(email="other@example.com")["tokens"]["access_token"])
    assert client.post(url, json={}, headers=other).status_code == 422  # another user is unaffected
