import io


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _upload_file(
    client,
    headers,
    title="Ave Maria",
    owner_type="user",
    group_id=None,
    include_music=True,
    include_pdf=False,
    composer=None,
    youtube_url=None,
    default_tempo_bpm=None,
):
    data = {"title": title, "owner_type": owner_type}
    if group_id:
        data["group_id"] = group_id
    if composer is not None:
        data["composer"] = composer
    if youtube_url is not None:
        data["youtube_url"] = youtube_url
    if default_tempo_bpm is not None:
        data["default_tempo_bpm"] = default_tempo_bpm
    files = {}
    if include_music:
        files["file"] = ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")
    if include_pdf:
        files["pdf_file"] = ("piece.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")
    return client.post("/library/pieces", data=data, files=files, headers=headers)


def test_individual_can_upload_and_own_a_piece(client):
    headers = _register_and_login(client, "solo@example.com")
    upload = _upload_file(client, headers)
    assert upload.status_code == 201
    body = upload.json()
    assert body["piece"]["owner_type"] == "user"
    assert body["version"]["status"] == "draft"
    assert body["version"]["source"] == "original"

    library = client.get("/library/pieces", headers=headers)
    assert library.status_code == 200
    assert [e["title"] for e in library.json()] == ["Ave Maria"]


def test_non_admin_cannot_upload_group_piece(client):
    admin_headers = _register_and_login(client, "gadmin@example.com")
    member_headers = _register_and_login(client, "gmember@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "gmember@example.com"}, headers=admin_headers)

    forbidden = _upload_file(client, member_headers, owner_type="group", group_id=group_id)
    assert forbidden.status_code == 403


def test_full_group_review_and_distribution_flow(client):
    admin_headers = _register_and_login(client, "admin@example.com")
    member_headers = _register_and_login(client, "member@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "member@example.com"}, headers=admin_headers)

    upload = _upload_file(client, admin_headers, owner_type="group", group_id=group_id)
    assert upload.status_code == 201
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]

    # Not yet approved: distribution is refused.
    early_push = client.post(
        f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers
    )
    assert early_push.status_code == 409

    submit = client.post(f"/library/versions/{version_id}/submit", headers=admin_headers)
    assert submit.status_code == 200
    assert submit.json()["status"] == "submitted"

    # A non-admin member cannot approve.
    member_approve = client.post(f"/library/versions/{version_id}/approve", headers=member_headers)
    assert member_approve.status_code == 403

    approve = client.post(f"/library/versions/{version_id}/approve", headers=admin_headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"

    push = client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    assert push.status_code == 201

    # Pushing the same version to the same group twice is a conflict.
    push_again = client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)
    assert push_again.status_code == 409

    member_library = client.get("/library/pieces", headers=member_headers)
    assert member_library.status_code == 200
    entry = member_library.json()[0]
    assert entry["piece_id"] == piece_id
    assert entry["version_status"] == "approved"


def test_member_can_submit_but_not_approve_own_version(client):
    admin_headers = _register_and_login(client, "admin2@example.com")
    member_headers = _register_and_login(client, "member2@example.com")
    group_id = client.post("/groups", json={"name": "Choir"}, headers=admin_headers).json()["id"]
    client.post("/groups/" + group_id + "/members", json={"email": "member2@example.com"}, headers=admin_headers)

    upload = _upload_file(client, admin_headers, owner_type="group", group_id=group_id)
    piece_id = upload.json()["piece"]["id"]

    new_version = client.post(
        f"/library/pieces/{piece_id}/versions",
        files={"file": ("v2.xml", io.BytesIO(b"<musicxml/>"), "application/xml")},
        headers=member_headers,
    )
    assert new_version.status_code == 201
    version_id = new_version.json()["id"]
    assert new_version.json()["source"] == "modification"

    submit = client.post(f"/library/versions/{version_id}/submit", headers=member_headers)
    assert submit.status_code == 200

    forbidden = client.post(f"/library/versions/{version_id}/approve", headers=member_headers)
    assert forbidden.status_code == 403

    reject = client.post(f"/library/versions/{version_id}/reject", headers=admin_headers)
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    # Rejected version never appears in the member's own group library (nothing was ever distributed).
    member_library = client.get("/library/pieces", headers=member_headers)
    assert member_library.json() == []


def test_default_tempo_owner_can_set_and_clear(client):
    headers = _register_and_login(client, "tempoowner@example.com")
    upload = _upload_file(client, headers)
    piece_id = upload.json()["piece"]["id"]
    assert upload.json()["piece"]["default_tempo_bpm"] is None

    set_res = client.put(
        f"/library/pieces/{piece_id}/default-tempo", json={"default_tempo_bpm": 76}, headers=headers
    )
    assert set_res.status_code == 200
    assert set_res.json()["default_tempo_bpm"] == 76

    library = client.get("/library/pieces", headers=headers)
    assert library.json()[0]["default_tempo_bpm"] == 76

    clear_res = client.put(
        f"/library/pieces/{piece_id}/default-tempo", json={"default_tempo_bpm": None}, headers=headers
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["default_tempo_bpm"] is None


def test_default_tempo_non_owner_and_non_admin_forbidden(client):
    owner_headers = _register_and_login(client, "tempoowner2@example.com")
    other_headers = _register_and_login(client, "tempostranger@example.com")
    piece_id = _upload_file(client, owner_headers).json()["piece"]["id"]

    res = client.put(
        f"/library/pieces/{piece_id}/default-tempo", json={"default_tempo_bpm": 90}, headers=other_headers
    )
    assert res.status_code == 403

    admin_headers = _register_and_login(client, "tempogadmin@example.com")
    member_headers = _register_and_login(client, "tempogmember@example.com")
    group_id = client.post("/groups", json={"name": "Tempo Choir"}, headers=admin_headers).json()["id"]
    client.post(
        f"/groups/{group_id}/members", json={"email": "tempogmember@example.com"}, headers=admin_headers
    )
    group_piece_id = _upload_file(
        client, admin_headers, title="Group Piece", owner_type="group", group_id=group_id
    ).json()["piece"]["id"]

    member_res = client.put(
        f"/library/pieces/{group_piece_id}/default-tempo", json={"default_tempo_bpm": 90}, headers=member_headers
    )
    assert member_res.status_code == 403

    admin_res = client.put(
        f"/library/pieces/{group_piece_id}/default-tempo", json={"default_tempo_bpm": 90}, headers=admin_headers
    )
    assert admin_res.status_code == 200
    assert admin_res.json()["default_tempo_bpm"] == 90


def test_piece_details_owner_can_edit_and_clear(client):
    headers = _register_and_login(client, "detailsowner@example.com")
    piece_id = _upload_file(client, headers, title="Draft Title", composer="Old Composer").json()["piece"]["id"]

    edit_res = client.patch(
        f"/library/pieces/{piece_id}",
        json={"title": "Final Title", "composer": "New Composer", "youtube_url": "https://youtu.be/abc123"},
        headers=headers,
    )
    assert edit_res.status_code == 200
    body = edit_res.json()
    assert body["title"] == "Final Title"
    assert body["composer"] == "New Composer"
    assert body["youtube_url"] == "https://youtu.be/abc123"

    library = client.get("/library/pieces", headers=headers)
    assert library.json()[0]["title"] == "Final Title"

    clear_res = client.patch(
        f"/library/pieces/{piece_id}", json={"title": "Final Title", "composer": None, "youtube_url": None},
        headers=headers,
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["composer"] is None
    assert clear_res.json()["youtube_url"] is None


def test_piece_details_can_set_and_clear_default_tempo(client):
    # The edit-details panel folds default-tempo editing into this same
    # endpoint rather than a separate one — see `update_piece_details`.
    headers = _register_and_login(client, "detailstempo@example.com")
    piece_id = _upload_file(client, headers).json()["piece"]["id"]

    set_res = client.patch(
        f"/library/pieces/{piece_id}", json={"title": "Ave Maria", "default_tempo_bpm": 84}, headers=headers
    )
    assert set_res.status_code == 200
    assert set_res.json()["default_tempo_bpm"] == 84

    clear_res = client.patch(
        f"/library/pieces/{piece_id}", json={"title": "Ave Maria", "default_tempo_bpm": None}, headers=headers
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["default_tempo_bpm"] is None


def test_piece_details_blank_title_rejected(client):
    headers = _register_and_login(client, "detailsblank@example.com")
    piece_id = _upload_file(client, headers).json()["piece"]["id"]

    res = client.patch(f"/library/pieces/{piece_id}", json={"title": "   "}, headers=headers)
    assert res.status_code == 400


def test_piece_details_non_owner_and_non_admin_forbidden(client):
    owner_headers = _register_and_login(client, "detailsowner2@example.com")
    other_headers = _register_and_login(client, "detailsstranger@example.com")
    piece_id = _upload_file(client, owner_headers).json()["piece"]["id"]

    res = client.patch(f"/library/pieces/{piece_id}", json={"title": "Hijacked"}, headers=other_headers)
    assert res.status_code == 403

    admin_headers = _register_and_login(client, "detailsgadmin@example.com")
    member_headers = _register_and_login(client, "detailsgmember@example.com")
    group_id = client.post("/groups", json={"name": "Details Choir"}, headers=admin_headers).json()["id"]
    client.post(
        f"/groups/{group_id}/members", json={"email": "detailsgmember@example.com"}, headers=admin_headers
    )
    group_piece_id = _upload_file(
        client, admin_headers, title="Group Piece", owner_type="group", group_id=group_id
    ).json()["piece"]["id"]

    member_res = client.patch(
        f"/library/pieces/{group_piece_id}", json={"title": "Member Edit"}, headers=member_headers
    )
    assert member_res.status_code == 403

    admin_res = client.patch(
        f"/library/pieces/{group_piece_id}", json={"title": "Admin Edit"}, headers=admin_headers
    )
    assert admin_res.status_code == 200
    assert admin_res.json()["title"] == "Admin Edit"


def test_delete_piece_owner_can_delete_and_it_disappears(client):
    headers = _register_and_login(client, "deleteowner@example.com")
    piece_id = _upload_file(client, headers).json()["piece"]["id"]
    assert client.get("/library/pieces", headers=headers).json() != []

    res = client.delete(f"/library/pieces/{piece_id}", headers=headers)
    assert res.status_code == 204
    assert client.get("/library/pieces", headers=headers).json() == []

    # Gone, not just hidden — a second delete/patch 404s.
    assert client.delete(f"/library/pieces/{piece_id}", headers=headers).status_code == 404
    assert client.patch(f"/library/pieces/{piece_id}", json={"title": "x"}, headers=headers).status_code == 404


def test_delete_piece_cleans_up_annotations_and_distributions(client):
    admin_headers = _register_and_login(client, "deleteadmin@example.com")
    member_headers = _register_and_login(client, "deletemember@example.com")
    group_id = client.post("/groups", json={"name": "Delete Choir"}, headers=admin_headers).json()["id"]
    client.post(f"/groups/{group_id}/members", json={"email": "deletemember@example.com"}, headers=admin_headers)

    upload = _upload_file(client, admin_headers, owner_type="group", group_id=group_id)
    piece_id = upload.json()["piece"]["id"]
    version_id = upload.json()["version"]["id"]
    client.post(f"/library/versions/{version_id}/submit", headers=admin_headers)
    client.post(f"/library/versions/{version_id}/approve", headers=admin_headers)
    client.post(f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers)

    annotation = client.post(
        "/annotations",
        json={"piece_id": piece_id, "position": "0", "content": "watch the tempo here"},
        headers=member_headers,
    )
    assert annotation.status_code == 201

    res = client.delete(f"/library/pieces/{piece_id}", headers=admin_headers)
    assert res.status_code == 204
    assert client.get("/library/pieces", headers=member_headers).json() == []


def test_delete_piece_non_owner_and_non_admin_forbidden(client):
    owner_headers = _register_and_login(client, "deleteowner2@example.com")
    other_headers = _register_and_login(client, "deletestranger@example.com")
    piece_id = _upload_file(client, owner_headers).json()["piece"]["id"]

    res = client.delete(f"/library/pieces/{piece_id}", headers=other_headers)
    assert res.status_code == 403

    admin_headers = _register_and_login(client, "deletegadmin@example.com")
    member_headers = _register_and_login(client, "deletegmember@example.com")
    group_id = client.post("/groups", json={"name": "Delete Choir 2"}, headers=admin_headers).json()["id"]
    client.post(f"/groups/{group_id}/members", json={"email": "deletegmember@example.com"}, headers=admin_headers)
    group_piece_id = _upload_file(
        client, admin_headers, title="Group Piece", owner_type="group", group_id=group_id
    ).json()["piece"]["id"]

    member_res = client.delete(f"/library/pieces/{group_piece_id}", headers=member_headers)
    assert member_res.status_code == 403

    admin_res = client.delete(f"/library/pieces/{group_piece_id}", headers=admin_headers)
    assert admin_res.status_code == 204


# --- Real piece uploads: MIDI/MusicXML + PDF + reference audio ---


def test_upload_music_only(client):
    headers = _register_and_login(client, "musiconly@example.com")
    upload = _upload_file(client, headers, include_music=True, include_pdf=False)
    assert upload.status_code == 201
    version = upload.json()["version"]
    assert version["id"]

    library = client.get("/library/pieces", headers=headers)
    entry = library.json()[0]
    assert entry["has_music"] is True
    assert entry["has_pdf"] is False


def test_upload_pdf_only(client):
    headers = _register_and_login(client, "pdfonly@example.com")
    upload = _upload_file(client, headers, include_music=False, include_pdf=True)
    assert upload.status_code == 201

    library = client.get("/library/pieces", headers=headers)
    entry = library.json()[0]
    assert entry["has_music"] is False
    assert entry["has_pdf"] is True


def test_upload_music_and_pdf(client):
    headers = _register_and_login(client, "both@example.com")
    upload = _upload_file(client, headers, include_music=True, include_pdf=True)
    assert upload.status_code == 201

    library = client.get("/library/pieces", headers=headers)
    entry = library.json()[0]
    assert entry["has_music"] is True
    assert entry["has_pdf"] is True
    assert entry["music_file_name"] == "piece.xml"
    assert entry["pdf_file_name"] == "piece.pdf"


def test_new_version_carries_forward_untouched_file_slot(client):
    # The edit panel's "replace/add a file" fields are independent — giving
    # just a new music file must not erase an already-uploaded PDF, and
    # vice versa. See `upload_version`'s carry-forward.
    headers = _register_and_login(client, "carryforward@example.com")
    piece_id = _upload_file(client, headers, include_music=True, include_pdf=True).json()["piece"]["id"]

    music_only = client.post(
        f"/library/pieces/{piece_id}/versions",
        files={"file": ("v2.xml", io.BytesIO(b"<musicxml v2/>"), "application/xml")},
        headers=headers,
    )
    assert music_only.status_code == 201
    version_id = music_only.json()["id"]
    assert client.get(f"/library/versions/{version_id}/file", headers=headers).status_code == 200
    assert client.get(f"/library/versions/{version_id}/pdf", headers=headers).status_code == 200
    entry = client.get("/library/pieces", headers=headers).json()[0]
    assert entry["music_file_name"] == "v2.xml"
    assert entry["pdf_file_name"] == "piece.pdf"

    pdf_only = client.post(
        f"/library/pieces/{piece_id}/versions",
        files={"pdf_file": ("v3.pdf", io.BytesIO(b"%PDF-1.4 v3"), "application/pdf")},
        headers=headers,
    )
    assert pdf_only.status_code == 201
    version_id_2 = pdf_only.json()["id"]
    assert client.get(f"/library/versions/{version_id_2}/file", headers=headers).status_code == 200
    assert client.get(f"/library/versions/{version_id_2}/pdf", headers=headers).status_code == 200
    entry_2 = client.get("/library/pieces", headers=headers).json()[0]
    assert entry_2["music_file_name"] == "v2.xml"
    assert entry_2["pdf_file_name"] == "v3.pdf"


def test_new_version_can_explicitly_remove_a_file_slot(client):
    # `remove_file`/`remove_pdf_file` — distinct from just omitting the
    # file (which carries the existing one forward, per the test above).
    headers = _register_and_login(client, "removefile@example.com")
    piece_id = _upload_file(client, headers, include_music=True, include_pdf=True).json()["piece"]["id"]

    remove_pdf = client.post(
        f"/library/pieces/{piece_id}/versions", data={"remove_pdf_file": "true"}, headers=headers
    )
    assert remove_pdf.status_code == 201
    entry = client.get("/library/pieces", headers=headers).json()[0]
    assert entry["has_music"] is True
    assert entry["has_pdf"] is False
    assert entry["pdf_file_name"] is None

    remove_music_too = client.post(
        f"/library/pieces/{piece_id}/versions", data={"remove_file": "true"}, headers=headers
    )
    assert remove_music_too.status_code == 400

    # Removing the last file while simultaneously supplying a replacement
    # for it is fine — it's not actually left with nothing.
    replace_and_remove_other = client.post(
        f"/library/pieces/{piece_id}/versions",
        data={"remove_pdf_file": "true"},
        files={"file": ("v2.xml", io.BytesIO(b"<musicxml v2/>"), "application/xml")},
        headers=headers,
    )
    assert replace_and_remove_other.status_code == 201
    entry_2 = client.get("/library/pieces", headers=headers).json()[0]
    assert entry_2["has_music"] is True
    assert entry_2["has_pdf"] is False
    assert entry_2["music_file_name"] == "v2.xml"


def test_upload_neither_music_nor_pdf_rejected(client):
    headers = _register_and_login(client, "neither@example.com")
    upload = _upload_file(client, headers, include_music=False, include_pdf=False)
    assert upload.status_code == 400


def test_upload_composer_youtube_and_default_tempo_round_trip(client):
    headers = _register_and_login(client, "metadata@example.com")
    upload = _upload_file(
        client,
        headers,
        composer="W. A. Mozart",
        youtube_url="https://youtube.com/watch?v=abc123",
        default_tempo_bpm=88,
    )
    assert upload.status_code == 201
    piece = upload.json()["piece"]
    assert piece["composer"] == "W. A. Mozart"
    assert piece["youtube_url"] == "https://youtube.com/watch?v=abc123"
    assert piece["default_tempo_bpm"] == 88

    library = client.get("/library/pieces", headers=headers)
    entry = library.json()[0]
    assert entry["composer"] == "W. A. Mozart"
    assert entry["youtube_url"] == "https://youtube.com/watch?v=abc123"


def test_version_file_route_200_when_present_404_when_absent(client):
    headers = _register_and_login(client, "filesroute@example.com")
    upload = _upload_file(client, headers, include_music=True, include_pdf=False)
    version_id = upload.json()["version"]["id"]

    music = client.get(f"/library/versions/{version_id}/file", headers=headers)
    assert music.status_code == 200

    pdf = client.get(f"/library/versions/{version_id}/pdf", headers=headers)
    assert pdf.status_code == 404


def test_version_pdf_route_200_when_present_404_when_absent(client):
    headers = _register_and_login(client, "pdfroute@example.com")
    upload = _upload_file(client, headers, include_music=False, include_pdf=True)
    version_id = upload.json()["version"]["id"]

    pdf = client.get(f"/library/versions/{version_id}/pdf", headers=headers)
    assert pdf.status_code == 200

    music = client.get(f"/library/versions/{version_id}/file", headers=headers)
    assert music.status_code == 404


def test_version_pdf_route_404_not_500_when_bytes_missing_from_storage(client, monkeypatch):
    # A version row can outlive its file: the free-tier disk gets wiped, or
    # an object-storage key goes missing. The route must surface that as a
    # clean 404, not let FileResponse raise a 500. See storage/files.py's
    # resolve_existing_source_path.
    headers = _register_and_login(client, "gonepdf@example.com")
    upload = _upload_file(client, headers, include_music=False, include_pdf=True)
    version_id = upload.json()["version"]["id"]
    assert client.get(f"/library/versions/{version_id}/pdf", headers=headers).status_code == 200

    from app.api.routes.library import files as library_files

    def _raise_missing(_path):
        raise FileNotFoundError(_path)

    monkeypatch.setattr(library_files, "resolve_existing_source_path", _raise_missing)
    gone = client.get(f"/library/versions/{version_id}/pdf", headers=headers)
    assert gone.status_code == 404
    assert "missing from storage" in gone.json()["detail"]


def test_version_file_routes_access_gated_like_manifest(client):
    owner_headers = _register_and_login(client, "fileowner@example.com")
    stranger_headers = _register_and_login(client, "filestranger@example.com")
    upload = _upload_file(client, owner_headers, include_music=True, include_pdf=True)
    version_id = upload.json()["version"]["id"]

    assert client.get(f"/library/versions/{version_id}/file", headers=stranger_headers).status_code == 403
    assert client.get(f"/library/versions/{version_id}/pdf", headers=stranger_headers).status_code == 403
