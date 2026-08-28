def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def test_admin_can_create_weekly_note(client):
    admin_headers = _register_and_login(client, "wn-admin@example.com")
    group_id = _make_group(client, admin_headers)

    create = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Week of Sept 1", "body": "No rehearsal, retreat instead", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["group_id"] == group_id
    assert body["title"] == "Week of Sept 1"
    assert body["body"] == "No rehearsal, retreat instead"


def test_member_cannot_create_weekly_note(client):
    admin_headers = _register_and_login(client, "wn-admin2@example.com")
    member_headers = _register_and_login(client, "wn-member2@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "wn-member2@example.com"}, headers=admin_headers)

    forbidden = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "X", "note_date": "2026-09-01T00:00:00Z"},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_member_can_list_weekly_notes(client):
    admin_headers = _register_and_login(client, "wn-admin3@example.com")
    member_headers = _register_and_login(client, "wn-member3@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "wn-member3@example.com"}, headers=admin_headers)
    created = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Thor week", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    listing = client.get("/groups/" + group_id + "/weekly-notes", headers=member_headers)
    assert listing.status_code == 200
    assert [n["id"] for n in listing.json()] == [created["id"]]


def test_non_member_cannot_list_weekly_notes(client):
    admin_headers = _register_and_login(client, "wn-admin4@example.com")
    outsider_headers = _register_and_login(client, "wn-outsider4@example.com")
    group_id = _make_group(client, admin_headers)

    assert client.get("/groups/" + group_id + "/weekly-notes", headers=outsider_headers).status_code == 403


def test_admin_can_edit_weekly_note(client):
    admin_headers = _register_and_login(client, "wn-admin5@example.com")
    member_headers = _register_and_login(client, "wn-member5@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "wn-member5@example.com"}, headers=admin_headers)
    created = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Original", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    forbidden = client.put(
        "/weekly-notes/" + created["id"],
        json={"title": "Hacked", "note_date": "2026-09-01T00:00:00Z"},
        headers=member_headers,
    )
    assert forbidden.status_code == 403

    edited = client.put(
        "/weekly-notes/" + created["id"],
        json={"title": "Updated", "body": "New body", "note_date": "2026-09-08T00:00:00Z"},
        headers=admin_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Updated"
    assert edited.json()["body"] == "New body"


def test_unknown_weekly_note_id_404s(client):
    headers = _register_and_login(client, "wn-admin6@example.com")
    assert client.get("/groups/does-not-exist/weekly-notes", headers=headers).status_code == 404
    assert client.put(
        "/weekly-notes/does-not-exist", json={"title": "X", "note_date": "2026-09-01T00:00:00Z"}, headers=headers
    ).status_code == 404
    assert client.delete("/weekly-notes/does-not-exist", headers=headers).status_code == 404


def test_admin_can_delete_weekly_note(client):
    admin_headers = _register_and_login(client, "wn-admin7@example.com")
    member_headers = _register_and_login(client, "wn-member7@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "wn-member7@example.com"}, headers=admin_headers)
    created = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Thor week", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    forbidden = client.delete("/weekly-notes/" + created["id"], headers=member_headers)
    assert forbidden.status_code == 403

    ok = client.delete("/weekly-notes/" + created["id"], headers=admin_headers)
    assert ok.status_code == 204
    assert client.get("/groups/" + group_id + "/weekly-notes", headers=admin_headers).json() == []


def test_weekly_notes_ordered_newest_first(client):
    admin_headers = _register_and_login(client, "wn-admin8@example.com")
    group_id = _make_group(client, admin_headers)
    earlier = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Earlier", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()
    later = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Later", "note_date": "2026-09-08T00:00:00Z"},
        headers=admin_headers,
    ).json()

    listing = client.get("/groups/" + group_id + "/weekly-notes", headers=admin_headers).json()
    assert [n["id"] for n in listing] == [later["id"], earlier["id"]]
