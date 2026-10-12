import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # No defaults for secrets: the app refuses to start without them.
    DATABASE_URL: str
    JWT_SECRET: str
    TEST_DATABASE_URL: str | None = None

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7
    RESET_TOKEN_MINUTES: int = 30

    ENVIRONMENT: str = "development"
    # JSON list or comma-separated: '["https://a.vercel.app"]' or 'https://a.vercel.app,https://b.com'
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    FRONTEND_URL: str = "http://localhost:5173"

    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    ML_ENABLED: bool = True
    RATE_LIMIT_ENABLED: bool = True

    # ---- code execution: "disabled" | "judge0" | "local" (local = Python only, development only)
    CODE_RUNNER: str = "disabled"
    ALLOW_UNSAFE_LOCAL_RUNNER: bool = False  # the local runner refuses to run when ENVIRONMENT=production
    JUDGE0_URL: str = ""  # e.g. https://ce.judge0.com, https://judge0-ce.p.rapidapi.com, or your own instance
    JUDGE0_API_KEY: str = ""  # RapidAPI key, or the X-Auth-Token of a self-hosted instance
    JUDGE0_API_HOST: str = ""  # set only for RapidAPI, e.g. judge0-ce.p.rapidapi.com
    JUDGE0_PYTHON_ID: int = 71
    JUDGE0_JAVA_ID: int = 62
    JUDGE0_TIMEOUT_SECONDS: int = 30

    # ---- generative AI (all optional; the app is fully usable with LLM_PROVIDER=disabled)
    LLM_PROVIDER: str = "disabled"  # "disabled" | "openai_compatible" | "anthropic"
    LLM_BASE_URL: str = ""  # openai_compatible: e.g. https://api.groq.com/openai/v1 or http://localhost:11434/v1
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""
    LLM_TIMEOUT_SECONDS: int = 40
    AI_DAILY_LIMIT_PER_USER: int = 30  # hints + feedback requests per user per rolling 24 hours

    @field_validator("DATABASE_URL", "TEST_DATABASE_URL", mode="after")
    @classmethod
    def _driver(cls, v: str | None) -> str | None:
        """Hosts such as Render hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg driver."""
        if not v:
            return v
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
