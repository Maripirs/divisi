"""Admin-triggered "AI edit" tool: rewrite a selected measure range of a
piece's MusicXML from a plain-language instruction.

A second, more conservative sibling to `app/lyrics/`: same "land the
result as an unpublished draft for human review" shape (see
`app/api/routes/library/edit.py`), but scoped to one small measure range
at a time rather than a whole-piece pass, and Groq-only with no fallback
provider (see `client.py`'s own doc comment for why).

- `client.py`: one Groq call that turns a MusicXML fragment (the selected
  measures, every part) plus the user's instruction into a replacement
  fragment covering the same range.
- `apply.py`: `extract_range`/`splice_range`, the music21 side of pulling
  that fragment out of the full score and splicing the LLM's answer back
  in, with hard validation that the shape (part count, measure count)
  didn't change.
"""
