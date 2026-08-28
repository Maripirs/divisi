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
        json={"guest_password": "s3cret"},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["has_guest_password"] is True

    cleared = client.put(
        "/groups/" + group_id + "/guest-settings",
        json={"guest_password": None},
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
        json={"guest_password": "hack"},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_group_created_with_default_page_settings(client):
    admin_headers = _register_and_login(client, "pg-admin1@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    settings = client.get("/groups/" + group_id + "/page-settings", headers=admin_headers)
    assert settings.status_code == 200
    by_page = {row["page"]: row for row in settings.json()}
    assert set(by_page) == {"homework", "tracks", "members", "about", "responsibilities"}
    for page, row in by_page.items():
        assert row["enabled"] is True
        expected_audience = "everyone" if page == "tracks" else "members"
        assert row["audience"] == expected_audience


def test_non_admin_cannot_read_or_write_page_settings(client):
    admin_headers = _register_and_login(client, "pg-admin2@example.com")
    member_headers = _register_and_login(client, "pg-member2@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "pg-member2@example.com"}, headers=admin_headers)

    assert client.get("/groups/" + group_id + "/page-settings", headers=member_headers).status_code == 403
    forbidden = client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "homework", "enabled": False, "audience": "members"}]},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_admin_can_toggle_page_settings(client):
    admin_headers = _register_and_login(client, "pg-admin3@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]

    updated = client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "homework", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    by_page = {row["page"]: row for row in updated.json()}
    assert by_page["homework"]["audience"] == "everyone"
    # Untouched pages keep their prior settings.
    assert by_page["tracks"]["audience"] == "everyone"
    assert by_page["members"]["enabled"] is True

    disabled = client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": False, "audience": "everyone"}]},
        headers=admin_headers,
    ).json()
    assert {row["page"]: row["enabled"] for row in disabled}["tracks"] is False


def test_disabled_members_page_blocks_members_but_not_admin(client):
    admin_headers = _register_and_login(client, "pg-admin4@example.com")
    member_headers = _register_and_login(client, "pg-member4@example.com")
    group_id = client.post("/groups", json={"name": "G"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "pg-member4@example.com"}, headers=admin_headers)

    client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "members", "enabled": False, "audience": "members"}]},
        headers=admin_headers,
    )

    assert client.get("/groups/" + group_id + "/members", headers=member_headers).status_code == 403
    # Admins always see it regardless of the page's own settings.
    assert client.get("/groups/" + group_id + "/members", headers=admin_headers).status_code == 200
