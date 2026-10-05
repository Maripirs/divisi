"""The PDF lyric alignment must follow a staff's sounding lead line."""

import pytest
from music21 import note, spanner, stream, tie

from app.lyrics.aligned import inject_aligned_segments, select_lyric_onsets


def _overlapping_score():
    score = stream.Score()
    part = stream.Part()
    part.partName = "Soprano"
    measure = stream.Measure(number=1)
    upper = stream.Voice()
    lower = stream.Voice()
    first = note.Note("C5", quarterLength=2)
    second = note.Note("D5", quarterLength=1)
    held = note.Note("E5", quarterLength=1)
    upper.insert(0, first)
    upper.insert(2, second)
    upper.insert(3, held)
    lower.insert(0, note.Note("G4", quarterLength=1))
    lower.insert(1, note.Note("A4", quarterLength=1))
    lower.insert(2, note.Note("B4", quarterLength=1))
    measure.insert(0, upper)
    measure.insert(0, lower)
    part.append(measure)
    part.insert(0, spanner.Slur(second, held))
    score.insert(0, part)
    return score, first, second, held, lower


def test_select_lyric_onsets_skips_lower_overlap_and_slur_continuation():
    score, first, second, held, _lower = _overlapping_score()

    onsets = select_lyric_onsets(score.parts[0], 1, 1)

    assert [onset.element for onset in onsets] == [first, second]
    assert held not in [onset.element for onset in onsets]


def test_inject_aligned_segments_requires_matching_counts_before_writing():
    score, first, second, _held, lower = _overlapping_score()
    segments = [
        {
            "measure_start": 1,
            "measure_end": 1,
            "voices": [
                {
                    "voice": "soprano",
                    "syllables": [
                        {"text": "Sa-", "syllabic": "begin"},
                        {"text": "cred", "syllabic": "end"},
                    ],
                }
            ],
        }
    ]

    with pytest.raises(ValueError, match="needs review"):
        inject_aligned_segments(score, [{**segments[0], "voices": [{"voice": "soprano", "syllables": segments[0]["voices"][0]["syllables"][:1]}]}])
    assert first.lyrics == []

    report = inject_aligned_segments(score, segments)
    assert report[0]["onsets"] == report[0]["syllables"] == 2
    assert [first.lyrics[0].text, second.lyrics[0].text] == ["Sa", "cred"]
    assert first.lyrics[0].syllabic == "begin"
    assert all(n.lyrics == [] for n in lower.notes)


def test_reviewed_offsets_can_include_an_onset_under_a_slur():
    score, first, second, held, _lower = _overlapping_score()
    segments = [{
        "measure_start": 1,
        "measure_end": 1,
        "voices": [{
            "voice": "soprano",
            "onset_offsets": [0, 2, 3],
            "syllables": [
                {"text": word, "syllabic": "single"}
                for word in ("one", "two", "three")
            ],
        }],
    }]

    inject_aligned_segments(score, segments)

    assert [n.lyrics[0].text for n in (first, second, held)] == ["one", "two", "three"]


def test_reviewed_offsets_can_correct_a_false_tie_in_ocr_musicxml():
    score, first, second, held, _lower = _overlapping_score()
    held.tie = tie.Tie("stop")
    segments = [{
        "measure_start": 1,
        "measure_end": 1,
        "voices": [{
            "voice": "soprano",
            "onset_offsets": [0, 2, 3],
            "syllables": [
                {"text": word, "syllabic": "single"}
                for word in ("one", "two", "three")
            ],
        }],
    }]

    inject_aligned_segments(score, segments)

    assert held.lyrics[0].text == "three"
