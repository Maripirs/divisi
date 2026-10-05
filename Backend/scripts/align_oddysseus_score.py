"""Align Oddysseus's five choral parts with the printed PDF bars.

The source MusicXML begins at printed bar 7 in every part. Add six
introductory bars before its existing measures so every part spans 1-122.
The printed piano figure in bars 1-4 repeats source bar 1. Bars 5-6
keep that upper-staff figure with the lower-staff notes transcribed from
the PDF's opening system.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def add(parent: ET.Element, tag: str, value: str | int | None = None, **attrs: str) -> ET.Element:
    element = ET.SubElement(parent, tag, attrs)
    if value is not None:
        element.text = str(value)
    return element


def rest_measure(number: int, *, attributes: list[ET.Element] | None = None,
                 piano: bool = False, voice: str = "1") -> ET.Element:
    measure = ET.Element("measure", number=str(number))
    for element in attributes or []:
        measure.append(deepcopy(element))
    if piano:
        for staff in (1, 2):
            if staff == 2:
                add(add(measure, "backup"), "duration", 18)
            note = add(measure, "note")
            add(note, "rest", measure="yes")
            add(note, "duration", 18)
            add(note, "voice", str(staff))
            add(note, "staff", staff)
    else:
        note = add(measure, "note")
        add(note, "rest", measure="yes")
        add(note, "duration", 18)
        add(note, "voice", voice)
        add(note, "type", "whole")
    return measure


def bass_intro(measure4: ET.Element, measure5: ET.Element) -> None:
    measure4.clear()
    measure4.set("number", "4")
    first = add(measure4, "note")
    pitch = add(first, "pitch")
    add(pitch, "step", "F")
    add(pitch, "alter", 0)
    add(pitch, "octave", 3)
    add(first, "duration", 18)
    add(first, "tie", type="start")
    add(first, "voice", "9")
    add(first, "type", "half")
    add(first, "dot")
    add(add(first, "notations"), "tied", type="start")

    measure5.clear()
    measure5.set("number", "5")
    second = add(measure5, "note")
    pitch = add(second, "pitch")
    add(pitch, "step", "F")
    add(pitch, "alter", 0)
    add(pitch, "octave", 3)
    add(second, "duration", 6)
    add(second, "tie", type="stop")
    add(second, "voice", "9")
    add(second, "type", "quarter")
    add(add(second, "notations"), "tied", type="stop")
    for _ in range(2):
        note = add(measure5, "note")
        add(note, "rest")
        add(note, "duration", 6)
        add(note, "voice", "9")
        add(note, "type", "quarter")


def piano_note(measure: ET.Element, step: str, alter: int, octave: int,
               duration: int, kind: str, *, voice: str = "2", chord: bool = False,
               dotted: bool = False, accidental: str | None = None) -> None:
    note = add(measure, "note")
    if chord:
        add(note, "chord")
    pitch = add(note, "pitch")
    add(pitch, "step", step)
    add(pitch, "alter", alter)
    add(pitch, "octave", octave)
    add(note, "duration", duration)
    add(note, "voice", voice)
    add(note, "type", kind)
    if dotted:
        add(note, "dot")
    if accidental:
        add(note, "accidental", accidental)
    add(note, "stem", "up" if voice == "1" else "down")
    add(note, "staff", 2)


def piano_intro(source_measure: ET.Element, number: int) -> ET.Element:
    measure = deepcopy(source_measure)
    measure.set("number", str(number))
    if number > 1:
        for attributes in list(measure.findall("attributes")):
            measure.remove(attributes)
    if number <= 4:
        return measure
    # Retain both printed upper-staff voices, replacing the lower staff.
    backups = [item for item in measure if item.tag == "backup"]
    lower_start = list(measure).index(backups[1])
    for item in list(measure)[lower_start:]:
        measure.remove(item)
    add(add(measure, "backup"), "duration", 18)
    if number == 5:
        piano_note(measure, "B", -1, 1, 18, "half", dotted=True)
        piano_note(measure, "F", 0, 2, 18, "half", chord=True, dotted=True)
        add(add(measure, "backup"), "duration", 18)
        rest = add(measure, "note")
        add(rest, "rest")
        add(rest, "duration", 6)
        add(rest, "voice", "1")
        add(rest, "type", "quarter")
        add(rest, "staff", 2)
        piano_note(measure, "F", 0, 3, 12, "half", voice="1")
    else:
        piano_note(measure, "C", 0, 3, 12, "half")
        piano_note(measure, "A", -1, 3, 12, "half", chord=True, accidental="flat")
        piano_note(measure, "A", -1, 2, 6, "quarter", accidental="flat")
        piano_note(measure, "E", -1, 3, 6, "quarter", chord=True)
    return measure


def repair_bar62_staff(parts: dict[str, ET.Element]) -> None:
    soprano2 = parts["P2"].find("measure[@number='62']")
    alto = parts["P3"].find("measure[@number='62']")
    if soprano2 is None or alto is None:
        raise ValueError("Missing bar 62")
    source_note = alto.find("note")
    target_note = soprano2.find("note")
    if (source_note is None or source_note.findtext("pitch/step") != "D"
            or source_note.findtext("pitch/alter") != "-1"
            or target_note is None or target_note.find("rest") is None):
        raise ValueError("Bar 62 no longer matches the reviewed staff correction")
    for direction in list(alto.findall("direction")):
        alto.remove(direction)
        soprano2.insert(0, direction)
    alto.remove(source_note)
    soprano2.remove(target_note)
    source_note.find("voice").text = "21"
    soprano2.append(source_note)
    replacement = add(alto, "note")
    add(replacement, "rest", measure="yes")
    add(replacement, "duration", 18)
    add(replacement, "voice", "17")
    add(replacement, "type", "whole")


def build(manifest_path: Path, output: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    backend = manifest_path.parents[2]
    source = backend / manifest["source_musicxml"]
    pdf = backend / manifest["source_pdf"]
    if digest(source) != manifest["source_musicxml_sha256"] or digest(pdf) != manifest["source_pdf_sha256"]:
        raise ValueError("Source score or PDF changed")
    tree = ET.parse(source)
    root = tree.getroot()
    parts = {part.get("id"): part for part in root.findall("part")}
    if list(parts) != manifest["choral_part_ids"] + [manifest["piano_part_id"]]:
        raise ValueError("Unexpected part list")
    offset = manifest["choral_source_measure_offset"]
    for part_id in manifest["choral_part_ids"] + [manifest["piano_part_id"]]:
        part = parts[part_id]
        original = part.findall("measure")
        if len(original) != 116 or [m.get("number") for m in original] != [str(i) for i in range(1, 117)]:
            raise ValueError(f"Unexpected measure sequence for {part_id}")
        first_attributes = [deepcopy(element) for element in original[0].findall("attributes")]
        voice = original[0].findtext("note/voice") or "1"
        piano_pattern = deepcopy(original[0]) if part_id == manifest["piano_part_id"] else None
        for measure in original:
            measure.set("number", str(int(measure.get("number")) + offset))
        for number in range(offset, 0, -1):
            if piano_pattern is not None:
                intro = piano_intro(piano_pattern, number)
            else:
                intro = rest_measure(number, attributes=first_attributes if number == 1 else [],
                                     voice=voice, piano=part_id == manifest["piano_part_id"])
            part.insert(0, intro)
    bass = parts["P5"]
    bass_intro(bass.findall("measure")[3], bass.findall("measure")[4])
    repair_bar62_staff(parts)
    for part in root.findall("part"):
        if [m.get("number") for m in part.findall("measure")] != [str(i) for i in range(1, 123)]:
            raise ValueError(f"Printed bar labels differ in {part.get('id')}")
    doctype = re.search(r"<!DOCTYPE[^>]+>", source.read_text())
    ET.indent(tree, space="  ")
    data = (b'<?xml version="1.0" encoding="utf-8"?>\n'
            + (doctype.group().encode() + b"\n" if doctype else b"")
            + ET.tostring(root, encoding="utf-8") + b"\n")
    output.write_bytes(data)
    report = {"source_musicxml_sha256": manifest["source_musicxml_sha256"],
              "source_pdf_sha256": manifest["source_pdf_sha256"],
              "musicxml_sha256": sha256(data).hexdigest(),
              "printed_bars": [1, 122], "repeated_piano_intro": [1, 4],
              "transcribed_piano_intro": [5, 6],
              "bass_intro_sung_measure": 4, "soprano2_staff_repair": 62}
    output.with_suffix(output.suffix + ".report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.manifest, args.output), indent=2))
