"""Compare a reviewed lyric manifest against the PDF it was transcribed
from, and against the MusicXML it produces.

This is evidence for human review, not a pass/fail oracle. The PDF leg
compares the PDF's raw per-syllable words against the manifest's own
syllable texts, not its joined words. The two use the same one-token-per-
syllable granularity; comparing against joined words instead would flag
every multi-syllable word as a false mismatch. A real MISMATCH here means
a transcribed syllable differs from what is printed, or that the PDF
extractor picked up a stray non-lyric glyph (seen in practice: an
occasional isolated letter or ligature from a dynamics mark or clef that
leaked into a staff's word list). A MISMATCH on the manifest-vs-MusicXML
leg is the one that should never happen: both sides come from the same
syllables, so any difference there is a real alignment bug, most likely
syllables landing in the wrong order.

This builds the candidate MusicXML through apply_reviewed_lyrics.run(),
the same code path a reviewer runs for real, so score repairs and other
manifest-specific fixups are applied before the comparison.

Usage from Backend/:
  .venv/bin/python scripts/check_lyrics_against_pdf.py \
    lyric_runs/sfcc/song_of_proserpine.json \
    --pdf data/storage/_object_cache/04ba043ef0734347ad63b902d336a0ad.pdf

  .venv/bin/python scripts/check_lyrics_against_pdf.py \
    lyric_runs/sfcc/song_of_proserpine.json \
    --lanes lyric_runs/sfcc/song_of_proserpine.lanes.json

Exits 1 if any comparison mismatches, 0 otherwise.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

from music21 import converter

from app.lyrics.aligned import manifest_segment_words, part_lyric_words
from app.lyrics.inject import _match_parts_to_voices
from app.lyrics.staff_pdf import extract_lyric_systems

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply_reviewed_lyrics import run as build_candidate  # noqa: E402


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_lanes(args: argparse.Namespace) -> dict:
    if args.pdf is not None:
        pdf_bytes = args.pdf.read_bytes()
        pages = extract_lyric_systems(
            args.pdf, staves_per_system=args.staves_per_system, ocr_jsonl=args.ocr_jsonl,
            staff_overrides=json.loads(args.staff_overrides.read_text()) if args.staff_overrides else None,
            system_map=json.loads(args.system_map.read_text()) if args.system_map else None,
        )
        return {"pdf_sha256": _sha256(pdf_bytes), "pages": pages}
    return json.loads(args.lanes.read_text())


def _normalize(words: list[str]) -> list[str]:
    return [re.sub(r"^\W+|\W+$", "", w.lower()) for w in words]


def _diff_lines(label_a: str, words_a: list[str], label_b: str, words_b: list[str]) -> list[str]:
    lines = []
    for line in difflib.ndiff(words_a, words_b):
        if line.startswith("  "):
            continue
        prefix = f"{label_a}>" if line.startswith("- ") else f"{label_b}>" if line.startswith("+ ") else "?"
        lines.append(f"    {prefix} {line[2:]}")
    return lines


def _compare(label_a: str, words_a: list[str], label_b: str, words_b: list[str]) -> bool:
    match = _normalize(words_a) == _normalize(words_b)
    print(f"  {label_a} vs {label_b}: {'MATCH' if match else 'MISMATCH'}")
    if not match:
        for line in _diff_lines(label_a, words_a, label_b, words_b):
            print(line)
    return match


def run(manifest_path: Path, args: argparse.Namespace) -> bool:
    manifest = json.loads(manifest_path.read_text())
    lanes = _load_lanes(args)

    if lanes["pdf_sha256"] != manifest["source_pdf_sha256"]:
        raise ValueError(
            f"PDF evidence does not match this manifest's source PDF: "
            f"{lanes['pdf_sha256']} != {manifest['source_pdf_sha256']}"
        )

    with tempfile.TemporaryDirectory() as scratch:
        candidate = Path(scratch) / "candidate.musicxml"
        build_candidate(manifest_path, candidate)
        score = converter.parse(str(candidate))
    parts = _match_parts_to_voices(score)

    segments_by_page: dict[int, list[dict]] = {}
    for segment in manifest["segments"]:
        if segment["system"] == 0:
            # An instrumental introduction has measures but no lyric staff.
            continue
        segments_by_page.setdefault(segment["page"], []).append(segment)
    lanes_by_page = {page["page"]: page for page in lanes["pages"]}

    all_match = True
    for page, segments in segments_by_page.items():
        lane_page = lanes_by_page.get(page)
        if lane_page is None:
            print(f"page {page}: no PDF evidence for this page")
            all_match = False
            continue
        if lane_page.get("warning"):
            print(f"page {page}: {lane_page['warning']}; skipping PDF comparison")
            all_match = False
            continue
        systems = lane_page["systems"]
        if len(systems) != len(segments):
            print(
                f"page {page}: manifest has {len(segments)} segment(s) but PDF evidence "
                f"has {len(systems)} system(s); check for a missing system_map override"
            )
            all_match = False
            continue
        for segment, system in zip(segments, systems):
            start, end = segment["measure_start"], segment["measure_end"]
            for entry in segment["voices"]:
                voice = entry["voice"]
                pdf_words = system["voices"].get(voice, "").split()
                syllable_texts = [s["text"] for s in entry.get("syllables") or []]
                manifest_words = manifest_segment_words(entry)
                part = parts.get(voice)
                final_words = part_lyric_words(part, start, end) if part is not None else []

                print(f"page {page} measures {start}-{end} voice {voice}")
                print(f"  pdf:      {system['voices'].get(voice, '')}")
                print(f"  manifest: {' '.join(manifest_words)}")
                print(f"  musicxml: {' '.join(final_words)}")
                if not _compare("pdf", pdf_words, "manifest syllables", syllable_texts):
                    all_match = False
                if not _compare("manifest", manifest_words, "musicxml", final_words):
                    all_match = False
    return all_match


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pdf", type=Path, help="Recompute lane evidence fresh from this PDF")
    source.add_argument("--lanes", type=Path, help="Load precomputed lane evidence from this .lanes.json")
    parser.add_argument("--staves-per-system", type=int, default=4)
    parser.add_argument("--ocr-jsonl", type=Path)
    parser.add_argument("--staff-overrides", type=Path)
    parser.add_argument("--system-map", type=Path)
    args = parser.parse_args()
    ok = run(args.manifest, args)
    sys.exit(0 if ok else 1)
