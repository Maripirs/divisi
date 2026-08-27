def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_group_makes_creator_admin(client):
    headers = _register_and_login(client, "admin@example.com")
    create = client.post("/groups", json={"name": "Chamber Choir"}, headers=headers)
    assert create.status_code == 201
    body = create.json()
    assert body["name"] == "Chamber Choir"
    assert body["role"] == "admin"

    mine = client.get("/groups", headers=headers)
    assert mine.status_code == 200
    assert [g["role"] for g in mine.json()] == ["admin"]


def test_admin_can_add_and_list_members(client):
    admin_headers = _register_and_login(client, "admin2@example.com")
    _register_and_login(client, "member@example.com", name="Member")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    add = client.post(
        "/groups/" + group_id + "/members",
        json={"email": "member@example.com"},
        headers=admin_headers,
    )
    assert add.status_code == 201
    assert add.json()["role"] == "member"

    members = client.get("/groups/" + group_id + "/members", headers=admin_headers)
    assert members.status_code == 200
    emails = {m["email"] for m in members.json()}
    assert emails == {"admin2@example.com", "member@example.com"}


def test_non_admin_cannot_add_members(client):
    admin_headers = _register_and_login(client, "admin3@example.com")
    member_headers = _register_and_login(client, "member3@example.com")
    _register_and_login(client, "outsider@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]
    client.post(
        "/groups/" + group_id + "/members",
        json={"email": "member3@example.com"},
        headers=admin_headers,
    )

    forbidden = client.post(
        "/groups/" + group_id + "/members",
        json={"email": "outsider@example.com"},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_non_member_cannot_list_members(client):
    admin_headers = _register_and_login(client, "admin4@example.com")
    outsider_headers = _register_and_login(client, "outsider4@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    forbidden = client.get("/groups/" + group_id + "/members", headers=outsider_headers)
    assert forbidden.status_code == 403


def test_admin_can_remove_member(client):
    admin_headers = _register_and_login(client, "admin5@example.com")
    _register_and_login(client, "member5@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]
    client.post(
        "/groups/" + group_id + "/members",
        json={"email": "member5@example.com"},
        headers=admin_headers,
    )
    members = client.get("/groups/" + group_id + "/members", headers=admin_headers).json()
    member_id = next(m["user_id"] for m in members if m["email"] == "member5@example.com")

    remove = client.delete("/groups/" + group_id + "/members/" + member_id, headers=admin_headers)
    assert remove.status_code == 204
    remaining = client.get("/groups/" + group_id + "/members", headers=admin_headers).json()
    assert {m["email"] for m in remaining} == {"admin5@example.com"}


def test_cannot_remove_last_admin(client):
    admin_headers = _register_and_login(client, "admin6@example.com")
    group = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()
    admin_id = group["id"]
    members = client.get("/groups/" + admin_id + "/members", headers=admin_headers).json()
    admin_user_id = members[0]["user_id"]

    remove = client.delete("/groups/" + admin_id + "/members/" + admin_user_id, headers=admin_headers)
    assert remove.status_code == 409


def test_add_member_requires_existing_user(client):
    admin_headers = _register_and_login(client, "admin7@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    missing = client.post(
        "/groups/" + group_id + "/members",
        json={"email": "nobody@example.com"},
        headers=admin_headers,
    )
    assert missing.status_code == 404


def test_group_created_with_no_guest_password_by_default(client):
    admin_headers = _register_and_login(client, "admin8@example.com")
    group = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()
    assert group["has_guest_password"] is False
    assert group["guest_homework_visible"] is False


def test_group_can_be_created_with_a_guest_password(client):
    admin_headers = _register_and_login(client, "admin9@example.com")
    group = client.post(
        "/groups", json={"name": "G", "guest_password": "letmein"}, headers=admin_headers
    ).json()
    assert group["has_guest_password"] is True


def test_admin_can_update_guest_settings(client):
    admin_headers = _register_and_login(client, "admin10@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    updated = client.put(
        "/groups/" + group_id + "/guest-settings",
        json={"guest_password": "s3cret", "guest_homework_visible": True},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["has_guest_password"] is True
    assert body["guest_homework_visible"] is True

    cleared = client.put(
        "/groups/" + group_id + "/guest-settings",
        json={"guest_password": None, "guest_homework_visible": False},
        headers=admin_headers,
    )
    assert cleared.json()["has_guest_password"] is False


def test_non_admin_cannot_update_guest_settings(client):
    admin_headers = _register_and_login(client, "admin11@example.com")
    member_headers = _register_and_login(client, "member11@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "member11@example.com"}, headers=admin_headers)

    forbidden = client.put(
        "/groups/" + group_id + "/guest-settings",
        json={"guest_password": "hack", "guest_homework_visible": True},
        headers=member_headers,
    )
    assert forbidden.status_code == 403
