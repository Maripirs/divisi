#!/usr/bin/env python3
"""
Generates 2 small SATB MIDI fixtures approximating the opening choral
entrance of Mozart's Requiem, K.626 - Introitus ("Requiem aeternam dona eis,
Domine... et lux perpetua luceat eis"), D minor, Adagio.

NOTE ON ACCURACY: this is reconstructed from memory as a harmonically
plausible chorale reduction (correct key, tempo, text underlay, and overall
i-iv-V-i / VI-iv-V7-i shape), not a verified transcription against the
autograph score. It's meant as a structurally realistic dev fixture for the
MIDI parser (real multi-track SATB + lyric meta-events + an accompaniment
track), not as performance material.

8 bars, 4/4, quarter = 52bpm (Adagio), D minor, one chord per bar
subdivided by syllable rhythm.
"""
import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack

TICKS_PER_BEAT = 480
TEMPO = mido.bpm2tempo(52)

# One chord per bar (SATB pitches as MIDI note numbers), in order:
# i - iv - V - i - VI - iv - V7 - i
CHORDS = [
    {"S": 69, "A": 65, "T": 62, "B": 50},  # bar1 i        (D F A)
    {"S": 70, "A": 67, "T": 62, "B": 55},  # bar2 iv       (G Bb D)
    {"S": 69, "A": 64, "T": 61, "B": 57},  # bar3 V        (A C# E)
    {"S": 69, "A": 65, "T": 62, "B": 50},  # bar4 i        (D F A)
    {"S": 70, "A": 65, "T": 62, "B": 58},  # bar5 VI       (Bb D F)
    {"S": 70, "A": 67, "T": 62, "B": 55},  # bar6 iv       (G Bb D)
    {"S": 69, "A": 67, "T": 61, "B": 57},  # bar7 V7       (A C# E G)
    {"S": 69, "A": 62, "T": 65, "B": 50},  # bar8 i        (D F A)
]

# Per-bar syllable/duration-in-beats breakdown (durations sum to 4 beats/bar).
# A trailing (None, n) entry is a rest.
LYRICS = [
    [("Re", 1), ("qui", 1), ("em", 2)],
    [("ae", 1), ("ter", 1), ("nam", 2)],
    [("do", 1), ("na", 1), ("e", 1), ("is", 1)],
    [("Do", 1), ("mi", 1), ("ne", 2)],
    [("et", 1), ("lux", 1), ("per", 2)],
    [("pe", 1), ("tu", 1), ("a", 2)],
    [("lu", 1), ("ce", 1), ("at", 2)],
    [("e", 1), ("is", 2), (None, 1)],
]

VOICE_NAMES = {"S": "Soprano", "A": "Alto", "T": "Tenor", "B": "Bass"}
VELOCITY = 72


def beats_to_ticks(beats):
    return int(beats * TICKS_PER_BEAT)


def build_voice_track(voice_key):
    track = MidiTrack()
    track.append(MetaMessage("track_name", name=VOICE_NAMES[voice_key], time=0))
    pending_wait = 0  # ticks of rest to prepend to the next event
    for bar_chord, bar_lyrics in zip(CHORDS, LYRICS):
        pitch = bar_chord[voice_key]
        for syllable, dur_beats in bar_lyrics:
            dur_ticks = beats_to_ticks(dur_beats)
            if syllable is None:
                # rest: just accumulate wait time for the next note
                pending_wait += dur_ticks
                continue
            track.append(Message("note_on", note=pitch, velocity=VELOCITY, time=pending_wait))
            pending_wait = 0
            track.append(Message("note_off", note=pitch, velocity=0, time=dur_ticks))
    track.append(MetaMessage("end_of_track", time=0))
    return track


def build_accompaniment_track():
    """Sustained organ-pad chords doubling the harmony, one long note per
    bar per chord tone - stands in for the orchestral/continuo reduction.
    On a real MIDI channel other than the vocal ones, with a non-SATB
    track name, so the parser's voice-part heuristics should skip it."""
    track = MidiTrack()
    track.append(MetaMessage("track_name", name="Organ", time=0))
    track.append(Message("program_change", program=19, time=0))  # Church Organ (GM)
    bar_ticks = beats_to_ticks(4)
    for bar_chord in CHORDS:
        pitches = sorted(set(bar_chord.values()))
        # drop each chord tone an octave for a low pad sound
        pitches = [p - 12 for p in pitches]
        for i, p in enumerate(pitches):
            track.append(Message("note_on", note=p, velocity=50, time=0 if i else 0))
        for i, p in enumerate(pitches):
            track.append(Message("note_off", note=p, velocity=0, time=bar_ticks if i == 0 else 0))
    track.append(MetaMessage("end_of_track", time=0))
    return track


def build_file(path, with_accompaniment):
    mid = MidiFile(ticks_per_beat=TICKS_PER_BEAT, type=1)

    conductor = MidiTrack()
    conductor.append(MetaMessage("track_name", name="Requiem aeternam (excerpt)", time=0))
    conductor.append(MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    conductor.append(MetaMessage("key_signature", key="Dm", time=0))
    conductor.append(MetaMessage("set_tempo", tempo=TEMPO, time=0))
    conductor.append(MetaMessage("end_of_track", time=0))
    mid.tracks.append(conductor)

    for voice_key in ("S", "A", "T", "B"):
        mid.tracks.append(build_voice_track(voice_key))

    if with_accompaniment:
        mid.tracks.append(build_accompaniment_track())

    mid.save(path)
    print(f"wrote {path}  (tracks={len(mid.tracks)}, accompaniment={with_accompaniment})")


if __name__ == "__main__":
    import os
    out_dir = os.path.expanduser("~/projects/divisi/Fixtures")
    os.makedirs(out_dir, exist_ok=True)
    build_file(os.path.join(out_dir, "requiem-satb-plain.mid"), with_accompaniment=False)
    build_file(os.path.join(out_dir, "requiem-satb-accompanied.mid"), with_accompaniment=True)
