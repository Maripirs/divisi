"""Transcribe the two PDF-only choral subgroups into Ezekiel's reviewed score.

The manifest records the PDF page map, repeated notes, and exceptional ending.
Every original part is retained structurally. The solo remains outside this score.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re

from xml.etree import ElementTree as etree


QUARTER = 10080
BAR = 2 * QUARTER
SYLLABLES = (("doom", "begin"), ("a", "middle"), ("loom", "middle"), ("a,", "end")) * 2


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def canonical(element: etree.Element) -> bytes:
    return etree.canonicalize(etree.tostring(element, encoding="unicode")).encode()


def child(parent: etree._Element, tag: str, value: str | int | None = None, **attributes: str) -> etree._Element:
    element = etree.SubElement(parent, tag, **attributes)
    if value is not None:
        element.text = str(value)
    return element


def pitch(note: etree._Element, spelling: str) -> None:
    match = re.fullmatch(r"([A-G])([#b]?)([0-9])", spelling)
    if not match:
        raise ValueError(f"Invalid pitch: {spelling}")
    step, accidental, octave = match.groups()
    element = child(note, "pitch")
    child(element, "step", step)
    child(element, "alter", {"#": 1, "b": -1, "": 0}[accidental])
    child(element, "octave", octave)


def note(measure: etree._Element, spelling: str, duration: int, kind: str,
         *, chord: bool = False, voice: str | None = None,
         syllable: tuple[str, str] | None = None, accidental: str | None = None,
         accent: bool = False, stem: str | None = None,
         beam: str | None = None) -> etree._Element:
    element = child(measure, "note")
    if chord:
        child(element, "chord")
    pitch(element, spelling)
    child(element, "duration", duration)
    if voice:
        child(element, "voice", voice)
    child(element, "type", kind)
    if accidental:
        child(element, "accidental", accidental)
    if stem:
        child(element, "stem", stem)
    if beam:
        child(element, "beam", beam, number="1")
        child(element, "beam", beam, number="2")
    if accent:
        notations = child(element, "notations")
        child(child(notations, "articulations"), "accent")
    if syllable:
        lyric = child(element, "lyric", name="1", number="1")
        child(lyric, "syllabic", syllable[1])
        child(lyric, "text", syllable[0])
    return element


def add_rest(measure: etree._Element, duration: int) -> None:
    element = child(measure, "note")
    child(element, "rest", measure="yes")
    child(element, "duration", duration)


def set_pitch(element: etree._Element, spelling: str, accidental: str | None = None) -> None:
    old = element.find("pitch")
    if old is None:
        raise ValueError("Expected pitched note")
    element.remove(old)
    replacement = etree.Element("pitch")
    match = re.fullmatch(r"([A-G])([#b]?)([0-9])", spelling)
    if not match:
        raise ValueError(spelling)
    step, alter, octave = match.groups()
    child(replacement, "step", step)
    child(replacement, "alter", {"#": 1, "b": -1, "": 0}[alter])
    child(replacement, "octave", octave)
    element.insert(0 if element.find("chord") is None else 1, replacement)
    old_accidental = element.find("accidental")
    if old_accidental is not None:
        element.remove(old_accidental)
    if accidental:
        index = list(element).index(element.find("type")) + 1
        new_accidental = etree.Element("accidental")
        new_accidental.text = accidental
        element.insert(index, new_accidental)


def m87_tenor(measure: etree._Element) -> None:
    upper = note(measure, "F4", BAR, "half", voice="1", syllable=("wheel,", "single"))
    child(child(child(upper, "notations"), "articulations"), "staccato")
    child(child(measure, "backup"), "duration", BAR)
    lower = note(measure, "Bb3", QUARTER, "quarter", voice="2",
                 syllable=("wheel,", "single"), accidental="flat")
    child(child(lower, "notations"), "slur", number="1", type="start", placement="below")
    second = note(measure, "B3", QUARTER, "quarter", voice="2", accidental="natural")
    child(child(second, "notations"), "slur", number="1", type="stop")


def add_first_attributes(measure: etree._Element, clef: str) -> None:
    attributes = etree.Element("attributes")
    child(attributes, "divisions", QUARTER)
    child(child(attributes, "key"), "fifths", -2)
    time = child(attributes, "time")
    child(time, "beats", 2)
    child(time, "beat-type", 4)
    staff_clef = child(attributes, "clef")
    child(staff_clef, "sign", "G")
    child(staff_clef, "line", 2)
    if clef == "treble-8":
        child(staff_clef, "clef-octave-change", -1)
    measure.insert(0, attributes)


def build(manifest_path: Path, output_path: Path, pdf_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text())
    source = manifest_path.parent / Path(manifest["source_musicxml"]).name
    if digest(source.read_bytes()) != manifest["source_musicxml_sha256"]:
        raise ValueError("Reviewed MusicXML changed")
    if digest(pdf_path.read_bytes()) != manifest["source_pdf_sha256"]:
        raise ValueError("PDF changed")
    tree = etree.parse(str(source))
    root = tree.getroot()
    source_parts = {part.get("id"): part for part in root.findall("part")}
    if list(source_parts) != ["P1", "P2", "P3", "P4", "P5"]:
        raise ValueError("Unexpected source parts")
    originals = {key: canonical(value) for key, value in source_parts.items()}
    prototype = source_parts["P1"].findall("measure")
    if len(prototype) != 96 or prototype[-1].get("number") != "93":
        raise ValueError("Unexpected measure map")
    part_list = root.find("part-list")
    assert part_list is not None
    score_p5 = part_list.find("score-part[@id='P5']")
    assert score_p5 is not None
    insert_at = list(part_list).index(score_p5)
    piano_part = source_parts["P5"]
    results = {}
    for config in manifest["parts"]:
        score_part = etree.Element("score-part", id=config["id"])
        child(score_part, "part-name", config["name"])
        child(score_part, "part-abbreviation", config["abbreviation"])
        part_list.insert(insert_at, score_part)
        insert_at += 1
        part = etree.Element("part", id=config["id"])
        source_ending = source_parts[config["ending_copy_from"]]
        ending_measures = {measure.get("number"): measure for measure in source_ending.findall("measure")}
        repeated_count = 0
        for original in prototype:
            label = original.get("number")
            measure = etree.Element("measure", **original.attrib)
            if label == "0":
                add_first_attributes(measure, config["clef"])
            if label.isdigit() and int(label) >= 88:
                measure = deepcopy(ending_measures[label])
                if config["id"] == "P7":
                    if label == "91":
                        target = [n for n in measure.findall("note") if n.findtext("lyric/text") == "the"][0]
                        set_pitch(target, "Db4", "flat")
                    if label in ("92", "93"):
                        lower = [n for n in measure.findall("note") if n.findtext("voice") == "14" and n.find("pitch") is not None][0]
                        set_pitch(lower, "D4", "natural" if label == "92" else None)
            elif label == "87":
                if config["id"] == "P6":
                    measure = deepcopy(ending_measures[label])
                else:
                    m87_tenor(measure)
            elif label.isdigit() and int(label) >= config["first_sung_measure"]:
                number = int(label)
                pattern = next((item for item in config["repeated_notes"] if item["from"] <= number <= item["through"]), None)
                if pattern is None:
                    raise ValueError(f"No repeated pattern for {config['id']} m{label}")
                for index, syllable in enumerate(SYLLABLES):
                    beam = ("begin", "continue", "continue", "end")[index % 4]
                    for chord_index, spelling in enumerate(pattern["pitches"]):
                        note(measure, spelling, QUARTER // 4, "16th", chord=chord_index > 0,
                             syllable=syllable if chord_index == 0 else None, accent=chord_index == 0,
                             stem="up" if config["id"] == "P6" else "down", beam=beam)
                repeated_count += 1
            else:
                add_rest(measure, QUARTER // 2 if label in ("0", "32a") else BAR)
            if label in ("73", "80", "81"):
                for barline in original.findall("barline"):
                    if barline.get("location") == "left":
                        measure.insert(0, deepcopy(barline))
                    else:
                        measure.append(deepcopy(barline))
            part.append(measure)
        root.insert(list(root).index(piano_part), part)
        results[config["id"]] = {"name": config["name"], "repeated_measures": repeated_count,
                                 "lyrics": len(part.findall(".//lyric")), "notes": len(part.findall(".//note[pitch]"))}
    for key, original in originals.items():
        if canonical(root.find(f"part[@id='{key}']")) != original:
            raise ValueError(f"Original {key} changed")
    for part in root.findall("part"):
        if [m.get("number") for m in part.findall("measure")] != [m.get("number") for m in prototype]:
            raise ValueError(f"Measure labels differ in {part.get('id')}")
        if part.get("id") in ("P6", "P7") and [m.get("implicit") for m in part.findall("measure")] != [
            m.get("implicit") for m in prototype
        ]:
            raise ValueError(f"Pickup labels differ in {part.get('id')}")
    doctype = re.search(r"<!DOCTYPE[^>]+>", source.read_text())
    if not doctype:
        raise ValueError("MusicXML doctype missing")
    etree.indent(tree, space="  ")
    data = (b'<?xml version="1.0" encoding="utf-8"?>\n' + doctype.group().encode() + b"\n"
            + etree.tostring(root, encoding="utf-8") + b"\n")
    output_path.write_bytes(data)
    report = {"piece": manifest["piece"], "source_pdf_sha256": manifest["source_pdf_sha256"],
              "source_musicxml_sha256": manifest["source_musicxml_sha256"],
              "musicxml_sha256": digest(data), "original_parts_preserved": list(originals),
              "new_parts": results, "solo_excluded": True}
    output_path.with_suffix(output_path.suffix + ".report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.manifest, args.output, args.pdf), indent=2))
