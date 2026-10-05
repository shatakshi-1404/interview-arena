from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    FRONTEND_URL: str = "http://localhost:5173"

    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    CODE_RUNNER: str = "disabled"
    ML_ENABLED: bool = True
    RATE_LIMIT_ENABLED: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
