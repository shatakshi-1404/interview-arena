import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Point the app at the test DB *before* the app is imported.
_test_url = os.environ.get("TEST_DATABASE_URL")
if not _test_url:
    raise RuntimeError("Set TEST_DATABASE_URL to run tests")
os.environ["DATABASE_URL"] = _test_url
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")  # individual tests switch it on when they test limits
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod-0123456789")

from app.core.database import get_db  # noqa: E402
from app.core.email import get_email_sender  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

engine = create_engine(_test_url)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class CapturingEmailSender:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send_password_reset(self, to_email: str, reset_url: str) -> None:
        self.sent.append((to_email, reset_url))


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def email_sender():
    return CapturingEmailSender()


@pytest.fixture
def client(email_sender):
    def override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_email_sender] = lambda: email_sender
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(client):
    def _make(email="ada@example.com", name="Ada Lovelace", password="Passw0rdXY"):
        r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        assert r.status_code == 201, r.text
        return r.json()

    return _make


@pytest.fixture
def make_admin(make_user):
    from app.models.user import Role, User

    def _make(email="admin@example.com"):
        data = make_user(email=email, name="Admin")
        with TestSession() as db:
            u = db.query(User).filter_by(email=email).one()
            u.role = Role.ADMIN
            db.commit()
        return data

    return _make


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_h(make_admin):
    return auth_header(make_admin()["tokens"]["access_token"])


@pytest.fixture
def user_h(make_user):
    return auth_header(make_user()["tokens"]["access_token"])
