def test_register_login_and_me(client):
    register = client.post(
        "/auth/register",
        json={"email": "singer@example.com", "name": "Singer", "password": "hunter2"},
    )
    assert register.status_code == 201
    assert register.json()["email"] == "singer@example.com"

    login = client.post("/auth/login", json={"email": "singer@example.com", "password": "hunter2"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert token

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "singer@example.com"


def test_login_wrong_password_rejected(client):
    client.post(
        "/auth/register",
        json={"email": "singer2@example.com", "name": "Singer2", "password": "hunter2"},
    )
    login = client.post("/auth/login", json={"email": "singer2@example.com", "password": "wrong"})
    assert login.status_code == 401


def test_duplicate_email_rejected(client):
    body = {"email": "dupe@example.com", "name": "Dupe", "password": "hunter2"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json=body).status_code == 409


def test_protected_route_rejects_missing_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_protected_route_rejects_invalid_token(client):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
