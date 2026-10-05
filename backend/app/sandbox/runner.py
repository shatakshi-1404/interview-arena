"""Code execution abstraction.

The API never executes user code. It talks to a CodeRunner, and the only runner shipped here is
`DisabledRunner`. A real runner must be a separate, isolated worker (see docs/sandbox-architecture.md)
and gets registered in _RUNNERS below.
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


_RUNNERS: dict[str, type] = {"disabled": DisabledRunner}


def get_code_runner() -> CodeRunner:
    cls = _RUNNERS.get(settings.CODE_RUNNER)
    if cls is None:
        raise RunnerUnavailable(f"Unknown CODE_RUNNER '{settings.CODE_RUNNER}'")
    return cls()
