"""Google Sign-In (authorization-code flow), scaffolded ahead of real OAuth
app credentials existing — see `Backend/plan.md`'s Backlog for the human
step (create the app in Google Cloud Console, paste the client id/secret
in as env vars). Until then `Settings.oauth_configured["google"]` is
`False` and `app/api/routes/auth.py`'s routes report 501 rather than
attempting a handshake that can't complete.

Apple Sign-In is intentionally *not* implemented here yet, even as a
scaffold — its real requirements go beyond a static client secret (a
JWT-signed client secret generated from a `.p8` private key + key id +
team id, and a POST-based `form_post` callback rather than a plain
redirect), so a naive implementation would just be wrong, not merely
untested. `app/api/routes/auth.py`'s Apple routes always 501 for now.
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class OAuthError(Exception):
    """The provider rejected the code exchange or userinfo fetch — a real
    failure (bad/expired code, revoked app, ...), not a "not configured"
    situation (that's checked before this is ever called)."""


def google_authorization_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        # Re-consent isn't needed every time; `select_account` just avoids
        # silently reusing whichever Google account happens to be
        # currently signed in on a shared device.
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def google_exchange_code(client_id: str, client_secret: str, redirect_uri: str, code: str) -> dict:
    """Trades an authorization `code` for tokens, then fetches the
    profile — returns `{"provider_user_id", "email", "name"}`. Raises
    `OAuthError` on any failure at either step."""
    try:
        token_response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        token_response.raise_for_status()
        access_token = token_response.json()["access_token"]

        userinfo_response = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        userinfo_response.raise_for_status()
        userinfo = userinfo_response.json()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise OAuthError(str(exc)) from exc

    provider_user_id = userinfo.get("sub")
    email = userinfo.get("email")
    if not provider_user_id or not email:
        raise OAuthError("Google did not return a subject id / email")
    return {
        "provider_user_id": provider_user_id,
        "email": email,
        "name": userinfo.get("name") or email.split("@")[0],
    }
