"""End-to-end test of B7's manifest + render-file endpoints: upload a real
MIDI fixture, fetch its manifest, download a stem. Exercises the real
FluidSynth subprocess (see `app/rendering/synth.py`), so this is slower than
the rest of the suite — not mocked, since the render pipeline's correctness
is the whole point of B7.
"""

import io
import shutil
from pathlib import Path

import pytest

from app.core.config import get_settings

FIXTURES = Path(__file__).parent / "fixtures"


def _register_and_login(client, email, name="Name", password="hunter2"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _cleanup_render(version_id):
    render_dir = Path(get_settings().storage_dir) / "renders" / version_id
    shutil.rmtree(render_dir, ignore_errors=True)


def test_manifest_renders_stems_and_musicxml_for_a_midi_version(client):
    headers = _register_and_login(client, "renderer@example.com")
    midi_bytes = (FIXTURES / "requiem-satb-plain.mid").read_bytes()
    upload = client.post(
        "/library/pieces",
        data={"title": "Requiem", "owner_type": "user"},
        files={"file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi")},
        headers=headers,
    )
    assert upload.status_code == 201
    version_id = upload.json()["version"]["id"]

    try:
        manifest = client.get(f"/library/versions/{version_id}/manifest", headers=headers)
        assert manifest.status_code == 200
        body = manifest.json()
        assert set(body["stems"]) == {"soprano", "alto", "tenor", "bass", "backing"}
        assert body["tempo_bpm"] == pytest.approx(52)
        assert body["time_signature"] == {"numerator": 4, "denominator": 4}
        assert body["key_signature_fifths"] == -1
        assert body["duration_ms"] > 0

        stem_download = client.get(body["stems"]["soprano"], headers=headers)
        assert stem_download.status_code == 200
        assert stem_download.content[:4] == b"RIFF"  # WAV header

        xml_download = client.get(body["musicxml_url"], headers=headers)
        assert xml_download.status_code == 200
        assert b"<score-partwise" in xml_download.content

        # Second call hits the cache — same manifest, no re-render.
        manifest_again = client.get(f"/library/versions/{version_id}/manifest", headers=headers)
        assert manifest_again.json() == body
    finally:
        _cleanup_render(version_id)


def test_manifest_requires_piece_access(client):
    owner_headers = _register_and_login(client, "owner@example.com")
    outsider_headers = _register_and_login(client, "outsider@example.com")
    midi_bytes = (FIXTURES / "requiem-satb-plain.mid").read_bytes()
    upload = client.post(
        "/library/pieces",
        data={"title": "Requiem", "owner_type": "user"},
        files={"file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi")},
        headers=owner_headers,
    )
    version_id = upload.json()["version"]["id"]

    forbidden = client.get(f"/library/versions/{version_id}/manifest", headers=outsider_headers)
    assert forbidden.status_code == 403


def test_manifest_rejects_non_midi_version(client):
    headers = _register_and_login(client, "nonmidi@example.com")
    upload = client.post(
        "/library/pieces",
        data={"title": "Not MIDI", "owner_type": "user"},
        files={"file": ("piece.xml", io.BytesIO(b"<musicxml/>"), "application/xml")},
        headers=headers,
    )
    version_id = upload.json()["version"]["id"]

    response = client.get(f"/library/versions/{version_id}/manifest", headers=headers)
    assert response.status_code == 400
