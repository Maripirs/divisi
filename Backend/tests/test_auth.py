def test_register_login_and_me(client):
    register = client.post(
        "/auth/register",
        json={"email": "singer@example.com", "name": "Singer", "password": "hunter22"},
    )
    assert register.status_code == 201
    assert register.json()["email"] == "singer@example.com"

    login = client.post("/auth/login", json={"email": "singer@example.com", "password": "hunter22"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert token

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "singer@example.com"


def test_login_wrong_password_rejected(client):
    client.post(
        "/auth/register",
        json={"email": "singer2@example.com", "name": "Singer2", "password": "hunter22"},
    )
    login = client.post("/auth/login", json={"email": "singer2@example.com", "password": "wrong"})
    assert login.status_code == 401


def test_duplicate_email_rejected(client):
    body = {"email": "dupe@example.com", "name": "Dupe", "password": "hunter22"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json=body).status_code == 409


def test_protected_route_rejects_missing_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_protected_route_rejects_invalid_token(client):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_update_me_changes_name(client):
    headers = _register_and_login(client, "rename@example.com", name="Old Name")
    res = client.put("/auth/me", json={"name": "New Name"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "New Name"
    assert client.get("/auth/me", headers=headers).json()["name"] == "New Name"


def test_change_password_with_correct_current_password(client):
    email = "changepw1@example.com"
    headers = _register_and_login(client, email)
    res = client.put(
        "/auth/me/password",
        json={"current_password": "hunter22", "new_password": "newhunter22"},
        headers=headers,
    )
    assert res.status_code == 204

    # Old password no longer works, new one does.
    assert client.post("/auth/login", json={"email": email, "password": "hunter22"}).status_code == 401
    relogin = client.post("/auth/login", json={"email": email, "password": "newhunter22"})
    assert relogin.status_code == 200


def test_change_password_wrong_current_password_rejected(client):
    email = "changepw2@example.com"
    headers = _register_and_login(client, email)
    res = client.put(
        "/auth/me/password",
        json={"current_password": "wrongpassword", "new_password": "newhunter22"},
        headers=headers,
    )
    assert res.status_code == 400
    # Original password still works — the failed attempt didn't change anything.
    assert client.post("/auth/login", json={"email": email, "password": "hunter22"}).status_code == 200


def test_change_password_rejects_short_new_password(client):
    headers = _register_and_login(client, "changepw3@example.com")
    res = client.put(
        "/auth/me/password",
        json={"current_password": "hunter22", "new_password": "short"},
        headers=headers,
    )
    assert res.status_code == 422


def test_change_password_requires_auth(client):
    res = client.put("/auth/me/password", json={"current_password": "hunter22", "new_password": "newhunter22"})
    assert res.status_code == 401


def test_delete_account_removes_personal_data_and_the_account(client):
    headers = _register_and_login(client, "deleteme@example.com")

    # A personal piece, a private annotation, and membership in a group
    # where they aren't the sole admin -- all genuinely theirs.
    import io

    upload = client.post(
        "/library/pieces",
        data={"title": "My Own Piece", "owner_type": "user"},
        files={"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")},
        headers=headers,
    )
    piece_id = upload.json()["piece"]["id"]
    client.post(
        "/annotations", json={"piece_id": piece_id, "position": "m1", "content": "note"}, headers=headers
    )

    co_admin_headers = _register_and_login(client, "coadmin@example.com")
    group_id = client.post("/groups", json={"name": "Shared Group"}, headers=co_admin_headers).json()["id"]
    client.post(
        "/groups/" + group_id + "/members",
        json={"email": "deleteme@example.com", "role": "admin"},
        headers=co_admin_headers,
    )

    res = client.delete("/auth/me", headers=headers)
    assert res.status_code == 204

    # The account itself is gone -- can't log in, can't reuse the token.
    assert client.post(
        "/auth/login", json={"email": "deleteme@example.com", "password": "hunter22"}
    ).status_code == 401
    assert client.get("/auth/me", headers=headers).status_code == 401

    # Their personal piece is gone too.
    assert client.get("/library/pieces", headers=co_admin_headers).json() == []

    # The shared group and the co-admin's own membership survive.
    groups = client.get("/groups", headers=co_admin_headers).json()
    assert any(g["id"] == group_id for g in groups)


def test_delete_account_preserves_group_content_but_nulls_attribution(client):
    admin_headers = _register_and_login(client, "contentadmin@example.com")
    member_headers = _register_and_login(client, "contentmember@example.com")
    group_id = client.post("/groups", json={"name": "Content Choir"}, headers=admin_headers).json()["id"]
    client.post(
        "/groups/" + group_id + "/members",
        json={"email": "contentmember@example.com", "role": "admin"},
        headers=admin_headers,
    )
    homework = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Learn it", "range": "Full piece", "instructions": ""},
        headers=admin_headers,
    )
    homework_id = homework.json()["id"]

    # `contentadmin` isn't the sole admin (contentmember is also admin), so
    # deletion is allowed -- the homework they created should survive with
    # created_by nulled out, not disappear.
    res = client.delete("/auth/me", headers=admin_headers)
    assert res.status_code == 204

    still_there = client.get(f"/homework/{homework_id}", headers=member_headers)
    assert still_there.status_code == 200
    assert still_there.json()["created_by"] is None


def test_delete_account_blocked_as_sole_group_admin(client):
    headers = _register_and_login(client, "soleadmin@example.com")
    client.post("/groups", json={"name": "Solo Group"}, headers=headers)

    res = client.delete("/auth/me", headers=headers)
    assert res.status_code == 409

    # Account still works afterward.
    assert client.get("/auth/me", headers=headers).status_code == 200


# B19's PIN-based "Save across devices" (`POST /auth/save`) is gone as of
# B21, replaced by the group-scoped guest name match — see
# `tests/test_participants.py` for that coverage.
