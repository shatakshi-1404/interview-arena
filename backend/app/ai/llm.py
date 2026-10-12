"""Provider-agnostic LLM client.

LLM_PROVIDER
  disabled            AI features are off (default). Everything else in the app keeps working.
  openai_compatible   Any server that speaks POST {LLM_BASE_URL}/chat/completions: OpenAI, Groq, Google Gemini's
                      OpenAI-compatible endpoint, OpenRouter, Ollama, vLLM ...
  anthropic           Anthropic's Messages API.

The client only moves text. Prompts, output validation and the answer-leak guard live in the services, so swapping
provider never changes behaviour.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Protocol

import httpx

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)
ANTHROPIC_VERSION = "2023-06-01"


class AiUnavailable(AppError):
    def __init__(self, detail: str = "AI features are not enabled on this server"):
        super().__init__(detail, 503)


class AiBadOutput(AppError):
    def __init__(self, detail: str = "The AI returned something unusable. Please try again."):
        super().__init__(detail, 502)


class LlmClient(Protocol):
    model: str

    def complete(self, *, system: str, user: str, max_tokens: int = 700, temperature: float = 0.3) -> str: ...


class DisabledLlm:
    model = "disabled"

    def complete(self, **_: Any) -> str:
        raise AiUnavailable()


def ai_enabled() -> bool:
    p = settings.LLM_PROVIDER
    if p == "openai_compatible":
        return bool(settings.LLM_MODEL and settings.LLM_BASE_URL)
    if p == "anthropic":
        return bool(settings.LLM_MODEL and settings.LLM_API_KEY)
    return False


def _fail(status: int, text: str) -> AiUnavailable:
    if status in (401, 403):
        logger.error("LLM provider rejected our credentials (HTTP %s)", status)
        return AiUnavailable("AI is not configured correctly on this server")
    if status == 429:
        return AiUnavailable("The AI provider is busy right now. Try again in a minute.")
    logger.error("LLM provider error HTTP %s: %s", status, text[:300])
    return AiUnavailable("The AI provider returned an error. Try again shortly.")


class _Http:
    def __init__(self, client: httpx.Client | None):
        self._client = client

    def post(self, url: str, headers: dict[str, str], body: dict) -> dict:
        own = self._client is None
        client = self._client or httpx.Client(timeout=settings.LLM_TIMEOUT_SECONDS)
        try:
            r = client.post(url, headers=headers, json=body)
        except httpx.HTTPError as e:
            logger.warning("LLM provider unreachable: %s", e)
            raise AiUnavailable("The AI provider is unreachable right now. Try again shortly.")
        finally:
            if own:
                client.close()
        if r.status_code >= 400:
            raise _fail(r.status_code, r.text)
        try:
            return r.json()
        except ValueError:
            raise AiBadOutput()


class OpenAICompatibleClient:
    def __init__(self, client: httpx.Client | None = None):
        self.model = settings.LLM_MODEL
        self._http = _Http(client)

    def complete(self, *, system: str, user: str, max_tokens: int = 700, temperature: float = 0.3) -> str:
        headers = {"Content-Type": "application/json"}
        if settings.LLM_API_KEY:
            headers["Authorization"] = f"Bearer {settings.LLM_API_KEY}"
        data = self._http.post(
            settings.LLM_BASE_URL.rstrip("/") + "/chat/completions",
            headers,
            {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
        )
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise AiBadOutput()
        if not isinstance(text, str) or not text.strip():
            raise AiBadOutput()
        return text


class AnthropicClient:
    def __init__(self, client: httpx.Client | None = None):
        self.model = settings.LLM_MODEL
        self._http = _Http(client)

    def complete(self, *, system: str, user: str, max_tokens: int = 700, temperature: float = 0.3) -> str:
        base = (settings.LLM_BASE_URL or "https://api.anthropic.com").rstrip("/")
        data = self._http.post(
            base + "/v1/messages",
            {
                "Content-Type": "application/json",
                "x-api-key": settings.LLM_API_KEY,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
        try:
            text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
        except (KeyError, TypeError, AttributeError):
            raise AiBadOutput()
        if not text.strip():
            raise AiBadOutput()
        return text


def get_llm() -> LlmClient:
    """FastAPI dependency. Tests override it with a fake."""
    if settings.LLM_PROVIDER == "disabled":
        return DisabledLlm()
    if not ai_enabled():
        raise AiUnavailable("AI is not configured correctly on this server")
    if settings.LLM_PROVIDER == "openai_compatible":
        return OpenAICompatibleClient()
    if settings.LLM_PROVIDER == "anthropic":
        return AnthropicClient()
    raise AiUnavailable(f"Unknown LLM_PROVIDER '{settings.LLM_PROVIDER}'")


# ------------------------------------------------------------- parsing
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)


def extract_json(text: str) -> dict:
    """Models wrap JSON in prose or code fences. Pull out the first object, or raise AiBadOutput."""
    t = _FENCE.sub("", text.strip())
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        raise AiBadOutput()
    try:
        obj = json.loads(t[start : end + 1])
    except ValueError:
        raise AiBadOutput()
    if not isinstance(obj, dict):
        raise AiBadOutput()
    return obj
