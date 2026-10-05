"""Rebuild a choral MusicXML candidate from reviewed, PDF-sourced segments.

Usage from Backend/: .venv/bin/python scripts/apply_reviewed_lyrics.py \
  lyric_runs/sfcc/song_of_proserpine.json --output /tmp/proserpine-lyrics.musicxml

This command has no network or database side effects. It checks source
hashes and every segment's syllable/onset count before writing anything.
The reviewed JSON is the durable record of PDF transcription and any
manual note-offset corrections, so the same candidate can be recreated.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from collections import Counter
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree

from music21 import converter, expressions, note

from app.lyrics.aligned import _targeted_onsets, inject_aligned_segments
from app.lyrics.inject import _match_parts_to_voices

BACKEND = Path(__file__).resolve().parents[1]
VOICES = {"soprano", "alto", "tenor", "bass"}
SYLLABIC = {"single", "begin", "middle", "end"}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _check_segments(segments: list[dict]) -> None:
    last_end = -1
    for segment in segments:
        start, end = segment["measure_start"], segment["measure_end"]
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or start <= last_end or end < start:
            raise ValueError(f"Overlapping or unordered measure range: {start}-{end}")
        last_end = end
        voices = segment["voices"]
        if {v["voice"] for v in voices} != VOICES or len(voices) != len(VOICES):
            raise ValueError(f"Measure {start}-{end} needs one entry for each SATB voice")
        for entry in voices:
            for syllable in entry["syllables"]:
                if not syllable.get("text", "").strip() or syllable.get("syllabic") not in SYLLABIC:
                    raise ValueError(f"Invalid syllable in measure {start}-{end}: {syllable}")


def _apply_score_repairs(score, repairs: list[dict]) -> None:
    """Apply reviewed, source-checked note repairs visible in the PDF.

    A repair identifies the original event by part, measure, absolute offset,
    and duration. A source score change therefore fails instead of silently
    moving the repair to a different note or rest.
    """
    parts = _match_parts_to_voices(score)
    for repair in repairs:
        part = parts[repair["voice"]]
        measure = part.measure(repair["measure"])
        if repair["kind"] == "remove_ties":
            for value in repair["offsets"]:
                at = Fraction(str(value)).limit_denominator(10080)
                matches = [
                    element for element in measure.recurse().notes
                    if Fraction(str(float(element.getOffsetInHierarchy(part)))).limit_denominator(10080) == at
                    and (not repair.get("pitch") or element.pitch.nameWithOctave == repair["pitch"])
                ]
                expected_count = repair.get("expected_count", 1)
                if len(matches) != expected_count or any(not isinstance(n, note.Note) for n in matches):
                    raise ValueError(f"Score repair needs {expected_count} note(s) at {repair['voice']} m{repair['measure']} @{at}")
                for original in matches:
                    if (repair.get("pitch") and original.pitch.nameWithOctave != repair["pitch"]) or original.tie is None:
                        raise ValueError("Score repair source tie or pitch changed")
                    original.tie = None
            continue
        at = Fraction(str(repair["offset"])).limit_denominator(10080)
        matches = [
            element for element in measure.notesAndRests
            if Fraction(str(float(element.getOffsetInHierarchy(part)))).limit_denominator(10080) == at
        ]
        if len(matches) != 1:
            raise ValueError(f"Score repair needs one event at {repair['voice']} m{repair['measure']} @{at}")
        original = matches[0]
        expected = Fraction(repair["expected_duration"])
        if Fraction(str(original.quarterLength)).limit_denominator(10080) != expected:
            raise ValueError(f"Score repair duration changed at {repair['voice']} m{repair['measure']} @{at}")
        if repair["kind"] == "split_note":
            if not isinstance(original, note.Note) or original.pitch.nameWithOctave != repair["pitch"]:
                raise ValueError("Score repair source note changed")
            durations = [Fraction(value) for value in repair["durations"]]
            if sum(durations) != expected:
                raise ValueError("Score repair note durations do not sum to the original")
            local_at = original.offset
            measure.remove(original)
            elapsed = Fraction(0)
            for index, length in enumerate(durations):
                replacement = copy.deepcopy(original)
                replacement.quarterLength = length
                replacement.tie = copy.deepcopy(original.tie) if index == len(durations) - 1 else None
                replacement.lyrics = []
                measure.insert(float(local_at + elapsed), replacement)
                elapsed += length
        elif repair["kind"] == "replace_rest":
            if not isinstance(original, note.Rest):
                raise ValueError("Score repair source rest changed")
            local_at = original.offset
            measure.remove(original)
            replacement = note.Note(repair["pitch"], quarterLength=expected)
            measure.insert(local_at, replacement)
        else:
            raise ValueError(f"Unknown score repair: {repair['kind']}")


def _clear_choral_lyrics(score) -> None:
    for part in _match_parts_to_voices(score).values():
        for element in part.recurse().notes:
            element.lyrics = []


def _remove_unexportable_arpeggios(score) -> int:
    """Discard singleton arpeggio spanners imported from malformed OMR XML.

    music21 cannot export an ArpeggioMarkSpanner containing only one Note.
    Such a mark has no chord to arpeggiate and does not change note events.
    """
    invalid = [spanner for spanner in score.recurse().getElementsByClass(expressions.ArpeggioMarkSpanner)
               if len(spanner.getSpannedElements()) < 2]
    for spanner in invalid:
        spanner.activeSite.remove(spanner)
    return len(invalid)


def _preserve_source_parts(source: Path, output: Path, indices: list[int]) -> None:
    """Keep untouched parts byte-for-byte when music21 rewrites their ties."""
    source_xml = source.read_text()
    candidate_xml = output.read_text()
    source_parts = ElementTree.fromstring(source_xml).findall("part")
    for index in indices:
        part_id = source_parts[index].get("id")
        pattern = rf'<part id="{re.escape(part_id)}">.*?</part>'
        original = re.findall(pattern, source_xml, flags=re.DOTALL)
        generated = re.findall(pattern, candidate_xml, flags=re.DOTALL)
        if len(original) != 1 or len(generated) != 1:
            raise ValueError(f"Cannot preserve source part {part_id}")
        candidate_xml = candidate_xml.replace(generated[0], original[0], 1)
    output.write_text(candidate_xml)


def _verify_roundtrip(score, output: Path, report: list[dict]) -> None:
    """Catch note merges and dropped lyrics when MusicXML is written."""
    rebuilt = converter.parse(str(output))
    if len(score.parts) != len(rebuilt.parts):
        raise ValueError("MusicXML export changed the part count")

    def notes_in(part):
        return Counter(
            (
                element.measureNumber,
                round(float(element.getOffsetInHierarchy(part)), 6),
                tuple(p.nameWithOctave for p in element.pitches),
                round(float(element.quarterLength), 6),
            )
            for element in part.recurse().notes
        )

    for index, (original, written) in enumerate(zip(score.parts, rebuilt.parts)):
        if notes_in(original) != notes_in(written):
            raise ValueError(f"MusicXML export changed note events in part {index + 1}")
        def lyric_events(part):
            return Counter(
                (round(float(element.getOffsetInHierarchy(part)), 6),
                 tuple(p.nameWithOctave for p in element.pitches),
                 lyric.text, lyric.syllabic or "single")
                for element in part.recurse().notes for lyric in element.lyrics
            )
        if lyric_events(original) != lyric_events(written):
            raise ValueError(f"MusicXML export changed lyric text or placement in part {index + 1}")

    for voice, part in _match_parts_to_voices(rebuilt).items():
        expected = sum(row["syllables"] for row in report if row["voice"] == voice)
        actual = sum(len(element.lyrics) for element in part.recurse().notes)
        if expected != actual:
            raise ValueError(f"MusicXML export changed {voice} lyrics: {expected} planned, {actual} written")


def run(manifest_path: Path, output: Path, pdf: Path | None = None) -> dict:
    manifest = json.loads(manifest_path.read_text())
    music = BACKEND / manifest["source_musicxml"]
    if _sha256(music) != manifest["source_musicxml_sha256"]:
        raise ValueError(f"MusicXML source changed: {music}")
    if pdf is not None and _sha256(pdf) != manifest["source_pdf_sha256"]:
        raise ValueError(f"PDF source changed: {pdf}")
    segments = manifest["segments"]
    _check_segments(segments)
    score = converter.parse(str(music))
    _apply_score_repairs(score, manifest.get("score_repairs", []))
    removed_arpeggios = _remove_unexportable_arpeggios(score)
    _clear_choral_lyrics(score)
    score.metadata.title = manifest.get("score_title", manifest["piece"])
    if manifest.get("composer"):
        score.metadata.composer = manifest["composer"]
    max_measure = max(m.number for p in score.parts for m in p.getElementsByClass("Measure"))
    if segments[0]["measure_start"] not in (0, 1) or segments[-1]["measure_end"] != max_measure:
        raise ValueError(f"Segments do not cover all measures through {max_measure}")
    if any(a["measure_end"] + 1 != b["measure_start"] for a, b in zip(segments, segments[1:])):
        raise ValueError("Segments leave uncovered measures")
    report = inject_aligned_segments(score, segments)
    for extra in manifest.get("supplementary_lines", []):
        part = _match_parts_to_voices(score)[extra["voice"]]
        onsets = _targeted_onsets(part, extra["measure_start"], extra["measure_end"], extra["onset_targets"])
        syllables = extra["syllables"]
        if len(onsets) != len(syllables):
            raise ValueError(f"Supplementary {extra['voice']} lyric count changed")
        for onset, syllable in zip(onsets, syllables):
            if onset.element.lyrics:
                raise ValueError("Supplementary lyric would replace a primary line")
            onset.element.addLyric(syllable["text"])
            onset.element.lyrics[-1].syllabic = syllable["syllabic"]
        report.append({"voice": extra["voice"], "measure_start": extra["measure_start"],
                       "measure_end": extra["measure_end"], "onsets": len(onsets),
                       "syllables": len(syllables), "supplementary": True})
    output.parent.mkdir(parents=True, exist_ok=True)
    score.write("musicxml", fp=str(output))
    _preserve_source_parts(music, output, manifest.get("preserve_source_part_indices", []))
    header = music.read_text().split("<score-partwise", 1)[0]
    source_comments = re.findall(r"<!--.*?-->", header, flags=re.DOTALL)
    if source_comments:
        generated = output.read_text()
        declaration, remainder = generated.split("\n", 1)
        output.write_text(declaration + "\n" + "\n".join(source_comments) + "\n" + remainder)
    _verify_roundtrip(score, output, report)
    result = {
        "piece": manifest["piece"],
        "musicxml": str(output),
        "musicxml_sha256": _sha256(output),
        "source_pdf_sha256": manifest["source_pdf_sha256"],
        "systems": len(segments),
        "removed_unexportable_arpeggios": removed_arpeggios,
        "lyrics_by_voice": {
            voice: sum(row["syllables"] for row in report if row["voice"] == voice)
            for voice in sorted(VOICES)
        },
        "alignment": report,
    }
    output.with_suffix(output.suffix + ".report.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pdf", type=Path, help="Verify the local source PDF against its recorded hash")
    args = parser.parse_args()
    result = run(args.manifest, args.output, args.pdf)
    print(json.dumps({k: v for k, v in result.items() if k != "alignment"}, indent=2))
