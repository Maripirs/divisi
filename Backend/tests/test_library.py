import io


def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _upload_file(client, headers, title="Ave Maria", owner_type="user", group_id=None):
    data = {"title": title, "owner_type": owner_type}
    if group_id:
        data["group_id"] = group_id
    files = {"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")}
    return client.post("/library/pieces", data=data, files=files, headers=headers)


def test_individual_can_upload_and_own_a_piece(client):
    headers = _register_and_login(client, "solo@example.com")
    upload = _upload_file(client, headers)
    assert upload.status_code == 201
    body = upload.json()
    assert body["piece"]["owner_type"] == "user"
    assert body["version"]["status"] == "draft"
    assert body["version"]["source"] == "original"

    library = client.get("/library/pieces", headers=headers)
    assert library.status_code == 200
    assert [e["title"] for e in library.json()] == ["Ave Maria"]


def test_non_admin_cannot_upload_group_piece(client):
    admin_headers = _register_and_login(client, "gadmin@example.com")
    member_headers = _register_and_login(client, "gmember@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "gmember@example.com"}, headers=admin_headers)

    forbidden = _upload_file(client, member_headers, owner_type="group", group_id=group_id)
    assert forbidden.status_code == 403


def test_full_group_review_and_distribution_flow(client):
    admin_headers = _register_and_login(client, "admin@example.com")
    member_headers = _register_and_login(client, "member@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "member@example.com"}, headers=admin_headers)

    upload = _upload_file(client, admin_headers, owner_type="group", group_id=group_id)
    assert upload.status_code == 201
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]

    # Not yet approved: distribution is refused.
    early_push = client.post(
        f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers
    )
    assert early_push.status_code == 409

    submit = client.post(f"/library/versions/{version_id}/submit", headers=admin_headers)
    assert submit.status_code == 200
    assert submit.json()["status"] == "submitted"

    # A non-admin member cannot approve.
    member_approve = client.post(f"/library/versions/{version_id}/approve", headers=member_headers)
    assert member_approve.status_code == 403

    approve = client.post(f"/library/versions/{version_id}/approve", headers=admin_headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

    push = client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    assert push.status_code == 201

    # Pushing the same version to the same group twice is a conflict.
    push_again = client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    assert push_again.status_code == 409

    member_library = client.get("/library/pieces", headers=member_headers)
    assert member_library.status_code == 200
    entry = member_library.json()[0]
    assert entry["piece_id"] == piece_id
    assert entry["version_status"] == "approved"


def test_member_can_submit_but_not_approve_own_version(client):
    admin_headers = _register_and_login(client, "admin2@example.com")
    member_headers = _register_and_login(client, "member2@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "member2@example.com"}, headers=admin_headers)

    upload = _upload_file(client, admin_headers, owner_type="group", group_id=group_id)
    piece_id = upload.json()["piece"]["id"]

    new_version = client.post(
        f"/library/pieces/{piece_id}/versions",
        files={"file": ("v2.xml", io.BytesIO(b"<musicxml/>"), "application/xml")},
        headers=member_headers,
    )
    assert new_version.status_code == 201
    version_id = new_version.json()["id"]
    assert new_version.json()["source"] == "modification"

    submit = client.post(f"/library/versions/{version_id}/submit", headers=member_headers)
    assert submit.status_code == 200

    forbidden = client.post(f"/library/versions/{version_id}/approve", headers=member_headers)
    assert forbidden.status_code == 403

    reject = client.post(f"/library/versions/{version_id}/reject", headers=admin_headers)
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    # Rejected version never appears in the member's own group library (nothing was ever distributed).
    member_library = client.get("/library/pieces", headers=member_headers)
    assert member_library.json() == []
