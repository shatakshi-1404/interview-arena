from app.models.attempt import SubmissionStatus
from app.sandbox.runner import CaseOutcome, RunResult, get_code_runner
from app.main import app
from tests.test_questions import create_q, mcq_payload

CODING = dict(
    title="Max subarray",
    question_type="CODING",
    options=[],
    starter_code={"python": "print(0)"},
    test_cases=[
        {"input_data": "SAMPLE_IN", "expected_output": "1", "is_sample": True},
        {"input_data": "HIDDEN_INPUT_42", "expected_output": "HIDDEN_OUTPUT_42", "is_sample": False},
        {"input_data": "HIDDEN_INPUT_43", "expected_output": "HIDDEN_OUTPUT_43", "is_sample": False},
    ],
)


class ScriptedRunner:
    """Test double. NOT an executor: it returns whatever pass/fail pattern the test scripts."""

    def __init__(self, passes):
        self.passes = passes
        self.calls = []

    def run(self, *, language, code, cases, time_limit_ms, memory_limit_mb):
        self.calls.append(list(cases))
        outcomes = [CaseOutcome(passed=p, actual_output="out", runtime_ms=3) for p in self.passes[: len(cases)]]
        status = SubmissionStatus.ACCEPTED if all(o.passed for o in outcomes) else SubmissionStatus.WRONG_ANSWER
        return RunResult(status=status, cases=outcomes, runtime_ms=7)


def test_default_runner_is_disabled_and_nothing_is_stored(client, admin_h, user_h):
    q = create_q(client, admin_h, **CODING)
    r = client.post(f"/api/questions/{q['id']}/submit", json={"code": "print(1)", "language": "python"}, headers=user_h)
    assert r.status_code == 503 and "not enabled" in r.json()["detail"]
    assert client.get("/api/questions", headers=user_h).json()["items"][0]["user_status"] is None


def test_submit_partial_credit_and_hidden_cases_stay_hidden(client, admin_h, user_h):
    q = create_q(client, admin_h, **CODING)
    app.dependency_overrides[get_code_runner] = lambda: ScriptedRunner([True, False, True])
    r = client.post(f"/api/questions/{q['id']}/submit", json={"code": "x", "language": "python"}, headers=user_h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_correct"] is False and body["status"] == "WRONG_ANSWER"
    assert abs(body["score"] - 2 / 3) < 1e-9
    assert body["run"]["code"]["passed"] == 2 and body["run"]["code"]["total"] == 3
    assert "HIDDEN_INPUT_42" not in r.text and "HIDDEN_OUTPUT_42" not in r.text
    assert body["run"]["code"]["cases"][0]["input_data"] == "SAMPLE_IN"  # samples are shown


def test_run_executes_sample_cases_only(client, admin_h, user_h):
    q = create_q(client, admin_h, **CODING)
    runner = ScriptedRunner([True])
    app.dependency_overrides[get_code_runner] = lambda: runner
    r = client.post(f"/api/questions/{q['id']}/run", json={"code": "x", "language": "python"}, headers=user_h)
    assert r.status_code == 200 and len(runner.calls[-1]) == 1


def test_all_passed_is_correct(client, admin_h, user_h):
    q = create_q(client, admin_h, **CODING)
    app.dependency_overrides[get_code_runner] = lambda: ScriptedRunner([True, True, True])
    body = client.post(
        f"/api/questions/{q['id']}/submit", json={"code": "x", "language": "python"}, headers=user_h
    ).json()
    assert body["is_correct"] is True and body["score"] == 1.0


def test_language_is_validated(client, admin_h, user_h):
    q = create_q(client, admin_h, **CODING)
    r = client.post(f"/api/questions/{q['id']}/submit", json={"code": "x", "language": "cobol"}, headers=user_h)
    assert r.status_code == 422
