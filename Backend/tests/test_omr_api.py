"""End-to-end tests of the /omr job endpoints. Since neither Audiveris
nor oemer is installed in this dev sandbox (Backend/plan.md's B8 human
task — install path not yet decided), the "happy path" here is a real,
unmocked run of a job through to `failed` with an `OmrEngineUnavailable`
message: that's genuinely what this environment does today, and it's the
real code path (job tracking, background task wiring, status polling),
not a stand-in for one. `test_omr_pipeline.py` covers the engine-chaining
and MusicXML/MIDI-producing logic in isolation with mocked engine calls.
"""

import io


def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_job_requires_auth(client):
    response = client.post("/omr/jobs", files={"file": ("scan.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")})
    assert response.status_code == 401


def test_job_runs_to_failed_when_no_engine_is_installed(client):
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
