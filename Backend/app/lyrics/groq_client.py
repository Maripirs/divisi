"""Groq call (with an NVIDIA fallback): classify a PDF's raw word tokens
into per-voice sung syllables, in reading order.

Mirrors the proven request/response/error-handling shape from a sibling
project's `~/projects/walkcode/server/llm.js` (an OpenAI-compatible
`/chat/completions`, plain `Authorization: Bearer` header, JSON requested
in prose rather than via `response_format`, and a defensive
first-balanced-`{...}` extraction from the response text since a model
sometimes wraps its JSON in prose or code fences).

Everything else here (page-based chunking, `reasoning_effort: "low"`,
adaptive pacing off `x-ratelimit-reset-tokens`) was added after building
against Groq's real free tier and hitting real limits on a real 15-page
piece: a naive single request sending every word as one verbose JSON
object per word came to ~84k tokens against an 8000-tokens-per-minute
account-wide cap; `openai/gpt-oss-120b` is a reasoning model whose hidden
chain-of-thought can silently eat an entire completion budget and return
nothing; and the per-minute rate limit itself is a continuously-refilling
budget, not a rigid 60-second window, so pacing off the account's own
reported reset time (rather than a blind fixed sleep) keeps a multi-chunk
piece's total wait as short as the account's real budget allows. There's
also a separate, much bigger per-*day* cap (200,000 tokens on this
account) with no reset-time header at all, hit for real during a day of
iterating on this feature.

That per-day cap is exactly why `classify_lyric_tokens` falls back to
NVIDIA (`nvidia_lyrics_model`, `chat_template_kwargs: {"thinking": false}`
rather than Groq's `reasoning_effort`, since NVIDIA's own reasoning
models narrate their whole chain-of-thought directly in `content` with
no separate field to skip past) once Groq is confirmed unusable and an
NVIDIA key is configured -- a completely separate account/quota, so a
Groq outage or exhausted daily cap doesn't stall the whole feature.

Per chunk, same as Groq, not one call for the whole remainder -- tried
combining every remaining chunk into a single request first, reasoning
that NVIDIA's per-request latency looked too high for a per-chunk
fallback to be practical (~94s for one Groq-sized chunk). Two real
measurements (~94s for 3500 truncated completion tokens, ~170s for 8000
completed ones) turned out consistent with latency being driven almost
entirely by how many tokens get *generated*, not a fixed per-request
cost -- so the "one big request" approach doesn't save meaningful time
over the total generation work either shape has to do, while making
truncation far more likely (a whole piece's total syllable count is much
harder to budget for than one page's) and turning any single failure
into a total loss instead of one lost page. Per-chunk keeps the same
per-page partial-success behavior Groq already has, at comparable total
wall-clock cost. Once Groq fails twice on one chunk, it's assumed down
for the rest of the run (an exhausted daily cap fails identically on
every subsequent call, so retrying Groq on every later chunk would just
waste each chunk's retry-and-sleep cycle for nothing) and every
following chunk goes straight to NVIDIA. NVIDIA's endpoint exposes no
rate-limit headers at all (confirmed empirically), so chunks it serves
are paced with a short fixed pause instead of Groq's adaptive one.
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
_NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_TIMEOUT_SECONDS = 60.0
# NVIDIA's measured generation rate is ~37-47 completion tokens/sec
# (derived from two real requests: ~94s for 3500 truncated tokens, ~170s
# for 8000 completed ones). At this module's per-chunk `max_tokens: 5500`
# (see `_nvidia_body`), worst-case generation alone is ~150s; 220s leaves
# real margin above that for request/queueing overhead. Raised from 180
# after the first real per-chunk production run (2026-09-16) hit two
# genuine `httpx.ReadTimeout`s at the old ceiling.
_NVIDIA_TIMEOUT_SECONDS = 220.0
# Pause after a chunk served by NVIDIA, in place of Groq's adaptive
# `_seconds_until_reset` (NVIDIA's endpoint returns no rate-limit headers
# at all to pace off of -- confirmed empirically).
_NVIDIA_PAUSE_SECONDS = 3.0
# Short pause before retrying once on a failed NVIDIA chunk (a transient
# network blip, a malformed response) -- much shorter than Groq's own
# `_FALLBACK_SECONDS_BETWEEN_CHUNKS`, which is sized around Groq's
# tokens-per-minute refill rate and doesn't apply to NVIDIA at all.
_NVIDIA_RETRY_PAUSE_SECONDS = 5.0

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

# Fallback pause used in two cases: a response carries no usable
# `x-ratelimit-reset-tokens` header to pace off of (see
# `_seconds_until_reset`), or a chunk failed outright (a malformed
# response, a non-200) before any header could be read at all -- the
# retry-after-failure path in `classify_lyric_tokens` always uses this
# fixed value rather than an adaptive one, since there's no successful
# response to read a real reset time from. Raised from 15.0 after hitting
# this for real: a chunk failed with malformed JSON right after a
# preceding chunk had used most of the account's budget, the 15s retry
# pause wasn't enough for the budget to refill, and the retry itself got
# 429'd, losing that chunk's page entirely. 35s comfortably covers a full
# chunk's worth of refill (~133 tokens/sec, so ~4650 tokens by then) even
# from a nearly-exhausted budget, while staying under the hard cap below.
_FALLBACK_SECONDS_BETWEEN_CHUNKS = 35.0
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
        "You extract SUNG LYRICS from the raw text layer of a choral sheet-music PDF.",
        "You are given the text as one line per row on the page, in reading order, with a marker "
        "between pages.",
        "IGNORE anything that is not a sung syllable: dynamics (p, pp, f, mf, cresc., ...), tempo "
        'markings (e.g. "Moderato", "q = c.104"), copyright/publisher text, page numbers, and '
        "titles/composer bylines. A piano/accompaniment line has already been dropped entirely, since it "
        "has no lyrics -- you won't see it.",
        'PRESERVE hyphenated syllable splits exactly as they appear (e.g. "Thun-" "der-" "er!" is three '
        "syllables of one word): classify each syllable's `syllabic` as \"single\" (a whole word, no "
        'split), "begin" (first syllable of a split word), "middle" (an inner syllable), or "end" (last '
        "syllable).",
        "Return ONLY a JSON object, no prose, no code fences, in EXACTLY this shape:",
        '{"voices": [{"voice": "soprano"|"alto"|"tenor"|"bass"|null, "syllables": '
        '[{"text": string, "syllabic": "single"|"begin"|"middle"|"end"}]}]}',
        "One entry per voice found, syllables listed in reading order within that voice. If a token "
        "can't be confidently assigned to a voice, leave it out rather than guessing.",
        "Each line of text is already prefixed with which voice it belongs to, in square brackets "
        '(e.g. "[soprano] I am the God Thor,"), worked out from the PDF\'s actual page geometry before '
        "you ever saw it -- TRUST this prefix completely, do not re-derive or second-guess which voice a "
        "line belongs to from its wording or position in the text. A line prefixed \"[unknown voice]\" "
        "had no nearby label to go on; use your best judgment for those only, and it's fine to leave "
        "them out if you can't tell. Voice labels themselves (SOPRANO, ALTO, TENOR, BASS, S., A., T., "
        "B.) have already been stripped out of the text and used only to produce these prefixes -- "
        "you will not see them as separate tokens to classify.",
        "The user message may include a 'remaining sung-note budget' section: the EXACT number of "
        "sung notes each voice still has left in the piece, counted directly from the actual score, "
        "not a guess. This is ground truth, not a suggestion. Use it to sanity-check your own count as "
        "you work: if a voice's budget is small, that voice is nearly done (perhaps this is its last "
        "page with lyrics) and you should return few or no syllables for it; if you find yourself about "
        "to return notably more syllables for a voice than its stated budget, you have almost certainly "
        "misread a line or double-counted a token, so stop, recount, and cut it back to fit. Getting the "
        "COUNT right per voice matters more than getting every last word -- a short list of correct "
        "words that stays within budget is far better than a long list that drifts out of alignment.",
    ]
)


_VOICE_LABEL_WORDS = {
    "soprano": "soprano",
    "sop": "soprano",
    "alto": "alto",
    "alt": "alto",
    "tenor": "tenor",
    "ten": "tenor",
    "bass": "bass",
    "bs": "bass",
    "piano": "piano",
    "pno": "piano",
    "pf": "piano",
}
# Single-letter abbreviations (S./A./T./B.) REQUIRE the trailing period to
# count as a label -- without it, "A" or "I" is indistinguishable from a
# genuine one-letter lyric word ("a", "I" are both real English words that
# show up constantly in real lyrics).
_SINGLE_LETTER_LABELS = {"s.": "soprano", "a.": "alto", "t.": "tenor", "b.": "bass"}


def _label_voice(text: str) -> str | None:
    """Recognizes a token as a voice/instrument label (SOPRANO, Alto, S.,
    Pno., ...) rather than lyric content, so it can be used as a
    geometric anchor and then discarded. Returns `"piano"` for the
    accompaniment label (also an anchor, but never lyric content), or
    `None` for anything else."""
    cleaned = text.strip().lower()
    if cleaned in _SINGLE_LETTER_LABELS:
        return _SINGLE_LETTER_LABELS[cleaned]
    return _VOICE_LABEL_WORDS.get(cleaned.rstrip("."))


def _nearest_label_voice(y0: float, labels: list[tuple[float, str]]) -> str | None:
    """Which label a line at `y0` sits closest to, by vertical distance
    alone (no x0: within one system, voices stack vertically, and
    reading-order left-to-right within a line is already preserved by the
    caller's block/line grouping, so y-distance is the only axis that
    matters here)."""
    if not labels:
        return None
    return min(labels, key=lambda lv: abs(lv[0] - y0))[1]


def _render_pages_as_text(tokens: list[PdfWordToken]) -> str:
    """Re-join word tokens into lines using PyMuPDF's own block/line
    grouping, each line prefixed with the voice it belongs to, worked out
    from real page geometry (a `SOPRANO`/`S.` label's own y-position vs.
    every other line's y-position) rather than left to the model to guess
    from reading order.

    Built this way after the plain-reading-order version (no voice
    prefixes) proved unreliable on a real piece: its raw PDF text extracts
    with every voice's label bunched into one column block *before* any
    lyric text at all (`SOPRANO`, `ALTO`, `TENOR`, `BASS`, `Piano`, THEN
    "I am the God Thor..."), not interleaved with each voice's own row --
    so "the text between one label and the next belongs to that voice"
    (this function's original approach) is simply false for how this kind
    of PDF extracts. The model, given an ambiguous blob of the same
    homophonic text repeated once per voice with no way to tell the
    copies apart, sometimes returned nothing at all and sometimes fell
    into a degenerate repetition loop. The raw y-coordinates PyMuPDF
    already gives every token do preserve which row a line visually sits
    in relative to its own label, even though reading order doesn't --
    confirmed directly against a real page's token coordinates before
    building this. A verbose one-JSON-object-per-word encoding (this
    function's original shape) also inflates a real multi-page choral
    score by roughly 10x in tokens over plain text (measured on a real
    15-page piece: ~188k JSON characters vs. ~17.5k plain-text characters
    for the same words), which blew straight through Groq's account-wide
    8000-tokens-per-minute cap on a single request -- another reason
    plain, pre-labeled text beats handing the model raw tokens to sort out
    itself."""
    by_page: dict[int, list[PdfWordToken]] = {}
    for t in tokens:
        by_page.setdefault(t.page, []).append(t)

    rendered: list[str] = []
    for page in sorted(by_page):
        rendered.append(f"--- page {page + 1} ---")
        page_tokens = by_page[page]
        labels = [(t.y0, _label_voice(t.text)) for t in page_tokens if _label_voice(t.text)]

        lines: dict[tuple[int, int], list[str]] = {}
        line_y: dict[tuple[int, int], float] = {}
        for t in page_tokens:
            if _label_voice(t.text):
                continue  # a label is an anchor, never content, on any page
            # Cheap, free (no LLM tokens spent) noise filter: a token with
            # no letters at all is never a sung syllable in this dataset
            # -- it's a measure number, a page number, a repeat-bar glyph,
            # a bare melisma dash, or (on some exports) a run of
            # music-font glyphs PyMuPDF's text layer misreads as
            # characters like "™". A real hyphenated syllable (e.g.
            # "Thun-") always keeps its hyphen attached to a real letter,
            # so it survives this filter fine.
            if not any(c.isalpha() for c in t.text):
                continue
            key = (t.block_no, t.line_no)
            lines.setdefault(key, []).append(t.text)
            line_y.setdefault(key, t.y0)

        for key, words in lines.items():
            if not labels:
                # No label at all on this page to anchor against -- same
                # limitation the old undifferentiated rendering always
                # had; nothing geometric to do about it here.
                rendered.append(" ".join(words))
                continue
            voice = _nearest_label_voice(line_y[key], labels)
            if voice == "piano":
                continue  # accompaniment has no lyrics; drop rather than send as noise
            prefix = f"[{voice}] " if voice else "[unknown voice] "
            rendered.append(prefix + " ".join(words))
    return "\n".join(rendered)


def _build_user_prompt(tokens: list[PdfWordToken], remaining: dict[str, int] | None = None) -> str:
    budget_block = ""
    if remaining:
        lines = "\n".join(f"- {voice}: {count} sung notes remaining" for voice, count in remaining.items())
        budget_block = (
            "Remaining sung-note budget per voice for the rest of the piece (ground truth from the "
            f"score, see the system instructions on how to use this):\n{lines}\n\n"
        )
    return (
        budget_block
        + "Text extracted from a PDF's text layer, one line per row of text, in reading order, "
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


def _normalize_alternate_voice_shape(parsed: dict) -> list[dict] | None:
    """Recover a `{"voices": [...]}` list from a schema-drifted NVIDIA
    response. Observed live in production (2026-09-16, first real run of
    the per-chunk NVIDIA fallback): despite the system prompt spelling out
    the exact `{"voices": [{"voice": ..., "syllables": [...]}]}` shape,
    nemotron sometimes instead returns one top-level key per voice, e.g.
    `{"soprano": {"syllables": [...]}}` or `{"soprano": {"voice":
    "soprano", "syllables": [...]}, "alto": {...}}` -- the wrapper
    dropped, each voice's dict promoted to a top-level key. This was the
    single biggest source of lost chunks in that run (5 of ~9 failures):
    the content was almost always genuinely correct, just shaped wrong,
    and got thrown away entirely rather than recovered.

    Only recognizes this specific drift: EVERY top-level key must be a
    valid voice name whose value is a dict with a "syllables" list --
    anything else (including the real degenerate-repetition garbage also
    seen in that run, e.g. a wall of "ellsellsells...") falls through to
    the normal unparseable-response error path rather than guessing."""
    if not parsed:
        return None
    entries: list[dict] = []
    for key, value in parsed.items():
        if not isinstance(key, str) or key.lower() not in VALID_VOICES:
            return None
        if not isinstance(value, dict) or not isinstance(value.get("syllables"), list):
            return None
        entries.append({"voice": key.lower(), "syllables": value["syllables"]})
    return entries or None


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


def _call_nvidia(body: dict) -> httpx.Response:
    """The fallback provider's HTTP call, tried only when Groq fails and
    an NVIDIA key is configured (see `_classify_chunk_nvidia`). Factored
    out the same way as `_call_groq` so tests can monkeypatch it
    independently. Its own timeout: see `_NVIDIA_TIMEOUT_SECONDS`."""
    settings = get_settings()
    return httpx.post(
        _NVIDIA_URL,
        json=body,
        headers={"Authorization": f"Bearer {settings.nvidia_api_key}"},
        timeout=_NVIDIA_TIMEOUT_SECONDS,
    )


def _groq_body(tokens: list[PdfWordToken], remaining: dict[str, int] | None) -> dict:
    settings = get_settings()
    return {
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
        # Raised from 2000 after the onset-count budget was added: telling
        # Groq the true per-voice target made it count more carefully and
        # literally, which produces *more* completion tokens per chunk
        # (naming every voice explicitly, being thorough about syllable
        # boundaries) -- hit real truncation at 2000 for real
        # (`finish_reason: length` on 2 of 6 chunks for one piece, forcing
        # a retry that sometimes echoed a repeated stretch of text rather
        # than genuinely new content, undercounting badly: 112 of a true
        # 247 for one voice). 3500 plus the now-small reasoning-effort-low
        # completion and a ~2500-token chunk prompt still stays well under
        # the account's 8000-tokens-per-minute cap.
        "max_tokens": 3500,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(tokens, remaining)},
        ],
    }


def _nvidia_body(tokens: list[PdfWordToken], remaining: dict[str, int] | None) -> dict:
    settings = get_settings()
    return {
        "model": settings.nvidia_lyrics_model,
        "temperature": 0.1,
        # nemotron-3.5-lightning is also a reasoning model, but unlike
        # Groq's gpt-oss-120b it doesn't put that reasoning in a separate
        # response field -- it narrates the whole chain-of-thought
        # directly in `content`, before the actual JSON answer, with no
        # `reasoning_effort` param to shrink it (tried that; it made no
        # measurable difference here). `chat_template_kwargs:
        # {"thinking": false}` is what actually suppresses it, confirmed
        # live: with it, a real chunk's response started with `{"voices":`
        # immediately, no preamble at all.
        "chat_template_kwargs": {"thinking": False},
        # A mild penalty against the model repeating the same tokens
        # rather than genuinely continuing -- added after the first real
        # per-chunk production run (2026-09-16) hit a degenerate
        # repetition loop on one chunk (content devolved into a wall of
        # "ellsellsellsells..." until it wasn't valid JSON at all, wasting
        # that chunk's whole token budget on nothing). Standard
        # OpenAI-compatible param name; 0.4 is a light touch, enough to
        # break a loop without discouraging real repeated words a lyric
        # legitimately has (e.g. "Thor, Thor, hear me").
        "frequency_penalty": 0.4,
        # Per-chunk, same page-sized scope as Groq's own `_groq_body`
        # (see that function's comment for the "why 3500" reasoning this
        # mirrors) -- NOT sized for a whole piece (tried that: a single
        # request covering every remaining chunk needed well over 8000
        # tokens for a real 15-page piece's full syllable count, hit real
        # truncation, and the module docstring covers why per-chunk beat
        # that approach on both truncation risk and partial-success
        # behavior for about the same total wall-clock cost). Raised from
        # 4500 to 5500 after the first real per-chunk production run
        # (2026-09-16) hit real truncation mid-generation at 4500 despite
        # this already being higher than Groq's own 3500 for the same
        # onset-budget-aware prompt.
        "max_tokens": 5500,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(tokens, remaining)},
        ],
    }


def _call_and_parse(
    call_fn, body: dict, provider_name: str
) -> tuple[list[dict], httpx.Response]:
    """Shared request/response handling for both providers: call, check
    the status code, extract and validate the JSON shape. Raises
    `LyricExtractionError` on any failure, tagged with which provider
    failed so a caller falling back to a second provider can log which
    one actually broke."""
    try:
        response = call_fn(body)
    except httpx.HTTPError as exc:
        raise LyricExtractionError(f"Could not reach the {provider_name} API: {exc}") from exc

    if response.status_code != 200:
        raise LyricExtractionError(
            f"{provider_name} API returned {response.status_code}: {response.text[:200]}"
        )

    data = response.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    parsed = _extract_json(content)
    if parsed is not None and "voices" not in parsed:
        normalized = _normalize_alternate_voice_shape(parsed)
        if normalized is not None:
            parsed = {"voices": normalized}
    if parsed is None or "voices" not in parsed:
        logger.warning("%s lyric response wasn't parseable JSON: %r", provider_name, content[:500])
        raise LyricExtractionError(f"{provider_name} response wasn't valid JSON in the expected shape")

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
    return voices_out, response


def _classify_chunk(tokens: list[PdfWordToken], remaining: dict[str, int] | None = None) -> tuple[list[dict], float]:
    """One Groq call over a single chunk's tokens (already sized to fit
    Groq's rate limit by the caller). `remaining`, when given, is each
    voice's true remaining sung-note count for the rest of the piece (see
    `app.lyrics.inject.count_singable_onsets`), included in the prompt as
    a ground-truth sanity check against classification drift.

    Returns a `([{"voice": str | None, "syllables": [...]}], wait_seconds)`
    pair -- the voices found in just this chunk (`[]` if nothing usable,
    e.g. an instrumental page, not itself an error), and how long the
    caller should wait before firing the next chunk (see
    `_seconds_until_reset`). If Groq itself is unusable (rate limit,
    outage), see `classify_lyric_tokens`'s NVIDIA fallback
    (`_classify_chunk_nvidia`), not handled here -- this function is
    Groq-only."""
    voices, response = _call_and_parse(_call_groq, _groq_body(tokens, remaining), "Groq")
    return voices, _seconds_until_reset(response)


def _classify_chunk_nvidia(tokens: list[PdfWordToken], remaining: dict[str, int] | None) -> list[dict]:
    """Groq's fallback for one chunk, tried once more after a transient
    failure (a malformed response, a network blip) before giving up on
    just this chunk -- see `classify_lyric_tokens` for how this fits into
    the overall per-piece loop once Groq itself is assumed down. Returns
    `[]` rather than raising if both attempts fail, so one bad chunk never
    takes down the pieces around it (same "show what we can" philosophy
    the rest of this feature follows)."""
    try:
        voices, _response = _call_and_parse(_call_nvidia, _nvidia_body(tokens, remaining), "NVIDIA")
        return voices
    except LyricExtractionError:
        logger.warning("NVIDIA chunk failed, retrying once", exc_info=True)
        time.sleep(_NVIDIA_RETRY_PAUSE_SECONDS)
        try:
            voices, _response = _call_and_parse(_call_nvidia, _nvidia_body(tokens, remaining), "NVIDIA")
            return voices
        except LyricExtractionError:
            logger.warning("NVIDIA chunk failed again, skipping it", exc_info=True)
            return []


def classify_lyric_tokens(tokens: list[PdfWordToken], onset_counts: dict[str, int] | None = None) -> list[dict]:
    """Send the PDF's raw word tokens to Groq, chunked by whole pages to
    stay under Groq's tokens-per-minute cap, and return
    `[{"voice": str | None, "syllables": [{"text": str, "syllabic": str}]}]`,
    syllables in reading order per voice (concatenated across chunks in
    page order). Each chunk gets one retry on failure. If a chunk still
    fails after that: with an NVIDIA key configured, Groq is assumed down
    for the rest of the run (see the module docstring for why) and every
    chunk from here on, this one included, goes to NVIDIA instead
    (`_classify_chunk_nvidia`, itself retried once per chunk the same way
    Groq is); without a key, that chunk is simply skipped (its page
    contributes no lyrics) rather than losing the whole piece over one
    bad response. Raises `LyricExtractionError` only for a missing API
    key, or if literally nothing could be classified at all.

    NVIDIA is a completely separate account/quota from Groq, so it stays
    usable through a Groq outage or an exhausted daily cap (hit the
    latter for real: 200,000 tokens/day on the account this was built
    against, exhausted by a day of iterating on this feature).

    `onset_counts`, when given (see `app.lyrics.inject.count_singable_onsets`
    -- ground truth from the actual score, computed before this call),
    seeds a running "remaining budget" per voice that's passed into each
    chunk's prompt and decremented as syllables come back, so the model has
    a real target to check its own counting against instead of generating
    an unconstrained-length list per voice. Built for real after a
    positional-only alignment (no cross-check at all) let one voice's
    classification silently drift out of sync with its notes for the rest
    of a piece -- the failure mode this budget is meant to catch early."""
    settings = get_settings()
    if not settings.groq_api_key and not settings.nvidia_api_key:
        raise LyricExtractionError("Lyric generation is not configured (no API key set)")

    chunks = _chunk_tokens_by_page(tokens)
    remaining = dict(onset_counts) if onset_counts else {}
    merged: dict[str | None, list[dict]] = {}
    groq_available = True
    for i, chunk in enumerate(chunks):
        if groq_available:
            # A long piece means many sequential Groq calls (one per
            # chunk), each with some nonzero chance of a flaky response (a
            # truncated or malformed JSON body, a transient network error)
            # -- hit this for real on a 6-chunk piece where one chunk's
            # response just wasn't parseable. One retry recovers from that
            # without adding much total wait.
            try:
                voices, wait_seconds = _classify_chunk(chunk, remaining)
            except LyricExtractionError:
                logger.warning("Chunk %d/%d failed, retrying once", i + 1, len(chunks), exc_info=True)
                time.sleep(_FALLBACK_SECONDS_BETWEEN_CHUNKS)
                try:
                    voices, wait_seconds = _classify_chunk(chunk, remaining)
                except LyricExtractionError:
                    if settings.nvidia_api_key:
                        # Groq failed twice in a row on this chunk -- in
                        # every real case observed building this, that
                        # meant Groq was down for the rest of the run too
                        # (an exhausted per-day cap fails identically on
                        # every subsequent call), so stop spending each
                        # later chunk's own retry-and-sleep cycle on a
                        # provider that's already shown it won't recover;
                        # this chunk and everything after it goes to
                        # NVIDIA instead.
                        logger.warning(
                            "Groq failed twice on chunk %d/%d; treating it as down for the "
                            "rest of this run and switching to NVIDIA",
                            i + 1,
                            len(chunks),
                        )
                        groq_available = False
                        voices = _classify_chunk_nvidia(chunk, remaining)
                        wait_seconds = _NVIDIA_PAUSE_SECONDS
                    else:
                        logger.warning("Chunk %d/%d failed again, skipping it", i + 1, len(chunks), exc_info=True)
                        voices, wait_seconds = [], _FALLBACK_SECONDS_BETWEEN_CHUNKS
        else:
            voices = _classify_chunk_nvidia(chunk, remaining)
            wait_seconds = _NVIDIA_PAUSE_SECONDS

        for entry in voices:
            merged.setdefault(entry["voice"], []).extend(entry["syllables"])
            voice = entry["voice"]
            if voice in remaining:
                remaining[voice] = max(0, remaining[voice] - len(entry["syllables"]))

        if i < len(chunks) - 1:
            time.sleep(wait_seconds)

    voices_out = [{"voice": voice, "syllables": syllables} for voice, syllables in merged.items()]
    if not voices_out:
        raise LyricExtractionError("Groq returned no usable lyric syllables")

    if onset_counts:
        for entry in voices_out:
            voice, got = entry["voice"], len(entry["syllables"])
            target = onset_counts.get(voice)
            if target is not None and abs(got - target) > max(3, round(target * 0.1)):
                logger.warning(
                    "Lyric count for %s looks off: got %d syllables, score has %d sung notes "
                    "-- likely classification drift, worth a manual check",
                    voice,
                    got,
                    target,
                )

    return voices_out
