import io


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _upload_piece(client, headers, owner_type="user", group_id=None, title="Ave Maria"):
    data = {"title": title, "owner_type": owner_type}
    if group_id:
        data["group_id"] = group_id
    files = {"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")}
    return client.post("/library/pieces", data=data, files=files, headers=headers).json()["piece"]["id"]


def test_create_and_list_stroke_stamp_and_text(client):
    headers = _register_and_login(client, "owner@example.com")
    piece_id = _upload_piece(client, headers)

    stroke = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stroke",
            "color": "#ff0000",
            "width": 0.003,
            "points": [[0.1, 0.2], [0.15, 0.25], [0.2, 0.2]],
        },
        headers=headers,
    )
    assert stroke.status_code == 201
    assert stroke.json()["kind"] == "stroke"
    assert stroke.json()["points"] == [[0.1, 0.2], [0.15, 0.25], [0.2, 0.2]]

    stamp = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#0000ff",
            "stamp_type": "breath",
            "x": 0.5,
            "y": 0.3,
        },
        headers=headers,
    )
    assert stamp.status_code == 201
    assert stamp.json()["stamp_type"] == "breath"

    text = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "text",
            "color": "#16a34a",
            "width": 0.04,
            "text": "breathe here",
            "x": 0.4,
            "y": 0.35,
        },
        headers=headers,
    )
    assert text.status_code == 201
    assert text.json()["kind"] == "text"
    assert text.json()["text"] == "breathe here"

    listed = client.get("/piece-markup", params={"piece_id": piece_id}, headers=headers)
    assert listed.status_code == 200
    assert {m["kind"] for m in listed.json()} == {"stroke", "stamp", "text"}


def test_stroke_requires_points_and_width(client):
    headers = _register_and_login(client, "owner2@example.com")
    piece_id = _upload_piece(client, headers)

    missing_points = client.post(
        "/piece-markup",
        json={"piece_id": piece_id, "page_number": 1, "kind": "stroke", "color": "#000", "width": 0.003},
        headers=headers,
    )
    assert missing_points.status_code == 422

    missing_width = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stroke",
            "color": "#000",
            "points": [[0, 0], [1, 1]],
        },
        headers=headers,
    )
    assert missing_width.status_code == 422


def test_stamp_requires_type_and_position(client):
    headers = _register_and_login(client, "owner3@example.com")
    piece_id = _upload_piece(client, headers)

    resp = client.post(
        "/piece-markup",
        json={"piece_id": piece_id, "page_number": 1, "kind": "stamp", "color": "#000"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_text_requires_content_width_and_position(client):
    headers = _register_and_login(client, "owner3b@example.com")
    piece_id = _upload_piece(client, headers)

    resp = client.post(
        "/piece-markup",
        json={"piece_id": piece_id, "page_number": 1, "kind": "text", "color": "#000", "text": ""},
        headers=headers,
    )
    assert resp.status_code == 422


def test_stranger_cannot_create_or_list_marks(client):
    owner_headers = _register_and_login(client, "owner4@example.com")
    other_headers = _register_and_login(client, "other4@example.com")
    piece_id = _upload_piece(client, owner_headers)

    client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#000",
            "stamp_type": "star",
            "x": 0.1,
            "y": 0.1,
        },
        headers=owner_headers,
    )

    # A stranger with no access to the piece can't create marks on it.
    forbidden = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#000",
            "stamp_type": "star",
            "x": 0.1,
            "y": 0.1,
        },
        headers=other_headers,
    )
    assert forbidden.status_code == 403

    # A stranger with no access to the piece can't list marks on it.
    assert client.get("/piece-markup", params={"piece_id": piece_id}, headers=other_headers).status_code == 403

    assert client.get("/piece-markup", params={"piece_id": piece_id}, headers=owner_headers).json() != []


def _stamp_body(piece_id, scope=None, color="#000", x=0.1, y=0.1):
    body = {
        "piece_id": piece_id,
        "page_number": 1,
        "kind": "stamp",
        "color": color,
        "stamp_type": "breath",
        "x": x,
        "y": y,
    }
    if scope is not None:
        body["scope"] = scope
    return body


def _make_group_piece(client, admin_headers, member_emails=()):
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    for email in member_emails:
        client.post(f"/groups/{group_id}/members", json={"email": email}, headers=admin_headers)
    piece_id = _upload_piece(client, admin_headers, owner_type="group", group_id=group_id)
    return group_id, piece_id


def _promote_to_admin(client, admin_headers, group_id, email):
    members = client.get(f"/groups/{group_id}/members", headers=admin_headers).json()
    user_id = next(m["user_id"] for m in members if m["email"] == email)
    resp = client.put(
        f"/groups/{group_id}/members/{user_id}/role",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert resp.status_code == 200


def test_group_scope_returns_only_group_marks(client):
    admin_headers = _register_and_login(client, "gadmin7@example.com")
    member_headers = _register_and_login(client, "member7@example.com")
    _, piece_id = _make_group_piece(client, admin_headers, ["member7@example.com"])

    admin_personal = client.post(
        "/piece-markup", json=_stamp_body(piece_id, color="#a00"), headers=admin_headers
    ).json()
    admin_group = client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group", color="#0a0"), headers=admin_headers
    )
    assert admin_group.status_code == 201
    assert admin_group.json()["scope"] == "group"
    admin_group = admin_group.json()
    member_personal = client.post(
        "/piece-markup", json=_stamp_body(piece_id, color="#00a"), headers=member_headers
    ).json()

    # The group layer: only scope=group marks, visible to any member.
    for headers in (admin_headers, member_headers):
        group = client.get(
            "/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=headers
        )
        assert group.status_code == 200
        assert {m["id"] for m in group.json()} == {admin_group["id"]}

    # Personal scope (default) is unchanged: only the caller's own personal marks.
    admin_default = client.get("/piece-markup", params={"piece_id": piece_id}, headers=admin_headers)
    assert {m["id"] for m in admin_default.json()} == {admin_personal["id"]}
    member_default = client.get("/piece-markup", params={"piece_id": piece_id}, headers=member_headers)
    assert {m["id"] for m in member_default.json()} == {member_personal["id"]}


def test_group_scope_write_requires_owning_group_admin(client):
    admin_headers = _register_and_login(client, "gadmin8@example.com")
    member_headers = _register_and_login(client, "member8@example.com")
    stranger_headers = _register_and_login(client, "stranger8@example.com")
    _, piece_id = _make_group_piece(client, admin_headers, ["member8@example.com"])

    # A plain member can read the group layer but not write it.
    assert client.get(
        "/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=member_headers
    ).status_code == 200
    assert client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group"), headers=member_headers
    ).status_code == 403

    # A non-member gets 403 on any scope, no leak.
    assert client.get(
        "/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=stranger_headers
    ).status_code == 403
    assert client.get(
        "/piece-markup", params={"piece_id": piece_id, "scope": "personal"}, headers=stranger_headers
    ).status_code == 403
    assert client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group"), headers=stranger_headers
    ).status_code == 403

    # The admin can.
    assert client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group"), headers=admin_headers
    ).status_code == 201


def test_any_owning_group_admin_co_edits_group_marks(client):
    admin_a = _register_and_login(client, "admina9@example.com")
    admin_b = _register_and_login(client, "adminb9@example.com")
    member_headers = _register_and_login(client, "member9@example.com")
    group_id, piece_id = _make_group_piece(
        client, admin_a, ["adminb9@example.com", "member9@example.com"]
    )
    _promote_to_admin(client, admin_a, group_id, "adminb9@example.com")

    mark_one = client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group", x=0.1), headers=admin_a
    ).json()
    mark_two = client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group", x=0.2), headers=admin_a
    ).json()

    # Admin B edits a group mark admin A created...
    edited = client.patch(
        f"/piece-markup/{mark_one['id']}", json={"x": 0.9, "y": 0.8}, headers=admin_b
    )
    assert edited.status_code == 200
    assert edited.json()["x"] == 0.9
    # ...and user_id follows the last editor (audit only).
    assert edited.json()["user_id"] != mark_one["user_id"]

    # ...and deletes another.
    assert client.delete(f"/piece-markup/{mark_two['id']}", headers=admin_b).status_code == 204

    # A plain member cannot edit or delete the group layer.
    assert client.patch(
        f"/piece-markup/{mark_one['id']}", json={"x": 0.1}, headers=member_headers
    ).status_code == 403
    assert client.delete(f"/piece-markup/{mark_one['id']}", headers=member_headers).status_code == 403

    remaining = client.get(
        "/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=admin_a
    ).json()
    assert {m["id"] for m in remaining} == {mark_one["id"]}


def test_group_scope_on_personal_piece_returns_empty(client):
    owner_headers = _register_and_login(client, "owner10@example.com")
    piece_id = _upload_piece(client, owner_headers)

    resp = client.get("/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=owner_headers)
    assert resp.status_code == 200
    assert resp.json() == []

    # And a group-scoped write on a personal piece is rejected.
    assert client.post(
        "/piece-markup", json=_stamp_body(piece_id, scope="group"), headers=owner_headers
    ).status_code == 403


def test_owner_can_delete_others_cannot(client):
    owner_headers = _register_and_login(client, "owner5@example.com")
    peer_headers = _register_and_login(client, "peer5@example.com")
    admin_headers = _register_and_login(client, "gadmin5@example.com")

    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "owner5@example.com"}, headers=admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "peer5@example.com"}, headers=admin_headers)
    piece_id = _upload_piece(client, admin_headers, owner_type="group", group_id=group_id)

    mark = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#000",
            "stamp_type": "accent",
            "x": 0.2,
            "y": 0.2,
        },
        headers=owner_headers,
    ).json()

    # A fellow group member has piece access but doesn't own this mark.
    assert client.delete(f"/piece-markup/{mark['id']}", headers=peer_headers).status_code == 403

    delete = client.delete(f"/piece-markup/{mark['id']}", headers=owner_headers)
    assert delete.status_code == 204

    remaining = client.get("/piece-markup", params={"piece_id": piece_id}, headers=owner_headers)
    assert remaining.json() == []


def _cue_body(piece_id, scope=None, time_ms=12345, x=0.3, y=0.4):
    body = {
        "piece_id": piece_id,
        "page_number": 1,
        "kind": "cue",
        "color": "#2563eb",
        "x": x,
        "y": y,
        "time_ms": time_ms,
    }
    if scope is not None:
        body["scope"] = scope
    return body


def test_create_personal_cue_with_time_ms(client):
    headers = _register_and_login(client, "cue-owner@example.com")
    piece_id = _upload_piece(client, headers)

    resp = client.post("/piece-markup", json=_cue_body(piece_id, time_ms=45000), headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "cue"
    assert body["time_ms"] == 45000
    assert body["scope"] == "personal"

    listed = client.get("/piece-markup", params={"piece_id": piece_id}, headers=headers)
    assert [m["time_ms"] for m in listed.json()] == [45000]


def test_create_group_cue_as_owning_group_admin(client):
    admin_headers = _register_and_login(client, "cue-gadmin@example.com")
    _, piece_id = _make_group_piece(client, admin_headers)

    resp = client.post(
        "/piece-markup", json=_cue_body(piece_id, scope="group", time_ms=8000), headers=admin_headers
    )
    assert resp.status_code == 201
    assert resp.json()["scope"] == "group"
    assert resp.json()["time_ms"] == 8000


def test_cue_requires_time_ms(client):
    headers = _register_and_login(client, "cue-owner2@example.com")
    piece_id = _upload_piece(client, headers)

    body = _cue_body(piece_id)
    del body["time_ms"]
    assert client.post("/piece-markup", json=body, headers=headers).status_code == 422

    negative = _cue_body(piece_id, time_ms=-1)
    assert client.post("/piece-markup", json=negative, headers=headers).status_code == 422


def test_time_ms_rejected_on_a_stroke(client):
    headers = _register_and_login(client, "cue-owner3@example.com")
    piece_id = _upload_piece(client, headers)

    resp = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stroke",
            "color": "#000",
            "width": 0.003,
            "points": [[0, 0], [1, 1]],
            "time_ms": 1000,
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_member_cannot_write_group_cue_but_can_read_it(client):
    admin_headers = _register_and_login(client, "cue-gadmin2@example.com")
    member_headers = _register_and_login(client, "cue-member2@example.com")
    _, piece_id = _make_group_piece(client, admin_headers, ["cue-member2@example.com"])

    cue = client.post(
        "/piece-markup", json=_cue_body(piece_id, scope="group", time_ms=5000), headers=admin_headers
    ).json()

    # A plain member can read the group cue...
    group = client.get(
        "/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=member_headers
    )
    assert group.status_code == 200
    assert {m["id"] for m in group.json()} == {cue["id"]}

    # ...but can't create or re-time one.
    assert client.post(
        "/piece-markup", json=_cue_body(piece_id, scope="group", time_ms=6000), headers=member_headers
    ).status_code == 403
    assert client.patch(
        f"/piece-markup/{cue['id']}", json={"time_ms": 9999}, headers=member_headers
    ).status_code == 403


def test_patch_a_cue_time_ms(client):
    headers = _register_and_login(client, "cue-owner4@example.com")
    piece_id = _upload_piece(client, headers)

    cue = client.post("/piece-markup", json=_cue_body(piece_id, time_ms=1000), headers=headers).json()
    patched = client.patch(f"/piece-markup/{cue['id']}", json={"time_ms": 73210}, headers=headers)
    assert patched.status_code == 200
    assert patched.json()["time_ms"] == 73210


def test_owner_can_update_text_others_cannot(client):
    owner_headers = _register_and_login(client, "owner6@example.com")
    peer_headers = _register_and_login(client, "peer6@example.com")
    admin_headers = _register_and_login(client, "gadmin6@example.com")

    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "owner6@example.com"}, headers=admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "peer6@example.com"}, headers=admin_headers)
    piece_id = _upload_piece(client, admin_headers, owner_type="group", group_id=group_id)

    mark = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "text",
            "color": "#000",
            "width": 0.04,
            "text": "soft",
            "x": 0.2,
            "y": 0.2,
        },
        headers=owner_headers,
    ).json()

    forbidden = client.patch(
        f"/piece-markup/{mark['id']}",
        json={"text": "louder", "x": 0.4, "y": 0.45},
        headers=peer_headers,
    )
    assert forbidden.status_code == 403

    updated = client.patch(
        f"/piece-markup/{mark['id']}",
        json={"text": "taller vowels", "x": 0.4, "y": 0.45, "width": 0.05},
        headers=owner_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["text"] == "taller vowels"
    assert updated.json()["x"] == 0.4
    assert updated.json()["y"] == 0.45
    assert updated.json()["width"] == 0.05
