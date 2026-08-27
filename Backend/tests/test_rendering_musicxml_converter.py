import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from app.rendering.midi_parser import parse_midi
from app.rendering.models import VoicePart
from app.rendering.musicxml_converter import HIGHLIGHT_COLOR, MusicXMLConverterError, convert, convert_all_parts

FIXTURES = Path(__file__).parent / "fixtures"


def test_convert_single_part_produces_well_formed_xml():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")
    result = convert(parsed, VoicePart.soprano)

    root = ET.fromstring(result.xml)
    assert root.tag == "score-partwise"
    assert len(root.findall(".//part")) == 1
    assert result.ms_per_whole_note > 0


def test_convert_raises_when_voice_part_has_no_notes():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")
    empty = parsed.__class__(
        notes=[],
        lyrics=[],
        tempo_bpm=parsed.tempo_bpm,
        time_signature=parsed.time_signature,
        key_signature_fifths=parsed.key_signature_fifths,
        track_voice_parts={},
    )
    with pytest.raises(MusicXMLConverterError):
        convert(empty, VoicePart.soprano)


def test_convert_all_parts_has_four_parts_with_equal_measure_counts():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")
    result = convert_all_parts(parsed, highlighted_part=VoicePart.alto)

    root = ET.fromstring(result.xml)
    parts = root.findall(".//part")
    assert len(parts) == 4
    measure_counts = {len(part.findall("measure")) for part in parts}
    assert len(measure_counts) == 1  # all parts padded to the same measure count

    # Alto's noteheads are tinted; the others aren't.
    assert f'color="{HIGHLIGHT_COLOR}"' in result.xml
    parts_by_id = {part.get("id"): part for part in parts}
    alto_part = parts_by_id["P2"]
    assert alto_part.find(".//note").get("color") == HIGHLIGHT_COLOR
    soprano_part = parts_by_id["P1"]
    assert soprano_part.find(".//note").get("color") is None


def test_convert_all_parts_pads_a_silent_part_with_rests():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")
    only_soprano = parsed.__class__(
        notes=[n for n in parsed.notes if n.voice_part == VoicePart.soprano],
        lyrics=[],
        tempo_bpm=parsed.tempo_bpm,
        time_signature=parsed.time_signature,
        key_signature_fifths=parsed.key_signature_fifths,
        track_voice_parts={},
    )
    result = convert_all_parts(only_soprano)
    root = ET.fromstring(result.xml)
    parts_by_id = {part.get("id"): part for part in root.findall(".//part")}
    # Bass (P4) has no source notes but should still be a full rest-only part.
    bass_measures = parts_by_id["P4"].findall("measure")
    assert len(bass_measures) == len(parts_by_id["P1"].findall("measure"))
    assert all(measure.find(".//rest") is not None for measure in bass_measures)
