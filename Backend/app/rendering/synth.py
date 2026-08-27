"""Renders `ParsedMIDI` to one WAV stem per SATB voice part plus a backing
stem, via FluidSynth + a bundled GM soundfont.

No Swift equivalent — the iOS app played MIDI live through
`AVAudioEngine`/`AVAudioUnitSampler`; the backend instead needs to produce
static audio files up front (see B7 in `Backend/plan.md`) so the frontend
player can fetch and mix pre-rendered stems. Same soundfont
(`TimGM6mb.sf2`) as the iOS app, vendored into this package so the backend
doesn't depend on the `Fixtures/` directory.

Each stem is built from the *same* tempo and covers the *same* total
duration (silence padded at the end via a harmless trailing control-change
event), so all five renders stay sample-aligned when played together —
nothing here depends on wall-clock scheduling like the iOS/live approach did.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import mido

from app.rendering.models import BackingNote, MIDINote, ParsedMIDI, VoicePart

_TICKS_PER_BEAT = 480
_SAMPLE_RATE = 44100

_SOUNDFONT_PATH = Path(__file__).resolve().parent / "resources" / "TimGM6mb.sf2"

STEM_NAMES = [part.value for part in VoicePart] + ["backing"]


class SynthError(Exception):
    pass


def _ms_to_ticks(ms: float, tempo_bpm: float) -> int:
    ticks_per_ms = _TICKS_PER_BEAT * tempo_bpm / 60_000.0
    return round(ms * ticks_per_ms)


def _build_part_midi(notes: list[MIDINote] | list[BackingNote], tempo_bpm: float, duration_ms: int) -> mido.MidiFile:
    mid = mido.MidiFile(type=0, ticks_per_beat=_TICKS_PER_BEAT)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(tempo_bpm), time=0))

    # (tick, is_note_on, pitch) — note_off sorted before note_on at the same
    # tick so back-to-back same-pitch notes don't collide as one long note.
    events: list[tuple[int, int, int]] = []
    for note in notes:
        start_tick = _ms_to_ticks(note.start_ms, tempo_bpm)
        end_tick = _ms_to_ticks(note.start_ms + note.duration_ms, tempo_bpm)
        end_tick = max(end_tick, start_tick + 1)
        events.append((start_tick, 1, note.pitch))
        events.append((end_tick, 0, note.pitch))
    events.sort(key=lambda e: (e[0], e[1]))

    cursor = 0
    for tick, is_on, pitch in events:
        delta = max(0, tick - cursor)
        if is_on:
            track.append(mido.Message("note_on", note=pitch, velocity=96, time=delta))
        else:
            track.append(mido.Message("note_off", note=pitch, velocity=0, time=delta))
        cursor = tick

    # Pad trailing silence so every stem renders to the same length,
    # regardless of how early this particular part's last note ends.
    final_tick = _ms_to_ticks(duration_ms, tempo_bpm)
    if final_tick > cursor:
        track.append(mido.MetaMessage("marker", text="end", time=final_tick - cursor))
    track.append(mido.MetaMessage("end_of_track", time=0))
    return mid


def _render_wav(midi_path: Path, wav_path: Path, soundfont_path: Path) -> None:
    if shutil.which("fluidsynth") is None:
        raise SynthError("fluidsynth executable not found on PATH")
    result = subprocess.run(
        [
            "fluidsynth", "-n", "-i",
            "-F", str(wav_path),
            "-r", str(_SAMPLE_RATE),
            str(soundfont_path),
            str(midi_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or not wav_path.exists():
        raise SynthError(f"fluidsynth failed ({result.returncode}): {result.stderr.strip()}")


def render_stems(parsed: ParsedMIDI, output_dir: Path, soundfont_path: Path = _SOUNDFONT_PATH) -> dict[str, Path]:
    """Renders one WAV per SATB part plus a `backing` stem into
    `output_dir`, named `{part}.wav`. Returns {stem_name: path}."""
    output_dir.mkdir(parents=True, exist_ok=True)
    stems: dict[str, Path] = {}

    for voice_part in VoicePart:
        notes = [n for n in parsed.notes if n.voice_part == voice_part]
        midi = _build_part_midi(notes, parsed.tempo_bpm, parsed.duration_ms)
        midi_path = output_dir / f"{voice_part.value}.mid"
        wav_path = output_dir / f"{voice_part.value}.wav"
        midi.save(str(midi_path))
        _render_wav(midi_path, wav_path, soundfont_path)
        midi_path.unlink()
        stems[voice_part.value] = wav_path

    backing_midi = _build_part_midi(parsed.backing_notes, parsed.tempo_bpm, parsed.duration_ms)
    backing_midi_path = output_dir / "backing.mid"
    backing_wav_path = output_dir / "backing.wav"
    backing_midi.save(str(backing_midi_path))
    _render_wav(backing_midi_path, backing_wav_path, soundfont_path)
    backing_midi_path.unlink()
    stems["backing"] = backing_wav_path

    return stems
