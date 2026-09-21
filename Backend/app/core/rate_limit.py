"""Minimal per-IP rate limiting for B6's unauthenticated guest endpoints
(the brute-force hardening called for in `Backend/plan.md`'s B6) and for
the `/auth/login` and `/auth/register` endpoints (online password
brute-forcing / email-enumeration hardening).

Fixed-window counter, in-process memory only. Deliberately not a real
distributed limiter (Redis, etc.): fine for a single-instance MVP behind
one uvicorn worker, and cheap to replace later if the API scales to
multiple processes/instances without touching call sites, see B6's log.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_WINDOW_SECONDS = 60
# Raised from 20 (B6's original figure) after B23-F31's guest pages/carpool
# routes made a single guest page view cost several requests: a real guest
# clicking between a few tabs could trip the old ceiling during entirely
# normal use (see the F31 fast-follow's GuestTabsOut, which independently
# cut that same per-view cost). Still tight enough to make join-code or
# password brute-forcing impractical, which is this limiter's actual job.
_MAX_REQUESTS_PER_WINDOW = 60

_AUTH_WINDOW_SECONDS = 60
_AUTH_MAX_REQUESTS_PER_WINDOW = 10

# Shared across both buckets, keyed by `f"{bucket}:{ip}"` rather than just
# `ip`, so the guest and auth limits never share a counter -- and so tests
# can reset every bucket at once by clearing this one dict (see
# `tests/conftest.py`'s `client` fixture).
_hits: dict[str, list[float]] = defaultdict(list)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_rate_limit(bucket: str, request: Request, max_requests: int, window_seconds: int) -> None:
    now = time.monotonic()
    key = f"{bucket}:{_client_key(request)}"
    window_start = now - window_seconds
    recent = [t for t in _hits[key] if t > window_start]
    if len(recent) >= max_requests:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests, try again shortly")
    recent.append(now)
    _hits[key] = recent


def rate_limit_guest(request: Request) -> None:
    _check_rate_limit("guest", request, _MAX_REQUESTS_PER_WINDOW, _WINDOW_SECONDS)


def rate_limit_auth(request: Request) -> None:
    _check_rate_limit("auth", request, _AUTH_MAX_REQUESTS_PER_WINDOW, _AUTH_WINDOW_SECONDS)
