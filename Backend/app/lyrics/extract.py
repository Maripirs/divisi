"""PDF -> word-token extraction for the lyric-generation pipeline.

Pulls per-page word tokens (text + bounding box) out of a piece's PDF via
PyMuPDF, and detects the "no real text layer" case (a scanned/raster PDF)
so the caller can fail clearly instead of silently feeding an empty token
list to Groq and getting garbage lyrics back.
"""

from __future__ import annotations

from dataclasses import dataclass

import pymupdf


class NoTextLayerError(Exception):
    """Raised when a PDF has near-zero extractable text across every
    page -- almost certainly a scanned/raster image, which needs real OCR
    (not supported here) rather than PyMuPDF's text-layer extraction."""


@dataclass(frozen=True)
class PdfWordToken:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    page: int  # 0-based page index
    # PyMuPDF's own block/line grouping (see `page.get_text("words")`'s
    # return shape below) -- lets a caller re-join words into the same
    # visual line without re-deriving it from y-coordinates. Defaulted so
    # existing call sites/tests that only care about `text`/`page` don't
    # need updating.
    block_no: int = 0
    line_no: int = 0


# Below this many total non-whitespace characters across the *whole*
# document, a PDF is treated as having no real text layer. Checked across
# the whole document rather than page-by-page: a real choral score
# routinely has individual pages that are almost entirely music with only
# a couple of words (a page number, a voice-label carried over) even when
# it's a genuine born-digital export, so a single sparse page isn't
# evidence of a scan -- an entire scanned document coming back with
# (near) zero characters everywhere is.
_MIN_TOTAL_CHARS = 10


def extract_word_tokens(pdf_path: str) -> list[PdfWordToken]:
    """Every word token across every page of the PDF at `pdf_path`, in
    PyMuPDF's natural per-page reading order (`page.get_text("words")`,
    which already returns one tuple per word: `(x0, y0, x1, y1, word,
    block_no, line_no, word_no)`).

    Raises `NoTextLayerError` if the whole document comes back with
    near-zero extractable text (looks like a scan)."""
    tokens: list[PdfWordToken] = []
    total_chars = 0
    with pymupdf.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            total_chars += len(page.get_text().strip())
            for x0, y0, x1, y1, word, block_no, line_no, _word_no in page.get_text("words"):
                word = word.strip()
                if word:
                    tokens.append(
                        PdfWordToken(
                            text=word,
                            x0=x0,
                            y0=y0,
                            x1=x1,
                            y1=y1,
                            page=page_index,
                            block_no=block_no,
                            line_no=line_no,
                        )
                    )

    if total_chars < _MIN_TOTAL_CHARS:
        raise NoTextLayerError(
            "No text layer found in the PDF (looks like a scan); OCR isn't supported yet."
        )
    return tokens
