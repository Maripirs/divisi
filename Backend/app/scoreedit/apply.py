"""music21 side of the AI-edit feature: pull a measure range out of a
full score to send to the LLM (`extract_range`), then splice its answer
back in (`splice_range`).

`splice_range` is the highest-risk part of this feature (confirmed by
hand against a real music21 `Score` before committing to this shape --
see PLAN.md's entry for this feature): `Part.measures(start, end)`
carries clef/key/time/divisions context forward even when the range
doesn't start at measure 1, so the fragment handed to the LLM is always a
playable, self-contained mini-score; `Stream.remove`/`Stream.insert` at
each removed measure's own original offset is enough to splice a
same-shaped replacement back into the right place, since music21's
MusicXML writer serializes each part's measures in stream order, not by
recomputing offsets from note durations. What splice_range does NOT
verify is that a replacement measure's own note/rest durations actually
sum to its time signature -- the LLM is asked to keep that intact, but a
wrong rhythmic sum wouldn't raise a splice error, just a wrong-looking
measure once rendered. Out of scope for v1's validation, which only
guards the shape (part count, measure count) the plan calls out.
"""

from __future__ import annotations

from music21 import converter, stream


class SpliceValidationError(Exception):
    """Raised when the LLM's replacement fragment doesn't match the
    original selection's shape (part count, or measure count within any
    part) -- v1's conservative rule is "same shape back, or a clean
    error", never a best-effort splice of a mismatched fragment."""


def extract_range(score: stream.Score, start: int, end: int) -> stream.Score:
    """A small multi-part `Score` built from each of `score`'s parts'
    `.measures(start, end)` -- the exact measure range, every part, with
    clef/key/time/divisions context carried along by music21 even when
    `start` isn't the piece's first measure. This is what gets serialized
    and sent to the LLM (`app.scoreedit.client.edit_measures`); the LLM
    never sees the rest of the piece."""
    extracted = stream.Score()
    for part in score.parts:
        extracted.insert(0, part.measures(start, end))
    return extracted


def _measures_in_range(part: stream.Part, start: int, end: int) -> list[stream.Measure]:
    return [m for m in part.getElementsByClass(stream.Measure) if start <= m.number <= end]


def splice_range(score: stream.Score, start: int, end: int, replacement_fragment_xml: str) -> None:
    """Mutates `score` in place: replaces measures `start..end` in every
    part with the corresponding part's measures from
    `replacement_fragment_xml` (the LLM's answer to
    `app.scoreedit.client.edit_measures`), leaving everything outside
    that range untouched.

    Raises `SpliceValidationError` if the replacement doesn't parse as
    MusicXML, or its part count or any part's in-range measure count
    doesn't exactly match the original selection -- v1's deliberately
    conservative "same shape back, or a clean error" rule (see this
    module's own doc comment; PLAN.md's entry for this feature). Matches
    replacement measures to original ones positionally (by order within
    the range), not by their own `<measure number>` -- the LLM isn't
    required to keep the original numbering, only the same count and
    order, which is all `splice_range` actually needs to know where each
    one goes."""
    try:
        replacement = converter.parse(replacement_fragment_xml)
    except Exception as exc:  # noqa: BLE001 - any parse failure is a clean validation error here
        raise SpliceValidationError(f"Could not parse the AI's replacement as MusicXML: {exc}") from exc

    orig_parts = list(score.parts)
    repl_parts = list(replacement.parts)
    if len(orig_parts) != len(repl_parts):
        raise SpliceValidationError(
            f"The AI's replacement has {len(repl_parts)} part(s), expected {len(orig_parts)}"
        )

    # Validate every part's shape up front, before mutating anything --
    # a mismatch discovered halfway through would otherwise leave `score`
    # half-spliced.
    targets_by_part: list[list[stream.Measure]] = []
    repl_measures_by_part: list[list[stream.Measure]] = []
    for i, (orig_part, repl_part) in enumerate(zip(orig_parts, repl_parts)):
        target = _measures_in_range(orig_part, start, end)
        repl_measures = list(repl_part.getElementsByClass(stream.Measure))
        if len(target) != len(repl_measures):
            raise SpliceValidationError(
                f"Part {i + 1}: the AI's replacement has {len(repl_measures)} measure(s), "
                f"expected {len(target)} (measures {start}-{end})"
            )
        targets_by_part.append(target)
        repl_measures_by_part.append(repl_measures)

    for orig_part, target, repl_measures in zip(orig_parts, targets_by_part, repl_measures_by_part):
        offsets = [m.getOffsetBySite(orig_part) for m in target]
        for old_measure in target:
            orig_part.remove(old_measure)
        for offset, new_measure in zip(offsets, repl_measures):
            orig_part.insert(offset, new_measure)
