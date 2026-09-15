"""Shared carpool API test helpers."""


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _set_carpool_page_settings(
    client, admin_headers, group_id, enabled=True, audience="members", min_identity="anyone"
):
    return client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "carpool", "enabled": enabled, "audience": audience, "min_identity": min_identity}]},
        headers=admin_headers,
    )


def _make_event(client, admin_headers, group_id, title="Sep 16 rehearsal", **kwargs):
    payload = {
        "title": title,
        "starts_at": "2026-09-16T18:00:00Z",
        "destination_label": "SFCC rehearsal hall",
        **kwargs,
    }
    return client.post("/groups/" + group_id + "/carpool/events", json=payload, headers=admin_headers)


def _driver_post(origin_label="Mission", seats_total=3, **kwargs):
    return {"kind": "driver", "origin_label": origin_label, "seats_total": seats_total, **kwargs}


def _rider_post(origin_label="Sunset", **kwargs):
    return {"kind": "rider", "origin_label": origin_label, **kwargs}


def _setup_driver_post(client, admin_email_prefix, seats_total=2):
    admin_headers = _register_and_login(client, admin_email_prefix + "-admin@example.com")
    driver_headers = _register_and_login(client, admin_email_prefix + "-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], admin_email_prefix + "-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    driver_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(seats_total=seats_total),
        headers=driver_headers,
    ).json()
    return admin_headers, driver_headers, group, event, driver_post
