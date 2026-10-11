"""Password strength, forgot/reset-password, and OAuth-provider-status
routes. No email provider is wired up yet (see Backend/plan.md's Backlog)
-- the reset link is logged server-side instead of sent, so these tests
recover it from the log record rather than an inbox."""

import logging
import re


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _logged_reset_token(caplog) -> str:
    match = re.search(r"token=([\w-]+)", caplog.text)
    assert match, f"no reset link found in logs: {caplog.text!r}"
    return match.group(1)


def test_password_too_short_is_rejected(client):
    res = client.post(
        "/auth/register", json={"email": "short@example.com", "name": "Short", "password": "abc123"}
    )
    assert res.status_code == 422


def test_forgot_password_unknown_email_returns_the_same_generic_response(client):
    res = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert res.status_code == 202
    assert "reset link" in res.json()["detail"].lower()


def test_forgot_password_logs_a_working_reset_link(client, caplog):
    old_headers = _register_and_login(client, "reset@example.com", name="Reset")
    with caplog.at_level(logging.WARNING, logger="divisi.auth"):
        res = client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    assert res.status_code == 202
    token = _logged_reset_token(caplog)

    reset = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword123"})
    assert reset.status_code == 200

    old_login = client.post("/auth/login", json={"email": "reset@example.com", "password": "hunter22"})
    assert old_login.status_code == 401
    new_login = client.post("/auth/login", json={"email": "reset@example.com", "password": "newpassword123"})
    assert new_login.status_code == 200

    # The session token minted before the reset is revoked, even though it
    # hasn't expired -- a stolen token shouldn't survive its own owner's
    # reset.
    assert client.get("/auth/me", headers=old_headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {new_login.json()['access_token']}"}
    assert client.get("/auth/me", headers=new_headers).status_code == 200


def test_reset_password_token_is_single_use(client, caplog):
    client.post(
        "/auth/register", json={"email": "onceonly@example.com", "name": "Once", "password": "hunter22"}
    )
    with caplog.at_level(logging.WARNING, logger="divisi.auth"):
        client.post("/auth/forgot-password", json={"email": "onceonly@example.com"})
    token = _logged_reset_token(caplog)

    first = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword123"})
    assert first.status_code == 200
    second = client.post("/auth/reset-password", json={"token": token, "new_password": "anotherpassword1"})
    assert second.status_code == 400


def test_reset_password_rejects_a_short_new_password(client, caplog):
    client.post(
        "/auth/register", json={"email": "shortreset@example.com", "name": "S", "password": "hunter22"}
    )
    with caplog.at_level(logging.WARNING, logger="divisi.auth"):
        client.post("/auth/forgot-password", json={"email": "shortreset@example.com"})
    token = _logged_reset_token(caplog)
    res = client.post("/auth/reset-password", json={"token": token, "new_password": "short"})
    assert res.status_code == 422


def test_reset_password_rejects_an_unknown_token(client):
    res = client.post(
        "/auth/reset-password", json={"token": "not-a-real-token", "new_password": "somepassword123"}
    )
    assert res.status_code == 400


def test_oauth_providers_report_unconfigured_by_default(client):
    res = client.get("/auth/oauth/providers")
    assert res.status_code == 200
    assert res.json() == {"google": False, "apple": False}


def test_oauth_google_start_501s_when_not_configured(client):
    res = client.get("/auth/oauth/google/start", follow_redirects=False)
    assert res.status_code == 501


def test_oauth_google_callback_501s_when_not_configured(client):
    res = client.get("/auth/oauth/google/callback?code=x&state=y", follow_redirects=False)
    assert res.status_code == 501


def test_oauth_apple_start_always_501s(client):
    # Not just unconfigured -- genuinely unimplemented, see app/services/oauth.py.
    res = client.get("/auth/oauth/apple/start", follow_redirects=False)
    assert res.status_code == 501


def test_oauth_unknown_provider_404s(client):
    res = client.get("/auth/oauth/facebook/start", follow_redirects=False)
    assert res.status_code == 404


def test_forgot_password_finds_the_account_whatever_case_is_typed(client, caplog):
    _register_and_login(client, "Mixed.Case@Example.com", name="Mixed")
    with caplog.at_level(logging.WARNING, logger="divisi.auth"):
        res = client.post("/auth/forgot-password", json={"email": "MIXED.case@example.COM"})
    assert res.status_code == 202
    token = _logged_reset_token(caplog)
    reset = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword123"})
    assert reset.status_code == 200
    login = client.post("/auth/login", json={"email": "mixed.case@example.com", "password": "newpassword123"})
    assert login.status_code == 200


def test_oauth_google_links_to_an_existing_account_regardless_of_email_case(client, monkeypatch):
    from app.api.routes import auth as auth_routes
    from app.core.config import get_settings

    _register_and_login(client, "oauth-case@example.com", name="Existing")
    monkeypatch.setattr(get_settings(), "google_client_id", "cid")
    monkeypatch.setattr(get_settings(), "google_client_secret", "secret")
    monkeypatch.setattr(
        auth_routes,
        "google_exchange_code",
        lambda *_args: {"provider_user_id": "g-case", "email": "OAuth-Case@Example.com", "name": "Google Name"},
    )
    client.cookies.set(auth_routes.OAUTH_STATE_COOKIE, "st")
    res = client.get("/auth/oauth/google/callback?code=c&state=st", follow_redirects=False)
    assert res.status_code in (302, 307), res.text
    token = re.search(r"token=([^&]+)", res.headers["location"]).group(1)
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "oauth-case@example.com"
    assert me["name"] == "Existing"
