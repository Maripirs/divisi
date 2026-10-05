"""A reviewed manifest's syllables must land on the generated MusicXML in
the same words and the same order. The exact-count check in
apply_reviewed_lyrics.py cannot see a bug that keeps the right count but
puts syllables on the wrong notes; comparing reconstructed words can."""

import glob
import json
import sys
from pathlib import Path

import pytest
from music21 import converter

from app.lyrics.aligned import manifest_segment_words, part_lyric_words
from app.lyrics.inject import _match_parts_to_voices

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
from apply_reviewed_lyrics import run as build_candidate  # noqa: E402


def _reviewed_manifests() -> list[str]:
    paths = []
    for path in sorted(glob.glob(str(BACKEND / "lyric_runs/sfcc/*.json"))):
        if "segments" in json.loads(Path(path).read_text()):
            paths.append(path)
    return paths


@pytest.mark.parametrize("manifest_path", _reviewed_manifests())
def test_manifest_words_match_generated_musicxml(manifest_path, tmp_path):
    manifest = json.loads(Path(manifest_path).read_text())
    candidate = tmp_path / "candidate.musicxml"
    build_candidate(Path(manifest_path), candidate)
    score = converter.parse(str(candidate))
    parts = _match_parts_to_voices(score)

    for segment in manifest["segments"]:
        start, end = segment["measure_start"], segment["measure_end"]
        for entry in segment["voices"]:
            part = parts.get(entry["voice"])
            if part is None:
                continue
            expected = manifest_segment_words(entry)
            actual = part_lyric_words(part, start, end)
            assert actual == expected, (
                f"{Path(manifest_path).name} measures {start}-{end} voice {entry['voice']}"
            )
