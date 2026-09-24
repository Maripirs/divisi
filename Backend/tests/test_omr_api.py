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
import json


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
    # Submit + approve the original version first -- otherwise it's itself
    # picked up as a "pending draft" by Part B's broadened `source=original`
    # fallback (a never-submitted piece's first version -- see
    # `working_draft`'s own doc comment), which isn't what this test means
    # to check (a failed OMR run genuinely leaving nothing new pending).
    assert client.post(f"/library/versions/{original_version_id}/submit", headers=headers).status_code == 200
    assert client.post(f"/library/versions/{original_version_id}/approve", headers=headers).status_code == 200

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


def test_list_jobs_requires_auth(client):
    assert client.get("/omr/jobs").status_code == 401


def test_list_jobs_returns_own_jobs_newest_first_with_piece_context(client, monkeypatch):
    headers = _register_and_login(client, "listjobs@example.com")
    _fake_run_omr_ok(monkeypatch)
    piece_id, _ = _upload_pdf_track(client, headers, "Listed Track")

    # A standalone job (no piece), then a piece-tagged one — the tagged one
    # is created last, so it sorts first.
    client.post(
        "/omr/jobs",
        files={"file": ("loose.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=headers,
    )
    client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=headers,
    )

    jobs = client.get("/omr/jobs", headers=headers)
    assert jobs.status_code == 200
    body = jobs.json()
    assert len(body) == 2

    tagged, loose = body
    assert tagged["piece_id"] == piece_id
    assert tagged["piece_title"] == "Listed Track"
    assert tagged["group_id"] is None  # user-owned piece
    assert tagged["status"] == "done"
    assert tagged["pending_generated_version_id"] is not None

    assert loose["piece_id"] is None
    assert loose["piece_title"] is None
    assert loose["pending_generated_version_id"] is None


def test_list_jobs_does_not_leak_other_users_jobs(client, monkeypatch):
    mine = _register_and_login(client, "mine-list@example.com")
    theirs = _register_and_login(client, "theirs-list@example.com")
    _fake_run_omr_ok(monkeypatch)

    client.post(
        "/omr/jobs",
        files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=theirs,
    )

    assert client.get("/omr/jobs", headers=mine).json() == []


def test_list_jobs_reports_group_id_for_a_group_owned_track(client, monkeypatch):
    admin = _register_and_login(client, "grouplist-admin@example.com")
    _fake_run_omr_ok(monkeypatch)
    group_id = client.post("/groups", json={"name": "List Choir"}, headers=admin).json()["id"]

    upload = client.post(
        "/library/pieces",
        data={"title": "Choir Track", "owner_type": "group", "group_id": group_id},
        files={"pdf_file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=admin,
    )
    piece_id = upload.json()["piece"]["id"]

    client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        data={"piece_id": piece_id},
        headers=admin,
    )

    job = client.get("/omr/jobs", headers=admin).json()[0]
    assert job["piece_id"] == piece_id
    assert job["group_id"] == group_id


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


# --- B16: paged (per-page) OMR --------------------------------------------


def _fake_run_omr_paged(monkeypatch, *, needs_review=True, seg_paths=None):
    """Stub `run_omr_paged`: write a provisional merge, two segment files,
    and a `paged-report.json` into the job dir; report `needs_review`.
    `seg_paths` overrides the report's segment file paths (for the
    path-traversal guard test)."""
    from app.jobs import omr_jobs
    from app.omr.paged import PagedReport

    monkeypatch.setattr(omr_jobs, "_page_count", lambda path: 3)

    seg1_xml, seg2_xml = seg_paths or (
        "segments/segment-01.musicxml",
        "segments/segment-02.musicxml",
    )

    def fake(source_path, output_dir, engine=None, on_page_done=None):
        if on_page_done is not None:
            for n in (1, 2, 3):
                on_page_done(n, 3)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "segments").mkdir(parents=True, exist_ok=True)
        for name in ("segment-01.musicxml", "segment-02.musicxml"):
            (output_dir / "segments" / name).write_bytes(b"<score-partwise/>")
        for name in ("segment-01.mid", "segment-02.mid"):
            (output_dir / "segments" / name).write_bytes(b"MThd\x00\x00\x00\x06")
        mx = output_dir / "score.musicxml"
        mx.write_bytes(b"<score-partwise/>")
        mid = output_dir / "score.mid"
        mid.write_bytes(b"fake midi bytes")

        report_dict = {
            "total": 3,
            "ok": 3,
            "failed_pages": [],
            "needs_review": needs_review,
            "combined_error": None,
            "segments": [
                {
                    "index": 1,
                    "pages": [1, 2],
                    "parts": 4,
                    "start_reason": None,
                    "boundary_measure": None,
                    "musicxml": seg1_xml,
                    "midi": "segments/segment-01.mid",
                },
                {
                    "index": 2,
                    "pages": [3],
                    "parts": 5,
                    "start_reason": "page 3 has 5 part(s), the run before it had 4",
                    "boundary_measure": 7,
                    "musicxml": seg2_xml,
                    "midi": "segments/segment-02.mid",
                },
            ],
            "unresolved_boundaries": [
                {
                    "before_page": 3,
                    "merged_measure": 7,
                    "reason": "page 3 has 5 part(s), the run before it had 4",
                }
            ],
            "pages": [
                {"page": 1, "ok": True, "error": None, "start_measure": 1, "measure_count": 3},
                {"page": 2, "ok": True, "error": None, "start_measure": 4, "measure_count": 3},
                {"page": 3, "ok": True, "error": None, "start_measure": 7, "measure_count": 3},
            ],
        }
        (output_dir / "paged-report.json").write_text(json.dumps(report_dict), encoding="utf-8")
        return mx, mid, PagedReport(needs_review=needs_review, output_dir=output_dir)

    monkeypatch.setattr(omr_jobs, "run_omr_paged", fake)


def _start_paged_job(client, headers):
    created = client.post(
        "/omr/jobs",
        files={"file": ("book.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=headers,
    )
    assert created.status_code == 201
    return created.json()


def test_multipage_job_runs_paged_and_flags_needs_review(client, monkeypatch):
    headers = _register_and_login(client, "paged@example.com")
    _fake_run_omr_paged(monkeypatch)

    job = _start_paged_job(client, headers)

    polled = client.get(f"/omr/jobs/{job['id']}", headers=headers).json()
    assert polled["status"] == "done"
    assert polled["paged"] is True
    assert polled["needs_review"] is True
    assert polled["report_url"] == f"/omr/jobs/{job['id']}/paged-report"
    # The provisional whole-score merge is still what's served as the result.
    assert client.get(polled["musicxml_url"], headers=headers).status_code == 200


def test_paged_report_route_rewrites_segment_paths_to_urls(client, monkeypatch):
    headers = _register_and_login(client, "pagedreport@example.com")
    _fake_run_omr_paged(monkeypatch)
    job_id = _start_paged_job(client, headers)["id"]

    report = client.get(f"/omr/jobs/{job_id}/paged-report", headers=headers).json()
    assert [s["pages"] for s in report["segments"]] == [[1, 2], [3]]
    assert report["segments"][0]["musicxml_url"] == f"/omr/jobs/{job_id}/segments/1/musicxml"
    assert report["segments"][1]["midi_url"] == f"/omr/jobs/{job_id}/segments/2/midi"
    assert "musicxml" not in report["segments"][0]  # storage path never leaves the server
    assert report["unresolved_boundaries"][0]["merged_measure"] == 7
    # B18: per-page measure offsets into the provisional merge pass through.
    assert [(p["start_measure"], p["measure_count"]) for p in report["pages"]] == [
        (1, 3),
        (4, 3),
        (7, 3),
    ]


def test_segment_download_serves_the_file(client, monkeypatch):
    headers = _register_and_login(client, "pagedseg@example.com")
    _fake_run_omr_paged(monkeypatch)
    job_id = _start_paged_job(client, headers)["id"]

    got = client.get(f"/omr/jobs/{job_id}/segments/1/musicxml", headers=headers)
    assert got.status_code == 200
    assert got.content == b"<score-partwise/>"
    assert client.get(f"/omr/jobs/{job_id}/segments/2/midi", headers=headers).status_code == 200
    # Unknown kind / index -> 404, not a stray file.
    assert client.get(f"/omr/jobs/{job_id}/segments/1/wav", headers=headers).status_code == 404
    assert client.get(f"/omr/jobs/{job_id}/segments/9/musicxml", headers=headers).status_code == 404


def test_segment_route_rejects_path_traversal(client, monkeypatch):
    headers = _register_and_login(client, "pagedtrav@example.com")
    _fake_run_omr_paged(
        monkeypatch, seg_paths=("../../../../../../etc/passwd", "segments/segment-02.musicxml")
    )
    job_id = _start_paged_job(client, headers)["id"]

    assert client.get(f"/omr/jobs/{job_id}/segments/1/musicxml", headers=headers).status_code == 404


def test_paged_report_404s_for_a_non_paged_job(client, monkeypatch):
    headers = _register_and_login(client, "nonpaged@example.com")
    _fake_run_omr_ok(monkeypatch)
    created = client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=headers,
    )
    job_id = created.json()["id"]
    assert client.get(f"/omr/jobs/{job_id}/paged-report", headers=headers).status_code == 404


# --- B17: per-page progress readout + per-page re-run --------------------


def test_paged_job_reports_page_progress(client, monkeypatch):
    headers = _register_and_login(client, "pagedprogress@example.com")
    _fake_run_omr_paged(monkeypatch)
    job = _start_paged_job(client, headers)

    polled = client.get(f"/omr/jobs/{job['id']}", headers=headers).json()
    assert polled["pages_total"] == 3
    assert polled["pages_done"] == 3


def test_rerun_page_404s_for_a_non_paged_job(client, monkeypatch):
    headers = _register_and_login(client, "rerun-nonpaged@example.com")
    _fake_run_omr_ok(monkeypatch)
    created = client.post(
        "/omr/jobs",
        files={"file": ("score.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")},
        headers=headers,
    )
    job_id = created.json()["id"]
    assert client.post(f"/omr/jobs/{job_id}/pages/1/rerun", headers=headers).status_code == 404


def test_rerun_page_404s_for_an_out_of_range_page(client, monkeypatch):
    headers = _register_and_login(client, "rerun-oor@example.com")
    _fake_run_omr_paged(monkeypatch)
    job_id = _start_paged_job(client, headers)["id"]
    assert client.post(f"/omr/jobs/{job_id}/pages/99/rerun", headers=headers).status_code == 404


def test_rerun_page_rewrites_needs_review_and_serves_the_page_xml(client, monkeypatch):
    headers = _register_and_login(client, "rerun-ok@example.com")
    _fake_run_omr_paged(monkeypatch)
    job_id = _start_paged_job(client, headers)["id"]
    assert client.get(f"/omr/jobs/{job_id}", headers=headers).json()["needs_review"] is True

    from app.api.routes import omr as omr_routes
    from app.omr.paged import PagedReport, PageResult

    def fake_rerun_page(output_dir, page_no, engine=None):
        page_dir = output_dir / "pages" / f"p{page_no:02d}"
        page_dir.mkdir(parents=True, exist_ok=True)
        xml = page_dir / "page.musicxml"
        xml.write_bytes(b"<score-partwise><rerun/></score-partwise>")
        return (
            PageResult(page=page_no, ok=True, musicxml_path=xml),
            PagedReport(needs_review=False, output_dir=output_dir),
        )

    monkeypatch.setattr(omr_routes, "rerun_page", fake_rerun_page)
    monkeypatch.setattr(omr_routes, "_page_len", lambda path: 4)

    r = client.post(f"/omr/jobs/{job_id}/pages/3/rerun", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "ok": True,
        "still_failed": False,
        "measure_count": 4,
        "page_musicxml_url": f"/omr/jobs/{job_id}/pages/3/musicxml",
    }
    assert client.get(f"/omr/jobs/{job_id}", headers=headers).json()["needs_review"] is False

    served = client.get(body["page_musicxml_url"], headers=headers)
    assert served.status_code == 200
    assert b"<rerun/>" in served.content


def test_rerun_page_reports_a_page_that_still_fails(client, monkeypatch):
    headers = _register_and_login(client, "rerun-stillfail@example.com")
    _fake_run_omr_paged(monkeypatch)
    job_id = _start_paged_job(client, headers)["id"]

    from app.api.routes import omr as omr_routes
    from app.omr.paged import PagedReport, PageResult

    monkeypatch.setattr(
        omr_routes,
        "rerun_page",
        lambda output_dir, page_no, engine=None: (
            PageResult(page=page_no, ok=False, error="still broken"),
            PagedReport(needs_review=True, output_dir=output_dir),
        ),
    )

    body = client.post(f"/omr/jobs/{job_id}/pages/3/rerun", headers=headers).json()
    assert body["ok"] is False
    assert body["still_failed"] is True
    assert body["measure_count"] == 0
    assert body["page_musicxml_url"] is None
