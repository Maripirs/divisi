def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _resources_url(group_id):
    return "/groups/" + group_id + "/resources"


def test_admin_can_create_and_list_resource(client):
    admin_headers = _register_and_login(client, "gr-admin1@example.com")
    group_id = _make_group(client, admin_headers)

    create = client.post(
        _resources_url(group_id),
        json={"label": "Rehearsal playlist", "url": "https://open.spotify.com/playlist/abc"},
        headers=admin_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["group_id"] == group_id
    assert body["label"] == "Rehearsal playlist"
    assert body["url"] == "https://open.spotify.com/playlist/abc"
    assert body["created_by"] is not None

    listing = client.get(_resources_url(group_id), headers=admin_headers)
    assert listing.status_code == 200
    assert [r["id"] for r in listing.json()] == [body["id"]]


def test_create_rejects_non_absolute_url(client):
    admin_headers = _register_and_login(client, "gr-admin2@example.com")
    group_id = _make_group(client, admin_headers)

    bad = client.post(
        _resources_url(group_id),
        json={"label": "Broken", "url": "not-a-url"},
        headers=admin_headers,
    )
    assert bad.status_code == 422

    bad_scheme = client.post(
        _resources_url(group_id),
        json={"label": "Broken", "url": "javascript:alert(1)"},
        headers=admin_headers,
    )
    assert bad_scheme.status_code == 422


def test_member_can_list_but_not_write(client):
    admin_headers = _register_and_login(client, "gr-admin3@example.com")
    member_headers = _register_and_login(client, "gr-member3@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "gr-member3@example.com")
    created = client.post(
        _resources_url(group_id),
        json={"label": "Shared drive", "url": "https://drive.example.com/folder"},
        headers=admin_headers,
    ).json()

    listing = client.get(_resources_url(group_id), headers=member_headers)
    assert listing.status_code == 200
    assert [r["id"] for r in listing.json()] == [created["id"]]

    forbidden_create = client.post(
        _resources_url(group_id),
        json={"label": "X", "url": "https://example.com"},
        headers=member_headers,
    )
    assert forbidden_create.status_code == 403

    forbidden_patch = client.patch(
        _resources_url(group_id) + "/" + created["id"],
        json={"label": "Hacked"},
        headers=member_headers,
    )
    assert forbidden_patch.status_code == 403

    forbidden_delete = client.delete(
        _resources_url(group_id) + "/" + created["id"], headers=member_headers
    )
    assert forbidden_delete.status_code == 403


def test_non_member_cannot_list(client):
    admin_headers = _register_and_login(client, "gr-admin4@example.com")
    outsider_headers = _register_and_login(client, "gr-outsider4@example.com")
    group_id = _make_group(client, admin_headers)

    assert client.get(_resources_url(group_id), headers=outsider_headers).status_code == 403


def test_admin_can_partial_update(client):
    admin_headers = _register_and_login(client, "gr-admin5@example.com")
    group_id = _make_group(client, admin_headers)
    created = client.post(
        _resources_url(group_id),
        json={"label": "Original", "url": "https://example.com/old"},
        headers=admin_headers,
    ).json()

    label_only = client.patch(
        _resources_url(group_id) + "/" + created["id"],
        json={"label": "Renamed"},
        headers=admin_headers,
    )
    assert label_only.status_code == 200
    assert label_only.json()["label"] == "Renamed"
    # Untouched field survives the partial update.
    assert label_only.json()["url"] == "https://example.com/old"

    url_only = client.patch(
        _resources_url(group_id) + "/" + created["id"],
        json={"url": "https://example.com/new"},
        headers=admin_headers,
    )
    assert url_only.status_code == 200
    assert url_only.json()["url"] == "https://example.com/new"
    assert url_only.json()["label"] == "Renamed"


def test_admin_can_delete(client):
    admin_headers = _register_and_login(client, "gr-admin6@example.com")
    group_id = _make_group(client, admin_headers)
    created = client.post(
        _resources_url(group_id),
        json={"label": "X", "url": "https://example.com"},
        headers=admin_headers,
    ).json()

    ok = client.delete(_resources_url(group_id) + "/" + created["id"], headers=admin_headers)
    assert ok.status_code == 204
    assert client.get(_resources_url(group_id), headers=admin_headers).json() == []


def test_resource_from_another_group_404s(client):
    admin_headers = _register_and_login(client, "gr-admin7@example.com")
    other_admin_headers = _register_and_login(client, "gr-admin7-other@example.com")
    group_id = _make_group(client, admin_headers)
    other_group_id = _make_group(client, other_admin_headers, name="Other")
    foreign = client.post(
        _resources_url(other_group_id),
        json={"label": "X", "url": "https://example.com"},
        headers=other_admin_headers,
    ).json()

    assert client.patch(
        _resources_url(group_id) + "/" + foreign["id"], json={"label": "Hack"}, headers=admin_headers
    ).status_code == 404
    assert client.delete(
        _resources_url(group_id) + "/" + foreign["id"], headers=admin_headers
    ).status_code == 404


def test_unknown_ids_404(client):
    admin_headers = _register_and_login(client, "gr-admin8@example.com")
    group_id = _make_group(client, admin_headers)

    assert client.get(_resources_url("nope"), headers=admin_headers).status_code == 404
    assert client.post(
        _resources_url("nope"), json={"label": "X", "url": "https://example.com"}, headers=admin_headers
    ).status_code == 404
    assert client.patch(
        _resources_url(group_id) + "/nope", json={"label": "X"}, headers=admin_headers
    ).status_code == 404
    assert client.delete(_resources_url(group_id) + "/nope", headers=admin_headers).status_code == 404


def test_resources_ordered_oldest_first(client):
    admin_headers = _register_and_login(client, "gr-admin9@example.com")
    group_id = _make_group(client, admin_headers)
    first = client.post(
        _resources_url(group_id), json={"label": "First", "url": "https://example.com/1"}, headers=admin_headers
    ).json()
    second = client.post(
        _resources_url(group_id), json={"label": "Second", "url": "https://example.com/2"}, headers=admin_headers
    ).json()

    listing = client.get(_resources_url(group_id), headers=admin_headers).json()
    assert [r["id"] for r in listing] == [first["id"], second["id"]]


def test_guest_can_read_resources_when_about_page_guest_visible(client):
    admin_headers = _register_and_login(client, "gr-admin10@example.com")
    group_id = _make_group(client, admin_headers)
    created = client.post(
        _resources_url(group_id), json={"label": "X", "url": "https://example.com"}, headers=admin_headers
    ).json()
    join_code = client.get("/groups", headers=admin_headers).json()[0]["join_code"]

    # Default `about` audience is members-only — no guest access yet.
    assert client.get(f"/guest/{join_code}/resources").status_code == 404

    client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "about", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )

    guest_listing = client.get(f"/guest/{join_code}/resources")
    assert guest_listing.status_code == 200
    assert [r["id"] for r in guest_listing.json()] == [created["id"]]


def test_disabling_about_page_blocks_member_resources_list_not_admin(client):
    admin_headers = _register_and_login(client, "gr-admin11@example.com")
    member_headers = _register_and_login(client, "gr-member11@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "gr-member11@example.com")
    client.post(
        _resources_url(group_id), json={"label": "X", "url": "https://example.com"}, headers=admin_headers
    )

    assert client.get(_resources_url(group_id), headers=member_headers).status_code == 200

    client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "about", "enabled": False, "audience": "members"}]},
        headers=admin_headers,
    )

    assert client.get(_resources_url(group_id), headers=member_headers).status_code == 403
    assert client.get(_resources_url(group_id), headers=admin_headers).status_code == 200
