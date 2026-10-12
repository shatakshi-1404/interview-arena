from sqlalchemy.exc import OperationalError

from app.core.database import get_db
from app.main import app


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_ready_checks_the_database(client):
    assert client.get("/api/ready").json() == {"status": "ok"}


def test_ready_reports_503_when_the_database_is_down(client):
    class Broken:
        def execute(self, *_):
            raise OperationalError("SELECT 1", {}, Exception("database is down"))

    app.dependency_overrides[get_db] = lambda: Broken()
    r = client.get("/api/ready")
    assert r.status_code == 503 and r.json() == {"status": "unavailable"}
