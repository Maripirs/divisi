"""B33: a small Resend wrapper backing the carpool match notification
(`app/api/routes/carpool.py`'s `create_claim`/`create_interest`), the only
place this repo actually sends outbound email, unlike `auth.py`'s
password-reset flow, which still just logs its reset link server-side
rather than emailing it (see that module's docstring).

Styled after `app/lyrics/groq_client.py`'s use of `httpx` for an external
API call: a plain `Authorization: Bearer` header, one `httpx.post`, no
retry logic. `send_email` must never raise: a failed send is logged and
swallowed, since a notification email is a nice-to-have on top of the
in-app reveal (`app.services.carpool.serialize_post`), never something a
claim/interest creation should fail over.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("divisi.email")

_RESEND_URL = "https://api.resend.com/emails"
_TIMEOUT_SECONDS = 10.0


def send_email(to: str, subject: str, html_body: str) -> None:
    """POST one email through Resend. Same "unconfigured -> clean no-op"
    shape as the OAuth providers in `app/core/config.py`: an empty
    `resend_api_key` logs a warning and returns without attempting a send,
    rather than raising, since there's no way to actually deliver mail
    without one. Any failure past that point (network error, non-2xx
    response) is also just logged and swallowed -- callers rely on this
    function never raising."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("Resend not configured (no resend_api_key); skipping email to %s", to)
        return

    try:
        response = httpx.post(
            _RESEND_URL,
            json={
                "from": settings.resend_from_email,
                "to": [to],
                "subject": subject,
                "html": html_body,
            },
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            timeout=_TIMEOUT_SECONDS,
        )
        if response.status_code >= 300:
            logger.warning("Resend send to %s failed: %s %s", to, response.status_code, response.text)
    except httpx.HTTPError as exc:
        logger.warning("Resend send to %s raised %s", to, exc)
