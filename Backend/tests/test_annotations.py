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


def test_annotation_is_private_by_default(client):
    owner_headers = _register_and_login(client, "owner@example.com")
    other_headers = _register_and_login(client, "other@example.com")
    piece_id = _upload_piece(client, owner_headers)

    create = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "m4b2", "content": "watch the tempo here"},
        headers=owner_headers,
    )
    assert create.status_code == 201
    annotation_id = create.json()["id"]

    # Owner sees it in the piece's annotation list and by id.
    mine = client.get("/annotations", params={"piece_id": piece_id}, headers=owner_headers)
    assert [a["id"] for a in mine.json()] == [annotation_id]
    assert client.get(f"/annotations/{annotation_id}", headers=owner_headers).status_code == 200

    # A stranger with no access to the piece can't create/see annotations on it.
    forbidden_create = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "m1", "content": "nope"},
        headers=other_headers,
    )
    assert forbidden_create.status_code == 403

    forbidden_get = client.get(f"/annotations/{annotation_id}", headers=other_headers)
    assert forbidden_get.status_code == 403

    others_list = client.get("/annotations", params={"piece_id": piece_id}, headers=other_headers)
    assert others_list.json() == []


def test_share_grants_visibility_and_unshare_revokes_it(client):
    owner_headers = _register_and_login(client, "owner2@example.com")
    peer_headers = _register_and_login(client, "peer2@example.com")
    admin_headers = _register_and_login(client, "gadmin2@example.com")

    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "owner2@example.com"}, headers=admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "peer2@example.com"}, headers=admin_headers)
    piece_id = _upload_piece(client, admin_headers, owner_type="group", group_id=group_id)

    create = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "m10", "content": "breathe here"},
        headers=owner_headers,
    )
    annotation_id = create.json()["id"]

    # Not yet shared: the peer can't see it.
    assert client.get(f"/annotations/{annotation_id}", headers=peer_headers).status_code == 403

    share = client.post(
        f"/annotations/{annotation_id}/share", json={"email": "peer2@example.com"}, headers=peer_headers
    )
    assert share.status_code == 403  # only the owner can share

    share = client.post(
        f"/annotations/{annotation_id}/share", json={"email": "peer2@example.com"}, headers=owner_headers
    )
    assert share.status_code == 201

    # Sharing again is a conflict.
    again = client.post(
        f"/annotations/{annotation_id}/share", json={"email": "peer2@example.com"}, headers=owner_headers
    )
    assert again.status_code == 409

    # Now visible to the peer, including in their piece-scoped list.
    peer_get = client.get(f"/annotations/{annotation_id}", headers=peer_headers)
    assert peer_get.status_code == 200
    peer_list = client.get("/annotations", params={"piece_id": piece_id}, headers=peer_headers)
    assert [a["id"] for a in peer_list.json()] == [annotation_id]

    # The peer still can't edit or unshare — only the owner can.
    assert client.patch(f"/annotations/{annotation_id}", json={"content": "hijacked"}, headers=peer_headers).status_code == 403
    peer_user_id = share.json()["shared_with_user_id"]
    assert client.delete(f"/annotations/{annotation_id}/share/{peer_user_id}", headers=peer_headers).status_code == 403

    # Owner unshares; peer loses visibility again.
    unshare = client.delete(f"/annotations/{annotation_id}/share/{peer_user_id}", headers=owner_headers)
    assert unshare.status_code == 204
    assert client.get(f"/annotations/{annotation_id}", headers=peer_headers).status_code == 403


def test_list_shares_is_owner_only(client):
    owner_headers = _register_and_login(client, "owner4@example.com")
    peer_headers = _register_and_login(client, "peer4@example.com")
    piece_id = _upload_piece(client, owner_headers)

    annotation_id = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "m1", "content": "note"},
        headers=owner_headers,
    ).json()["id"]

    # No shares yet.
    assert client.get(f"/annotations/{annotation_id}/shares", headers=owner_headers).json() == []

    client.post(f"/annotations/{annotation_id}/share", json={"email": "peer4@example.com"}, headers=owner_headers)

    owner_shares = client.get(f"/annotations/{annotation_id}/shares", headers=owner_headers)
    assert owner_shares.status_code == 200
    assert [s["email"] for s in owner_shares.json()] == ["peer4@example.com"]

    # Only the owner can list shares — not even the person shared with.
    assert client.get(f"/annotations/{annotation_id}/shares", headers=peer_headers).status_code == 403


def test_owner_can_update_and_delete(client):
    owner_headers = _register_and_login(client, "owner3@example.com")
    piece_id = _upload_piece(client, owner_headers)

    create = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "m1", "content": "draft note"},
        headers=owner_headers,
    )
    annotation_id = create.json()["id"]

    update = client.patch(f"/annotations/{annotation_id}", json={"content": "final note"}, headers=owner_headers)
    assert update.status_code == 200
    assert update.json()["content"] == "final note"
    assert update.json()["position"] == "m1"

    delete = client.delete(f"/annotations/{annotation_id}", headers=owner_headers)
    assert delete.status_code == 204
    assert client.get(f"/annotations/{annotation_id}", headers=owner_headers).status_code == 404
