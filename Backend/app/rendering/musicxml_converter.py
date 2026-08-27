"""`ParsedMIDI` -> MusicXML, for OSMD to render.

Ported from the iOS app's `MusicXMLConverter.swift` (root `plan.md` M4) —
same fixed-grid quantization approach, same tie/measure-splitting logic,
same flat pitch-spelling table. See that file's doc comment for the known
simplifications (fixed-grid rhythm snap, non-harmonic pitch spelling) —
unchanged here, this is a straight port, not a redesign.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.rendering.models import MIDINote, MIDITimeSignature, ParsedMIDI, VoicePart

_UNITS_PER_WHOLE_NOTE = 16  # one grid unit = a sixteenth note
_DIVISIONS_PER_QUARTER = 4  # MusicXML <divisions>; a unit count *is* a MusicXML duration directly

# Standard iOS system blue — tints the highlighted part's noteheads in
# "highlighted" mode. Not user-configurable yet.
HIGHLIGHT_COLOR = "#3478F6"


@dataclass(frozen=True)
class ConvertResult:
    xml: str
    ms_per_whole_note: float


class MusicXMLConverterError(Exception):
    pass


def convert(parsed: ParsedMIDI, voice_part: VoicePart) -> ConvertResult:
    notes = _notes_for(parsed, voice_part)
    if not notes:
        raise MusicXMLConverterError(f"No notes for voice part {voice_part}")

    unit_ms = _unit_ms(parsed.tempo_bpm)
    units_per_measure = _units_per_measure(parsed.time_signature)
    measure_unit_spans = _measures(notes, unit_ms, units_per_measure)
    use_flats = parsed.key_signature_fifths < 0
    attributes_xml = _attributes_xml(parsed.time_signature, parsed.key_signature_fifths, voice_part)

    body = _body_xml(measure_unit_spans, use_flats, attributes_xml)
    xml = _score_xml([(f"P1", voice_part.value.capitalize(), body)])
    return ConvertResult(xml=xml, ms_per_whole_note=unit_ms * _UNITS_PER_WHOLE_NOTE)


def convert_all_parts(parsed: ParsedMIDI, highlighted_part: VoicePart | None = None) -> ConvertResult:
    """Converts all four voice parts into one multi-part score, one <part>
    per voice in SATB order, all padded to the same shared measure count so
    barlines line up vertically. A part with no notes at all still gets its
    full share of rest-only measures rather than being omitted, so every
    display mode shows a consistent SATB grid regardless of what a given
    file actually uses."""
    unit_ms = _unit_ms(parsed.tempo_bpm)
    units_per_measure = _units_per_measure(parsed.time_signature)
    use_flats = parsed.key_signature_fifths < 0

    measure_unit_spans_by_part: dict[VoicePart, list[list[_MeasurePiece]]] = {}
    for voice_part in VoicePart:
        notes = _notes_for(parsed, voice_part)
        measure_unit_spans_by_part[voice_part] = _measures(notes, unit_ms, units_per_measure)

    shared_measure_count = max(1, max((len(spans) for spans in measure_unit_spans_by_part.values()), default=1))
    rest_measure = [_MeasurePiece(duration_units=units_per_measure, pitch=None, continues_from_previous=False, continues_to_next=False)]
    for voice_part in VoicePart:
        spans = measure_unit_spans_by_part[voice_part]
        while len(spans) < shared_measure_count:
            spans.append(rest_measure)

    parts: list[tuple[str, str, str]] = []
    for index, voice_part in enumerate(VoicePart):
        attributes_xml = _attributes_xml(parsed.time_signature, parsed.key_signature_fifths, voice_part)
        color = HIGHLIGHT_COLOR if voice_part == highlighted_part else None
        body = _body_xml(measure_unit_spans_by_part[voice_part], use_flats, attributes_xml, color=color)
        parts.append((f"P{index + 1}", voice_part.value.capitalize(), body))

    return ConvertResult(xml=_score_xml(parts), ms_per_whole_note=unit_ms * _UNITS_PER_WHOLE_NOTE)


def _notes_for(parsed: ParsedMIDI, voice_part: VoicePart) -> list[MIDINote]:
    return sorted((n for n in parsed.notes if n.voice_part == voice_part), key=lambda n: n.start_ms)


def _unit_ms(tempo_bpm: float) -> float:
    return 60_000.0 / tempo_bpm / _DIVISIONS_PER_QUARTER


def _units_per_measure(time_signature: MIDITimeSignature) -> int:
    return time_signature.numerator * (_UNITS_PER_WHOLE_NOTE // time_signature.denominator)


# --- Grid quantization -------------------------------------------------

@dataclass(frozen=True)
class _GridEvent:
    start_unit: int
    duration_units: int
    pitch: int | None  # None = rest


def _build_timeline(notes: list[MIDINote], unit_ms: float, units_per_measure: int) -> list[_GridEvent]:
    """Snaps each note to the nearest grid unit, then fills every gap
    between notes (including before the first one) with a rest so the whole
    part is a contiguous, gap-free timeline. Also pads a final trailing rest
    so the last measure comes out full."""
    quantized: list[tuple[int, int, int]] = []  # (start_unit, end_unit, pitch)
    cursor = 0
    for note in sorted(notes, key=lambda n: n.start_ms):
        start_unit = round(note.start_ms / unit_ms)
        end_unit = round((note.start_ms + note.duration_ms) / unit_ms)
        # Rounding two adjacent notes onto the same grid unit (or a tiny
        # negative gap) can make them overlap — clamp to where the previous
        # note actually finished.
        start_unit = max(start_unit, cursor)
        end_unit = max(end_unit, start_unit + 1)
        quantized.append((start_unit, end_unit, note.pitch))
        cursor = end_unit

    timeline: list[_GridEvent] = []
    unit_cursor = 0
    for start_unit, end_unit, pitch in quantized:
        if start_unit > unit_cursor:
            timeline.append(_GridEvent(start_unit=unit_cursor, duration_units=start_unit - unit_cursor, pitch=None))
        timeline.append(_GridEvent(start_unit=start_unit, duration_units=end_unit - start_unit, pitch=pitch))
        unit_cursor = end_unit

    remainder = unit_cursor % units_per_measure
    if remainder != 0:
        timeline.append(_GridEvent(start_unit=unit_cursor, duration_units=units_per_measure - remainder, pitch=None))
    return timeline


@dataclass(frozen=True)
class _MeasurePiece:
    duration_units: int
    pitch: int | None
    continues_from_previous: bool
    continues_to_next: bool


def _piece_count(start: int, duration: int, measure_start: int, units_per_measure: int) -> int:
    """Dry-run of the splitting loop below that only counts how many
    barline-crossing pieces `duration` units starting at `start` would
    produce — a look-ahead so tie-continuation flags can be set in a single
    real pass."""
    remaining_start = start
    remaining_duration = duration
    boundary = measure_start
    count = 0
    while remaining_duration > 0:
        measure_end = boundary + units_per_measure
        piece_duration = min(remaining_duration, measure_end - remaining_start)
        remaining_start += piece_duration
        remaining_duration -= piece_duration
        count += 1
        if remaining_start >= measure_end:
            boundary = measure_end
    return count


def _split_at_measure_boundaries(timeline: list[_GridEvent], units_per_measure: int) -> list[list[_MeasurePiece]]:
    """Splits any event that straddles a measure boundary into two (or more)
    pieces at that boundary, and groups the result by measure."""
    measures: list[list[_MeasurePiece]] = [[]]
    measure_start = 0

    for event in timeline:
        total_pieces = _piece_count(event.start_unit, event.duration_units, measure_start, units_per_measure)
        is_note = event.pitch is not None

        remaining_start = event.start_unit
        remaining_duration = event.duration_units
        piece_index = 0
        while remaining_duration > 0:
            measure_end = measure_start + units_per_measure
            room_in_measure = measure_end - remaining_start
            piece_duration = min(remaining_duration, room_in_measure)
            measures[-1].append(
                _MeasurePiece(
                    duration_units=piece_duration,
                    pitch=event.pitch,
                    continues_from_previous=is_note and piece_index > 0,
                    continues_to_next=is_note and piece_index < total_pieces - 1,
                )
            )
            remaining_start += piece_duration
            remaining_duration -= piece_duration
            piece_index += 1
            if remaining_start >= measure_end:
                measure_start = measure_end
                measures.append([])

    if measures and not measures[-1]:
        measures.pop()
    return measures


def _measures(notes: list[MIDINote], unit_ms: float, units_per_measure: int) -> list[list[_MeasurePiece]]:
    timeline = _build_timeline(notes, unit_ms, units_per_measure)
    return _split_at_measure_boundaries(timeline, units_per_measure)


# --- Rhythm decomposition ------------------------------------------------

@dataclass(frozen=True)
class _Chunk:
    units: int
    type: str
    dots: int


# Table of every plain/dotted note value expressible on a sixteenth-note
# grid within one whole note, largest first, so the greedy decomposition
# below prefers the fewest/simplest tied fragments.
_VALUE_TABLE: list[tuple[int, str, int]] = [
    (16, "whole", 0), (12, "half", 1), (8, "half", 0), (6, "quarter", 1),
    (4, "quarter", 0), (3, "eighth", 1), (2, "eighth", 0), (1, "16th", 0),
]


def _decompose(units: int) -> list[_Chunk]:
    """Greedily breaks a unit count into standard note values, largest
    first. Always terminates (the table includes 1) and never produces a
    remainder, though an odd unit count ties across the split rather than
    picking a beat-aware grouping — a known simplification (see this
    module's top-level doc comment)."""
    remaining = units
    chunks: list[_Chunk] = []
    while remaining > 0:
        value = next((v for v in _VALUE_TABLE if v[0] <= remaining), None)
        if value is None:
            break
        chunks.append(_Chunk(units=value[0], type=value[1], dots=value[2]))
        remaining -= value[0]
    return chunks


# --- XML emission --------------------------------------------------------

_SHARP_STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
_SHARP_ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
_FLAT_STEPS = ["C", "D", "D", "E", "E", "F", "G", "G", "A", "A", "B", "B"]
_FLAT_ALTERS = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0]


def _note_xml(pitch: int | None, chunk: _Chunk, use_flats: bool, tie_start: bool, tie_stop: bool, color: str | None = None) -> str:
    dots_xml = "\n          <dot/>" * chunk.dots
    if pitch is not None:
        pitch_class = pitch % 12
        octave = pitch // 12 - 1
        steps = _FLAT_STEPS if use_flats else _SHARP_STEPS
        alters = _FLAT_ALTERS if use_flats else _SHARP_ALTERS
        step = steps[pitch_class]
        alter = alters[pitch_class]
        alter_xml = f"\n          <alter>{alter}</alter>" if alter != 0 else ""
        pitch_or_rest_xml = f"      <pitch>\n        <step>{step}</step>{alter_xml}\n        <octave>{octave}</octave>\n      </pitch>"
    else:
        pitch_or_rest_xml = "      <rest/>"

    # MusicXML needs both: <tie> is the playback-level tie, <notations><tied>
    # is what actually draws the tie curve.
    tie_xml = ""
    tied_notations_xml = ""
    if tie_stop:
        tie_xml += '\n        <tie type="stop"/>'
        tied_notations_xml += '\n            <tied type="stop"/>'
    if tie_start:
        tie_xml += '\n        <tie type="start"/>'
        tied_notations_xml += '\n            <tied type="start"/>'
    notations_xml = f"\n          <notations>{tied_notations_xml}\n          </notations>" if tied_notations_xml else ""
    color_attr_xml = f' color="{color}"' if color else ""

    return (
        f"      <note{color_attr_xml}>\n"
        f"{pitch_or_rest_xml}\n"
        f"        <duration>{chunk.units}</duration>{tie_xml}\n"
        f"        <type>{chunk.type}</type>{dots_xml}{notations_xml}\n"
        f"      </note>\n"
    )


def _body_xml(measure_unit_spans: list[list[_MeasurePiece]], use_flats: bool, first_measure_attributes_xml: str, color: str | None = None) -> str:
    body = ""
    for measure_index, measure_events in enumerate(measure_unit_spans):
        body += f'    <measure number="{measure_index + 1}">\n'
        if measure_index == 0:
            body += first_measure_attributes_xml
        for piece in measure_events:
            chunks = _decompose(piece.duration_units)
            for chunk_index, chunk in enumerate(chunks):
                is_note = piece.pitch is not None
                tie_stop = is_note and (chunk_index > 0 or piece.continues_from_previous)
                tie_start = is_note and (chunk_index < len(chunks) - 1 or piece.continues_to_next)
                body += _note_xml(piece.pitch, chunk, use_flats, tie_start, tie_stop, color=color if is_note else None)
        body += "    </measure>\n"
    return body


def _attributes_xml(time_signature: MIDITimeSignature, key_signature_fifths: int, voice_part: VoicePart) -> str:
    if voice_part in (VoicePart.soprano, VoicePart.alto):
        clef_sign, clef_line, clef_octave_change = "G", 2, None
    elif voice_part == VoicePart.tenor:
        clef_sign, clef_line, clef_octave_change = "G", 2, -1  # vocal tenor clef
    else:
        clef_sign, clef_line, clef_octave_change = "F", 4, None
    octave_change_xml = f"\n        <clef-octave-change>{clef_octave_change}</clef-octave-change>" if clef_octave_change is not None else ""
    return (
        "      <attributes>\n"
        f"        <divisions>{_DIVISIONS_PER_QUARTER}</divisions>\n"
        "        <key>\n"
        f"          <fifths>{key_signature_fifths}</fifths>\n"
        "        </key>\n"
        "        <time>\n"
        f"          <beats>{time_signature.numerator}</beats>\n"
        f"          <beat-type>{time_signature.denominator}</beat-type>\n"
        "        </time>\n"
        "        <clef>\n"
        f"          <sign>{clef_sign}</sign>\n"
        f"          <line>{clef_line}</line>{octave_change_xml}\n"
        "        </clef>\n"
        "      </attributes>\n\n"
    )


def _score_xml(parts: list[tuple[str, str, str]]) -> str:
    score_parts_xml = "".join(f'    <score-part id="{pid}">\n      <part-name>{name}</part-name>\n    </score-part>\n' for pid, name, _body in parts)
    parts_xml = "".join(f'  <part id="{pid}">\n{body}  </part>\n' for pid, _name, body in parts)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n'
        '<score-partwise version="4.0">\n'
        "  <part-list>\n"
        f"{score_parts_xml}  </part-list>\n"
        f"{parts_xml}</score-partwise>"
    )
