"""MIDI file -> `ParsedMIDI`.

Ported from the iOS app's `MIDIParser.swift` (root `plan.md` M2) using
`mido` instead of AudioToolbox's `MusicSequence` — same voice-part heuristic
(track-name matching, falling back to mean-pitch ranking), same tempo-map-
aware tick->ms conversion, same SMF format-0-vs-1 handling.
"""

from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path

import mido

from app.rendering.models import (
    BackingNote,
    MIDILyricEvent,
    MIDINote,
    MIDITimeSignature,
    ParsedMIDI,
    VoicePart,
)

# Full-word aliases per part, matched as a *prefix* of the (trimmed,
# lowercased) track name — covers real-world split-part naming like
# "Soprano 1", "Soprano II", "Altos", "Tenor 2", "Sop.", "Alt".
_WORD_ALIASES: dict[VoicePart, list[str]] = {
    VoicePart.soprano: ["soprano", "sop"],
    VoicePart.alto: ["alto", "alt"],
    VoicePart.tenor: ["tenor", "ten"],
    VoicePart.bass: ["bass", "bs"],
}

# Single-letter shorthand per part ("S", "S1", "S 2", "S.", "T II", "B2") —
# matched only when the *entire* name reduces to the code plus
# punctuation/numbering, since a bare letter as a prefix elsewhere would
# false-positive too easily (e.g. "Strings").
_SHORT_CODES: dict[str, VoicePart] = {"s": VoicePart.soprano, "a": VoicePart.alto, "t": VoicePart.tenor, "b": VoicePart.bass}
_SHORT_CODE_TRAILER = set(".0123456789ivx ")

# Key-signature name (mido's `key_signature` meta message `.key`, e.g. "C",
# "F#m") -> signed fifths count, matching the MIDI key-signature meta-event's
# `sf` byte semantics the Swift parser reads directly.
_KEY_TO_FIFTHS: dict[str, int] = {
    "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
    "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
    "Am": 0, "Em": 1, "Bm": 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
    "Dm": -1, "Gm": -2, "Cm": -3, "Fm": -4, "Bbm": -5, "Ebm": -6, "Abm": -7,
}


class MIDIParserError(Exception):
    pass


def _match_voice_part(raw_name: str) -> VoicePart | None:
    name = raw_name.strip().lower()
    if not name:
        return None

    for part, aliases in _WORD_ALIASES.items():
        if any(name.startswith(alias) for alias in aliases):
            return part

    code, rest = name[0], name[1:]
    if not all(c in _SHORT_CODE_TRAILER for c in rest):
        return None
    return _SHORT_CODES.get(code)


def _assign_voice_parts(tracks: list[tuple[str | None, list[float]]]) -> dict[int, VoicePart]:
    """Maps track index -> voice part. Tracks that can't be confidently
    mapped (accompaniment, unnamed extras, an ambiguous leftover count) are
    simply absent from the result."""
    assignments: dict[int, VoicePart] = {}
    assigned_parts: set[VoicePart] = set()

    # Pass 1: track-name meta-events. Multiple tracks can map to the same
    # part on purpose — divisi splits ("Soprano 1"/"Soprano 2") both belong
    # in the same voice-part bucket.
    for index, (name, _pitches) in enumerate(tracks):
        if name is None:
            continue
        part = _match_voice_part(name)
        if part is None:
            continue
        assignments[index] = part
        assigned_parts.add(part)

    # Pass 2: mean-pitch fallback (high->low) for whatever voice parts are
    # still unassigned, drawn only from tracks that have notes and weren't
    # already name-matched to a different part.
    remaining_parts = [p for p in VoicePart if p not in assigned_parts]
    if not remaining_parts:
        return assignments

    candidates = [i for i, (_name, pitches) in enumerate(tracks) if i not in assignments and pitches]
    if len(candidates) != len(remaining_parts):
        # More or fewer note-bearing candidate tracks than remaining voice
        # parts — too ambiguous to guess at safely.
        return assignments

    ranked = sorted(candidates, key=lambda i: sum(tracks[i][1]) / len(tracks[i][1]), reverse=True)
    for part, index in zip(remaining_parts, ranked):
        assignments[index] = part
    return assignments


def _is_format_zero(file_path: Path) -> bool:
    """Reads the raw MThd header directly (format field), same as the Swift
    parser — mido's `MidiFile.type` would also tell us this, but the intent
    (and prior-art doc comment) is preserved by reading the header field
    directly rather than trusting a library's higher-level interpretation."""
    try:
        with open(file_path, "rb") as handle:
            header = handle.read(10)
    except OSError:
        return False
    if len(header) != 10 or header[:4] != b"MThd":
        return False
    fmt = (header[8] << 8) | header[9]
    return fmt == 0


def _absolute_ticks(track: mido.MidiTrack) -> list[tuple[int, mido.Message]]:
    events: list[tuple[int, mido.Message]] = []
    t = 0
    for msg in track:
        t += msg.time
        events.append((t, msg))
    return events


def _split_by_channel(track: mido.MidiTrack) -> dict[int, list[tuple[int, mido.Message]]]:
    """Format-0 files put every voice in one track, distinguished only by
    MIDI channel — split into one virtual track per channel, mirroring the
    Swift parser's use of `.smf_ChannelsToTracks` for format-0 files. Meta
    events (name/lyric/etc.) have no channel and aren't attributed to any
    single voice here, same as that load flag doesn't preserve per-channel
    names either — the mean-pitch fallback covers this case."""
    by_channel: dict[int, list[tuple[int, mido.Message]]] = defaultdict(list)
    t = 0
    for msg in track:
        t += msg.time
        channel = getattr(msg, "channel", None)
        if channel is not None:
            by_channel[channel].append((t, msg))
    return dict(by_channel)


def _build_tempo_map(all_events: list[tuple[int, mido.Message]]) -> list[tuple[int, int]]:
    """Returns [(abs_tick, microseconds_per_beat), ...] sorted by tick,
    always starting with a tick-0 entry (default 500000 usec/beat = 120bpm
    if the file has none) — needed to convert ticks to real seconds across
    tempo changes, same as the Swift parser reading the dedicated tempo
    track via `MusicSequenceGetSecondsForBeats`."""
    changes = sorted(
        {(tick, msg.tempo) for tick, msg in all_events if msg.type == "set_tempo"},
        key=lambda pair: pair[0],
    )
    if not changes or changes[0][0] != 0:
        changes.insert(0, (0, 500000))
    # Collapse duplicate ticks (keep the last), preserving order.
    merged: list[tuple[int, int]] = []
    for tick, tempo in changes:
        if merged and merged[-1][0] == tick:
            merged[-1] = (tick, tempo)
        else:
            merged.append((tick, tempo))
    return merged


def _ticks_to_ms(tempo_map: list[tuple[int, int]], ticks_per_beat: int, tick: int) -> int:
    """Integrates real elapsed time across every tempo-map segment up to
    `tick`, so a tempo change mid-note (or mid-piece) doesn't skew timing —
    matching the Swift parser's per-note recomputation via the tempo track
    rather than assuming one constant tempo throughout."""
    elapsed_us = 0.0
    for i, (seg_start, tempo) in enumerate(tempo_map):
        seg_end = tempo_map[i + 1][0] if i + 1 < len(tempo_map) else None
        if tick <= seg_start:
            break
        segment_ticks = tick - seg_start if seg_end is None else min(tick, seg_end) - seg_start
        elapsed_us += segment_ticks * tempo / ticks_per_beat
        if seg_end is not None and tick <= seg_end:
            break
    return round(elapsed_us / 1000)


def parse_midi(file_path: str | Path) -> ParsedMIDI:
    file_path = Path(file_path)
    try:
        mid = mido.MidiFile(str(file_path))
    except (OSError, EOFError, ValueError) as exc:
        raise MIDIParserError(f"Failed to load MIDI file: {exc}") from exc

    ticks_per_beat = mid.ticks_per_beat or 480

    if mid.type == 0 or _is_format_zero(file_path):
        raw_tracks_events = list(_split_by_channel(mid.tracks[0]).values()) if mid.tracks else []
    else:
        raw_tracks_events = [_absolute_ticks(track) for track in mid.tracks]

    all_events = [pair for track in raw_tracks_events for pair in track]
    tempo_map = _build_tempo_map(all_events)

    def to_ms(tick: int) -> int:
        return _ticks_to_ms(tempo_map, ticks_per_beat, tick)

    time_signature = MIDITimeSignature.default()
    for _tick, msg in sorted(all_events, key=lambda pair: pair[0]):
        if msg.type == "time_signature":
            time_signature = MIDITimeSignature(numerator=msg.numerator, denominator=msg.denominator)
            break

    tempo_bpm = 60_000_000 / tempo_map[0][1]

    # Per-track name / lyrics / key-signature / note pairing.
    names: list[str | None] = []
    track_lyrics: list[list[tuple[int, str]]] = []
    track_notes: list[list[tuple[int, int, int]]] = []  # (start_tick, duration_ticks, pitch)
    key_signature_fifths: int | None = None

    for events in raw_tracks_events:
        name: str | None = None
        lyrics: list[tuple[int, str]] = []
        notes: list[tuple[int, int, int]] = []
        pending: dict[int, deque[int]] = defaultdict(deque)  # pitch -> [start_tick, ...]

        for tick, msg in events:
            if msg.type == "track_name" and name is None:
                name = msg.name
            elif msg.type == "lyrics":
                lyrics.append((tick, msg.text))
            elif msg.type == "key_signature" and key_signature_fifths is None:
                key_signature_fifths = _KEY_TO_FIFTHS.get(msg.key, 0)
            elif msg.type == "note_on" and msg.velocity > 0:
                pending[msg.note].append(tick)
            elif msg.type in ("note_off", "note_on"):  # note_on velocity==0 == note_off
                starts = pending.get(msg.note)
                if starts:
                    start_tick = starts.popleft()
                    notes.append((start_tick, tick - start_tick, msg.note))

        notes.sort(key=lambda n: n[0])
        names.append(name)
        track_lyrics.append(lyrics)
        track_notes.append(notes)

    assignments = _assign_voice_parts(
        [(names[i], [float(p) for _s, _d, p in track_notes[i]]) for i in range(len(raw_tracks_events))]
    )

    notes: list[MIDINote] = []
    lyrics: list[MIDILyricEvent] = []
    backing_notes: list[BackingNote] = []
    max_tick = 0

    for index in range(len(raw_tracks_events)):
        voice_part = assignments.get(index)
        for start_tick, duration_ticks, pitch in track_notes[index]:
            start_ms = to_ms(start_tick)
            end_ms = to_ms(start_tick + duration_ticks)
            duration_ms = max(0, end_ms - start_ms)
            if voice_part is not None:
                notes.append(MIDINote(pitch=pitch, start_ms=start_ms, duration_ms=duration_ms, voice_part=voice_part))
            else:
                backing_notes.append(BackingNote(pitch=pitch, start_ms=start_ms, duration_ms=duration_ms))
            max_tick = max(max_tick, start_tick + duration_ticks)
        if voice_part is not None:
            for tick, text in track_lyrics[index]:
                lyrics.append(MIDILyricEvent(text=text, time_ms=to_ms(tick), voice_part=voice_part))

    notes.sort(key=lambda n: n.start_ms)
    lyrics.sort(key=lambda l: l.time_ms)
    backing_notes.sort(key=lambda n: n.start_ms)

    return ParsedMIDI(
        notes=notes,
        lyrics=lyrics,
        tempo_bpm=tempo_bpm,
        time_signature=time_signature,
        key_signature_fifths=key_signature_fifths or 0,
        track_voice_parts=assignments,
        backing_notes=backing_notes,
        duration_ms=to_ms(max_tick),
    )
