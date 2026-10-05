"""Rebuild a reviewed lyric-text correction without altering the score notes.

Each correction identifies one existing lyric by part, measure, and its
zero-based lyric index within that measure. The old syllable must match.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree


PART = re.compile(r'<part id="([^"]+)">.*?</part>', re.DOTALL)
MEASURE = re.compile(r'<measure number="([^"]+)"[^>]*>.*?</measure>', re.DOTALL)
LYRIC = re.compile(r'<lyric\b[^>]*>.*?</lyric>', re.DOTALL)
TEXT = re.compile(r'<text>(.*?)</text>', re.DOTALL)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def lyric_positions(xml: str) -> dict[tuple[str, str, int], tuple[int, int, str]]:
    positions = {}
    for part in PART.finditer(xml):
        for measure in MEASURE.finditer(part.group()):
            for index, lyric in enumerate(LYRIC.finditer(measure.group())):
                matches = list(TEXT.finditer(lyric.group()))
                if len(matches) > 1:
                    raise ValueError("One lyric element has multiple text elements")
                if not matches:
                    continue
                inner = matches[0]
                start = part.start() + measure.start() + lyric.start() + inner.start(1)
                end = part.start() + measure.start() + lyric.start() + inner.end(1)
                key = (part.group(1), measure.group(1), index)
                if key in positions:
                    raise ValueError(f"Duplicate lyric address: {key}")
                positions[key] = (start, end, inner.group(1))
    return positions


def build(manifest_path: Path, source_path: Path, pdf_path: Path, output_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    source = source_path.read_bytes()
    pdf = pdf_path.read_bytes()
    if digest(source) != manifest["source_musicxml_sha256"]:
        raise ValueError("MusicXML source hash differs from reviewed manifest")
    if digest(pdf) != manifest["source_pdf_sha256"]:
        raise ValueError("PDF source hash differs from reviewed manifest")

    xml = source.decode("utf-8")
    positions = lyric_positions(xml)
    replacements = []
    seen = set()
    for correction in manifest["corrections"]:
        key = (correction["part_id"], str(correction["measure"]), correction["lyric_index"])
        if key in seen:
            raise ValueError(f"Duplicate correction: {key}")
        seen.add(key)
        if key not in positions:
            raise ValueError(f"Lyric address missing: {key}")
        start, end, old = positions[key]
        if old != correction["old"]:
            raise ValueError(f"At {key}, expected {correction['old']!r}, found {old!r}")
        new = correction["new"]
        if not new or any(char in new for char in "<&>"):
            raise ValueError(f"Invalid replacement lyric at {key}")
        replacements.append((start, end, new))
    if not replacements:
        raise ValueError("Correction manifest is empty")

    for start, end, new in sorted(replacements, reverse=True):
        xml = xml[:start] + new + xml[end:]
    candidate = xml.encode("utf-8")
    original_tree = ElementTree.fromstring(source)
    candidate_tree = ElementTree.fromstring(candidate)
    original_lyrics = original_tree.findall(".//lyric")
    candidate_lyrics = candidate_tree.findall(".//lyric")
    if len(original_lyrics) != len(candidate_lyrics):
        raise ValueError("Lyric element count changed")
    if len(original_tree.findall(".//note")) != len(candidate_tree.findall(".//note")):
        raise ValueError("Note count changed")
    # Compare every MusicXML element after removing lyrics. This includes
    # notes, rhythms, instruments, layout, and metadata.
    for tree in (original_tree, candidate_tree):
        for parent in tree.iter():
            for child in list(parent):
                if child.tag == "lyric":
                    parent.remove(child)
    if ElementTree.tostring(original_tree) != ElementTree.tostring(candidate_tree):
        raise ValueError("Candidate contains changes outside lyric elements")

    report = {
        "piece": manifest["piece"],
        "source_musicxml_sha256": digest(source),
        "source_pdf_sha256": digest(pdf),
        "musicxml_sha256": digest(candidate),
        "correction_count": len(replacements),
        "lyric_element_count": len(candidate_lyrics),
        "note_element_count": len(candidate_tree.findall(".//note")),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(candidate)
    output_path.with_suffix(output_path.suffix + ".report.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.manifest, args.source, args.pdf, args.output), indent=2))
