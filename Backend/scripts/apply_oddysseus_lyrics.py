"""Apply visually reviewed Oddysseus syllables to the aligned choral score.

Entries can use the usual slur-aware sung onsets, or name exact note attacks
when the printed PDF puts a new syllable on a tied note or carries one vowel
through several unattached notes. Original musical elements remain intact.
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


PARTS = ("P1", "P2", "P3", "P4", "P5")


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def syllables(words: str) -> list[tuple[str, str]]:
    result = []
    for word in words.split():
        pieces = word.split("|")
        if any(not piece for piece in pieces):
            raise ValueError(f"Empty syllable in {word!r}")
        for index, piece in enumerate(pieces):
            kind = ("single" if len(pieces) == 1 else "begin" if index == 0
                    else "end" if index == len(pieces) - 1 else "middle")
            result.append((piece, kind))
    return result


def pitch_height(note: ET.Element) -> int:
    pitch = note.find("pitch")
    if pitch is None:
        return -1
    step = pitch.findtext("step")
    alter = int(pitch.findtext("alter") or 0)
    octave = int(pitch.findtext("octave"))
    return 12 * (octave + 1) + {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[step] + alter


def onsets(measure: ET.Element, divisions: int = 6) -> list[tuple[int, ET.Element]]:
    cursor = 0
    last = 0
    at: dict[int, list[ET.Element]] = defaultdict(list)
    for item in measure:
        if item.tag == "backup":
            cursor -= int(item.findtext("duration"))
        elif item.tag == "forward":
            cursor += int(item.findtext("duration"))
        elif item.tag == "note":
            chord = item.find("chord") is not None
            start = last if chord else cursor
            if item.find("pitch") is not None:
                at[start].append(item)
            if not chord:
                last = start
                cursor += int(item.findtext("duration") or 0)
    return [(tick, max(notes, key=pitch_height)) for tick, notes in sorted(at.items())]


def strip_lyrics(part: ET.Element) -> bytes:
    clone = ET.fromstring(ET.tostring(part))
    for note in clone.findall(".//note"):
        for lyric in note.findall("lyric"):
            note.remove(lyric)
    return ET.canonicalize(ET.tostring(clone, encoding="unicode")).encode()


def apply(manifest_path: Path, output: Path, *, require_complete: bool = True) -> dict:
    manifest = json.loads(manifest_path.read_text())
    backend = manifest_path.parents[2]
    source = backend / manifest["source_musicxml"]
    if digest(source) != manifest["source_musicxml_sha256"]:
        raise ValueError("Aligned source score changed")
    tree = ET.parse(source)
    root = tree.getroot()
    raw_parts = {part.get("id"): part for part in root.findall("part")}
    originals = {part_id: strip_lyrics(part) for part_id, part in raw_parts.items()}
    score = converter.parse(str(source))
    parsed_parts = dict(zip(PARTS, score.parts[:5]))
    claimed: set[tuple[str, int, int]] = set()
    reviewed = set()
    report_entries = []
    for entry in manifest["entries"]:
        page = entry["page"]
        part_id = entry["part_id"]
        start, end = entry["measure_start"], entry["measure_end"]
        if part_id not in PARTS:
            raise ValueError(f"Unsupported part {part_id}")
        if (page, part_id) in reviewed:
            raise ValueError(f"Duplicate page/part: {page} {part_id}")
        reviewed.add((page, part_id))
        text = syllables(entry["words"])
        targets = []
        if "targets" in entry:
            for number_string, choice in entry["targets"].items():
                number = int(number_string)
                if not start <= number <= end:
                    raise ValueError(f"Target outside page: {number}")
                measure = raw_parts[part_id].find(f"measure[@number='{number}']")
                available = onsets(measure)
                selected = range(len(available)) if choice == "all" else choice
                for index in selected:
                    if not 0 <= index < len(available):
                        raise ValueError(f"Missing onset {part_id} m{number} index {index}")
                    tick, note = available[index]
                    targets.append((number, tick, note))
        else:
            parsed_part = parsed_parts[part_id]
            for onset in select_lyric_onsets(parsed_part, start, end):
                number = onset.measure
                parsed_measure = parsed_part.measure(number)
                local = float(onset.element.getOffsetInHierarchy(parsed_measure))
                tick = round(local * 6)
                if abs(local * 6 - tick) > 1e-5:
                    raise ValueError(f"Nonintegral source tick {part_id} m{number} @{local}")
                available = dict(onsets(raw_parts[part_id].find(f"measure[@number='{number}']")))
                if tick not in available:
                    raise ValueError(f"No XML note at {part_id} m{number} tick {tick}")
                targets.append((number, tick, available[tick]))
        if len(text) != len(targets):
            raise ValueError(f"PDF page {page} {part_id}: {len(text)} syllables for {len(targets)} notes")
        if [(m, tick) for m, tick, _ in targets] != sorted((m, tick) for m, tick, _ in targets):
            raise ValueError(f"Unsorted targets on page {page} {part_id}")
        for (number, tick, note), (word, kind) in zip(targets, text):
            identity = (part_id, number, tick)
            if identity in claimed:
                raise ValueError(f"Duplicate lyric onset {identity}")
            claimed.add(identity)
            lyric = ET.SubElement(note, "lyric", {"number": "1", "name": "1"})
            ET.SubElement(lyric, "syllabic").text = kind
            ET.SubElement(lyric, "text").text = word
        report_entries.append({"page": page, "part_id": part_id, "measures": [start, end],
                               "lyrics": len(text), "target_mode": "explicit" if "targets" in entry else "slur-aware"})
    if require_complete:
        expected = {(page, part_id) for page in range(1, 21) for part_id in PARTS}
        if reviewed != expected:
            raise ValueError(f"Unreviewed page/part lanes: {sorted(expected - reviewed)}")
    for part_id, original in originals.items():
        if strip_lyrics(raw_parts[part_id]) != original:
            raise ValueError(f"Musical content changed in {part_id}")
    doctype = re.search(r"<!DOCTYPE[^>]+>", source.read_text())
    ET.indent(tree, space="  ")
    data = (b'<?xml version="1.0" encoding="utf-8"?>\n'
            + (doctype.group().encode() + b"\n" if doctype else b"")
            + ET.tostring(root, encoding="utf-8") + b"\n")
    output.write_bytes(data)
    report = {"source_musicxml_sha256": manifest["source_musicxml_sha256"],
              "source_pdf_sha256": manifest["source_pdf_sha256"],
              "musicxml_sha256": sha256(data).hexdigest(),
              "total_lyrics": len(claimed), "entries": report_entries,
              "complete_review": require_complete and len(reviewed) == 100}
    output.with_suffix(output.suffix + ".report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()
    print(json.dumps(apply(args.manifest, args.output, require_complete=not args.allow_partial), indent=2))
