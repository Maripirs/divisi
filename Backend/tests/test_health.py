from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_stub_routes_registered() -> None:
    for path in ("/omr/ping", "/library/ping"):
        response = client.get(path)
        assert response.status_code == 200
