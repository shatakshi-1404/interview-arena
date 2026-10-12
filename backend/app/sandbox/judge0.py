"""Judge0 runner: executes code on a Judge0 service instead of in this process.

Works with the public Judge0 CE API, RapidAPI's Judge0 CE, or your own Judge0 container. Each test case becomes one
submission; they are sent as a batch and polled until finished. Judge0 sandboxes the code (isolate); this class only
translates between our CaseInput/RunResult types and Judge0's JSON.
"""
import base64
import logging
import time

import httpx

from app.core.config import settings
from app.models.attempt import SubmissionStatus
from app.sandbox.runner import CaseInput, CaseOutcome, RunnerUnavailable, RunResult, normalize_output

logger = logging.getLogger(__name__)

BATCH_SIZE = 20  # Judge0's default maximum per batch
# Judge0 status ids: 1 queued, 2 processing, 3 accepted, 4 wrong answer, 5 time limit, 6 compile error,
# 7-12 runtime errors, 13 internal error, 14 exec format error.
FIELDS = "token,stdout,stderr,compile_output,message,status,time,memory"


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _unb64(value: str | None) -> str:
    if not value:
        return ""
    try:
        return base64.b64decode(value).decode(errors="replace")
    except ValueError:
        return ""


class Judge0Runner:
    def __init__(self, client: httpx.Client | None = None, poll_interval: float = 0.6):
        self._client = client
        self._poll = poll_interval

    # ------------------------------------------------------------ http
    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if settings.JUDGE0_API_HOST:  # RapidAPI
            h["X-RapidAPI-Key"] = settings.JUDGE0_API_KEY
            h["X-RapidAPI-Host"] = settings.JUDGE0_API_HOST
        elif settings.JUDGE0_API_KEY:  # self-hosted with AUTHN_TOKEN
            h["X-Auth-Token"] = settings.JUDGE0_API_KEY
        return h

    def _request(self, client: httpx.Client, method: str, path: str, **kw) -> httpx.Response:
        url = settings.JUDGE0_URL.rstrip("/") + path
        try:
            r = client.request(method, url, headers=self._headers(), **kw)
        except httpx.HTTPError as e:
            logger.warning("Judge0 unreachable: %s", e)
            raise RunnerUnavailable("The code execution service is unreachable right now. Try again shortly.")
        if r.status_code == 429:
            raise RunnerUnavailable("The code execution service is busy. Try again in a moment.")
        if r.status_code in (401, 403):
            logger.error("Judge0 rejected our credentials (HTTP %s)", r.status_code)
            raise RunnerUnavailable("Code execution is not configured correctly on this server")
        if r.status_code >= 400:
            logger.error("Judge0 error HTTP %s: %s", r.status_code, r.text[:300])
            raise RunnerUnavailable("The code execution service returned an error. Try again shortly.")
        return r

    # ------------------------------------------------------------- run
    def run(
        self, *, language: str, code: str, cases: list[CaseInput], time_limit_ms: int, memory_limit_mb: int
    ) -> RunResult:
        if language == "python":
            lang_id, cpu = settings.JUDGE0_PYTHON_ID, time_limit_ms / 1000
        elif language == "java":
            lang_id, cpu = settings.JUDGE0_JAVA_ID, time_limit_ms / 1000 * 2  # JVM start-up is slow
        else:
            raise RunnerUnavailable(f"Language '{language}' is not supported")
        if not cases:
            return RunResult(status=SubmissionStatus.ACCEPTED, cases=[])

        payloads = []
        for c in cases:
            p = {
                "source_code": _b64(code),
                "language_id": lang_id,
                "cpu_time_limit": cpu,
                "wall_time_limit": min(cpu * 3, 20),
                "memory_limit": memory_limit_mb * 1024,
            }
            if c.input_data:
                p["stdin"] = _b64(c.input_data)
            payloads.append(p)

        own = self._client is None
        client = self._client or httpx.Client(timeout=15)
        try:
            results: list[dict] = []
            deadline = time.monotonic() + settings.JUDGE0_TIMEOUT_SECONDS
            for start in range(0, len(payloads), BATCH_SIZE):
                results += self._run_batch(client, payloads[start : start + BATCH_SIZE], deadline)
        finally:
            if own:
                client.close()
        return self._to_result(results, cases)

    def _run_batch(self, client: httpx.Client, payloads: list[dict], deadline: float) -> list[dict]:
        created = self._request(
            client, "POST", "/submissions/batch", params={"base64_encoded": "true"}, json={"submissions": payloads}
        ).json()
        tokens = [item.get("token") for item in created]
        if len(tokens) != len(payloads) or not all(tokens):
            raise RunnerUnavailable("The code execution service rejected the submission.")
        while True:
            got = self._request(
                client,
                "GET",
                "/submissions/batch",
                params={"tokens": ",".join(tokens), "base64_encoded": "true", "fields": FIELDS},
            ).json()
            subs = got.get("submissions", [])
            if len(subs) == len(tokens) and all((s.get("status") or {}).get("id", 1) >= 3 for s in subs):
                by_token = {s["token"]: s for s in subs}
                return [by_token[t] for t in tokens]
            if time.monotonic() > deadline:
                raise RunnerUnavailable("The code execution service took too long. Try again shortly.")
            time.sleep(self._poll)

    # --------------------------------------------------------- results
    def _to_result(self, results: list[dict], cases: list[CaseInput]) -> RunResult:
        outcomes: list[CaseOutcome] = []
        compile_error: str | None = None
        saw_tle = saw_runtime = False
        max_ms: int | None = None
        max_kb: int | None = None
        for sub, case in zip(results, cases):
            sid = (sub.get("status") or {}).get("id", 13)
            stdout = _unb64(sub.get("stdout"))
            stderr = _unb64(sub.get("stderr"))
            ms = int(float(sub["time"]) * 1000) if sub.get("time") not in (None, "") else None
            if ms is not None:
                max_ms = max(max_ms or 0, ms)
            if sub.get("memory") is not None:
                max_kb = max(max_kb or 0, int(sub["memory"]))
            if sid in (13, 14):
                logger.error("Judge0 internal error: %s", _unb64(sub.get("message")) or sub.get("status"))
                raise RunnerUnavailable("The code execution service had an internal error. Try again shortly.")
            if sid == 6:
                compile_error = (_unb64(sub.get("compile_output")) or "Compilation failed")[:2000]
                outcomes.append(CaseOutcome(passed=False, error="Compilation failed", runtime_ms=ms))
            elif sid == 5:
                saw_tle = True
                outcomes.append(CaseOutcome(passed=False, error="Time limit exceeded", runtime_ms=ms))
            elif sid >= 7:
                saw_runtime = True
                err = (stderr or _unb64(sub.get("message")) or "Runtime error").strip()
                outcomes.append(CaseOutcome(passed=False, actual_output=stdout[:2000], error=err[-1000:], runtime_ms=ms))
            else:  # 3 accepted (we send no expected_output, so this means "ran to completion") or 4
                passed = normalize_output(stdout) == normalize_output(case.expected_output)
                outcomes.append(CaseOutcome(passed=passed, actual_output=stdout[:2000], runtime_ms=ms))

        if compile_error:
            status = SubmissionStatus.COMPILE_ERROR
        elif all(o.passed for o in outcomes):
            status = SubmissionStatus.ACCEPTED
        elif saw_tle:
            status = SubmissionStatus.TIME_LIMIT_EXCEEDED
        elif saw_runtime:
            status = SubmissionStatus.RUNTIME_ERROR
        else:
            status = SubmissionStatus.WRONG_ANSWER
        return RunResult(status=status, cases=outcomes, runtime_ms=max_ms, memory_kb=max_kb, compile_error=compile_error)
