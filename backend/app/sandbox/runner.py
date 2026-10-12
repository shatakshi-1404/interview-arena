"""Code execution abstraction.

The API process never runs user code itself in production. It talks to a CodeRunner:

  disabled  coding questions can be read but not run (default)
  judge0    a Judge0 service (hosted, or your own container): the recommended runner for any public deployment
  local     Python only, a subprocess with resource limits. DEVELOPMENT ONLY: it shares the API's container and
            user, so it refuses to run when ENVIRONMENT=production unless ALLOW_UNSAFE_LOCAL_RUNNER=true.
"""
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import settings
from app.core.errors import AppError
from app.models.attempt import SubmissionStatus

ALLOWED_LANGUAGES = {"python", "java"}
DEFAULT_TIME_LIMIT_MS = 2000
DEFAULT_MEMORY_LIMIT_MB = 256


class RunnerUnavailable(AppError):
    def __init__(self, detail: str = "Code execution is not enabled on this server"):
        super().__init__(detail, 503)


@dataclass(frozen=True)
class CaseInput:
    input_data: str  # fed to stdin
    expected_output: str  # compared with stdout
    is_sample: bool


@dataclass
class CaseOutcome:
    passed: bool
    actual_output: str | None = None
    error: str | None = None
    runtime_ms: int | None = None


@dataclass
class RunResult:
    status: SubmissionStatus
    cases: list[CaseOutcome] = field(default_factory=list)
    runtime_ms: int | None = None
    memory_kb: int | None = None
    compile_error: str | None = None


class CodeRunner(Protocol):
    def run(
        self,
        *,
        language: str,
        code: str,
        cases: list[CaseInput],
        time_limit_ms: int,
        memory_limit_mb: int,
    ) -> RunResult: ...


def normalize_output(text: str) -> str:
    """Comparison rule a real runner should apply: ignore trailing whitespace per line and at the end."""
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


class DisabledRunner:
    def run(self, **_) -> RunResult:
        raise RunnerUnavailable()


def runner_enabled() -> bool:
    """True when coding questions can actually be run and graded on this server."""
    name = settings.CODE_RUNNER
    if name == "judge0":
        return bool(settings.JUDGE0_URL)
    if name == "local":
        return settings.ENVIRONMENT != "production" or settings.ALLOW_UNSAFE_LOCAL_RUNNER
    return False


def get_code_runner() -> CodeRunner:
    name = settings.CODE_RUNNER
    if name == "disabled":
        return DisabledRunner()
    if not runner_enabled():
        raise RunnerUnavailable("Code execution is not configured correctly on this server")
    if name == "judge0":
        from app.sandbox.judge0 import Judge0Runner

        return Judge0Runner()
    if name == "local":
        from app.sandbox.local import LocalPythonRunner

        return LocalPythonRunner()
    raise RunnerUnavailable(f"Unknown CODE_RUNNER '{name}'")
