import io


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _upload_piece(client, headers, owner_type="group", group_id=None, title="Ave Maria"):
    data = {"title": title, "owner_type": owner_type}
    if group_id:
        data["group_id"] = group_id
    files = {"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")}
    return client.post("/library/pieces", data=data, files=files, headers=headers).json()["piece"]["id"]


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


def test_admin_can_promote_weekly_note_defaults_title_and_body(client):
    admin_headers = _register_and_login(client, "wn-promote1@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    note = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={
            "title": "Week of Sept 1",
            "body": "No rehearsal, retreat instead",
            "note_date": "2026-09-01T00:00:00Z",
        },
        headers=admin_headers,
    ).json()

    promoted = client.post(
        "/weekly-notes/" + note["id"] + "/promote",
        json={"piece_id": piece_id},
        headers=admin_headers,
    )
    assert promoted.status_code == 201
    body = promoted.json()
    assert body["group_id"] == group_id
    assert body["piece_id"] == piece_id
    assert body["title"] == "Week of Sept 1"
    assert body["body"] == "No rehearsal, retreat instead"
    assert body["kind"] == "other"
    assert body["source_weekly_note_id"] == note["id"]
    assert body["created_by"] is not None


def test_promote_overrides_win_over_source_note(client):
    admin_headers = _register_and_login(client, "wn-promote2@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    note = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "Original title", "body": "Original body", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    promoted = client.post(
        "/weekly-notes/" + note["id"] + "/promote",
        json={
            "piece_id": piece_id,
            "kind": "entrance",
            "title": "Tenor entrance",
            "body": "Watch the conductor",
            "page_number": 4,
            "measure_label": "m. 52",
            "part_scope": "Tenor 1",
        },
        headers=admin_headers,
    ).json()
    assert promoted["kind"] == "entrance"
    assert promoted["title"] == "Tenor entrance"
    assert promoted["body"] == "Watch the conductor"
    assert promoted["page_number"] == 4
    assert promoted["measure_label"] == "m. 52"
    assert promoted["part_scope"] == "Tenor 1"

    # The source weekly note itself is untouched by the promotion.
    still_there = client.get("/groups/" + group_id + "/weekly-notes", headers=admin_headers).json()
    assert still_there[0]["title"] == "Original title"
    assert still_there[0]["body"] == "Original body"


def test_promoted_note_appears_in_piece_rehearsal_notes_list(client):
    admin_headers = _register_and_login(client, "wn-promote3@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    note = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "X", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()
    client.post("/weekly-notes/" + note["id"] + "/promote", json={"piece_id": piece_id}, headers=admin_headers)

    listing = client.get(
        "/groups/" + group_id + "/pieces/" + piece_id + "/rehearsal-notes", headers=admin_headers
    ).json()
    assert len(listing) == 1
    assert listing[0]["source_weekly_note_id"] == note["id"]


def test_member_cannot_promote_weekly_note(client):
    admin_headers = _register_and_login(client, "wn-promote4@example.com")
    member_headers = _register_and_login(client, "wn-promote4-member@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "wn-promote4-member@example.com")
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    note = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "X", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    forbidden = client.post(
        "/weekly-notes/" + note["id"] + "/promote", json={"piece_id": piece_id}, headers=member_headers
    )
    assert forbidden.status_code == 403


def test_promote_against_piece_not_in_group_404s(client):
    admin_headers = _register_and_login(client, "wn-promote5@example.com")
    other_admin_headers = _register_and_login(client, "wn-promote5-other@example.com")
    group_id = _make_group(client, admin_headers)
    other_group_id = _make_group(client, other_admin_headers, name="Other")
    foreign_piece_id = _upload_piece(client, other_admin_headers, group_id=other_group_id)
    note = client.post(
        "/groups/" + group_id + "/weekly-notes",
        json={"title": "X", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()

    forbidden = client.post(
        "/weekly-notes/" + note["id"] + "/promote", json={"piece_id": foreign_piece_id}, headers=admin_headers
    )
    assert forbidden.status_code == 404


def test_promote_unknown_note_404s(client):
    admin_headers = _register_and_login(client, "wn-promote6@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    assert client.post(
        "/weekly-notes/does-not-exist/promote", json={"piece_id": piece_id}, headers=admin_headers
    ).status_code == 404
