import base64
import json

import httpx
import pytest

from app.core.config import settings
from app.models.attempt import SubmissionStatus as S
from app.sandbox.judge0 import Judge0Runner
from app.sandbox.local import LocalPythonRunner
from app.sandbox.runner import CaseInput, DisabledRunner, RunnerUnavailable, get_code_runner, runner_enabled

b64 = lambda s: base64.b64encode(s.encode()).decode()  # noqa: E731
KW = dict(time_limit_ms=1500, memory_limit_mb=128)


def judge0_client(statuses, seen):
    """A fake Judge0: accepts a batch, then answers the poll with the given [(status_id, stdout, stderr, compile)]."""
    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        if req.method == "POST":
            n = len(json.loads(req.content)["submissions"])
            return httpx.Response(201, json=[{"token": f"t{i}"} for i in range(n)])
        subs = [
            {"token": f"t{i}", "status": {"id": sid}, "stdout": b64(out) if out is not None else None,
             "stderr": b64(err) if err else None, "compile_output": b64(comp) if comp else None,
             "time": "0.02", "memory": 900}
            for i, (sid, out, err, comp) in enumerate(statuses)
        ]
        return httpx.Response(200, json={"submissions": subs})

    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture
def j0(monkeypatch):
    monkeypatch.setattr(settings, "JUDGE0_URL", "https://judge.test")
    monkeypatch.setattr(settings, "JUDGE0_API_KEY", "k")
    monkeypatch.setattr(settings, "JUDGE0_API_HOST", "")


CASES = [CaseInput("1 2", "3", True), CaseInput("2 2", "4", False)]


def test_judge0_accepts_and_sends_base64_stdin_and_limits(j0):
    seen = []
    r = Judge0Runner(judge0_client([(3, "3\n", None, None), (3, "4  \n", None, None)], seen), poll_interval=0).run(
        language="python", code="print(1)", cases=CASES, **KW)
    assert r.status == S.ACCEPTED and [c.passed for c in r.cases] == [True, True] and r.runtime_ms == 20
    post = json.loads(seen[0].content)["submissions"][0]
    assert base64.b64decode(post["stdin"]).decode() == "1 2" and post["language_id"] == 71
    assert post["cpu_time_limit"] == 1.5 and post["memory_limit"] == 128 * 1024
    assert seen[0].headers["X-Auth-Token"] == "k"


def test_judge0_wrong_answer_and_runtime_and_tle_and_compile(j0):
    run = lambda st: Judge0Runner(judge0_client(st, []), poll_interval=0).run(  # noqa: E731
        language="python", code="x", cases=CASES, **KW)
    assert run([(3, "3", None, None), (3, "5", None, None)]).status == S.WRONG_ANSWER
    assert run([(3, "3", None, None), (11, "", "Traceback boom", None)]).status == S.RUNTIME_ERROR
    assert run([(3, "3", None, None), (5, None, None, None)]).status == S.TIME_LIMIT_EXCEEDED
    ce = run([(6, None, None, "Main.java:1: error"), (6, None, None, "Main.java:1: error")])
    assert ce.status == S.COMPILE_ERROR and "error" in ce.compile_error


def test_judge0_java_uses_java_id(j0):
    seen = []
    Judge0Runner(judge0_client([(3, "3", None, None)], seen), poll_interval=0).run(
        language="java", code="x", cases=CASES[:1], **KW)
    assert json.loads(seen[0].content)["submissions"][0]["language_id"] == 62


@pytest.mark.parametrize("code", [401, 429, 500])
def test_judge0_http_errors_are_503_not_500(j0, code):
    c = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(code, text="no")))
    with pytest.raises(RunnerUnavailable):
        Judge0Runner(c, poll_interval=0).run(language="python", code="x", cases=CASES, **KW)


def test_judge0_internal_error_and_network_failure_are_503(j0):
    with pytest.raises(RunnerUnavailable):
        Judge0Runner(judge0_client([(13, None, None, None)], []), poll_interval=0).run(
            language="python", code="x", cases=CASES[:1], **KW)

    def boom(req):
        raise httpx.ConnectError("down")

    with pytest.raises(RunnerUnavailable):
        Judge0Runner(httpx.Client(transport=httpx.MockTransport(boom)), poll_interval=0).run(
            language="python", code="x", cases=CASES, **KW)


def test_judge0_times_out_polling(j0, monkeypatch):
    monkeypatch.setattr(settings, "JUDGE0_TIMEOUT_SECONDS", 0)
    with pytest.raises(RunnerUnavailable):
        Judge0Runner(judge0_client([(2, None, None, None)], []), poll_interval=0).run(
            language="python", code="x", cases=CASES[:1], **KW)


def test_rapidapi_headers(j0, monkeypatch):
    monkeypatch.setattr(settings, "JUDGE0_API_HOST", "judge0-ce.p.rapidapi.com")
    seen = []
    Judge0Runner(judge0_client([(3, "3", None, None)], seen), poll_interval=0).run(
        language="python", code="x", cases=CASES[:1], **KW)
    assert seen[0].headers["X-RapidAPI-Host"] == "judge0-ce.p.rapidapi.com" and "X-Auth-Token" not in seen[0].headers


# --------------------------------------------------------------- local
ADD = "a, b = map(int, input().split())\nprint(a + b)\n"


def local(code, cases=CASES, **kw):
    return LocalPythonRunner().run(language="python", code=code, cases=cases, **{**KW, **kw})


def test_local_accepts_correct_solution():
    r = local(ADD)
    assert r.status == S.ACCEPTED and all(c.passed for c in r.cases)


def test_local_wrong_answer_shows_actual_output():
    r = local("print(0)")
    assert r.status == S.WRONG_ANSWER and r.cases[0].actual_output.strip() == "0"


def test_local_runtime_error_and_syntax_error():
    r = local("raise ValueError('boom')")
    assert r.status == S.RUNTIME_ERROR and "boom" in r.cases[0].error
    c = local("def (:\n")
    assert c.status == S.COMPILE_ERROR and c.compile_error


def test_local_time_limit():
    r = local("while True: pass", cases=CASES[:1], time_limit_ms=500)
    assert r.status == S.TIME_LIMIT_EXCEEDED


def test_local_huge_output_is_capped():
    r = local("print('x' * 10_000_000)", cases=CASES[:1])
    assert len(r.cases[0].actual_output or "") <= 2000 + 10


def test_local_rejects_java_and_refuses_in_production(monkeypatch):
    with pytest.raises(RunnerUnavailable):
        LocalPythonRunner().run(language="java", code="x", cases=CASES, **KW)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_UNSAFE_LOCAL_RUNNER", False)
    with pytest.raises(RunnerUnavailable):
        local(ADD)


# ------------------------------------------------------------ registry
def test_registry(monkeypatch):
    monkeypatch.setattr(settings, "CODE_RUNNER", "disabled")
    assert not runner_enabled() and isinstance(get_code_runner(), DisabledRunner)
    monkeypatch.setattr(settings, "CODE_RUNNER", "judge0")
    monkeypatch.setattr(settings, "JUDGE0_URL", "")
    assert not runner_enabled()
    with pytest.raises(RunnerUnavailable):
        get_code_runner()
    monkeypatch.setattr(settings, "JUDGE0_URL", "https://j")
    assert runner_enabled() and isinstance(get_code_runner(), Judge0Runner)
    monkeypatch.setattr(settings, "CODE_RUNNER", "local")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert runner_enabled() and isinstance(get_code_runner(), LocalPythonRunner)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert not runner_enabled()
