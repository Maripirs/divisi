from pathlib import Path

import pytest

from app.rendering.midi_parser import parse_midi
from app.rendering.models import VoicePart

FIXTURES = Path(__file__).parent / "fixtures"


def test_parses_satb_tracks_and_tempo():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")

    assert parsed.tempo_bpm == pytest.approx(52)
    assert parsed.time_signature.numerator == 4
    assert parsed.time_signature.denominator == 4
    assert parsed.key_signature_fifths == -1  # D minor
    assert not parsed.backing_notes

    by_part = {part: [n for n in parsed.notes if n.voice_part == part] for part in VoicePart}
    for part, notes in by_part.items():
        assert len(notes) == 24, part

    # First chord (bar 1, beat 1): S69 A65 T62 B50, all starting at t=0.
    assert by_part[VoicePart.soprano][0].pitch == 69
    assert by_part[VoicePart.alto][0].pitch == 65
    assert by_part[VoicePart.tenor][0].pitch == 62
    assert by_part[VoicePart.bass][0].pitch == 50
    assert all(by_part[part][0].start_ms == 0 for part in VoicePart)


def test_accompaniment_track_falls_back_to_backing_notes():
    parsed = parse_midi(FIXTURES / "requiem-satb-accompanied.mid")

    by_part = {part: [n for n in parsed.notes if n.voice_part == part] for part in VoicePart}
    for part, notes in by_part.items():
        assert len(notes) == 24, part
    assert len(parsed.backing_notes) > 0


def test_notes_sorted_by_start_time():
    parsed = parse_midi(FIXTURES / "requiem-satb-plain.mid")
    starts = [n.start_ms for n in parsed.notes]
    assert starts == sorted(starts)
