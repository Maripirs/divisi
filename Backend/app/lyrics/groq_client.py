"""Groq call: classify a PDF's raw word tokens into per-voice sung
syllables, in reading order.

Mirrors the proven request/response/error-handling shape from a sibling
project's `~/projects/walkcode/server/llm.js` (Groq's OpenAI-compatible
`/chat/completions`, plain `Authorization: Bearer` header, JSON requested
in prose rather than via `response_format`, and a defensive
first-balanced-`{...}` extraction from the response text since the model
sometimes wraps its JSON in prose or code fences).
"""

from __future__ import annotations

import json
import logging

import httpx

from app.core.config import get_settings
from app.lyrics.extract import PdfWordToken

logger = logging.getLogger("divisi.lyrics")

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_TIMEOUT_SECONDS = 60.0

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


def _build_user_prompt(tokens: list[PdfWordToken]) -> str:
    payload = [{"text": t.text, "page": t.page} for t in tokens]
    return (
        "Word tokens, in reading order, from one PDF text-extraction pass:\n"
        + json.dumps(payload)
        + "\n\nReturn ONLY the JSON object described in the instructions."
    )


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


def classify_lyric_tokens(tokens: list[PdfWordToken]) -> list[dict]:
    """Send the PDF's raw word tokens to Groq and return
    `[{"voice": str | None, "syllables": [{"text": str, "syllabic": str}]}]`,
    syllables in reading order per voice. Raises `LyricExtractionError` on
    any failure -- missing API key, network error, non-200, or a response
    that doesn't parse into this shape."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise LyricExtractionError("Lyric generation is not configured (no Groq API key set)")

    body = {
        "model": settings.groq_lyrics_model,
        "temperature": 0.1,
        "max_tokens": 4000,
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

    if not voices_out:
        raise LyricExtractionError("Groq returned no usable lyric syllables")
    return voices_out
