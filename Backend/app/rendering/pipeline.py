"""Orchestrates B7: MIDI file -> stems + MusicXML, cached per `PieceVersion`.

A `PieceVersion`'s `file_path` is set once at creation and never mutated by
any endpoint (see `app/api/routes/library.py`), so a version's rendered
output can be cached by version id alone — no content hash needed, just "has
this id been rendered before". Cache is a manifest.json file per version
dir; its presence is the cache-hit signal.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from app.core.config import get_settings
from app.rendering.midi_parser import parse_midi
from app.rendering.musicxml_converter import convert_all_parts
from app.rendering.synth import STEM_NAMES, render_stems


class RenderError(Exception):
    pass


def _render_dir(piece_version_id: str) -> Path:
    return Path(get_settings().storage_dir) / "renders" / piece_version_id


def _manifest_path(piece_version_id: str) -> Path:
    return _render_dir(piece_version_id) / "manifest.json"


def is_midi_file(file_path: str) -> bool:
    return file_path.lower().endswith((".mid", ".midi"))


def render_manifest(piece_version_id: str, source_file_path: Path, force: bool = False) -> dict:
    """Returns the manifest dict for this version, rendering (and caching)
    it first if not already cached. `source_file_path` is the absolute path
    to the version's stored MIDI file."""
    manifest_path = _manifest_path(piece_version_id)
    if manifest_path.exists() and not force:
        return json.loads(manifest_path.read_text())

    render_dir = _render_dir(piece_version_id)
    parsed = parse_midi(source_file_path)
    if not parsed.notes:
        raise RenderError("No voice-part notes found in this MIDI file")

    stems = render_stems(parsed, render_dir)
    xml_result = convert_all_parts(parsed)
    musicxml_path = render_dir / "score.musicxml"
    musicxml_path.write_text(xml_result.xml)

    manifest = {
        "piece_version_id": piece_version_id,
        "stems": {name: f"{name}.wav" for name in STEM_NAMES if name in stems},
        "musicxml": musicxml_path.name,
        "tempo_bpm": parsed.tempo_bpm,
        "time_signature": asdict(parsed.time_signature),
        "key_signature_fifths": parsed.key_signature_fifths,
        "ms_per_whole_note": xml_result.ms_per_whole_note,
        "duration_ms": parsed.duration_ms,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest


def render_file_path(piece_version_id: str, filename: str) -> Path:
    """Resolves a manifest-listed filename to its on-disk path, for the
    file-serving route. Rejects anything outside the version's render dir
    (defense against a filename containing `..`)."""
    render_dir = _render_dir(piece_version_id).resolve()
    candidate = (render_dir / filename).resolve()
    if render_dir not in candidate.parents and candidate != render_dir:
        raise RenderError("Invalid render file path")
    if not candidate.exists():
        raise RenderError("Render file not found")
    return candidate
