"""Deterministic sequencing: pair each voice's classified lyric syllables
with that voice part's note onsets in order, and write them into a
music21 Score as MusicXML `<lyric>` elements.

Sequential/positional alignment only, no pixel-position matching: the Nth
cleaned syllable (in reading order) pairs with the Nth sung note-onset
(skipping rests and tied-continuation notes) in that same voice part.
Same principle the Frontend's `attachLyrics` in
`Frontend/src/lib/midi/musicXmlConverter.ts` already uses for MIDI lyric
meta-events, applied here to PDF-derived tokens instead. Partial lyrics
are fine and expected: this is "show what we can", not a strict
validator, so a voice running out of tokens (or notes) before the other
does just stops cleanly.
"""

from __future__ import annotations

from music21 import stream
from music21.note import GeneralNote, NotRest

_CANONICAL_VOICES = ("soprano", "alto", "tenor", "bass")


def _normalize_voice(name: str | None) -> str | None:
    """Fuzzy-matches a music21 part name/id to one of the four canonical
    voice names -- "S.", "Sop.", "Soprano", "SOPRANO" all mean the same
    thing here, and `part.partName`/`part.id` conventions vary a lot
    across notation software."""
    if not name:
        return None
    cleaned = name.strip().lower().rstrip(".").strip()
    if not cleaned:
        return None
    for canonical in _CANONICAL_VOICES:
        if cleaned == canonical or canonical.startswith(cleaned):
            return canonical
    return None


def _match_parts_to_voices(score: stream.Score) -> dict[str, stream.Part]:
    """One music21 `Part` per recognized voice name, first match wins in
    top-to-bottom part order. A divisi pair like "Soprano 1"/"Soprano 2"
    both normalize to "soprano" -- only the first gets lyrics, an
    acknowledged limitation (see this feature's own report).

    Falls back to positional SATB order (first four parts, top to bottom)
    when NOT ONE part carries a recognizable voice name -- hit this for
    real on a piece whose MusicXML came from an OMR tool that only wrote
    generic `<part-name>Part 1</part-name>` .. `Part N` metadata, with the
    real SOPRANO/ALTO/TENOR/BASS labels living only as printed page text,
    never as part metadata at all. Standard choral engraving order is
    top-to-bottom SATB, so this is a safe default when there's truly no
    name to go on. Only engages when matching finds nothing at all, so it
    never overrides a piece that names even one part correctly."""
    matched: dict[str, stream.Part] = {}
    for part in score.parts:
        part_id = part.id if isinstance(part.id, str) else None
        voice = _normalize_voice(part.partName) or _normalize_voice(part_id)
        if voice and voice not in matched:
            matched[voice] = part
    if matched:
        return matched
    return dict(zip(_CANONICAL_VOICES, score.parts))


def _is_singable_onset(el: GeneralNote) -> bool:
    """True for a note/chord that should receive the next lyric: not a
    rest, and not a tied continuation. A note whose `tie.type` is "stop"
    or "continue" is still the same sung syllable as the note that
    started the tie, so it must not consume another token -- the same
    rule `musicXmlConverter.ts` follows around `tieStop`."""
    if not isinstance(el, NotRest):
        return False
    tie = getattr(el, "tie", None)
    if tie is not None and tie.type in ("stop", "continue"):
        return False
    return True


def inject_lyrics(score: stream.Score, voices: list[dict]) -> int:
    """Mutates `score` in place, adding a `Lyric` to each matched voice
    part's note onsets in sequence. `voices` is
    `[{"voice": str | None, "syllables": [{"text": str, "syllabic": str}]}]`
    (see `app.lyrics.groq_client.classify_lyric_tokens`). Returns the
    total number of lyrics written."""
    parts_by_voice = _match_parts_to_voices(score)
    written = 0
    for entry in voices:
        voice = entry.get("voice")
        part = parts_by_voice.get(voice) if voice else None
        if part is None:
            continue
        syllables = entry.get("syllables") or []
        idx = 0
        for el in part.flatten().notesAndRests:
            if idx >= len(syllables):
                break
            if not _is_singable_onset(el):
                continue
            syl = syllables[idx]
            el.lyrics = []
            el.addLyric(syl["text"])
            el.lyrics[-1].syllabic = syl["syllabic"]
            idx += 1
            written += 1
    return written
