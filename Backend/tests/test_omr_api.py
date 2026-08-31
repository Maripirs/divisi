"""End-to-end tests of the /omr job endpoints. The "happy path" here is a
real, unmocked run of a job through to `failed` with an
`OmrEngineUnavailable` message — `shutil.which` is forced to report both
binaries missing (see `test_job_runs_to_failed_when_no_engine_is_installed`)
rather than relying on neither actually being installed, since either or
both may be present on a given dev machine now (Backend/README.md's OMR
engines section). This still exercises the real code path (job tracking,
background task wiring, status polling), not a stand-in for one.
`test_omr_pipeline.py` covers the engine-chaining and MusicXML/MIDI-
producing logic in isolation with mocked engine calls.
"""

import io


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_job_requires_auth(client):
    response = client.post("/omr/jobs", files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")})
    assert response.status_code == 401


def test_job_runs_to_failed_when_no_engine_is_installed(client, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: None)
    headers = _register_and_login(client, "omr@example.com")

    created = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4 not a real pdf"), "application/pdf")},
        headers=headers,
    )
    assert created.status_code == 201
    job_id = created.json()["id"]

    # TestClient runs BackgroundTasks synchronously as part of the
    # request/response cycle, so by the time `create_job` returned above
    # the background task has already run to completion.
    polled = client.get(f"/omr/jobs/{job_id}", headers=headers)
    assert polled.status_code == 200
    body = polled.json()
    assert body["status"] == "failed"
    assert "not found on PATH" in body["error_message"]
    assert body["musicxml_url"] is None
    assert body["midi_url"] is None


def test_create_job_rejects_empty_file(client):
    headers = _register_and_login(client, "empty@example.com")
    response = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b""), "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 400


def test_get_job_404s_for_unknown_id(client):
    headers = _register_and_login(client, "unknown@example.com")
    response = client.get("/omr/jobs/does-not-exist", headers=headers)
    assert response.status_code == 404


def test_get_job_404s_for_someone_elses_job(client):
    owner_headers = _register_and_login(client, "owner@example.com")
    outsider_headers = _register_and_login(client, "outsider@example.com")

    created = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=owner_headers,
    )
    job_id = created.json()["id"]

    response = client.get(f"/omr/jobs/{job_id}", headers=outsider_headers)
    assert response.status_code == 404


def test_get_job_result_404s_when_not_yet_available(client):
    headers = _register_and_login(client, "noresult@example.com")
    created = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=headers,
    )
    job_id = created.json()["id"]

    response = client.get(f"/omr/jobs/{job_id}/result/musicxml", headers=headers)
    assert response.status_code == 404


def _create_done_job(client, headers, monkeypatch) -> str:
    """Completes a job to `done` with a fake (but real-file) result,
    bypassing the actual engines (still not installed in this sandbox —
    `test_job_runs_to_failed_when_no_engine_is_installed` above covers
    that real path). `test_omr_pipeline.py` covers `run_omr`'s own
    engine-chaining logic in isolation; this just needs *a* result on
    disk for the import endpoint below to copy."""
    from app.jobs import omr_jobs

    def fake_run_omr(source_path, output_dir):
        output_dir.mkdir(parents=True, exist_ok=True)
        musicxml_path = output_dir / "score.musicxml"
        musicxml_path.write_bytes(b"<score-partwise/>")
        midi_path = output_dir / "score.mid"
        midi_path.write_bytes(b"fake midi bytes")
        return musicxml_path, midi_path

    monkeypatch.setattr(omr_jobs, "run_omr", fake_run_omr)

    created = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=headers,
    )
    return created.json()["id"]


def test_import_creates_a_new_piece(client, monkeypatch):
    headers = _register_and_login(client, "importer@example.com")
    job_id = _create_done_job(client, headers, monkeypatch)

    response = client.post(
        f"/omr/jobs/{job_id}/import",
        json={"title": "Imported Piece", "owner_type": "user"},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_new_piece"] is True
    assert body["piece"]["title"] == "Imported Piece"
    assert body["version"]["source"] == "original"
    assert body["version"]["status"] == "draft"

    library = client.get("/library/pieces", headers=headers)
    assert any(entry["piece_id"] == body["piece"]["id"] for entry in library.json())


def test_import_adds_a_version_to_an_existing_piece(client, monkeypatch):
    headers = _register_and_login(client, "importer2@example.com")
    job_id = _create_done_job(client, headers, monkeypatch)

    upload = client.post(
        "/library/pieces",
        data={"title": "Existing Piece", "owner_type": "user"},
        files={"file": ("original.mid", io.BytesIO(b"MThd"), "audio/midi")},
        headers=headers,
    )
    piece_id = upload.json()["piece"]["id"]

    response = client.post(f"/omr/jobs/{job_id}/import", json={"piece_id": piece_id}, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["created_new_piece"] is False
    assert body["piece"]["id"] == piece_id
    assert body["version"]["source"] == "modification"


def test_import_rejects_neither_piece_id_nor_title(client, monkeypatch):
    headers = _register_and_login(client, "importer3@example.com")
    job_id = _create_done_job(client, headers, monkeypatch)

    response = client.post(f"/omr/jobs/{job_id}/import", json={}, headers=headers)
    assert response.status_code == 400


def test_import_rejects_both_piece_id_and_title(client, monkeypatch):
    headers = _register_and_login(client, "importer4@example.com")
    job_id = _create_done_job(client, headers, monkeypatch)

    response = client.post(
        f"/omr/jobs/{job_id}/import",
        json={"piece_id": "does-not-matter", "title": "Also given"},
        headers=headers,
    )
    assert response.status_code == 400


def test_import_rejects_a_job_with_no_result_yet(client):
    headers = _register_and_login(client, "importer5@example.com")
    created = client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=headers,
    )
    job_id = created.json()["id"]  # runs to `failed` — no engine installed in this sandbox

    response = client.post(
        f"/omr/jobs/{job_id}/import",
        json={"title": "Nope", "owner_type": "user"},
        headers=headers,
    )
    assert response.status_code == 409


def test_import_404s_for_someone_elses_job(client, monkeypatch):
    owner_headers = _register_and_login(client, "importowner@example.com")
    outsider_headers = _register_and_login(client, "importoutsider@example.com")
    job_id = _create_done_job(client, owner_headers, monkeypatch)

    response = client.post(
        f"/omr/jobs/{job_id}/import",
        json={"title": "Steal", "owner_type": "user"},
        headers=outsider_headers,
    )
    assert response.status_code == 404


# --- "Generate music from PDF" on an existing track: job carries a
# `piece_id`, and the runner auto-imports the finished result as a *draft*
# version on that piece (no explicit /import call). ---


def _fake_run_omr_ok(monkeypatch) -> None:
    from app.jobs import omr_jobs

    def fake_run_omr(source_path, output_dir):
        output_dir.mkdir(parents=True, exist_ok=True)
        musicxml_path = output_dir / "score.musicxml"
        musicxml_path.write_bytes(b"<score-partwise/>")
        midi_path = output_dir / "score.mid"
        midi_path.write_bytes(b"fake midi bytes")
        return musicxml_path, midi_path

    monkeypatch.setattr(omr_jobs, "run_omr", fake_run_omr)


def _upload_pdf_track(client, headers, title):
    upload = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "user"},
        files={"pdf_file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=headers,
    )
    assert upload.status_code == 201
    return upload.json()["piece"]["id"], upload.json()["version"]["id"]


def _entry_for(client, headers, piece_id):
    library = client.get("/library/pieces", headers=headers).json()
    return next(e for e in library if e["piece_id"] == piece_id)


def test_create_job_with_piece_id_auto_imports_a_draft_version(client, monkeypatch):
    headers = _register_and_login(client, "gen@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, original_version_id = _upload_pdf_track(client, headers, "Scanned Track")

    created = client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["piece_id"] == piece_id

    polled = client.get(f"/omr/jobs/{created.json()['id']}", headers=headers)
    assert polled.json()["status"] == "done"

    entry = _entry_for(client, headers, piece_id)
    assert entry["latest_omr_job"]["status"] == "done"
    assert entry["pending_generated_version_id"] is not None
    assert entry["pending_generated_version_id"] != original_version_id
    # The draft carries the track's existing PDF forward, plus the derived MIDI.
    assert entry["has_pdf"] is True
    assert entry["has_music"] is True


def test_create_job_rejects_piece_id_the_caller_cannot_edit(client, monkeypatch):
    owner = _register_and_login(client, "owner-gen@example.com")
    outsider = _register_and_login(client, "outsider-gen@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, _ = _upload_pdf_track(client, owner, "Private Track")

    created = client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=outsider,
    )
    assert created.status_code == 403


def test_failed_job_with_piece_id_leaves_no_draft(client, monkeypatch):
    monkeypatch.setattr("shutil.which", lambda name: None)  # no engine on PATH -> job fails
    headers = _register_and_login(client, "genfail@example.com")
    piece_id, original_version_id = _upload_pdf_track(client, headers, "Doomed Track")

    created = client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )
    assert created.status_code == 201

    entry = _entry_for(client, headers, piece_id)
    assert entry["latest_omr_job"]["status"] == "failed"
    assert entry["pending_generated_version_id"] is None
    assert entry["version_id"] == original_version_id


def test_generated_draft_can_be_discarded_via_reject(client, monkeypatch):
    headers = _register_and_login(client, "gendiscard@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, original_version_id = _upload_pdf_track(client, headers, "Discardable Track")

    client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )
    draft_id = _entry_for(client, headers, piece_id)["pending_generated_version_id"]
    assert draft_id is not None

    # "Discard": reject accepts a never-submitted draft (only the OMR runner
    # makes those), so the panel's pending state clears with one call.
    rejected = client.post(f"/library/versions/{draft_id}/reject", headers=headers)
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    entry = _entry_for(client, headers, piece_id)
    assert entry["pending_generated_version_id"] is None


def test_deleting_a_track_that_has_an_omr_job_succeeds(client, monkeypatch):
    headers = _register_and_login(client, "gendelete@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, _ = _upload_pdf_track(client, headers, "Deletable Track")
    client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )

    deleted = client.delete(f"/library/pieces/{piece_id}", headers=headers)
    assert deleted.status_code == 204
    assert all(e["piece_id"] != piece_id for e in client.get("/library/pieces", headers=headers).json())
