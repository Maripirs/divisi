"""Insert reviewed choir syllables into the source MusicXML without rewriting notes.

The input uses consecutive printed measure ranges, one SATB entry per
system, and optional absolute onset offsets for PDF-checked melismas.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET

from music21 import converter

from app.lyrics.aligned import select_lyric_onsets
from app.lyrics.inject import _match_parts_to_voices


BACKEND = Path(__file__).resolve().parents[1]
VOICES = ("soprano", "alto", "tenor", "bass")


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def pitch_height(note: ET.Element) -> int:
    pitch = note.find("pitch")
    step = pitch.findtext("step")
    alter = int(pitch.findtext("alter") or 0)
    octave = int(pitch.findtext("octave"))
    return 12 * (octave + 1) + {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[step] + alter


def note_onsets(measure: ET.Element) -> dict[int, ET.Element]:
    cursor = last = 0
    by_tick: dict[int, list[ET.Element]] = defaultdict(list)
    for item in measure:
        if item.tag == "backup":
            cursor -= int(item.findtext("duration"))
        elif item.tag == "forward":
            cursor += int(item.findtext("duration"))
        elif item.tag == "note":
            chord = item.find("chord") is not None
            start = last if chord else cursor
            if item.find("pitch") is not None:
                by_tick[start].append(item)
            if not chord:
                last = start
                cursor += int(item.findtext("duration") or 0)
    return {tick: max(notes, key=pitch_height) for tick, notes in by_tick.items()}


def music_only(part: ET.Element) -> bytes:
    clone = ET.fromstring(ET.tostring(part))
    for note in clone.findall(".//note"):
        for lyric in list(note.findall("lyric")):
            note.remove(lyric)
    return ET.canonicalize(ET.tostring(clone, encoding="unicode"), strip_text=True).encode()


def apply(manifest_path: Path, output: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    source = BACKEND / manifest["source_musicxml"]
    pdf = BACKEND / manifest["source_pdf"]
    if digest(source) != manifest["source_musicxml_sha256"]:
        raise ValueError("Reviewed MusicXML source changed")
    if digest(pdf) != manifest["source_pdf_sha256"]:
        raise ValueError("Reviewed PDF source changed")
    tree = ET.parse(source)
    root = tree.getroot()
    raw_parts = root.findall("part")
    if len(raw_parts) < 4:
        raise ValueError("Source lacks four choir parts")
    originals = [music_only(part) for part in raw_parts]
    score = converter.parse(str(source))
    parsed = _match_parts_to_voices(score)
    divisions = int(raw_parts[0].findtext("measure/attributes/divisions"))
    claimed = set()
    summary = []
    last_end = 0
    for position, segment in enumerate(manifest["segments"]):
        start, end = segment["measure_start"], segment["measure_end"]
        if start != last_end + 1 or end < start:
            raise ValueError(f"Printed measure gap before {start}-{end}")
        last_end = end
        if segment.get("page") != position // 2 + 1 or segment.get("system") != position % 2 + 1:
            raise ValueError("PDF system order changed")
        voices = {entry["voice"]: entry for entry in segment["voices"]}
        if set(voices) != set(VOICES):
            raise ValueError(f"Missing choir voice at page {segment['page']} system {segment['system']}")
        for index, voice in enumerate(VOICES):
            entry = voices[voice]
            selected = list(select_lyric_onsets(parsed[voice], start, end))
            if "onset_offsets" in entry:
                allowed = {round(float(offset), 6) for offset in entry["onset_offsets"]}
                available = {round(float(onset.offset), 6) for onset in selected}
                if not allowed <= available:
                    raise ValueError(f"Unknown reviewed onset for {voice} at {start}-{end}")
                selected = [onset for onset in selected if round(float(onset.offset), 6) in allowed]
            syllables = entry["syllables"]
            if len(selected) != len(syllables):
                raise ValueError(f"{voice} at {start}-{end}: {len(syllables)} syllables for {len(selected)} notes")
            raw_part = raw_parts[index]
            for onset, syllable in zip(selected, syllables):
                number = onset.measure
                raw_measure = raw_part.find(f"measure[@number='{number}']")
                if raw_measure is None:
                    raise ValueError(f"Missing printed measure {number} for {voice}")
                local = float(onset.element.getOffsetInHierarchy(parsed[voice].measure(number)))
                tick = round(local * divisions)
                if abs(local * divisions - tick) > 1e-5:
                    raise ValueError(f"Nonintegral note position: {voice} m{number} @{local}")
                note = note_onsets(raw_measure).get(tick)
                if note is None:
                    raise ValueError(f"No source note: {voice} m{number} @{tick}")
                identity = (voice, number, tick)
                if identity in claimed:
                    raise ValueError(f"Duplicate lyric onset: {identity}")
                claimed.add(identity)
                lyric = ET.SubElement(note, "lyric", {"number": "1", "name": "1"})
                ET.SubElement(lyric, "syllabic").text = syllable["syllabic"]
                ET.SubElement(lyric, "text").text = syllable["text"]
            summary.append({"page": segment["page"], "system": segment["system"],
                            "voice": voice, "lyrics": len(syllables)})
    maximum = max(int(measure.get("number")) for measure in raw_parts[0].findall("measure"))
    if len(manifest["segments"]) != 42 or last_end != maximum:
        raise ValueError("PDF review does not cover the complete score")
    for part, original in zip(raw_parts, originals):
        if music_only(part) != original:
            raise ValueError(f"Source music changed in {part.get('id')}")
    doctype = re.search(r"<!DOCTYPE[^>]+>", source.read_text())
    ET.indent(tree, space="  ")
    data = (b'<?xml version="1.0" encoding="utf-8"?>\n'
            + (doctype.group().encode() + b"\n" if doctype else b"")
            + ET.tostring(root, encoding="utf-8") + b"\n")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    report = {"source_musicxml_sha256": manifest["source_musicxml_sha256"],
              "source_pdf_sha256": manifest["source_pdf_sha256"],
              "musicxml_sha256": sha256(data).hexdigest(),
              "total_lyrics": len(claimed), "complete_review": True,
              "systems": len(manifest["segments"]), "entries": summary}
    output.with_suffix(output.suffix + ".report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps({k: v for k, v in apply(args.manifest, args.output).items() if k != "entries"}, indent=2))
