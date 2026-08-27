"""Domain types for the B7 rendering pipeline.

Mirrors the iOS app's `MIDIModels.swift` shape (see root `plan.md` M2/M4) so
the parsing/quantization logic below is a straight port rather than a
redesign. Plain dataclasses, no FastAPI/SQLAlchemy coupling — this module is
usable standalone (e.g. by a future OMR pipeline or a script) same as the
Swift original was kept Foundation-only for portability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class VoicePart(str, Enum):
    """Ordered high->low so a fallback mean-pitch ranking can zip against it
    directly, same as the Swift `VoicePart: CaseIterable` ordering."""

    soprano = "soprano"
    alto = "alto"
    tenor = "tenor"
    bass = "bass"


@dataclass(frozen=True)
class MIDINote:
    """A single sung note, already resolved to a voice part and to
    milliseconds (tempo map applied)."""

    pitch: int  # MIDI note number, 0-127
    start_ms: int
    duration_ms: int
    voice_part: VoicePart


@dataclass(frozen=True)
class BackingNote:
    """A note from a track that couldn't be mapped to any voice part
    (accompaniment, unnamed extras) — no Swift equivalent, see
    `ParsedMIDI.backing_notes`."""

    pitch: int
    start_ms: int
    duration_ms: int


@dataclass(frozen=True)
class MIDILyricEvent:
    text: str
    time_ms: int
    voice_part: VoicePart


@dataclass(frozen=True)
class MIDITimeSignature:
    numerator: int
    denominator: int

    @staticmethod
    def default() -> "MIDITimeSignature":
        return MIDITimeSignature(numerator=4, denominator=4)


@dataclass(frozen=True)
class ParsedMIDI:
    """The result of parsing one MIDI file.

    `tempo_bpm`/`time_signature`/`key_signature_fifths` are the file's
    *initial* values only — mid-file changes aren't tracked, matching the
    Swift model's documented simplification (steady-tempo choral repertoire).

    `backing_notes` has no Swift equivalent: it's every note from a track
    that couldn't be mapped to a voice part (accompaniment, unnamed extras),
    kept here (rather than silently dropped, as the Swift parser does) so
    `synth.py` can render a backing/accompaniment stem alongside the four
    SATB stems.
    """

    notes: list[MIDINote]
    lyrics: list[MIDILyricEvent]
    tempo_bpm: float
    time_signature: MIDITimeSignature
    key_signature_fifths: int
    track_voice_parts: dict[int, VoicePart]
    backing_notes: list[BackingNote] = field(default_factory=list)
    duration_ms: int = 0
