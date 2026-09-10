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
            "presentation": None,
            "has_music": True,
            "has_pdf": False,
        }
    ]


def test_resolve_join_code_surfaces_the_admin_presentation_hint(client):
    admin_headers = _register_and_login(client, "presentationadmin@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)

    set_res = client.patch(
        f"/library/pieces/{piece_id}",
        json={"title": "Requiem", "presentation": "score_reference"},
        headers=admin_headers,
    )
    assert set_res.status_code == 200

    body = client.get(f"/guest/{group['join_code']}").json()
    assert body["pieces"][0]["presentation"] == "score_reference"


def test_unknown_join_code_returns_404(client):
    response = client.get("/guest/NOTAREAL")
    assert response.status_code == 404


def test_guest_sees_no_pieces_for_a_group_with_nothing_distributed(client):
    admin_headers = _register_and_login(client, "empty@example.com")
    group = client.post("/groups", json={"name": "Empty Choir"}, headers=admin_headers).json()

    response = client.get(f"/guest/{group['join_code']}")
    assert response.status_code == 200
    assert response.json() == {"group_name": "Empty Choir", "pieces": []}


def test_piece_owner_endpoint_names_the_group_and_reports_password_required(client):
    admin_headers = _register_and_login(client, "owner-pw@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "s3cret"},
        headers=admin_headers,
    )

    response = client.get(f"/guest/pieces/{piece_id}/owner")
    assert response.status_code == 200
    assert response.json() == {
        "group_name": "Choir",
        "join_code": group["join_code"],
        "guest_password_required": True,
    }


def test_piece_owner_endpoint_reports_no_password_when_group_has_none(client):
    admin_headers = _register_and_login(client, "owner-nopw@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)

    body = client.get(f"/guest/pieces/{piece_id}/owner").json()
    assert body["group_name"] == "Choir"
    assert body["join_code"] == group["join_code"]
    assert body["guest_password_required"] is False


def test_piece_owner_endpoint_404s_for_a_personal_or_undistributed_piece(client):
    admin_headers = _register_and_login(client, "owner-personal@example.com")
    midi_bytes = (FIXTURES / "requiem-satb-plain.mid").read_bytes()
    upload = client.post(
        "/library/pieces",
        data={"title": "Just Mine", "owner_type": "user"},
        files={"file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi")},
        headers=admin_headers,
    )
    piece_id = upload.json()["piece"]["id"]

    assert client.get(f"/guest/pieces/{piece_id}/owner").status_code == 404
    # And a piece id that doesn't exist at all is the same generic 404.
    assert client.get("/guest/pieces/does-not-exist/owner").status_code == 404


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


def test_guest_join_code_alone_opens_a_password_protected_group(client):
    # The join code is now the guest credential on its own: holding it is
    # treated as equivalent to having entered the group's guest password,
    # so every read route opens with just the code even when a password is
    # set. A stray/omitted `password` query param makes no difference.
    admin_headers = _register_and_login(client, "gp-admin@example.com")
    group = client.post(
        "/groups", json={"name": "Protected Choir", "guest_password": "s3cret"}, headers=admin_headers
    ).json()

    assert client.get(f"/guest/{group['join_code']}").status_code == 200
    assert client.get(f"/guest/{group['join_code']}", params={"password": "nope"}).status_code == 200


def test_guest_auth_still_verifies_the_password_for_the_no_code_piece_link_gate(client):
    # POST /guest/{code}/auth is the one surviving guest-password check: a
    # bare `/piece/{id}` link (no `?code=`) calls it to verify a visitor's
    # entered member password before sending them in with the code.
    admin_headers = _register_and_login(client, "gauth-admin@example.com")
    group = client.post(
        "/groups", json={"name": "Token Choir", "guest_password": "s3cret"}, headers=admin_headers
    ).json()
    code = group["join_code"]

    # The join code alone already opens the group's read routes.
    assert client.get(f"/guest/{code}").status_code == 200

    auth = client.post(f"/guest/{code}/auth", json={"password": "s3cret"})
    assert auth.status_code == 200
    assert auth.json()["token"]

    assert client.post(f"/guest/{code}/auth", json={"password": "nope"}).status_code == 401
    assert client.post(f"/guest/{code}/auth", json={}).status_code == 401


def test_guest_routes_all_open_with_the_join_code_alone(client):
    admin_headers = _register_and_login(client, "gtok-admin@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_director_note(client, admin_headers, group["id"], piece_id)
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={
            "pages": [
                {"page": "homework", "enabled": True, "audience": "everyone"},
                {"page": "weekly_notes", "enabled": True, "audience": "everyone"},
                {"page": "responsibilities", "enabled": True, "audience": "everyone"},
            ]
        },
        headers=admin_headers,
    )
    client.post(
        "/groups/" + group["id"] + "/homework",
        json={"title": "Lacrymosa", "range": "mm. 18-42"},
        headers=admin_headers,
    )
    client.post(
        "/groups/" + group["id"] + "/weekly-notes",
        json={"title": "Week of Sept 1", "note_date": "2026-09-01T00:00:00Z"},
        headers=admin_headers,
    )
    # A guest password is set, but it no longer gates any of these read
    # routes: the join code is sufficient.
    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "s3cret"},
        headers=admin_headers,
    )
    code = group["join_code"]

    assert client.get(f"/guest/{code}").status_code == 200
    assert client.get(f"/guest/{code}/homework").status_code == 200
    assert client.get(f"/guest/{code}/weekly-notes").status_code == 200
    assert client.get(f"/guest/{code}/responsibilities/dates").status_code == 200
    assert client.get(f"/guest/{code}/pieces/{piece_id}/rehearsal-notes").status_code == 200
    assert client.get(f"/guest/{code}/pieces/{piece_id}/file").status_code == 200

    # A still-minted guest token, or a garbage one, is simply ignored now,
    # never rejected.
    token = client.post(f"/guest/{code}/auth", json={"password": "s3cret"}).json()["token"]
    assert client.get(f"/guest/{code}/homework", params={"token": token}).status_code == 200
    assert (
        client.get(
            f"/guest/{code}/pieces/{piece_id}/rehearsal-notes", params={"token": "garbage"}
        ).status_code
        == 200
    )


def test_token_query_param_is_ignored_now_that_the_join_code_authorizes(client):
    # Guest-token validation is gone from the read routes (it lived in
    # `_authorize_guest`). A member JWT, a garbage string, or an empty
    # value passed as `token=` are all simply ignored: the join code is
    # what authorizes.
    admin_headers = _register_and_login(client, "mtok-admin@example.com")
    group = client.post(
        "/groups", json={"name": "Scoped Choir", "guest_password": "s3cret"}, headers=admin_headers
    ).json()
    member_token = admin_headers["Authorization"].removeprefix("Bearer ")
    code = group["join_code"]

    assert client.get(f"/guest/{code}", params={"token": member_token}).status_code == 200
    assert client.get(f"/guest/{code}", params={"token": "not-a-real-token"}).status_code == 200
    assert client.get(f"/guest/{code}", params={"token": ""}).status_code == 200


def test_guest_auth_returns_a_token_even_with_no_guest_password(client):
    admin_headers = _register_and_login(client, "gauth-nopw@example.com")
    group = client.post("/groups", json={"name": "Open Choir"}, headers=admin_headers).json()
    code = group["join_code"]

    # Unchanged: no password and no token still opens the group.
    assert client.get(f"/guest/{code}").status_code == 200

    auth = client.post(f"/guest/{code}/auth", json={})
    assert auth.status_code == 200
    assert auth.json()["token"]


def test_guest_password_set_via_guest_settings_only_gates_the_auth_route(client):
    admin_headers = _register_and_login(client, "gp-admin2@example.com")
    group = client.post("/groups", json={"name": "Choir GP2"}, headers=admin_headers).json()
    assert client.get(f"/guest/{group['join_code']}").status_code == 200

    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "newpass"},
        headers=admin_headers,
    )
    # Read routes stay open on the join code alone...
    assert client.get(f"/guest/{group['join_code']}").status_code == 200
    # ...and the password now only matters at POST /guest/{code}/auth.
    assert (
        client.post(f"/guest/{group['join_code']}/auth", json={"password": "newpass"}).status_code
        == 200
    )
    assert (
        client.post(f"/guest/{group['join_code']}/auth", json={"password": "wrong"}).status_code
        == 401
    )


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


def _add_director_note(client, admin_headers, group_id, piece_id, body="Watch the cutoff at m. 40"):
    return client.post(
        f"/groups/{group_id}/pieces/{piece_id}/rehearsal-notes",
        json={"body": body},
        headers=admin_headers,
    )


def test_guest_sees_director_rehearsal_notes_when_tracks_is_public(client):
    admin_headers = _register_and_login(client, "grn-admin@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    assert _add_director_note(client, admin_headers, group["id"], piece_id).status_code == 201

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/rehearsal-notes")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["body"] == "Watch the cutoff at m. 40"


def test_guest_rehearsal_notes_404_when_tracks_disabled(client):
    admin_headers = _register_and_login(client, "grn-admin2@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_director_note(client, admin_headers, group["id"], piece_id)
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": False, "audience": "everyone"}]},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/rehearsal-notes")
    assert response.status_code == 404


def test_guest_rehearsal_notes_404_when_tracks_members_only(client):
    admin_headers = _register_and_login(client, "grn-admin3@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_director_note(client, admin_headers, group["id"], piece_id)
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": True, "audience": "members"}]},
        headers=admin_headers,
    )

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/rehearsal-notes")
    assert response.status_code == 404


def test_guest_rehearsal_notes_open_with_the_join_code_even_when_a_password_is_set(client):
    admin_headers = _register_and_login(client, "grn-admin4@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_director_note(client, admin_headers, group["id"], piece_id)
    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "s3cret"},
        headers=admin_headers,
    )
    base = f"/guest/{group['join_code']}/pieces/{piece_id}/rehearsal-notes"

    # The join code is the credential now; a password param is neither
    # required nor consulted.
    assert client.get(base).status_code == 200
    assert client.get(base, params={"password": "nope"}).status_code == 200


def test_guest_rehearsal_notes_404_for_piece_not_distributed_to_group(client):
    admin_headers = _register_and_login(client, "grn-admin5@example.com")
    group, _piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    # A group-owned piece from a *different* group, never distributed here.
    other_admin = _register_and_login(client, "grn-other@example.com")
    other_group, other_piece_id, _ov = _create_group_with_distributed_midi_piece(
        client, other_admin, title="Elsewhere"
    )
    _add_director_note(client, other_admin, other_group["id"], other_piece_id)

    response = client.get(f"/guest/{group['join_code']}/pieces/{other_piece_id}/rehearsal-notes")
    assert response.status_code == 404


def _add_group_cue(client, admin_headers, piece_id, time_ms=12000, x=0.3, y=0.4):
    return client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "cue",
            "color": "#2563eb",
            "scope": "group",
            "x": x,
            "y": y,
            "time_ms": time_ms,
        },
        headers=admin_headers,
    )


def _add_group_stamp(client, admin_headers, piece_id):
    return client.post(
        "/piece-markup",
        json={
            "piece_id": piece_id,
            "page_number": 1,
            "kind": "stamp",
            "color": "#0a0",
            "scope": "group",
            "stamp_type": "breath",
            "width": 0.04,
            "x": 0.5,
            "y": 0.5,
        },
        headers=admin_headers,
    )


def test_guest_sees_group_cues_when_tracks_is_public(client):
    admin_headers = _register_and_login(client, "gcue-admin@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    assert _add_group_cue(client, admin_headers, piece_id, time_ms=8000).status_code == 201
    # Director pen/stamp ink shares the group layer but has no guest path.
    assert _add_group_stamp(client, admin_headers, piece_id).status_code == 201

    response = client.get(f"/guest/{group['join_code']}/pieces/{piece_id}/cues")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["kind"] == "cue"
    assert body[0]["scope"] == "group"
    assert body[0]["time_ms"] == 8000


def test_guest_cues_404_when_tracks_members_only_or_disabled(client):
    admin_headers = _register_and_login(client, "gcue-admin2@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_group_cue(client, admin_headers, piece_id)
    base = f"/guest/{group['join_code']}/pieces/{piece_id}/cues"

    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": True, "audience": "members"}]},
        headers=admin_headers,
    )
    assert client.get(base).status_code == 404

    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "tracks", "enabled": False, "audience": "everyone"}]},
        headers=admin_headers,
    )
    assert client.get(base).status_code == 404


def test_guest_cues_404_for_piece_not_distributed_to_group(client):
    admin_headers = _register_and_login(client, "gcue-admin3@example.com")
    group, _piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    other_admin = _register_and_login(client, "gcue-other@example.com")
    other_group, other_piece_id, _ov = _create_group_with_distributed_midi_piece(
        client, other_admin, title="Elsewhere"
    )
    _add_group_cue(client, other_admin, other_piece_id)

    response = client.get(f"/guest/{group['join_code']}/pieces/{other_piece_id}/cues")
    assert response.status_code == 404


def test_guest_cues_open_with_the_join_code_even_when_group_has_a_password(client):
    admin_headers = _register_and_login(client, "gcue-admin4@example.com")
    group, piece_id, _version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    _add_group_cue(client, admin_headers, piece_id, time_ms=3000)
    client.put(
        "/groups/" + group["id"] + "/guest-settings",
        json={"guest_password": "s3cret"},
        headers=admin_headers,
    )
    base = f"/guest/{group['join_code']}/pieces/{piece_id}/cues"

    # No token or password needed: the join code authorizes on its own. A
    # minted token or a stray password param are both simply ignored.
    assert client.get(base).status_code == 200
    token = client.post(f"/guest/{group['join_code']}/auth", json={"password": "s3cret"}).json()["token"]
    assert client.get(base, params={"token": token}).status_code == 200
    assert client.get(base, params={"password": "s3cret"}).status_code == 200


def test_guest_endpoints_are_rate_limited(client):
    admin_headers = _register_and_login(client, "admin4@example.com")
    group = client.post("/groups", json={"name": "Choir4"}, headers=admin_headers).json()

    for _ in range(rate_limit._MAX_REQUESTS_PER_WINDOW):
        response = client.get(f"/guest/{group['join_code']}")
        assert response.status_code == 200

    throttled = client.get(f"/guest/{group['join_code']}")
    assert throttled.status_code == 429


def test_min_identity_saved_does_not_disturb_guest_reads_or_member_signup(client):
    """B19: `min_identity = saved` only gates a *write* by a local-only
    participant. Guest reads (dates / manifest / homework) and a normal
    authenticated member self-signup are untouched by it."""
    admin_headers = _register_and_login(client, "b19-guest-admin@example.com")
    group, piece_id, version_id = _create_group_with_distributed_midi_piece(client, admin_headers)
    member_headers = _register_and_login(client, "b19-guest-member@example.com")
    client.post(
        "/groups/" + group["id"] + "/members",
        json={"email": "b19-guest-member@example.com"},
        headers=admin_headers,
    )
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={
            "pages": [
                {"page": "homework", "enabled": True, "audience": "everyone"},
                {
                    "page": "responsibilities",
                    "enabled": True,
                    "audience": "everyone",
                    "min_identity": "saved",
                },
            ]
        },
        headers=admin_headers,
    )
    client.post(
        "/groups/" + group["id"] + "/homework",
        json={"title": "Kyrie", "range": "mm. 1-20"},
        headers=admin_headers,
    )
    schedule = client.post(
        "/groups/" + group["id"] + "/responsibilities/schedules",
        json={"name": "Sunday", "roles": [{"name": "Cantor", "needed_count": 2}]},
        headers=admin_headers,
    ).json()
    date = client.post(
        "/groups/" + group["id"] + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [schedule["id"]]},
        headers=admin_headers,
    ).json()
    code = group["join_code"]

    # Reads: unaffected.
    assert client.get(f"/guest/{code}/responsibilities/dates").status_code == 200
    assert client.get(f"/guest/{code}/homework").status_code == 200
    assert client.get(f"/guest/{code}/pieces/{piece_id}/manifest").status_code == 200

    # A real authenticated member can still self-sign-up on the gated page.
    ok = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": schedule["roles"][0]["id"]},
        headers=member_headers,
    )
    assert ok.status_code == 201
    _cleanup_render(version_id)
