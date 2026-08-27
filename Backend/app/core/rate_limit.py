"""Minimal per-IP rate limiting for B6's unauthenticated guest endpoints —
the brute-force hardening called for in `Backend/plan.md`'s B6.

Fixed-window counter, in-process memory only. Deliberately not a real
distributed limiter (Redis, etc.): fine for a single-instance MVP behind
one uvicorn worker, and cheap to replace later if the API scales to
multiple processes/instances without touching call sites — see B6's log.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_WINDOW_SECONDS = 60
_MAX_REQUESTS_PER_WINDOW = 20

_hits: dict[str, list[float]] = defaultdict(list)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit_guest(request: Request) -> None:
    now = time.monotonic()
    key = _client_key(request)
    window_start = now - _WINDOW_SECONDS
    recent = [t for t in _hits[key] if t > window_start]
    if len(recent) >= _MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests — try again shortly")
    recent.append(now)
    _hits[key] = recent
