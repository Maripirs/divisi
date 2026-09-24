"""B17: the working-draft slot — `POST /library/pieces/{id}/working-draft`
(get-or-create, copy-on-edit), `PUT /library/versions/{id}/file` (save in
place), `POST /library/versions/{id}/publish` (submit->approve->distribute
in one), and generate-from-PDF replacing an existing open draft.
"""

import io


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _upload_personal_piece(client, headers, title="Ave Maria"):
    r = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "user"},
        files={
            "file": ("orig.xml", io.BytesIO(b"<score-partwise/>"), "application/xml"),
            "pdf_file": ("orig.pdf", io.BytesIO(b"%PDF-1.4 original"), "application/pdf"),
        },
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()["piece"]["id"], r.json()["version"]["id"]


def _make_group_with_member(client, admin_headers, member_email, name="Choir"):
    group_id = client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]
    client.post(f"/groups/{group_id}/members", json={"email": member_email}, headers=admin_headers)
    return group_id


# --- get-or-create -----------------------------------------------------


def test_working_draft_created_by_cloning_the_live_version(client):
    headers = _register_and_login(client, "wd-create@example.com")
    piece_id, live_version_id = _upload_personal_piece(client, headers)
    # Move the initial version out of `draft` first -- otherwise it's
    # itself the open working draft (Part B's broadened `source=original`
    # fallback, see `working_draft`'s doc comment) and get-or-create just
    # returns it instead of cloning, which is what this test wants to lock in.
    assert client.post(f"/library/versions/{live_version_id}/submit", headers=headers).status_code == 200
    assert client.post(f"/library/versions/{live_version_id}/approve", headers=headers).status_code == 200

    r = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["forked_from_live"] is True
    assert body["version"]["id"] != live_version_id
    assert body["version"]["status"] == "draft"
    assert body["version"]["source"] == "modification"

    draft_id = body["version"]["id"]
    # Files were content-copied from the live version, not left empty.
    assert client.get(f"/library/versions/{draft_id}/file", headers=headers).content == b"<score-partwise/>"
    assert client.get(f"/library/versions/{draft_id}/pdf", headers=headers).content == b"%PDF-1.4 original"


def test_working_draft_is_idempotent(client):
    headers = _register_and_login(client, "wd-idem@example.com")
    piece_id, _ = _upload_personal_piece(client, headers)

    first = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()
    second = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()

    assert first["version"]["id"] == second["version"]["id"]
    assert second["forked_from_live"] is False


def test_working_draft_requires_review_authority(client):
    admin = _register_and_login(client, "wd-admin@example.com")
    member = _register_and_login(client, "wd-member@example.com")
    group_id = _make_group_with_member(client, admin, "wd-member@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Group Piece", "owner_type": "group", "group_id": group_id},
        files={"file": ("g.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]

    assert client.post(f"/library/pieces/{piece_id}/working-draft", headers=member).status_code == 403
    assert client.post(f"/library/pieces/{piece_id}/working-draft", headers=admin).status_code == 200


# --- PUT .../file ----------------------------------------------------


def test_put_file_updates_the_draft_in_place(client):
    headers = _register_and_login(client, "wd-put@example.com")
    piece_id, _ = _upload_personal_piece(client, headers)
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"]

    r = client.put(
        f"/library/versions/{draft_id}/file",
        files={"file": ("edit.xml", io.BytesIO(b"<score-partwise><edited/></score-partwise>"), "application/xml")},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["id"] == draft_id  # same row, no new version
    assert b"<edited/>" in client.get(f"/library/versions/{draft_id}/file", headers=headers).content


def test_put_file_refuses_a_non_draft(client):
    headers = _register_and_login(client, "wd-nondraft@example.com")
    _piece_id, version_id = _upload_personal_piece(client, headers)
    # Move it out of `draft` (draft -> submitted) so it's no longer editable in place.
    assert client.post(f"/library/versions/{version_id}/submit", headers=headers).status_code == 200

    r = client.put(
        f"/library/versions/{version_id}/file",
        files={"file": ("x.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=headers,
    )
    assert r.status_code == 409


def test_put_file_rejects_empty(client):
    headers = _register_and_login(client, "wd-empty@example.com")
    piece_id, _ = _upload_personal_piece(client, headers)
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"]

    r = client.put(
        f"/library/versions/{draft_id}/file",
        files={"file": ("x.xml", io.BytesIO(b""), "application/xml")},
        headers=headers,
    )
    assert r.status_code == 400


# --- publish -------------------------------------------------------


def test_publish_personal_piece_approves_the_draft(client):
    headers = _register_and_login(client, "wd-pub@example.com")
    piece_id, _ = _upload_personal_piece(client, headers)
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"]

    r = client.post(
        f"/library/versions/{draft_id}/publish",
        json={"seams_resolved": True},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    # It's no longer the open working draft — a fresh copy-on-edit starts next time.
    again = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()
    assert again["version"]["id"] != draft_id
    assert again["forked_from_live"] is True


def test_publish_group_piece_distributes(client):
    admin = _register_and_login(client, "wd-gpub-admin@example.com")
    member = _register_and_login(client, "wd-gpub-member@example.com")
    group_id = _make_group_with_member(client, admin, "wd-gpub-member@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Group Piece", "owner_type": "group", "group_id": group_id},
        files={"file": ("g.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=admin).json()["version"]["id"]

    r = client.post(f"/library/versions/{draft_id}/publish", json={"seams_resolved": True}, headers=admin)
    assert r.status_code == 200

    # The member now sees the piece in their library (it was distributed).
    member_lib = client.get("/library/pieces", headers=member).json()
    entry = next(e for e in member_lib if e["piece_id"] == piece_id)
    assert entry["version_id"] == draft_id


def test_publish_refuses_unresolved_seams(client):
    headers = _register_and_login(client, "wd-pub-409@example.com")
    piece_id, _ = _upload_personal_piece(client, headers)
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"]

    r = client.post(f"/library/versions/{draft_id}/publish", json={"seams_resolved": False}, headers=headers)
    assert r.status_code == 409
    # Still a draft, untouched.
    assert client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"] == draft_id


def test_publish_a_non_draft_version_is_409(client):
    """Publishing only ever applies to a version still in `draft` status --
    once it's been submitted (or beyond), `publish_version` refuses it
    regardless of `source`. (A fresh `draft`/`source=original` version --
    what `_upload_personal_piece` itself creates -- is now publishable
    directly; see `test_publish_a_fresh_original_source_draft` below for
    that broadened case.)"""
    headers = _register_and_login(client, "wd-pub-nonwd@example.com")
    _piece_id, version_id = _upload_personal_piece(client, headers)
    assert client.post(f"/library/versions/{version_id}/submit", headers=headers).status_code == 200

    r = client.post(f"/library/versions/{version_id}/publish", json={"seams_resolved": True}, headers=headers)
    assert r.status_code == 409


def test_publish_requires_review_authority(client):
    admin = _register_and_login(client, "wd-pub-403-admin@example.com")
    member = _register_and_login(client, "wd-pub-403-member@example.com")
    group_id = _make_group_with_member(client, admin, "wd-pub-403-member@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Group Piece", "owner_type": "group", "group_id": group_id},
        files={"file": ("g.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]
    draft_id = client.post(f"/library/pieces/{piece_id}/working-draft", headers=admin).json()["version"]["id"]

    r = client.post(f"/library/versions/{draft_id}/publish", json={"seams_resolved": True}, headers=member)
    assert r.status_code == 403


# --- generate-from-PDF replaces an existing open working draft --------


def _fake_run_omr_ok(monkeypatch):
    from app.jobs import omr_jobs

    def fake_run_omr(source_path, output_dir):
        output_dir.mkdir(parents=True, exist_ok=True)
        mx = output_dir / "score.musicxml"
        mx.write_bytes(b"<score-partwise/>")
        mid = output_dir / "score.mid"
        mid.write_bytes(b"fake midi bytes")
        return mx, mid

    monkeypatch.setattr(omr_jobs, "run_omr", fake_run_omr)


def test_generate_replaces_an_existing_open_working_draft(client, monkeypatch):
    headers = _register_and_login(client, "wd-gen-replace@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, _ = _upload_personal_piece(client, headers)

    first_draft = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"]

    client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )

    entry = next(
        e for e in client.get("/library/pieces", headers=headers).json() if e["piece_id"] == piece_id
    )
    new_draft = entry["pending_generated_version_id"]
    assert new_draft is not None
    assert new_draft != first_draft

    # Only one open working draft: asking again returns the generated one,
    # not a third.
    assert client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()["version"]["id"] == new_draft

    # The old one was rejected, not left dangling.
    assert client.post(f"/library/versions/{first_draft}/publish", json={"seams_resolved": True}, headers=headers).status_code == 409


# --- Part B: a fresh original-source draft (a brand-new, never-submitted
# piece) is discoverable/publishable through the same working-draft slot,
# closing the gap where a new Tracks-tab upload had no review step at all --
# see Backend/app/services/pieces.py's `working_draft`/`publish_version` doc
# comments for the reasoning. ---------------------------------------------


def test_working_draft_finds_a_fresh_original_source_draft(client):
    headers = _register_and_login(client, "wd-original@example.com")
    piece_id, version_id = _upload_personal_piece(client, headers)

    r = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers)
    assert r.status_code == 200
    body = r.json()
    # Found the existing original-source draft rather than cloning a new
    # modification version on top of it.
    assert body["forked_from_live"] is False
    assert body["version"]["id"] == version_id
    assert body["version"]["source"] == "original"
    assert body["version"]["status"] == "draft"


def test_publish_a_fresh_original_source_draft(client):
    headers = _register_and_login(client, "wd-pub-original@example.com")
    piece_id, version_id = _upload_personal_piece(client, headers)

    r = client.post(f"/library/versions/{version_id}/publish", json={"seams_resolved": True}, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    # No longer an open working draft -- a fresh copy-on-edit starts next time.
    again = client.post(f"/library/pieces/{piece_id}/working-draft", headers=headers).json()
    assert again["version"]["id"] != version_id
    assert again["forked_from_live"] is True


def test_publish_a_fresh_original_source_draft_distributes_for_a_group_piece(client):
    admin = _register_and_login(client, "wd-pub-original-admin@example.com")
    member = _register_and_login(client, "wd-pub-original-member@example.com")
    group_id = _make_group_with_member(client, admin, "wd-pub-original-member@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Group Piece", "owner_type": "group", "group_id": group_id},
        files={"file": ("g.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]

    r = client.post(f"/library/versions/{version_id}/publish", json={"seams_resolved": True}, headers=admin)
    assert r.status_code == 200

    member_lib = client.get("/library/pieces", headers=member).json()
    entry = next(e for e in member_lib if e["piece_id"] == piece_id)
    assert entry["version_id"] == version_id


def test_admin_sees_own_groups_undistributed_piece_in_library(client):
    """Part B: `list_my_library`'s new admin-only branch -- a group-owned
    piece with zero `Distribution` rows at all (exactly what a brand-new
    Tracks-tab upload is, before publish) is now visible to the admin who
    uploaded it, so its `/review` link stays reachable while ambiguous
    parts are still unresolved."""
    admin = _register_and_login(client, "wd-undist-admin@example.com")
    member = _register_and_login(client, "wd-undist-member@example.com")
    group_id = _make_group_with_member(client, admin, "wd-undist-member@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Never Distributed", "owner_type": "group", "group_id": group_id},
        files={"file": ("g.xml", io.BytesIO(b"<score-partwise/>"), "application/xml")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]

    admin_lib = client.get("/library/pieces", headers=admin).json()
    entry = next((e for e in admin_lib if e["piece_id"] == piece_id), None)
    assert entry is not None
    assert entry["version_id"] == version_id
    assert entry["pending_generated_version_id"] == version_id

    # A plain member (not admin) gets nothing -- it's never been shared.
    member_lib = client.get("/library/pieces", headers=member).json()
    assert all(e["piece_id"] != piece_id for e in member_lib)
