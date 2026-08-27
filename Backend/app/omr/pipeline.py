"""Chooses/chains OMR engines and normalizes their output.

Tries the configured engine first, falling through to the other only if
the chosen one's executable simply isn't installed (`OmrEngineUnavailable`)
— a real parse failure (`OmrEngineError`) is never masked by silently
retrying with a worse engine, it's surfaced as-is.

Output is normalized to plain (uncompressed) MusicXML regardless of which
engine produced it, then a MIDI file is derived from that MusicXML via
music21 — so an OMR'd piece can be fed straight into the same MIDI-based
rendering pipeline (`app/rendering/`) as any other version, matching B7's
manifest/stem flow rather than needing a separate MusicXML playback path.
"""

from __future__ import annotations

import zipfile
from pathlib import Path

from music21 import converter

from app.core.config import get_settings
from app.omr.audiveris import OmrEngineError, OmrEngineUnavailable, run_audiveris
from app.omr.oemer import run_oemer

__all__ = ["OmrEngineError", "OmrEngineUnavailable", "run_omr"]

_ENGINES = {
    "audiveris": run_audiveris,
    "oemer": run_oemer,
}


def _normalize_to_musicxml(raw_path: Path, output_dir: Path) -> Path:
    """Audiveris exports compressed MusicXML (`.mxl`, a zip); oemer
    exports plain `.musicxml` already. Normalize both to one plain
    `.musicxml` file so every downstream caller (job results, the file-
    serving route) only ever deals with a single format."""
    if raw_path.suffix != ".mxl":
        return raw_path

    with zipfile.ZipFile(raw_path) as zf:
        # Per the MusicXML container spec, container.xml names the real
        # rootfile; every real-world .mxl (Audiveris included) has
        # exactly one score document outside META-INF/.
        inner_names = [n for n in zf.namelist() if n.endswith(".xml") and not n.startswith("META-INF/")]
        if not inner_names:
            raise OmrEngineError("Compressed MusicXML (.mxl) had no root score document")
        xml_path = output_dir / "score.musicxml"
        xml_path.write_bytes(zf.read(inner_names[0]))
        return xml_path


def _musicxml_to_midi(musicxml_path: Path, output_dir: Path) -> Path:
    score = converter.parse(str(musicxml_path))
    midi_path = output_dir / "score.mid"
    score.write("midi", fp=str(midi_path))
    return midi_path


def run_omr(source_path: Path, output_dir: Path, engine: str | None = None) -> tuple[Path, Path]:
    """Runs OMR on `source_path`, producing `(musicxml_path, midi_path)`
    inside `output_dir`."""
    chosen = engine or get_settings().omr_engine
    if chosen not in _ENGINES:
        raise ValueError(f"Unknown OMR engine '{chosen}' (expected one of {list(_ENGINES)})")
    order = [chosen] + [name for name in _ENGINES if name != chosen]

    last_error: Exception | None = None
    for name in order:
        try:
            raw_output = _ENGINES[name](source_path, output_dir)
        except OmrEngineUnavailable as exc:
            last_error = exc
            continue
        musicxml_path = _normalize_to_musicxml(raw_output, output_dir)
        midi_path = _musicxml_to_midi(musicxml_path, output_dir)
        return musicxml_path, midi_path

    raise OmrEngineUnavailable(f"No OMR engine available (tried: {', '.join(order)}). Last error: {last_error}")
