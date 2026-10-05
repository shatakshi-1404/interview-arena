"""Small in-process sliding-window rate limiter.

State lives in this process's memory: correct for one API container. With several replicas each would count
separately, so put limits in front (nginx/WAF) or back them with Redis before scaling out.
"""
import math
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from app.core.config import settings
from app.core.errors import AppError


class RateLimited(AppError):
    def __init__(self, retry_after: int):
        super().__init__(
            "Too many requests. Please wait a moment and try again.",
            429,
            headers={"Retry-After": str(retry_after)},
        )


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self.clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._ops = 0

    def hit(self, key: str) -> int:
        """Records a request. Returns 0 if allowed, otherwise the seconds until a slot frees up.
        Rejected requests are not recorded, so waiting out the window always works."""
        now = self.clock()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            cutoff = now - self.window
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return max(1, math.ceil(q[0] + self.window - now))
            q.append(now)
            self._ops += 1
            if self._ops % 1000 == 0:
                self._prune_locked(now)
            return 0

    def _prune_locked(self, now: float) -> None:
        cutoff = now - self.window
        for key in [k for k, q in self._hits.items() if not q or q[-1] <= cutoff]:
            del self._hits[key]

    def prune(self) -> None:
        with self._lock:
            self._prune_locked(self.clock())

    def size(self) -> int:
        return len(self._hits)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_limiters: dict[tuple[str, int, int], SlidingWindowLimiter] = {}


def get_limiter(name: str, limit: int, window_seconds: int) -> SlidingWindowLimiter:
    key = (name, limit, window_seconds)
    if key not in _limiters:
        _limiters[key] = SlidingWindowLimiter(limit, window_seconds)
    return _limiters[key]


def reset_all() -> None:
    for limiter in _limiters.values():
        limiter.reset()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limit_by_ip(name: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """Route dependency: at most `limit` requests per `window_seconds` per client IP."""
    limiter = get_limiter(name, limit, window_seconds)

    def dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        retry = limiter.hit(client_ip(request))
        if retry:
            raise RateLimited(retry)

    return dependency
