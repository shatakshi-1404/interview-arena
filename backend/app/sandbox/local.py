"""Local Python runner for DEVELOPMENT ONLY.

Runs each test case as a separate `python -I` subprocess with CPU, memory, file-size and wall-clock limits and a
scrubbed environment. It is NOT a security boundary: the child runs as the same OS user in the same container as the
API, so it can read that process's files and make network calls. get_code_runner() therefore refuses to use it when
ENVIRONMENT=production unless ALLOW_UNSAFE_LOCAL_RUNNER=true. For anything public, use CODE_RUNNER=judge0.
"""
import os
import resource
import signal
import subprocess
import sys
import tempfile
import time

from app.core.config import settings
from app.models.attempt import SubmissionStatus
from app.sandbox.runner import CaseInput, CaseOutcome, RunnerUnavailable, RunResult, normalize_output

MAX_OUTPUT_BYTES = 64 * 1024
MAX_CODE_CHARS = 20_000


def _limits(cpu_seconds: int, memory_mb: int):
    def apply() -> None:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (memory_mb * 1024 * 1024, memory_mb * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES * 4, MAX_OUTPUT_BYTES * 4))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    return apply


def _read(path: str) -> str:
    with open(path, "rb") as f:
        return f.read(MAX_OUTPUT_BYTES).decode(errors="replace")


class LocalPythonRunner:
    def run(
        self, *, language: str, code: str, cases: list[CaseInput], time_limit_ms: int, memory_limit_mb: int
    ) -> RunResult:
        if settings.ENVIRONMENT == "production" and not settings.ALLOW_UNSAFE_LOCAL_RUNNER:
            raise RunnerUnavailable("The local code runner is disabled in production")
        if language != "python":
            raise RunnerUnavailable("The local runner supports Python only. Use CODE_RUNNER=judge0 for Java.")
        if len(code) > MAX_CODE_CHARS:
            return RunResult(status=SubmissionStatus.COMPILE_ERROR, compile_error="Code is too long")
        try:
            compile(code, "main.py", "exec")
        except SyntaxError as e:
            return RunResult(
                status=SubmissionStatus.COMPILE_ERROR, compile_error=f"Line {e.lineno}: {e.msg}"[:500]
            )

        wall = time_limit_ms / 1000
        cpu = max(1, int(wall) + 1)
        outcomes: list[CaseOutcome] = []
        saw_tle = saw_runtime = False
        max_ms = 0
        with tempfile.TemporaryDirectory(prefix="ia_run_") as d:
            script = os.path.join(d, "main.py")
            with open(script, "w") as f:
                f.write(code)
            for i, case in enumerate(cases):
                out_path, err_path = os.path.join(d, f"out{i}"), os.path.join(d, f"err{i}")
                start = time.perf_counter()
                timed_out = False
                with open(out_path, "wb") as fo, open(err_path, "wb") as fe:
                    proc = subprocess.Popen(
                        [sys.executable, "-I", "-B", script],
                        stdin=subprocess.PIPE,
                        stdout=fo,
                        stderr=fe,
                        cwd=d,
                        env={"PATH": "/usr/bin:/bin", "PYTHONIOENCODING": "utf-8", "LANG": "C.UTF-8"},
                        preexec_fn=_limits(cpu, memory_limit_mb),
                        start_new_session=True,
                    )
                    try:
                        proc.communicate(case.input_data.encode(), timeout=wall)
                    except subprocess.TimeoutExpired:
                        timed_out = True
                        try:
                            os.killpg(proc.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        proc.wait()
                    except BrokenPipeError:
                        proc.wait()
                ms = int((time.perf_counter() - start) * 1000)
                max_ms = max(max_ms, ms)
                stdout, stderr = _read(out_path), _read(err_path)
                if timed_out or proc.returncode in (-signal.SIGXCPU, -signal.SIGKILL):
                    saw_tle = True
                    outcomes.append(CaseOutcome(passed=False, error="Time limit exceeded", runtime_ms=ms))
                elif proc.returncode != 0:
                    saw_runtime = True
                    outcomes.append(
                        CaseOutcome(passed=False, actual_output=stdout[:2000], error=stderr.strip()[-1000:] or "Runtime error", runtime_ms=ms)
                    )
                else:
                    ok = normalize_output(stdout) == normalize_output(case.expected_output)
                    outcomes.append(CaseOutcome(passed=ok, actual_output=stdout[:2000], runtime_ms=ms))
        if all(o.passed for o in outcomes):
            status = SubmissionStatus.ACCEPTED
        elif saw_tle:
            status = SubmissionStatus.TIME_LIMIT_EXCEEDED
        elif saw_runtime:
            status = SubmissionStatus.RUNTIME_ERROR
        else:
            status = SubmissionStatus.WRONG_ANSWER
        return RunResult(status=status, cases=outcomes, runtime_ms=max_ms)
