"""Place PDF lyrics on the sounding line of a choral MusicXML part.

MusicXML often stores two voices on one staff. Counting every note in the
part consumes a syllable twice when one voice moves beneath a held note in
the other. A slur can also span several notes on one printed syllable.
This module selects one onset per sung syllable before any lyrics are
written. Callers should divide a score into PDF systems or pages so a
classification error cannot shift every later lyric in the piece.
"""

from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush

from music21 import chord, note, spanner, stream

from app.lyrics.text import join_syllables_to_words


@dataclass(frozen=True)
class LyricOnset:
    measure: int
    offset: float
    element: note.Note | chord.Chord


def _pitch_height(element: note.Note | chord.Chord) -> int:
    return max(p.midi for p in element.pitches)


def select_lyric_onsets(
    part: stream.Part, measure_start: int, measure_end: int
) -> list[LyricOnset]:
    """Return the highest sounding note attacks outside slur continuations.

    All sounding notes, including tied continuations, determine the top
    line at a given time. A lower voice's attack beneath a held upper note
    does not consume another syllable. The first note of a slur can take a
    syllable; later onsets through its last note hold that syllable.
    """
    sounding: list[tuple[float, float, int, note.Note | chord.Chord]] = []
    for element in part.recurse().notes:
        start = float(element.getOffsetInHierarchy(part))
        sounding.append((start, start + float(element.quarterLength), _pitch_height(element), element))
    sounding.sort(key=lambda item: item[0])

    slur_spans: list[tuple[float, float]] = []
    for slur in part.recurse().getElementsByClass(spanner.Slur):
        endpoints = list(slur.getSpannedElements())
        if len(endpoints) >= 2:
            start = float(endpoints[0].getOffsetInHierarchy(part))
            end = float(endpoints[-1].getOffsetInHierarchy(part))
            if start < end:
                slur_spans.append((start, end))

    selected: list[LyricOnset] = []
    active: list[tuple[int, float, int]] = []
    index = 0
    while index < len(sounding):
        at = sounding[index][0]
        while active and active[0][1] <= at:
            heappop(active)
        same_time: list[tuple[float, float, int, note.Note | chord.Chord]] = []
        while index < len(sounding) and sounding[index][0] == at:
            item = sounding[index]
            same_time.append(item)
            heappush(active, (-item[2], item[1], index))
            index += 1

        top_pitch = -active[0][0]
        if any(start < at <= end for start, end in slur_spans):
            continue
        for start, _end, pitch, element in same_time:
            if pitch != top_pitch or getattr(element.tie, "type", None) in ("stop", "continue"):
                continue
            measure = element.measureNumber
            if measure is not None and measure_start <= measure <= measure_end:
                selected.append(LyricOnset(measure=measure, offset=start, element=element))
                break
    return selected


def select_voice_onsets(
    part: stream.Part, measure_start: int, measure_end: int, voice_id: str
) -> list[LyricOnset]:
    """Select attacks on a specified written voice of a shared staff.

    This is useful when one staff has two independently printed lyric rows.
    The PDF review must identify the voice; ties carry the preceding syllable.
    """
    selected: list[LyricOnset] = []
    for measure in part.getElementsByClass(stream.Measure):
        if not measure_start <= measure.number <= measure_end:
            continue
        matches = [voice for voice in measure.voices if str(voice.id) == voice_id]
        if len(matches) != 1:
            raise ValueError(f"Expected voice {voice_id} once in measure {measure.number}")
        seen: set[float] = set()
        for element in matches[0].recurse().notes:
            at = round(float(element.getOffsetInHierarchy(part)), 6)
            if at in seen or getattr(element.tie, "type", None) in ("stop", "continue"):
                continue
            seen.add(at)
            selected.append(LyricOnset(measure=measure.number, offset=at, element=element))
    return sorted(selected, key=lambda onset: onset.offset)


def _reviewed_onsets(
    part: stream.Part, measure_start: int, measure_end: int, offsets: list[float]
) -> list[LyricOnset]:
    """Resolve a reviewer's exact score offsets, in score order.

    Some OCR scores contain extra notes, missing ties, or slurs over words
    that have their own syllables. Their reviewed offsets belong in the
    saved segment data so another run makes the same choices.
    """
    choices: dict[float, LyricOnset] = {}
    for element in part.recurse().notes:
        measure = element.measureNumber
        if measure is None or not measure_start <= measure <= measure_end:
            continue
        at = float(element.getOffsetInHierarchy(part))
        current = choices.get(at)
        if current is None or _pitch_height(element) > _pitch_height(current.element):
            choices[at] = LyricOnset(measure=measure, offset=at, element=element)
    if offsets != sorted(set(offsets)):
        raise ValueError("Reviewed lyric offsets must be unique and in score order")
    missing = [at for at in offsets if at not in choices]
    if missing:
        raise ValueError(f"Reviewed lyric offsets have no note attack: {missing}")
    return [choices[at] for at in offsets]


def _targeted_onsets(part: stream.Part, start: int, end: int, targets: list[dict]) -> list[LyricOnset]:
    """Resolve exact pitch and onset when a written staff has two lines."""
    if [row["offset"] for row in targets] != sorted(set(row["offset"] for row in targets)):
        raise ValueError("Targeted lyric offsets must be unique and in score order")
    selected = []
    for row in targets:
        matches = [element for element in part.recurse().notes
                   if element.measureNumber is not None and start <= element.measureNumber <= end
                   and round(float(element.getOffsetInHierarchy(part)), 6) == row["offset"]
                   and any(p.nameWithOctave == row["pitch"] for p in element.pitches)]
        if len(matches) != 1:
            raise ValueError(f"Expected one note at {row['offset']} with pitch {row['pitch']}")
        selected.append(LyricOnset(measure=matches[0].measureNumber,
                                   offset=row["offset"], element=matches[0]))
    return selected


def inject_aligned_segments(
    score: stream.Score, segments: list[dict], *, require_exact: bool = True
) -> list[dict]:
    """Write classified syllables for bounded measure ranges.

    A segment has ``measure_start``, ``measure_end``, and ``voices`` in the
    classifier's normal voice/syllable format. The returned report has one
    row per voice and segment. With ``require_exact`` (the default), any
    count mismatch raises before the score is changed.
    """
    from app.lyrics.inject import _match_parts_to_voices

    parts = _match_parts_to_voices(score)
    planned: list[tuple[list[LyricOnset], list[dict], dict]] = []
    report: list[dict] = []
    for segment in segments:
        start, end = segment["measure_start"], segment["measure_end"]
        for entry in segment.get("voices", []):
            voice = entry.get("voice")
            part = parts.get(voice)
            if part is None:
                continue
            reviewed_offsets = entry.get("onset_offsets")
            if entry.get("onset_targets") is not None:
                onsets = _targeted_onsets(part, start, end, entry["onset_targets"])
            elif reviewed_offsets is not None:
                onsets = _reviewed_onsets(part, start, end, reviewed_offsets)
            elif entry.get("source_voice_id"):
                voice_end = entry.get("source_voice_until_measure", end)
                onsets = select_voice_onsets(part, start, voice_end, entry["source_voice_id"])
                if voice_end < end:
                    onsets += select_lyric_onsets(part, voice_end + 1, end)
            else:
                onsets = select_lyric_onsets(part, start, end)
            syllables = entry.get("syllables") or []
            row = {
                "voice": voice,
                "measure_start": start,
                "measure_end": end,
                "onsets": len(onsets),
                "syllables": len(syllables),
            }
            report.append(row)
            planned.append((onsets, syllables, row))

    mismatches = [row for row in report if row["onsets"] != row["syllables"]]
    if require_exact and mismatches:
        raise ValueError(f"Lyric alignment needs review: {mismatches}")

    for onsets, syllables, _row in planned:
        for onset, syllable in zip(onsets, syllables):
            onset.element.lyrics = []
            onset.element.addLyric(syllable["text"])
            onset.element.lyrics[-1].syllabic = syllable["syllabic"]
    return report


def manifest_segment_words(entry: dict) -> list[str]:
    """Reconstruct the printed words a manifest's voice entry records,
    from its `syllables` list of `{"text", "syllabic"}` dicts."""
    syllables = entry.get("syllables") or []
    return join_syllables_to_words([(s["text"], s["syllabic"]) for s in syllables])


def part_lyric_words(part: stream.Part, measure_start: int, measure_end: int) -> list[str]:
    """Reconstruct the printed words a part's notes carry as lyrics over a
    measure range, in singing order. Lets a caller compare a manifest's
    syllables against what a generated MusicXML actually ended up with,
    catching a bug that keeps the right syllable count but the wrong
    order.
    """
    pairs: list[tuple[float, str, str]] = []
    for element in part.recurse().notes:
        measure = element.measureNumber
        if measure is None or not measure_start <= measure <= measure_end:
            continue
        offset = float(element.getOffsetInHierarchy(part))
        for lyric in element.lyrics:
            if lyric.text:
                pairs.append((offset, lyric.text, lyric.syllabic or "single"))
    pairs.sort(key=lambda item: item[0])
    return join_syllables_to_words([(text, syllabic) for _offset, text, syllabic in pairs])
