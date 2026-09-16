"""Groq call: classify a PDF's raw word tokens into per-voice sung
syllables, in reading order.

Mirrors the proven request/response/error-handling shape from a sibling
project's `~/projects/walkcode/server/llm.js` (Groq's OpenAI-compatible
`/chat/completions`, plain `Authorization: Bearer` header, JSON requested
in prose rather than via `response_format`, and a defensive
first-balanced-`{...}` extraction from the response text since the model
sometimes wraps its JSON in prose or code fences).

Everything else here (page-based chunking, `reasoning_effort: "low"`,
adaptive pacing off `x-ratelimit-reset-tokens`) was added after building
against this account's real free tier and hitting real limits on a real
15-page piece: a naive single request sending every word as one verbose
JSON object per word came to ~84k tokens against an 8000-tokens-per-minute
account-wide cap; `openai/gpt-oss-120b` is a reasoning model whose hidden
chain-of-thought can silently eat an entire completion budget and return
nothing; and the rate limit itself is a continuously-refilling budget, not
a rigid 60-second window, so pacing off the account's own reported reset
time (rather than a blind fixed sleep) keeps a multi-chunk piece's total
wait as short as the account's real budget allows.
"""

from __future__ import annotations

import json
import logging
import re
import time

import httpx

from app.core.config import get_settings
from app.lyrics.extract import PdfWordToken

logger = logging.getLogger("divisi.lyrics")

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_TIMEOUT_SECONDS = 60.0

# Chunk size, in rendered characters of page text, per Groq call. This
# account's real free-tier cap is 8000 tokens/minute *total* (prompt +
# reserved completion together), confirmed by hitting real 413s while
# building this feature: a 15-page piece's full text rendered at ~1.7
# chars/token came to ~8100 prompt tokens on its own, before the system
# prompt or completion budget. A budget of 4000 rendered chars per chunk
# (rather than trying to fit a whole multi-page piece in one call) keeps
# each request comfortably under the cap with room for the system prompt
# and completion, and scales to pieces of any length. Whole pages only,
# never split mid-page, since a page's voice-label anchors need to stay
# together with the lyric text that follows them.
_MAX_CHARS_PER_CHUNK = 4000

# Fallback pause between chunks when a response carries no usable
# `x-ratelimit-reset-tokens` header to pace off of (see
# `_seconds_until_reset`). Real pacing is adaptive, not this constant --
# this only covers the (expected to be rare) case where Groq's response
# didn't include the header at all.
_FALLBACK_SECONDS_BETWEEN_CHUNKS = 15.0
# Never wait longer than this for one chunk's turn, even if the header
# reports the full per-minute window is exhausted -- an admin waiting on
# a synchronous button click needs an upper bound on total wait, and the
# chunk's own call will just 429 (a clear error) if the wait wasn't
# actually enough.
_MAX_SECONDS_BETWEEN_CHUNKS = 45.0

_DURATION_PART_RE = re.compile(r"(\d+(?:\.\d+)?)(ms|m|s)")


def _parse_groq_duration(value: str) -> float | None:
    """Parse Groq's `x-ratelimit-reset-*` duration strings (e.g.
    `"31.365s"`, `"1m26.4s"`, `"615ms"`) into seconds. Returns `None` if
    nothing recognizable is found, rather than guessing."""
    parts = _DURATION_PART_RE.findall(value or "")
    if not parts:
        return None
    total = 0.0
    for amount, unit in parts:
        if unit == "m":
            total += float(amount) * 60
        elif unit == "ms":
            total += float(amount) / 1000
        else:
            total += float(amount)
    return total


def _seconds_until_reset(response: httpx.Response) -> float:
    """How long to wait before the account's token budget has refilled
    enough for another chunk, per this response's own
    `x-ratelimit-reset-tokens` header (Groq's rate limit is a
    continuously-refilling budget -- confirmed empirically while building
    this feature: the reset duration scales linearly with how much of the
    8000-tokens-per-minute cap the account had used, ~133 tokens/sec,
    rather than a rigid 60s window). Falls back to a fixed guess if the
    header's missing or unparseable, and always caps the wait so one
    piece's generation can't stall indefinitely."""
    parsed = _parse_groq_duration(response.headers.get("x-ratelimit-reset-tokens", ""))
    seconds = parsed if parsed is not None else _FALLBACK_SECONDS_BETWEEN_CHUNKS
    return min(seconds, _MAX_SECONDS_BETWEEN_CHUNKS)

VALID_VOICES = {"soprano", "alto", "tenor", "bass"}
VALID_SYLLABIC = {"single", "begin", "middle", "end"}


class LyricExtractionError(Exception):
    """Raised when the Groq call fails outright (network, non-200), or
    its response can't be turned into the syllable-list shape this module
    promises callers -- either way the caller should surface a clear
    error rather than silently producing garbage lyrics."""


_SYSTEM_PROMPT = "\n".join(
    [
        "You extract SUNG LYRICS from the raw word tokens of a choral sheet-music PDF's text layer.",
        "You are given a JSON list of word tokens in reading order, each with its text and page number.",
        "IGNORE anything that is not a sung syllable: dynamics (p, pp, f, mf, cresc., ...), tempo "
        'markings (e.g. "Moderato", "q = c.104"), the voice/instrument labels themselves (SOPRANO, '
        "ALTO, TENOR, BASS, S., A., T., B., Pno., Piano), copyright/publisher text, page numbers, and "
        "titles/composer bylines.",
        "USE voice labels (SOPRANO/ALTO/TENOR/BASS, or their abbreviations S./A./T./B.) as ANCHORS: the "
        "lyric text that follows one of these labels, up to the next voice label or a clear break, "
        "belongs to that voice.",
        'PRESERVE hyphenated syllable splits exactly as they appear (e.g. "Thun-" "der-" "er!" is three '
        "syllables of one word): classify each syllable's `syllabic` as \"single\" (a whole word, no "
        'split), "begin" (first syllable of a split word), "middle" (an inner syllable), or "end" (last '
        "syllable).",
        "Return ONLY a JSON object, no prose, no code fences, in EXACTLY this shape:",
        '{"voices": [{"voice": "soprano"|"alto"|"tenor"|"bass"|null, "syllables": '
        '[{"text": string, "syllabic": "single"|"begin"|"middle"|"end"}]}]}',
        "One entry per voice found, syllables listed in reading order within that voice. If a token "
        "can't be confidently assigned to a voice, leave it out rather than guessing.",
    ]
)


def _render_pages_as_text(tokens: list[PdfWordToken]) -> str:
    """Re-join word tokens into lines using PyMuPDF's own block/line
    grouping, with a page marker between pages. A verbose one-JSON-object-
    per-word encoding (the original shape here) inflates a real multi-page
    choral score by roughly 10x in tokens over plain text (measured on a
    real 15-page piece: ~188k JSON characters vs. ~17.5k plain-text
    characters for the same words), which blew straight through Groq's
    account-wide 8000-tokens-per-minute cap on a single request. Plain
    text grouped into lines is both far cheaper and, if anything, easier
    for the model to read as an actual page of sheet music."""
    lines: dict[tuple[int, int, int], list[str]] = {}
    for t in tokens:
        # Cheap, free (no LLM tokens spent) noise filter: a token with no
        # letters at all is never a sung syllable in this dataset -- it's
        # a measure number, a page number, a repeat-bar glyph, a bare
        # melisma dash, or (on some exports) a run of music-font glyphs
        # PyMuPDF's text layer misreads as characters like "™". A real
        # hyphenated syllable (e.g. "Thun-") always keeps its hyphen
        # attached to a real letter, so it survives this filter fine.
        if not any(c.isalpha() for c in t.text):
            continue
        lines.setdefault((t.page, t.block_no, t.line_no), []).append(t.text)

    rendered: list[str] = []
    current_page: int | None = None
    for (page, _block_no, _line_no), words in lines.items():
        if page != current_page:
            rendered.append(f"--- page {page + 1} ---")
            current_page = page
        rendered.append(" ".join(words))
    return "\n".join(rendered)


def _build_user_prompt(tokens: list[PdfWordToken]) -> str:
    return (
        "Text extracted from a PDF's text layer, one line per row of text, in reading order, "
        "with a marker between pages:\n"
        + _render_pages_as_text(tokens)
        + "\n\nReturn ONLY the JSON object described in the instructions."
    )


def _chunk_tokens_by_page(tokens: list[PdfWordToken]) -> list[list[PdfWordToken]]:
    """Split tokens into groups of whole pages, each rendering to at most
    `_MAX_CHARS_PER_CHUNK` characters, so no single Groq call risks the
    account's tokens-per-minute cap regardless of how long the piece is.
    Never splits a page across two chunks (a page's voice-label anchors
    need to stay with the lyric text that follows them). A single page
    that alone exceeds the budget still gets its own chunk rather than
    being dropped -- it may fail its own call, but that's a clear error
    for one page rather than silently losing it."""
    by_page: dict[int, list[PdfWordToken]] = {}
    for t in tokens:
        by_page.setdefault(t.page, []).append(t)

    chunks: list[list[PdfWordToken]] = []
    current: list[PdfWordToken] = []
    current_chars = 0
    for page in sorted(by_page):
        page_tokens = by_page[page]
        page_chars = sum(len(t.text) + 1 for t in page_tokens)
        if current and current_chars + page_chars > _MAX_CHARS_PER_CHUNK:
            chunks.append(current)
            current = []
            current_chars = 0
        current.extend(page_tokens)
        current_chars += page_chars
    if current:
        chunks.append(current)
    return chunks


def _extract_json(text: str) -> dict | None:
    """Pull the first balanced `{...}` object out of a model response that
    may wrap JSON in prose or code fences, then parse it. Returns None if
    nothing parseable is found. Same defensive shape as `extractJson` in
    the sibling project's `llm.js`."""
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _call_groq(body: dict) -> httpx.Response:
    """The actual HTTP call, factored into its own module-level function
    so tests can monkeypatch it and never make a real network call in the
    default test run (this repo's house pattern for mocking an external
    call, see `test_library.py`)."""
    settings = get_settings()
    return httpx.post(
        _GROQ_URL,
        json=body,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        timeout=_TIMEOUT_SECONDS,
    )


def _classify_chunk(tokens: list[PdfWordToken]) -> tuple[list[dict], float]:
    """One Groq call over a single chunk's tokens (already sized to fit
    the account's rate limit by the caller). Returns a
    `([{"voice": str | None, "syllables": [...]}], wait_seconds)` pair --
    the voices found in just this chunk (`[]` if nothing usable, e.g. an
    instrumental page, not itself an error), and how long the caller
    should wait before firing the next chunk (see `_seconds_until_reset`)."""
    settings = get_settings()
    body = {
        "model": settings.groq_lyrics_model,
        "temperature": 0.1,
        # gpt-oss-120b is a reasoning model: by default it spends its
        # completion budget on a hidden chain-of-thought *before* emitting
        # the actual JSON answer, and on a plain classification task like
        # this one that reasoning can eat the entire `max_tokens` budget
        # and leave nothing for the real output (hit this for real: one
        # chunk came back with `finish_reason: length`, 1998 of its 2000
        # completion tokens spent on reasoning, empty content). "low"
        # effort dropped a comparable call's reasoning tokens from ~2000
        # to single digits with no loss in output quality for this
        # constrained a task, and matters doubly here since reasoning
        # tokens count against the account's tokens-per-minute cap too.
        "reasoning_effort": "low",
        # Kept modest so the reserved completion budget doesn't eat into
        # the account's tokens-per-minute cap (that limit covers prompt +
        # completion together) -- the actual sung-syllable output for even
        # a full chunk is a small fraction of its input text.
        "max_tokens": 2000,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(tokens)},
        ],
    }

    try:
        response = _call_groq(body)
    except httpx.HTTPError as exc:
        raise LyricExtractionError(f"Could not reach the Groq API: {exc}") from exc

    if response.status_code != 200:
        raise LyricExtractionError(
            f"Groq API returned {response.status_code}: {response.text[:200]}"
        )
    wait_seconds = _seconds_until_reset(response)

    data = response.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    parsed = _extract_json(content)
    if parsed is None or "voices" not in parsed:
        logger.warning("Groq lyric response wasn't parseable JSON: %r", content[:500])
        raise LyricExtractionError("Groq response wasn't valid JSON in the expected shape")

    voices_out: list[dict] = []
    for entry in parsed.get("voices") or []:
        if not isinstance(entry, dict):
            continue
        voice = entry.get("voice")
        voice = voice.lower() if isinstance(voice, str) and voice.lower() in VALID_VOICES else None
        syllables = []
        for syl in entry.get("syllables") or []:
            if not isinstance(syl, dict):
                continue
            text = str(syl.get("text", "")).strip()
            if not text:
                continue
            syllabic = syl.get("syllabic")
            syllabic = syllabic if syllabic in VALID_SYLLABIC else "single"
            syllables.append({"text": text, "syllabic": syllabic})
        if syllables:
            voices_out.append({"voice": voice, "syllables": syllables})
    return voices_out, wait_seconds


def classify_lyric_tokens(tokens: list[PdfWordToken]) -> list[dict]:
    """Send the PDF's raw word tokens to Groq, chunked by whole pages to
    stay under the account's tokens-per-minute cap, and return
    `[{"voice": str | None, "syllables": [{"text": str, "syllabic": str}]}]`,
    syllables in reading order per voice (concatenated across chunks in
    page order). Each chunk gets one retry on failure; a chunk that still
    fails after that is skipped (its page just contributes no lyrics)
    rather than losing the whole piece over one bad response. Raises
    `LyricExtractionError` only for a missing API key, or if literally
    every chunk failed and there's nothing to return at all."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise LyricExtractionError("Lyric generation is not configured (no Groq API key set)")

    chunks = _chunk_tokens_by_page(tokens)
    merged: dict[str | None, list[dict]] = {}
    for i, chunk in enumerate(chunks):
        # A long piece means many sequential calls (one per chunk), each
        # with some nonzero chance of a flaky response (a truncated or
        # malformed JSON body, a transient network error) -- hit this for
        # real on a 6-chunk piece where one chunk's response just wasn't
        # parseable. One retry recovers from that without adding much
        # total wait; if a chunk still fails after its retry, skip just
        # that chunk (log it) rather than losing the whole piece's lyrics
        # over one bad response -- same "show what we can" philosophy the
        # rest of this feature already follows for partial results.
        try:
            voices, wait_seconds = _classify_chunk(chunk)
        except LyricExtractionError:
            logger.warning("Chunk %d/%d failed, retrying once", i + 1, len(chunks), exc_info=True)
            time.sleep(_FALLBACK_SECONDS_BETWEEN_CHUNKS)
            try:
                voices, wait_seconds = _classify_chunk(chunk)
            except LyricExtractionError:
                logger.warning("Chunk %d/%d failed again, skipping it", i + 1, len(chunks), exc_info=True)
                voices, wait_seconds = [], _FALLBACK_SECONDS_BETWEEN_CHUNKS
        for entry in voices:
            merged.setdefault(entry["voice"], []).extend(entry["syllables"])
        if i < len(chunks) - 1:
            time.sleep(wait_seconds)

    voices_out = [{"voice": voice, "syllables": syllables} for voice, syllables in merged.items()]
    if not voices_out:
        raise LyricExtractionError("Groq returned no usable lyric syllables")
    return voices_out
