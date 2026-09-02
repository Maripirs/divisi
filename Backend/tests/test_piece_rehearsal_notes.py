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


def _notes_url(group_id, piece_id):
    return "/groups/" + group_id + "/pieces/" + piece_id + "/rehearsal-notes"


def test_admin_can_create_note_all_fields_round_trip(client):
    admin_headers = _register_and_login(client, "prn-admin1@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    create = client.post(
        _notes_url(group_id, piece_id),
        json={
            "kind": "entrance",
            "title": "Tenor entrance",
            "body": "Watch the conductor, come in a hair late",
            "page_number": 4,
            "measure_label": "m. 52",
            "part_scope": "Tenor 1",
        },
        headers=admin_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["group_id"] == group_id
    assert body["piece_id"] == piece_id
    assert body["kind"] == "entrance"
    assert body["title"] == "Tenor entrance"
    assert body["body"] == "Watch the conductor, come in a hair late"
    assert body["page_number"] == 4
    assert body["measure_label"] == "m. 52"
    assert body["part_scope"] == "Tenor 1"
    assert body["created_by"] is not None
    assert "created_at" in body


def test_create_defaults_kind_to_other(client):
    admin_headers = _register_and_login(client, "prn-admin-def@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    create = client.post(_notes_url(group_id, piece_id), json={"body": "General reminder"}, headers=admin_headers)
    assert create.status_code == 201
    assert create.json()["kind"] == "other"
    assert create.json()["title"] is None


def test_member_can_list_notes_ordering_stable(client):
    admin_headers = _register_and_login(client, "prn-admin2@example.com")
    member_headers = _register_and_login(client, "prn-member2@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "prn-member2@example.com")
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    first = client.post(_notes_url(group_id, piece_id), json={"body": "first"}, headers=admin_headers).json()
    second = client.post(_notes_url(group_id, piece_id), json={"body": "second"}, headers=admin_headers).json()
    third = client.post(_notes_url(group_id, piece_id), json={"body": "third"}, headers=admin_headers).json()

    listing = client.get(_notes_url(group_id, piece_id), headers=member_headers)
    assert listing.status_code == 200
    assert [n["id"] for n in listing.json()] == [first["id"], second["id"], third["id"]]


def test_list_only_returns_this_pieces_notes(client):
    admin_headers = _register_and_login(client, "prn-admin-scope@example.com")
    group_id = _make_group(client, admin_headers)
    piece_a = _upload_piece(client, admin_headers, group_id=group_id, title="A")
    piece_b = _upload_piece(client, admin_headers, group_id=group_id, title="B")

    note_a = client.post(_notes_url(group_id, piece_a), json={"body": "on A"}, headers=admin_headers).json()
    client.post(_notes_url(group_id, piece_b), json={"body": "on B"}, headers=admin_headers)

    listing = client.get(_notes_url(group_id, piece_a), headers=admin_headers).json()
    assert [n["id"] for n in listing] == [note_a["id"]]


def test_non_member_cannot_list(client):
    admin_headers = _register_and_login(client, "prn-admin3@example.com")
    outsider_headers = _register_and_login(client, "prn-outsider3@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    assert client.get(_notes_url(group_id, piece_id), headers=outsider_headers).status_code == 403


def test_non_member_cannot_create(client):
    admin_headers = _register_and_login(client, "prn-admin4@example.com")
    member_headers = _register_and_login(client, "prn-member4@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    # Registered, but never added to the group.

    forbidden = client.post(_notes_url(group_id, piece_id), json={"body": "x"}, headers=member_headers)
    assert forbidden.status_code == 403


def test_plain_member_cannot_create(client):
    admin_headers = _register_and_login(client, "prn-admin4b@example.com")
    member_headers = _register_and_login(client, "prn-member4b@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "prn-member4b@example.com")
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    forbidden = client.post(_notes_url(group_id, piece_id), json={"body": "x"}, headers=member_headers)
    assert forbidden.status_code == 403


def test_note_for_piece_not_in_this_group_404s(client):
    admin_headers = _register_and_login(client, "prn-admin5@example.com")
    other_admin_headers = _register_and_login(client, "prn-admin5-other@example.com")
    group_id = _make_group(client, admin_headers)
    other_group_id = _make_group(client, other_admin_headers, name="Other")
    # Piece owned by the other group.
    foreign_piece_id = _upload_piece(client, other_admin_headers, group_id=other_group_id)

    create = client.post(_notes_url(group_id, foreign_piece_id), json={"body": "x"}, headers=admin_headers)
    assert create.status_code == 404
    listing = client.get(_notes_url(group_id, foreign_piece_id), headers=admin_headers)
    assert listing.status_code == 404


def test_note_for_personal_piece_404s(client):
    admin_headers = _register_and_login(client, "prn-admin5b@example.com")
    group_id = _make_group(client, admin_headers)
    personal_piece_id = _upload_piece(client, admin_headers, owner_type="user")

    create = client.post(_notes_url(group_id, personal_piece_id), json={"body": "x"}, headers=admin_headers)
    assert create.status_code == 404


def test_unknown_ids_404(client):
    admin_headers = _register_and_login(client, "prn-admin6@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)

    assert client.get(_notes_url("nope", piece_id), headers=admin_headers).status_code == 404
    assert client.get(_notes_url(group_id, "nope"), headers=admin_headers).status_code == 404
    assert client.post(_notes_url("nope", piece_id), json={"body": "x"}, headers=admin_headers).status_code == 404
    assert client.post(_notes_url(group_id, "nope"), json={"body": "x"}, headers=admin_headers).status_code == 404
    assert client.put("/piece-rehearsal-notes/nope", json={"body": "x"}, headers=admin_headers).status_code == 404
    assert client.delete("/piece-rehearsal-notes/nope", headers=admin_headers).status_code == 404


def test_admin_can_put_full_replace(client):
    admin_headers = _register_and_login(client, "prn-admin7@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    created = client.post(
        _notes_url(group_id, piece_id),
        json={
            "kind": "rhythm",
            "title": "Original",
            "body": "old body",
            "page_number": 2,
            "measure_label": "m. 10",
            "part_scope": "Alto",
        },
        headers=admin_headers,
    ).json()

    edited = client.put(
        "/piece-rehearsal-notes/" + created["id"],
        json={"kind": "breath", "body": "new body"},
        headers=admin_headers,
    )
    assert edited.status_code == 200
    out = edited.json()
    assert out["kind"] == "breath"
    assert out["body"] == "new body"
    # Full replace: omitted fields fall back to their defaults.
    assert out["title"] is None
    assert out["page_number"] is None
    assert out["measure_label"] is None
    assert out["part_scope"] is None


def test_member_cannot_put_or_delete(client):
    admin_headers = _register_and_login(client, "prn-admin8@example.com")
    member_headers = _register_and_login(client, "prn-member8@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "prn-member8@example.com")
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    created = client.post(_notes_url(group_id, piece_id), json={"body": "x"}, headers=admin_headers).json()

    assert client.put(
        "/piece-rehearsal-notes/" + created["id"], json={"body": "hack"}, headers=member_headers
    ).status_code == 403
    assert client.delete("/piece-rehearsal-notes/" + created["id"], headers=member_headers).status_code == 403


def test_admin_can_delete(client):
    admin_headers = _register_and_login(client, "prn-admin9@example.com")
    group_id = _make_group(client, admin_headers)
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    created = client.post(_notes_url(group_id, piece_id), json={"body": "x"}, headers=admin_headers).json()

    assert client.delete("/piece-rehearsal-notes/" + created["id"], headers=admin_headers).status_code == 204
    assert client.get(_notes_url(group_id, piece_id), headers=admin_headers).json() == []


def test_disabling_weekly_notes_page_blocks_member_list_not_admin(client):
    admin_headers = _register_and_login(client, "prn-admin10@example.com")
    member_headers = _register_and_login(client, "prn-member10@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "prn-member10@example.com")
    piece_id = _upload_piece(client, admin_headers, group_id=group_id)
    client.post(_notes_url(group_id, piece_id), json={"body": "x"}, headers=admin_headers)

    # Members can list while the shared weekly_notes page gate is enabled.
    assert client.get(_notes_url(group_id, piece_id), headers=member_headers).status_code == 200

    client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "weekly_notes", "enabled": False, "audience": "members"}]},
        headers=admin_headers,
    )

    assert client.get(_notes_url(group_id, piece_id), headers=member_headers).status_code == 403
    # Admins always pass the page gate.
    assert client.get(_notes_url(group_id, piece_id), headers=admin_headers).status_code == 200
