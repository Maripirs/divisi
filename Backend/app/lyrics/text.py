"""Reconstruct printed words from classified lyric syllables.

A classifier splits one printed word across several note onsets, each
carrying a `syllabic` marker: single, begin, middle, or end. This module
reverses that split well enough to compare a manifest's syllables, or a
MusicXML note's lyrics, against the raw words a PDF lane prints.
"""

from __future__ import annotations

_CONTINUES = ("begin", "middle")
_STARTS = ("single", "begin")


def join_syllables_to_words(syllables: list[tuple[str, str]]) -> list[str]:
    """`syllables` is `(text, syllabic)` pairs in singing order.

    A single or begin syllable starts a new word. A begin or middle
    syllable's text has any trailing hyphen stripped before it joins the
    word; an end or single syllable's text is used as-is, punctuation and
    all, since it is the end of what a reader sees on the page.
    """
    words: list[str] = []
    for text, syllabic in syllables:
        piece = text[:-1] if syllabic in _CONTINUES and text.endswith("-") else text
        if syllabic in _STARTS or not words:
            words.append(piece)
        else:
            words[-1] += piece
    return words
