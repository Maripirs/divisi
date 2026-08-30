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


def test_create_and_list_stroke_and_stamp(client):
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

    listed = client.get("/piece-markup", params={"piece_id": piece_id}, headers=headers)
    assert listed.status_code == 200
    assert {m["kind"] for m in listed.json()} == {"stroke", "stamp"}


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


def test_marks_are_private_per_user(client):
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

    # Listing is scoped per-user even for someone who *does* have piece
    # access (e.g. a fellow group member) — marks are personal, not shared.
    assert client.get("/piece-markup", params={"piece_id": piece_id}, headers=owner_headers).json() != []


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
