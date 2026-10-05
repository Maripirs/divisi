"""Rebuild a MusicXML score with PDF-reviewed measure labels.

The manifest identifies source measures that do not advance the printed
measure count (pickups and alternate endings). This changes only measure
attributes; every note, rest, rhythm, lyric, and direction is preserved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree


PART = re.compile(r'<part id="([^"]+)">.*?</part>', re.DOTALL)
MEASURE_OPEN = re.compile(r'<measure\s+number="(\d+)"([^>]*)>')


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(manifest_path: Path, source_path: Path, pdf_path: Path, output_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    source = source_path.read_bytes()
    pdf = pdf_path.read_bytes()
    if sha256(source) != manifest["source_musicxml_sha256"]:
        raise ValueError("Source MusicXML differs from reviewed manifest")
    if sha256(pdf) != manifest["source_pdf_sha256"]:
        raise ValueError("Source PDF differs from reviewed manifest")
    exceptions = {row["source_measure"]: row for row in manifest["uncounted_measures"]}
    if len(exceptions) != len(manifest["uncounted_measures"]):
        raise ValueError("Duplicate uncounted measure")
    expected_total = manifest["source_measure_count"]
    mapping: dict[int, tuple[str, bool]] = {}
    printed = 0
    for source_number in range(1, expected_total + 1):
        if source_number in exceptions:
            mapping[source_number] = (exceptions[source_number]["label"], True)
        else:
            printed += 1
            mapping[source_number] = (str(printed), False)
    if printed != manifest["printed_measure_count"]:
        raise ValueError(f"Expected {manifest['printed_measure_count']} printed measures, got {printed}")
    for source_number, label in manifest["landmarks"].items():
        if mapping[int(source_number)][0] != label:
            raise ValueError(f"Measure landmark {source_number} changed")

    xml = source.decode("utf-8")
    part_count = 0
    replacements = []
    for part in PART.finditer(xml):
        matches = list(MEASURE_OPEN.finditer(part.group()))
        numbers = [int(m.group(1)) for m in matches]
        if numbers != list(range(1, expected_total + 1)):
            raise ValueError(f"Unexpected measure sequence in {part.group(1)}")
        part_count += 1
        for measure in matches:
            number = int(measure.group(1))
            label, implicit = mapping[number]
            attributes = measure.group(2)
            if "implicit=" in attributes:
                raise ValueError("Source already marks implicit measures")
            replacement = f'<measure number="{label}"' + (
                ' implicit="yes"' if implicit else ''
            ) + attributes + '>'
            replacements.append((part.start() + measure.start(), part.start() + measure.end(), replacement))
    if part_count != manifest["source_part_count"]:
        raise ValueError("Source part count changed")
    for start, end, replacement in reversed(replacements):
        xml = xml[:start] + replacement + xml[end:]
    candidate = xml.encode("utf-8")

    original_root = ElementTree.fromstring(source)
    candidate_root = ElementTree.fromstring(candidate)
    for root in (original_root, candidate_root):
        for measure in root.findall(".//measure"):
            measure.attrib.pop("number", None)
            measure.attrib.pop("implicit", None)
    if ElementTree.tostring(original_root) != ElementTree.tostring(candidate_root):
        raise ValueError("Candidate changed score content outside measure labels")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(candidate)
    report = {
        "piece": manifest["piece"],
        "musicxml_sha256": sha256(candidate),
        "source_musicxml_sha256": sha256(source),
        "source_pdf_sha256": sha256(pdf),
        "source_parts": part_count,
        "source_measures_per_part": expected_total,
        "printed_measures": printed,
        "uncounted_source_measures": [
            {"source": number, "label": row["label"], "reason": row["reason"]}
            for number, row in sorted(exceptions.items())
        ],
    }
    output_path.with_suffix(output_path.suffix + ".report.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.manifest, args.source, args.pdf, args.output), indent=2))
