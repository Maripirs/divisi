"""Misaki call, with a Groq fallback: turn a MusicXML fragment (a selected
measure range, all parts) plus a plain-language instruction into a
replacement fragment covering the exact same range.

Deliberately not built on top of `app/lyrics/groq_client.py`, even though
both modules call the same Groq endpoint with the same account -- that
module's chunking/rate-limit-pacing/multi-tier-fallback machinery is
tightly tuned to lyric classification's own shape (many small per-page
calls, JSON out), and this feature is the opposite: one call, a MusicXML
fragment in, a MusicXML fragment out. This module used to have no
fallback provider at all, on correctness grounds: a subtly wrong pitch or
rhythm from a less-reliable fallback model is much harder for an admin to
catch at a glance than a missing lyric, so a *weak* fallback here is a bad
trade even though it's a fine one for lyrics -- see PLAN.md's entry for
this feature. The project owner was told exactly that tradeoff and still
asked for Misaki tried first here, with Groq as the one fallback tier, so
that's what this module now does -- but it still isn't `groq_client.py`'s
kind of machinery: one attempt per tier, no retry-within-a-tier, and no
third provider. If both tiers fail, or neither is configured, the caller
surfaces a clear error and the admin can just retry the click.

Same request shape as `groq_client.py`'s own (an OpenAI-compatible
`/chat/completions`, `Authorization: Bearer`, JSON body), and Groq's tier
still uses the same `reasoning_effort: "low"` for the same reason:
`openai/gpt-oss-120b` is a reasoning model that silently spends its whole
completion budget on hidden chain-of-thought without it (see that
module's docstring for the real production failure this was found from).
Misaki's tier has no such tuning: it's an unproven model here, so no
reasoning-effort or other params are invented for it."""

from __future__ import annotations

import logging
import re

import httpx

from app.core.config import get_settings

logger = logging.getLogger("divisi.scoreedit")

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_MISAKI_URL = "https://llm.misaki.sh/v1/chat/completions"
_TIMEOUT_SECONDS = 60.0
# One fragment covering a small, admin-chosen measure range -- generous
# relative to `groq_client.py`'s own per-chunk budget (which has to cover
# many syllables across a whole page) since a MusicXML fragment for a
# handful of measures, even across several parts, stays well under this
# in practice, but sized with real margin for a wide multi-part range.
_MAX_TOKENS = 6000

_SYSTEM_PROMPT = "\n".join(
    [
        "You edit a small range of measures in a piece of choral sheet music, given as a MusicXML "
        "fragment covering every voice part for that range only.",
        "You are also given a plain-language instruction describing the change to make (e.g. \"fix the "
        'alto rhythm here", "this should be a dotted quarter", "make this measure forte").',
        "Return ONLY the replacement MusicXML fragment, no prose, no code fences -- starting at "
        "<score-partwise ...> and ending at the matching </score-partwise>.",
        "The replacement MUST cover the exact same measure range and the exact same parts, in the same "
        "order, as the fragment you were given -- do not add, remove, split, or reorder measures or "
        "parts. Every measure in your answer must have a <note>/<rest> content that sums to that "
        "measure's own time signature, same as the input.",
        "The fragment's FIRST measure carries <attributes> (divisions, key, time signature, clef) "
        "inherited from the full piece, even when the instruction has nothing to do with them -- "
        "reproduce that <attributes> block exactly in your first measure too, unless the instruction "
        "specifically asks you to change one of those things. Every part's own first measure needs its "
        "own <attributes> reproduced the same way; later measures typically won't have one, same as the "
        "input.",
        "Apply the instruction precisely and conservatively: change only what it asks for, and leave "
        "everything else (notes, rhythms, lyrics, dynamics, articulations) exactly as given.",
    ]
)


class ScoreEditError(Exception):
    """Raised when a provider call fails outright (network, non-200,
    missing API key), or its response doesn't contain anything that looks
    like a MusicXML fragment -- either way the caller should surface a
    clear error rather than trying to splice something unusable."""


def _call_groq(body: dict) -> httpx.Response:
    """Factored into its own module-level function, same as
    `app/lyrics/groq_client.py`'s `_call_groq`, so tests can monkeypatch
    it and never make a real network call in the default test run."""
    settings = get_settings()
    return httpx.post(
        _GROQ_URL,
        json=body,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        timeout=_TIMEOUT_SECONDS,
    )


def _call_misaki(body: dict) -> httpx.Response:
    """The first-tier provider's HTTP call, tried before Groq. Factored
    out the same way as `_call_groq` so tests can monkeypatch it
    independently. Reuses the same timeout as Groq."""
    settings = get_settings()
    return httpx.post(
        _MISAKI_URL,
        json=body,
        headers={"Authorization": f"Bearer {settings.misaki_llm_key}"},
        timeout=_TIMEOUT_SECONDS,
    )


def _groq_body(fragment_xml: str, message: str) -> dict:
    settings = get_settings()
    user_prompt = (
        f"Instruction: {message}\n\n"
        f"MusicXML fragment to edit:\n{fragment_xml}\n\n"
        "Return ONLY the replacement MusicXML fragment described in the instructions."
    )
    return {
        "model": settings.groq_score_edit_model,
        "temperature": 0.1,
        "reasoning_effort": "low",
        "max_tokens": _MAX_TOKENS,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _misaki_body(fragment_xml: str, message: str) -> dict:
    settings = get_settings()
    user_prompt = (
        f"Instruction: {message}\n\n"
        f"MusicXML fragment to edit:\n{fragment_xml}\n\n"
        "Return ONLY the replacement MusicXML fragment described in the instructions."
    )
    return {
        "model": settings.misaki_score_edit_model,
        "temperature": 0.1,
        # No reasoning_effort here, unlike `_groq_body` -- that tuning was
        # reverse-engineered specifically for Groq's gpt-oss-120b, and
        # nothing is known yet about how this model behaves, so nothing is
        # invented for it.
        "max_tokens": _MAX_TOKENS,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


# Matches from the first `<score-partwise` (with or without a preceding
# XML declaration, which the prompt doesn't ask for and models sometimes
# omit) through its matching close tag, tolerating prose or code fences
# wrapped around it the same defensive way `groq_client.py`'s
# `_extract_json` tolerates them around JSON. DOTALL so the fragment's
# own newlines don't stop the match.
_FRAGMENT_RE = re.compile(r"<score-partwise[^>]*>.*?</score-partwise>", re.DOTALL)


def _extract_musicxml(text: str) -> str | None:
    """Pulls a `<score-partwise>...</score-partwise>` document out of a
    model response that may wrap it in prose or a code fence. Returns
    `None` if nothing recognizable is found."""
    match = _FRAGMENT_RE.search(text or "")
    if match is None:
        return None
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + match.group(0)


def _call_and_extract(call_fn, body: dict, provider_name: str) -> str:
    """Shared request/response handling for both providers: call, check
    the status code, extract the MusicXML fragment. Raises
    `ScoreEditError` on any failure, tagged with which provider failed so
    the caller falling back to the next tier can log which one actually
    broke. Mirrors `groq_client.py`'s `_call_and_parse`, simpler since
    this returns a raw fragment string rather than a parsed voices
    list."""
    try:
        response = call_fn(body)
    except httpx.HTTPError as exc:
        raise ScoreEditError(f"Could not reach the {provider_name} API: {exc}") from exc

    if response.status_code != 200:
        raise ScoreEditError(f"{provider_name} API returned {response.status_code}: {response.text[:200]}")

    data = response.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    fragment = _extract_musicxml(content)
    if fragment is None:
        raise ScoreEditError(f"{provider_name}'s response didn't contain a recognizable MusicXML fragment")
    return fragment


def edit_measures(fragment_xml: str, message: str) -> str:
    """Sends `fragment_xml` (the selected measures' MusicXML, every part,
    from `app.scoreedit.apply.extract_range`) and the admin's plain-
    language `message` to Misaki first, falling back to Groq if Misaki
    fails, and returns the replacement fragment's raw MusicXML text.
    One attempt per tier, no retry-within-a-tier (see the module
    docstring for why this doesn't mirror `groq_client.py`'s heavier
    machinery). Raises `ScoreEditError` on total failure -- no API key
    configured at all, or the configured tier(s) all failing -- or if the
    response has no recognizable MusicXML in it. Does not validate the
    replacement's shape (part/measure count, well-formedness) at all --
    that's `app.scoreedit.apply.splice_range`'s job, once this has handed
    back raw text."""
    settings = get_settings()
    if not settings.misaki_llm_key and not settings.groq_api_key:
        raise ScoreEditError("AI edit is not configured (no API key set)")

    if settings.misaki_llm_key:
        try:
            return _call_and_extract(_call_misaki, _misaki_body(fragment_xml, message), "Misaki")
        except ScoreEditError as exc:
            if not settings.groq_api_key:
                raise
            logger.warning("Misaki AI edit failed, falling back to Groq: %s", exc)

    return _call_and_extract(_call_groq, _groq_body(fragment_xml, message), "Groq")
