"""B6: unauthenticated join-code access to a group's distributed pieces."""

import io
import shutil
from pathlib import Path

import pytest

from app.core import rate_limit
from app.core.config import get_settings

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    # The TestClient reuses one "testclient" host across every test in the
    # process, which would otherwise let unrelated tests exhaust each
    # other's rate-limit window.
    rate_limit._hits.clear()
    yield
    rate_limit._hits.clear()


def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_group_with_distributed_midi_piece(client, admin_headers, title="Requiem"):
    group = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()
    midi_bytes = (FIXTURES / "requiem-satb-plain.mid").read_bytes()
    upload = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "group", "group_id": group["id"]},
        files={"file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi")},
        headers=admin_headers,
    )
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]
    client.post(f"/library/versions/{version_id}/submit", headers=admin_headers)
    client.post(f"/library/versions/{version_id}/approve", headers=admin_headers)
    client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    return group, piece_id, version_id


def _cleanup_render(version_id):
    render_dir = Path(get_settings().storage_dir) / "renders" / version_id
    shutil.rmtree(render_dir, ignore_errors=True)


def test_create_group_returns_a_join_code(client):
    admin_headers = _register_and_login(client, "gadmin@example.com")
    group = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()
    assert len(group["join_code"]) == 8


def test_resolve_join_code_lists_distributed_pieces_no_auth(client):
    admin_headers = _register_and_login(client, "admin@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers)

    response = client.get(f"/guest/{group['join_code']}")
    assert response.status_code == 200
    body = response.json()
    assert body["group_name"] == "Choir"
    assert body["pieces"] == [
        {"piece_id": piece_id, "title": "Requiem", "version_id": version_id, "distributed_at": body["pieces"][0]["distributed_at"]}
    ]


def test_unknown_join_code_returns_404(client):
    response = client.get("/guest/NOTAREAL")
    assert response.status_code == 404


def test_guest_sees_no_pieces_for_a_group_with_nothing_distributed(client):
    admin_headers = _register_and_login(client, "empty@example.com")
    group = client.post("/groups", json={"name": "Empty Choir"}, headers=admin_headers).json()

    response = client.get(f"/guest/{group['join_code']}")
    assert response.status_code == 200
    assert response.json() == {"group_name": "Empty Choir", "pieces": []}


def test_guest_can_fetch_manifest_and_stem_for_a_distributed_piece(client):
    admin_headers = _register_and_login(client, "admin2@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers)

    try:
        manifest = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/manifest")
        assert manifest.status_code == 200
        body = manifest.json()
        assert set(body["stems"]) == {"soprano", "alto", "tenor", "bass", "backing"}

        stem = client.get(body["stems"]["soprano"])
        assert stem.status_code == 200
        assert stem.content[:4] == b"RIFF"
    finally:
        _cleanup_render(version_id)


def test_guest_cannot_fetch_manifest_for_a_piece_not_distributed_to_this_group(client):
    admin_headers = _register_and_login(client, "admin3@example.com")
    group = client.post("/groups", json={"name": "Choir3"}, headers=admin_headers).json()

    # Piece exists (owned individually) but was never distributed to this group.
    midi_bytes = (FIXTURES / "requiem-satb-plain.mid").read_bytes()
    upload = client.post(
        "/library/pieces",
        data={"title": "Not Shared", "owner_type": "user"},
        files={"file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi")},
        headers=admin_headers,
    )
    piece_id = upload.json()["piece"]["id"]

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/manifest")
    assert response.status_code == 404


def test_guest_endpoints_are_rate_limited(client):
    admin_headers = _register_and_login(client, "admin4@example.com")
    group = client.post("/groups", json={"name": "Choir4"}, headers=admin_headers).json()

    for _ in range(rate_limit._MAX_REQUESTS_PER_WINDOW):
        response = client.get(f"/guest/{group['join_code']}")
        assert response.status_code == 200

    throttled = client.get(f"/guest/{group['join_code']}")
    assert throttled.status_code == 429
