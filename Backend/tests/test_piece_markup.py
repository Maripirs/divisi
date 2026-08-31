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


def test_group_scope_lists_group_piece_marks(client):
    admin_headers = _register_and_login(client, "gadmin4b@example.com")
    owner_headers = _register_and_login(client, "owner4b@example.com")
    peer_headers = _register_and_login(client, "peer4b@example.com")

    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "owner4b@example.com"}, headers=admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "peer4b@example.com"}, headers=admin_headers)
    piece_id = _upload_piece(client, admin_headers, owner_type="group", group_id=group_id)

    owner_mark = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#000",
            "stamp_type": "breath",
            "x": 0.1,
            "y": 0.1,
        },
        headers=owner_headers,
    ).json()
    peer_mark = client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#111",
            "stamp_type": "accent",
            "x": 0.2,
            "y": 0.2,
        },
        headers=peer_headers,
    ).json()

    mine = client.get("/piece-markup", params={"piece_id": piece_id, "scope": "mine"}, headers=owner_headers)
    assert mine.status_code == 200
    assert [mark["id"] for mark in mine.json()] == [owner_mark["id"]]

    group = client.get("/piece-markup", params={"piece_id": piece_id, "scope": "group"}, headers=owner_headers)
    assert group.status_code == 200
    assert {mark["id"] for mark in group.json()} == {owner_mark["id"], peer_mark["id"]}


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
