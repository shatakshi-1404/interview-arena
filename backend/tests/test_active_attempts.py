import pytest
from sqlalchemy.exc import IntegrityError

from app.models.attempt import Attempt, AttemptMode, AttemptStatus
from app.repositories.assessment_repository import AssessmentRepository
from tests.conftest import TestSession
from tests.test_assessments import create_assessment, start
from tests.test_questions import create_q


def _uid(client, h):
    return client.get("/api/auth/me", headers=h).json()["id"]


def test_database_allows_one_active_attempt_per_assessment(client, admin_h, user_h):
    a = create_assessment(client, admin_h, [(create_q(client, admin_h), 1)])
    start(client, user_h, a)
    with TestSession() as db:
        db.add(Attempt(user_id=_uid(client, user_h), assessment_id=a["id"], mode=AttemptMode.ASSESSMENT, status=AttemptStatus.IN_PROGRESS))
        with pytest.raises(IntegrityError):
            db.commit()


def test_database_allows_one_active_mock_per_user(client, user_h):
    uid = _uid(client, user_h)
    with TestSession() as db:
        db.add(Attempt(user_id=uid, mode=AttemptMode.MOCK_INTERVIEW, status=AttemptStatus.IN_PROGRESS))
        db.commit()
    with TestSession() as db:
        db.add(Attempt(user_id=uid, mode=AttemptMode.MOCK_INTERVIEW, status=AttemptStatus.IN_PROGRESS))
        with pytest.raises(IntegrityError):
            db.commit()


def test_finished_attempts_do_not_count(client, admin_h, user_h):
    a = create_assessment(client, admin_h, [(create_q(client, admin_h), 1)])
    first = start(client, user_h, a)["attempt_id"]
    client.post(f"/api/attempts/{first}/submit", headers=user_h)
    assert start(client, user_h, a)["attempt_id"] != first


def test_start_survives_losing_a_race(client, admin_h, user_h, monkeypatch):
    a = create_assessment(client, admin_h, [(create_q(client, admin_h), 1)])
    first = start(client, user_h, a)["attempt_id"]

    real = AssessmentRepository.in_progress_attempt
    calls = {"n": 0}

    def flaky(self, user_id, assessment_id):  # the first lookup "misses" the attempt another request just created
        calls["n"] += 1
        return None if calls["n"] == 1 else real(self, user_id, assessment_id)

    monkeypatch.setattr(AssessmentRepository, "in_progress_attempt", flaky)
    again = client.post(f"/api/assessments/{a['id']}/start", headers=user_h)
    assert again.status_code == 200 and again.json()["attempt_id"] == first
