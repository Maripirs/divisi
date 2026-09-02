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


def _register_and_login(client, email, name="Name", password="hunter22"):
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
        {
            "piece_id": piece_id,
            "title": "Requiem",
            "version_id": version_id,
            "distributed_at": body["pieces"][0]["distributed_at"],
            "composer": None,
            "youtube_url": None,
            "has_music": True,
            "has_pdf": False,
        }
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


@pytest.mark.integration  # fetches a rendered stem -> runs the FluidSynth pipeline
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


def test_guest_can_list_homework_no_auth(client):
    admin_headers = _register_and_login(client, "gh-admin@example.com")
    group = client.post("/groups", json={"name": "Choir GH"}, headers=admin_headers).json()
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "homework", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    client.post(
        "/groups/" + group["id"] + "/homework",
        json={"title": "Lacrymosa", "range": "mm. 18-42"},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/homework")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Lacrymosa"


def test_guest_homework_unknown_join_code_404s(client):
    response = client.get("/guest/NOTAREAL/homework")
    assert response.status_code == 404


def test_guest_homework_hidden_by_default(client):
    admin_headers = _register_and_login(client, "gh-admin2@example.com")
    group = client.post("/groups", json={"name": "Choir GH2"}, headers=admin_headers).json()
    client.post(
        "/groups/" + group["id"] + "/homework",
        json={"title": "Lacrymosa", "range": "mm. 18-42"},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/homework")
    assert response.status_code == 404


def test_guest_can_list_weekly_notes_no_auth(client):
    admin_headers = _register_and_login(client, "gwn-admin@example.com")
    group = client.post("/groups", json={"name": "Choir GWN"}, headers=admin_headers).json()
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "weekly_notes", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    client.post(
        "/groups/" + group["id"] + "/weekly-notes",
        json={"title": "Week of Sept 1", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/weekly-notes")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Week of Sept 1"


def test_guest_weekly_notes_unknown_join_code_404s(client):
    response = client.get("/guest/NOTAREAL/weekly-notes")
    assert response.status_code == 404


def test_guest_weekly_notes_hidden_by_default(client):
    admin_headers = _register_and_login(client, "gwn-admin2@example.com")
    group = client.post("/groups", json={"name": "Choir GWN2"}, headers=admin_headers).json()
    client.post(
        "/groups/" + group["id"] + "/weekly-notes",
        json={"title": "Week of Sept 1", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/weekly-notes")
    assert response.status_code == 404


def test_guest_password_protects_all_routes(client):
    admin_headers = _register_and_login(client, "gp-admin@example.com")
    group = client.post(
        "/groups", json={"name": "Protected Choir", "guest_password": "s3cret"}, headers=admin_headers
    ).json()

    no_password = client.get(f"/guest/{group['join_code']}")
    assert no_password.status_code == 401

    wrong_password = client.get(f"/guest/{group['join_code']}", params={"password": "nope"})
    assert wrong_password.status_code == 401

    right_password = client.get(f"/guest/{group['join_code']}", params={"password": "s3cret"})
    assert right_password.status_code == 200


def test_guest_password_can_be_set_via_guest_settings(client):
    admin_headers = _register_and_login(client, "gp-admin2@example.com")
    group = client.post("/groups", json={"name": "Choir GP2"}, headers=admin_headers).json()
    assert client.get(f"/guest/{group['join_code']}").status_code == 200

    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "newpass"},
        headers=admin_headers,
    )
    assert client.get(f"/guest/{group['join_code']}").status_code == 401
    assert client.get(f"/guest/{group['join_code']}", params={"password": "newpass"}).status_code == 200


def test_guest_join_code_404s_when_tracks_page_disabled(client):
    admin_headers = _register_and_login(client, "pg-guest1@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers, title="Foo")
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": False, "audience": "everyone"}]},
        headers=admin_headers,
    )

    assert client.get(f"/guest/{group['join_code']}").status_code == 404
    assert client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/manifest").status_code == 404


def _create_group_with_distributed_pdf_only_piece(client, admin_headers, title="Score Only"):
    group = client.post("/groups", json={"name": "PDF Choir"}, headers=admin_headers).json()
    upload = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "group", "group_id": group["id"]},
        files={"pdf_file": ("piece.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=admin_headers,
    )
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]
    client.post(f"/library/versions/{version_id}/submit", headers=admin_headers)
    client.post(f"/library/versions/{version_id}/approve", headers=admin_headers)
    client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    return group, piece_id, version_id


def test_guest_can_fetch_music_file_for_a_distributed_piece(client):
    admin_headers = _register_and_login(client, "gfile-admin@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers)

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/file")
    assert response.status_code == 200

    no_pdf = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/pdf")
    assert no_pdf.status_code == 404


def test_guest_can_fetch_pdf_for_a_pdf_only_distributed_piece(client):
    admin_headers = _register_and_login(client, "gpdf-admin@example.com")
    group, piece_id, version_id = _create_group_with_distributed_pdf_only_piece(client, admin_headers)

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/pdf")
    assert response.status_code == 200

    no_music = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/file")
    assert no_music.status_code == 404


def test_guest_file_routes_404_for_unknown_join_code(client):
    assert client.get("/guest/NOTAREAL/pieces/whatever/file").status_code == 404
    assert client.get("/guest/NOTAREAL/pieces/whatever/pdf").status_code == 404


def test_guest_endpoints_are_rate_limited(client):
    admin_headers = _register_and_login(client, "admin4@example.com")
    group = client.post("/groups", json={"name": "Choir4"}, headers=admin_headers).json()

    for _ in range(rate_limit._MAX_REQUESTS_PER_WINDOW):
        response = client.get(f"/guest/{group['join_code']}")
        assert response.status_code == 200

    throttled = client.get(f"/guest/{group['join_code']}")
    assert throttled.status_code == 429
