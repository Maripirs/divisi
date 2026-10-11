"""Section tags (`part_scope`) on weekly notes and piece rehearsal notes:
the pure normalizer, plus the write/read paths that apply it."""

import io

import pytest

from app.services.part_scope import normalize_part_scope


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _make_group(client, headers):
    return client.post("/groups", json={"name": "G"}, headers=headers).json()


def _upload_piece(client, headers, group_id):
    data = {"title": "Ave Maria", "owner_type": "group", "group_id": group_id}
    files = {"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")}
    return client.post("/library/pieces", data=data, files=files, headers=headers).json()["piece"]["id"]


def _create_weekly(client, headers, group_id, **extra):
    return client.post(
        f"/groups/{group_id}/weekly-notes",
        json={"title": "Week", "note_date": "2026-09-01T00:00:00Z", **extra},
        headers=headers,
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        (" , ,", None),
        ("bass,tenor", "tenor,bass"),
        ("Tenor, BASS ,tenor", "tenor,bass"),
        ("alto", "alto"),
        ("bass,alto,soprano", "soprano,alto,bass"),
        ("soprano,alto,tenor,bass", None),
        ("bass,tenor,alto,soprano,alto", None),
    ],
)
def test_normalize_part_scope(raw, expected):
    assert normalize_part_scope(raw) == expected


@pytest.mark.parametrize("raw", ["Tenor 1", "baritone", "tenor,all", "tenor;bass"])
def test_normalize_part_scope_rejects_unknown_tokens(raw):
    with pytest.raises(ValueError):
        normalize_part_scope(raw)


def test_weekly_note_part_scope_create_update_list_round_trip(client):
    headers = _register_and_login(client, "ps-wn1@example.com")
    group_id = _make_group(client, headers)["id"]

    tagged = _create_weekly(client, headers, group_id, part_scope="bass,Tenor")
    assert tagged.status_code == 201
    assert tagged.json()["part_scope"] == "tenor,bass"
    untagged = _create_weekly(client, headers, group_id)
    assert untagged.json()["part_scope"] is None

    note_id = tagged.json()["id"]
    edited = client.put(
        f"/weekly-notes/{note_id}",
        json={"title": "Week", "note_date": "2026-09-01T00:00:00Z", "part_scope": "alto"},
        headers=headers,
    )
    assert edited.status_code == 200
    assert edited.json()["part_scope"] == "alto"

    listing = {n["id"]: n["part_scope"] for n in client.get(f"/groups/{group_id}/weekly-notes", headers=headers).json()}
    assert listing == {note_id: "alto", untagged.json()["id"]: None}

    # Selecting every section is the same thing as "All".
    all_four = client.put(
        f"/weekly-notes/{note_id}",
        json={"title": "Week", "note_date": "2026-09-01T00:00:00Z", "part_scope": "soprano,alto,tenor,bass"},
        headers=headers,
    )
    assert all_four.json()["part_scope"] is None


def test_weekly_note_unknown_section_422s(client):
    headers = _register_and_login(client, "ps-wn2@example.com")
    group_id = _make_group(client, headers)["id"]

    assert _create_weekly(client, headers, group_id, part_scope="baritone").status_code == 422
    note_id = _create_weekly(client, headers, group_id).json()["id"]
    bad_edit = client.put(
        f"/weekly-notes/{note_id}",
        json={"title": "Week", "note_date": "2026-09-01T00:00:00Z", "part_scope": "tenor,altos"},
        headers=headers,
    )
    assert bad_edit.status_code == 422


def test_guest_weekly_notes_listing_includes_part_scope(client):
    headers = _register_and_login(client, "ps-guest@example.com")
    group = _make_group(client, headers)
    client.put(
        f"/groups/{group['id']}/page-settings",
        json={"pages": [{"page": "weekly_notes", "enabled": True, "audience": "everyone"}]},
        headers=headers,
    )
    _create_weekly(client, headers, group["id"], part_scope="tenor,bass")

    body = client.get(f"/guest/{group['join_code']}/weekly-notes").json()
    assert [n["part_scope"] for n in body] == ["tenor,bass"]


def test_piece_note_multi_section_create_and_update(client):
    headers = _register_and_login(client, "ps-pn@example.com")
    group_id = _make_group(client, headers)["id"]
    piece_id = _upload_piece(client, headers, group_id)
    url = f"/groups/{group_id}/pieces/{piece_id}/rehearsal-notes"

    created = client.post(url, json={"body": "Lift off beat 3", "part_scope": "bass,soprano"}, headers=headers)
    assert created.status_code == 201
    assert created.json()["part_scope"] == "soprano,bass"

    note_id = created.json()["id"]
    edited = client.put(
        f"/piece-rehearsal-notes/{note_id}", json={"body": "Lift off beat 3", "part_scope": ""}, headers=headers
    )
    assert edited.status_code == 200
    assert edited.json()["part_scope"] is None

    assert client.post(url, json={"body": "x", "part_scope": "Tenor 1"}, headers=headers).status_code == 422
    assert [n["part_scope"] for n in client.get(url, headers=headers).json()] == [None]


def test_promote_defaults_part_scope_to_source_note(client):
    headers = _register_and_login(client, "ps-promote@example.com")
    group_id = _make_group(client, headers)["id"]
    piece_id = _upload_piece(client, headers, group_id)
    note_id = _create_weekly(client, headers, group_id, part_scope="tenor,bass").json()["id"]

    inherited = client.post(f"/weekly-notes/{note_id}/promote", json={"piece_id": piece_id}, headers=headers)
    assert inherited.status_code == 201
    assert inherited.json()["part_scope"] == "tenor,bass"

    overridden = client.post(
        f"/weekly-notes/{note_id}/promote", json={"piece_id": piece_id, "part_scope": "alto"}, headers=headers
    )
    assert overridden.json()["part_scope"] == "alto"

    # An explicit null is a real "for everyone" choice, not "use the source's".
    cleared = client.post(
        f"/weekly-notes/{note_id}/promote", json={"piece_id": piece_id, "part_scope": None}, headers=headers
    )
    assert cleared.json()["part_scope"] is None

    bad = client.post(
        f"/weekly-notes/{note_id}/promote", json={"piece_id": piece_id, "part_scope": "baritone"}, headers=headers
    )
    assert bad.status_code == 422
