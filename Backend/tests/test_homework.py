def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def test_admin_can_create_homework(client):
    admin_headers = _register_and_login(client, "hw-admin@example.com")
    group_id = _make_group(client, admin_headers)

    create = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Lacrymosa", "range": "mm. 18-42", "instructions": "Watch entrances", "due_date": "2026-09-04T00:00:00Z"},
        headers=admin_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["group_id"] == group_id
    assert body["title"] == "Lacrymosa"
    assert body["piece_id"] is None


def test_member_cannot_create_homework(client):
    admin_headers = _register_and_login(client, "hw-admin2@example.com")
    member_headers = _register_and_login(client, "hw-member2@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "hw-member2@example.com"}, headers=admin_headers)

    forbidden = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "X", "range": "Full piece"},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_member_can_list_and_get_homework(client):
    admin_headers = _register_and_login(client, "hw-admin3@example.com")
    member_headers = _register_and_login(client, "hw-member3@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "hw-member3@example.com"}, headers=admin_headers)
    created = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Thor", "range": "Full piece"},
        headers=admin_headers,
    ).json()

    listing = client.get("/groups/" + group_id + "/homework", headers=member_headers)
    assert listing.status_code == 200
    assert [hw["id"] for hw in listing.json()] == [created["id"]]

    single = client.get("/homework/" + created["id"], headers=member_headers)
    assert single.status_code == 200
    assert single.json()["title"] == "Thor"


def test_non_member_cannot_list_or_get_homework(client):
    admin_headers = _register_and_login(client, "hw-admin4@example.com")
    outsider_headers = _register_and_login(client, "hw-outsider4@example.com")
    group_id = _make_group(client, admin_headers)
    created = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Thor", "range": "Full piece"},
        headers=admin_headers,
    ).json()

    assert client.get("/groups/" + group_id + "/homework", headers=outsider_headers).status_code == 403
    assert client.get("/homework/" + created["id"], headers=outsider_headers).status_code == 403


def test_unknown_homework_id_404s(client):
    headers = _register_and_login(client, "hw-admin5@example.com")
    assert client.get("/homework/does-not-exist", headers=headers).status_code == 404


def test_admin_can_delete_homework(client):
    admin_headers = _register_and_login(client, "hw-admin6@example.com")
    member_headers = _register_and_login(client, "hw-member6@example.com")
    group_id = _make_group(client, admin_headers)
    client.post("/groups/" + group_id + "/members", json={"email": "hw-member6@example.com"}, headers=admin_headers)
    created = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Thor", "range": "Full piece"},
        headers=admin_headers,
    ).json()

    forbidden = client.delete("/homework/" + created["id"], headers=member_headers)
    assert forbidden.status_code == 403

    ok = client.delete("/homework/" + created["id"], headers=admin_headers)
    assert ok.status_code == 204
    assert client.get("/homework/" + created["id"], headers=admin_headers).status_code == 404


def test_homework_ordered_by_due_date(client):
    admin_headers = _register_and_login(client, "hw-admin7@example.com")
    group_id = _make_group(client, admin_headers)
    later = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Later", "range": "Full piece", "due_date": "2026-09-10T00:00:00Z"},
        headers=admin_headers,
    ).json()
    sooner = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "Sooner", "range": "Full piece", "due_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    ).json()
    no_date = client.post(
        "/groups/" + group_id + "/homework",
        json={"title": "No date", "range": "Full piece"},
        headers=admin_headers,
    ).json()

    listing = client.get("/groups/" + group_id + "/homework", headers=admin_headers).json()
    assert [hw["id"] for hw in listing] == [sooner["id"], later["id"], no_date["id"]]
