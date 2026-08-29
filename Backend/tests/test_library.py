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


def test_version_file_routes_access_gated_like_manifest(client):
    owner_headers = _register_and_login(client, "fileowner@example.com")
    stranger_headers = _register_and_login(client, "filestranger@example.com")
    upload = _upload_file(client, owner_headers, include_music=True, include_pdf=True)
    version_id = upload.json()["version"]["id"]

    assert client.get(f"/library/versions/{version_id}/file", headers=stranger_headers).status_code == 403
    assert client.get(f"/library/versions/{version_id}/pdf", headers=stranger_headers).status_code == 403
