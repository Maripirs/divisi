"""Lyric-generation pipeline: PDF word-token extraction (`app/lyrics/extract.py`),
Groq classification (`app/lyrics/groq_client.py`), sequential injection into a
music21 Score (`app/lyrics/inject.py`), and the
`POST /library/pieces/{id}/generate-lyrics` route wiring them together.

The Groq call is monkeypatched everywhere below except the explicit
`integration`-marked real-network test at the bottom, which is skipped
unless a real `GROQ_API_KEY` is set in the environment.
"""

from __future__ import annotations

import io
import json
import os

import pytest
import pymupdf
from music21 import note, stream, tie

from app.lyrics.extract import NoTextLayerError, PdfWordToken, extract_word_tokens
from app.lyrics.groq_client import LyricExtractionError, classify_lyric_tokens
from app.lyrics.inject import inject_lyrics

# --- inject.py: the deterministic sequencing/injection logic ---------------


def _soprano_score_with_tie_and_rest() -> stream.Score:
    """Soprano: C4, D4(tie start), D4(tie stop), E4, rest -- three real
    onsets (the tied D4 pair counts once), one non-singable rest."""
    score = stream.Score()
    part = stream.Part()
    part.partName = "Soprano"
    measure = stream.Measure(number=1)
    n1 = note.Note("C4", quarterLength=1)
    n2 = note.Note("D4", quarterLength=1)
    n2.tie = tie.Tie("start")
    n3 = note.Note("D4", quarterLength=1)
    n3.tie = tie.Tie("stop")
    n4 = note.Note("E4", quarterLength=1)
    r = note.Rest(quarterLength=1)
    measure.append([n1, n2, n3, n4, r])
    part.append(measure)
    score.append(part)
    return score


def test_inject_lyrics_skips_rests_and_tie_continuations():
    score = _soprano_score_with_tie_and_rest()
    voices = [
        {
            "voice": "soprano",
            "syllables": [
                {"text": "Ky-", "syllabic": "begin"},
                {"text": "ri-", "syllabic": "middle"},
                {"text": "e", "syllabic": "end"},
            ],
        }
    ]
    written = inject_lyrics(score, voices)
    assert written == 3

    notes = list(score.parts[0].flatten().notesAndRests)
    c4, d4_start, d4_stop, e4, rest = notes

    assert [ly.text for ly in c4.lyrics] == ["Ky"]
    assert c4.lyrics[0].syllabic == "begin"
    assert [ly.text for ly in d4_start.lyrics] == ["ri"]
    assert d4_start.lyrics[0].syllabic == "middle"
    # The tied continuation note must not consume a token of its own.
    assert d4_stop.lyrics == []
    assert [ly.text for ly in e4.lyrics] == ["e"]
    assert e4.lyrics[0].syllabic == "end"
    assert rest.lyrics == []


def test_inject_lyrics_stops_cleanly_when_fewer_tokens_than_notes():
    score = _soprano_score_with_tie_and_rest()
    voices = [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]
    written = inject_lyrics(score, voices)
    assert written == 1

    notes = list(score.parts[0].flatten().notesAndRests)
    c4, d4_start, d4_stop, e4, rest = notes
    assert [ly.text for ly in c4.lyrics] == ["Ah"]
    # Ran out of tokens: everything after gets no lyric, no error.
    assert d4_start.lyrics == []
    assert e4.lyrics == []


def test_inject_lyrics_stops_cleanly_when_more_tokens_than_notes():
    score = _soprano_score_with_tie_and_rest()
    voices = [
        {
            "voice": "soprano",
            "syllables": [{"text": w, "syllabic": "single"} for w in ["A", "B", "C", "D", "E", "F"]],
        }
    ]
    written = inject_lyrics(score, voices)
    # Only 3 real onsets exist, regardless of how many tokens were offered.
    assert written == 3


def test_inject_lyrics_ignores_unmatched_voice_and_unrecognized_part_name():
    score = _soprano_score_with_tie_and_rest()
    written = inject_lyrics(score, [{"voice": "tenor", "syllables": [{"text": "Ah", "syllabic": "single"}]}])
    assert written == 0
    for el in score.parts[0].flatten().notesAndRests:
        assert el.lyrics == []


def test_inject_lyrics_falls_back_to_positional_satb_when_no_part_has_a_recognizable_name():
    """Hit this for real on a piece whose MusicXML came from an OMR tool
    that only wrote generic `<part-name>Part 1</part-name>`..`Part 4`
    metadata -- the real SOPRANO/ALTO/TENOR/BASS labels lived only as
    printed page text, never in the part names music21 sees."""
    score = stream.Score()
    for i, name in enumerate(["Part 1", "Part 2", "Part 3", "Part 4"]):
        part = stream.Part()
        part.partName = name
        measure = stream.Measure(number=1)
        measure.append(note.Note("C4", quarterLength=1))
        part.append(measure)
        score.append(part)

    written = inject_lyrics(
        score,
        [
            {"voice": "soprano", "syllables": [{"text": "So", "syllabic": "single"}]},
            {"voice": "bass", "syllables": [{"text": "Ba", "syllabic": "single"}]},
        ],
    )
    assert written == 2
    part1, part2, part3, part4 = score.parts
    assert [ly.text for n in part1.flatten().notes for ly in n.lyrics] == ["So"]
    assert list(part2.flatten().notes)[0].lyrics == []
    assert list(part3.flatten().notes)[0].lyrics == []
    assert [ly.text for n in part4.flatten().notes for ly in n.lyrics] == ["Ba"]


def test_inject_lyrics_does_not_use_positional_fallback_when_any_part_is_named():
    """The fallback only engages when NOT ONE part has a recognizable
    name -- a piece that names even one part correctly (here, only the
    third part is "Tenor") must not have its other, genuinely-unnamed
    parts silently reassigned by position."""
    score = stream.Score()
    for name in ["Part 1", "Part 2", "Tenor", "Part 4"]:
        part = stream.Part()
        part.partName = name
        measure = stream.Measure(number=1)
        measure.append(note.Note("C4", quarterLength=1))
        part.append(measure)
        score.append(part)

    written = inject_lyrics(
        score, [{"voice": "soprano", "syllables": [{"text": "So", "syllabic": "single"}]}]
    )
    # "soprano" was never a recognized part name here (only "tenor" was),
    # so it stays unmatched rather than falling back to "Part 1" by position.
    assert written == 0


def test_inject_lyrics_serializes_to_musicxml_lyric_elements(tmp_path):
    score = stream.Score()
    part = stream.Part()
    part.partName = "Soprano"
    measure = stream.Measure(number=1)
    measure.append(note.Note("C4", quarterLength=1))
    part.append(measure)
    score.append(part)
    inject_lyrics(score, [{"voice": "soprano", "syllables": [{"text": "Ky-", "syllabic": "begin"}]}])

    out_path = score.write("musicxml")
    xml = out_path.read_text()
    assert "<lyric" in xml
    assert "<syllabic>begin</syllabic>" in xml
    assert "<text>Ky</text>" in xml


def test_count_singable_onsets_matches_true_onset_counts_per_voice():
    from app.lyrics.inject import count_singable_onsets

    score = _soprano_score_with_tie_and_rest()
    # 3 real onsets: C4, D4(tie start+stop counts once), E4 -- the rest doesn't count.
    assert count_singable_onsets(score) == {"soprano": 3}


def test_count_singable_onsets_uses_the_same_positional_fallback_as_injection():
    from app.lyrics.inject import count_singable_onsets

    score = stream.Score()
    for name in ["Part 1", "Part 2", "Part 3", "Part 4"]:
        part = stream.Part()
        part.partName = name
        measure = stream.Measure(number=1)
        measure.append([note.Note("C4", quarterLength=1), note.Note("D4", quarterLength=1)])
        part.append(measure)
        score.append(part)

    counts = count_singable_onsets(score)
    assert counts == {"soprano": 2, "alto": 2, "tenor": 2, "bass": 2}


@pytest.mark.parametrize(
    "part_name,expected_voice",
    [
        ("Soprano", "soprano"),
        ("SOPRANO", "soprano"),
        ("Sop.", "soprano"),
        ("S.", "soprano"),
        ("Alto", "alto"),
        ("A.", "alto"),
        ("Tenor", "tenor"),
        ("T.", "tenor"),
        ("Bass", "bass"),
        ("B.", "bass"),
        ("Piano", None),
        ("Pno.", None),
        (None, None),
    ],
)
def test_normalize_voice_matches_common_part_name_conventions(part_name, expected_voice):
    from app.lyrics.inject import _normalize_voice

    assert _normalize_voice(part_name) == expected_voice


# --- extract.py: PDF word-token extraction ----------------------------------


def _write_pdf(path, lines: list[tuple[float, float, str]]) -> None:
    doc = pymupdf.open()
    page = doc.new_page()
    for x, y, text in lines:
        page.insert_text((x, y), text)
    doc.save(str(path))
    doc.close()


def test_extract_word_tokens_returns_words_with_bounding_boxes(tmp_path):
    pdf_path = tmp_path / "score.pdf"
    _write_pdf(pdf_path, [(72, 72, "SOPRANO"), (72, 90, "Ky- ri- e e- lei- son")])

    tokens = extract_word_tokens(str(pdf_path))
    words = [t.text for t in tokens]
    assert words == ["SOPRANO", "Ky-", "ri-", "e", "e-", "lei-", "son"]
    assert all(isinstance(t, PdfWordToken) for t in tokens)
    assert all(t.page == 0 for t in tokens)
    assert tokens[0].x0 < tokens[0].x1
    assert tokens[0].y0 < tokens[0].y1


def test_extract_word_tokens_raises_on_a_blank_scanned_looking_pdf(tmp_path):
    pdf_path = tmp_path / "scan.pdf"
    doc = pymupdf.open()
    doc.new_page()
    doc.save(str(pdf_path))
    doc.close()

    with pytest.raises(NoTextLayerError):
        extract_word_tokens(str(pdf_path))


# --- groq_client.py: request/response handling (network mocked) ------------


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = "", headers: dict | None = None):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.headers = headers or {}

    def json(self):
        return self._payload


def _tokens():
    return [PdfWordToken(text="Ah", x0=0, y0=0, x1=1, y1=1, page=0)]


def test_classify_lyric_tokens_parses_a_clean_response(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    content = json.dumps(
        {
            "voices": [
                {
                    "voice": "Soprano",
                    "syllables": [{"text": "Ah", "syllabic": "single"}],
                }
            ]
        }
    )
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": content}}]}),
    )
    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]


def test_classify_lyric_tokens_extracts_json_wrapped_in_prose_and_code_fences(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    payload = {"voices": [{"voice": "alto", "syllables": [{"text": "Oh", "syllabic": "single"}]}]}
    content = f"Sure, here you go:\n```json\n{json.dumps(payload)}\n```\nHope that helps!"
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": content}}]}),
    )
    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "alto", "syllables": [{"text": "Oh", "syllabic": "single"}]}]


def test_classify_lyric_tokens_raises_on_non_200(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(groq_client, "_call_groq", lambda body: _FakeResponse(500, text="boom"))
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)  # a persistent failure retries once
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())


def test_classify_lyric_tokens_raises_on_unparseable_content(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": "not json at all"}}]}),
    )
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)  # a persistent failure retries once
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())


def test_classify_lyric_tokens_retries_once_then_succeeds_on_a_flaky_chunk(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    responses = [
        _FakeResponse(200, {"choices": [{"message": {"content": "not json at all"}}]}),
        _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]}),
    ]
    monkeypatch.setattr(groq_client, "_call_groq", lambda body: responses.pop(0))

    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]


def test_classify_lyric_tokens_raises_when_no_api_key_configured(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "groq_api_key", "")
    monkeypatch.setattr(get_settings(), "nvidia_api_key", "")
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())


# --- groq_client.py: Misaki tier (tried first, ahead of Groq and NVIDIA) ---


def test_classify_lyric_tokens_uses_misaki_first_and_never_calls_groq(monkeypatch):
    """When Misaki is configured and returns a clean response, it should
    be used directly -- Groq must never even be attempted for this
    chunk."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "misaki_llm_key", "test-misaki-key")
    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    monkeypatch.setattr(
        groq_client,
        "_call_misaki",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]}),
    )

    def _fail_if_called(body):
        raise AssertionError("Groq should never be called when Misaki succeeds")

    monkeypatch.setattr(groq_client, "_call_groq", _fail_if_called)

    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]


def test_classify_lyric_tokens_falls_back_to_groq_when_misaki_fails_twice(monkeypatch):
    """Misaki fails twice on a chunk (same "assume it's down for the rest
    of the run" pattern as the Groq-to-NVIDIA handoff): the chunk should
    fall through to Groq in the same iteration, not just get skipped."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "misaki_llm_key", "test-misaki-key")
    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(groq_client, "_call_misaki", lambda body: _FakeResponse(500, text="boom"))
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    groq_calls = []

    def _fake_groq(body):
        groq_calls.append(body)
        return _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]})

    monkeypatch.setattr(groq_client, "_call_groq", _fake_groq)

    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]
    assert len(groq_calls) == 1


# --- groq_client.py: NVIDIA fallback (Groq's per-minute AND per-day caps) --
#
# Per chunk, same as Groq (see the module docstring for why the earlier
# whole-remainder design was replaced with this): once Groq fails twice on
# one chunk, it's assumed down for the rest of the run and every chunk from
# there on goes to NVIDIA individually.


def test_classify_lyric_tokens_falls_back_to_nvidia_when_groq_fails_twice(monkeypatch):
    """The actual scenario this was built for: Groq's separate per-day cap
    (no reset-time header, unlike the per-minute one) got exhausted for
    real during a day of testing this feature -- every Groq attempt fails
    identically, so the one retry doesn't help, but NVIDIA (a separate
    account/quota) picks up this chunk."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(429, text="tokens per day (TPD): Limit 200000, Used 200000"),
    )
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    nvidia_calls = []

    def _fake_nvidia(body):
        nvidia_calls.append(body)
        return _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]})

    monkeypatch.setattr(groq_client, "_call_nvidia", _fake_nvidia)

    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]
    assert len(nvidia_calls) == 1
    assert nvidia_calls[0]["model"] == get_settings().nvidia_lyrics_model
    assert nvidia_calls[0]["chat_template_kwargs"] == {"thinking": False}
    assert nvidia_calls[0]["max_tokens"] == 5500
    assert "frequency_penalty" not in nvidia_calls[0]


# --- _normalize_alternate_voice_shape: recovering NVIDIA's schema drift ----
# Observed live in production (2026-09-16, first real per-chunk NVIDIA run):
# despite the system prompt spelling out the exact `{"voices": [...]}`
# shape, nemotron sometimes drops the wrapper and returns one top-level key
# per voice instead. This was the single biggest source of lost chunks in
# that run -- the content itself was almost always correct, just shaped
# wrong, and got discarded entirely before this fix.


def test_normalize_alternate_voice_shape_recovers_bare_voice_keys():
    from app.lyrics.groq_client import _normalize_alternate_voice_shape

    # The simplest drift seen live: no "voice" field inside at all.
    parsed = {"soprano": {"syllables": [{"text": "Ah", "syllabic": "single"}]}}
    assert _normalize_alternate_voice_shape(parsed) == [
        {"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}
    ]


def test_normalize_alternate_voice_shape_recovers_multiple_voices_with_redundant_voice_field():
    from app.lyrics.groq_client import _normalize_alternate_voice_shape

    # The other drift shape seen live: a redundant (and here, intentionally
    # mismatched) "voice" field inside each entry -- the top-level key wins.
    parsed = {
        "soprano": {"voice": "alto", "syllables": [{"text": "Gos", "syllabic": "single"}]},
        "alto": {"voice": "alto", "syllables": [{"text": "Gos", "syllabic": "single"}]},
    }
    result = _normalize_alternate_voice_shape(parsed)
    assert {(e["voice"], e["syllables"][0]["text"]) for e in result} == {
        ("soprano", "Gos"),
        ("alto", "Gos"),
    }


def test_normalize_alternate_voice_shape_rejects_anything_not_all_valid_voice_keys():
    from app.lyrics.groq_client import _normalize_alternate_voice_shape

    # A single non-voice top-level key (the correctly-shaped "voices"
    # response, or genuinely unrecognizable content) must NOT be guessed at
    # -- falls through to the normal unparseable-response error path.
    assert _normalize_alternate_voice_shape({"voices": []}) is None
    assert _normalize_alternate_voice_shape({"soprano": ["not", "a", "dict"]}) is None
    assert _normalize_alternate_voice_shape({"soprano": {"syllables": [{}]}, "notavoice": {"syllables": []}}) is None
    assert _normalize_alternate_voice_shape({}) is None


def test_classify_chunk_nvidia_recovers_a_schema_drifted_response(monkeypatch):
    """End-to-end through the real NVIDIA call path: a response shaped like
    the live production drift (`{"soprano": {...}}` instead of `{"voices":
    [...]}`) is recovered rather than thrown away and retried."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    drifted_content = json.dumps(
        {"soprano": {"syllables": [{"text": "Ah", "syllabic": "single"}]}}
    )
    calls = []

    def _fake_nvidia(body):
        calls.append(body)
        return _FakeResponse(200, {"choices": [{"message": {"content": drifted_content}}]})

    monkeypatch.setattr(groq_client, "_call_nvidia", _fake_nvidia)

    voices = groq_client._classify_chunk_nvidia(_tokens(), None)
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]
    assert len(calls) == 1  # recovered on the first attempt, no retry needed


def test_classify_lyric_tokens_sends_every_chunk_after_the_failure_to_nvidia(monkeypatch):
    """Three chunks; Groq fails on the first. The second and third should
    go straight to NVIDIA too, without Groq being retried on them (the
    sticky "Groq is down" flag)."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    monkeypatch.setattr(groq_client, "_MAX_CHARS_PER_CHUNK", 1)  # force one page per chunk
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    groq_calls = []
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: (groq_calls.append(body), _FakeResponse(429, text="rate limited"))[1],
    )
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    nvidia_calls = []

    def _fake_nvidia(body):
        nvidia_calls.append(body)
        return _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]})

    monkeypatch.setattr(groq_client, "_call_nvidia", _fake_nvidia)

    tokens = [
        PdfWordToken(text="Ky-", x0=0, y0=0, x1=1, y1=1, page=0),
        PdfWordToken(text="ri-", x0=0, y0=0, x1=1, y1=1, page=1),
        PdfWordToken(text="e", x0=0, y0=0, x1=1, y1=1, page=2),
    ]
    classify_lyric_tokens(tokens)

    # Groq attempted twice (initial + one retry), only for the first chunk.
    assert len(groq_calls) == 2
    # NVIDIA served all three chunks, each with just its own page's tokens.
    assert len(nvidia_calls) == 3
    assert "Ky-" in nvidia_calls[0]["messages"][1]["content"]
    assert "ri-" in nvidia_calls[1]["messages"][1]["content"]
    assert "e" in nvidia_calls[2]["messages"][1]["content"]


def test_classify_lyric_tokens_does_not_fall_back_when_no_nvidia_key_configured(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "nvidia_api_key", "")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(groq_client, "_call_groq", lambda body: _FakeResponse(429, text="rate limited"))
    nvidia_calls = []
    monkeypatch.setattr(groq_client, "_call_nvidia", lambda body: nvidia_calls.append(body))

    # No NVIDIA key configured: Groq's own retry-and-skip path is all that
    # runs, and since every attempt fails, the chunk (the only one) is
    # skipped, leaving nothing at all.
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())
    assert nvidia_calls == []


def test_classify_chunk_nvidia_retries_once_then_gives_up_on_that_chunk_only(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(groq_client, "_call_nvidia", lambda body: _FakeResponse(500, text="boom"))

    voices = groq_client._classify_chunk_nvidia(_tokens(), None)
    assert voices == []


def test_classify_chunk_nvidia_calls_nvidia_directly(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    good_content = json.dumps(
        {"voices": [{"voice": "alto", "syllables": [{"text": "Oh", "syllabic": "single"}]}]}
    )
    monkeypatch.setattr(
        groq_client,
        "_call_nvidia",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]}),
    )

    voices = groq_client._classify_chunk_nvidia(_tokens(), None)
    assert voices == [{"voice": "alto", "syllables": [{"text": "Oh", "syllabic": "single"}]}]


def test_classify_lyric_tokens_works_with_only_an_nvidia_key_configured(monkeypatch):
    """An empty groq_api_key shouldn't hard-block the whole feature if
    NVIDIA alone is configured -- Groq just fails fast (an auth error,
    twice, same as any other Groq failure) and the per-chunk fallback
    picks it up."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "")
    monkeypatch.setattr(get_settings(), "nvidia_api_key", "test-nvidia-key")
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(groq_client, "_call_groq", lambda body: _FakeResponse(401, text="no api key"))
    good_content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    monkeypatch.setattr(
        groq_client,
        "_call_nvidia",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": good_content}}]}),
    )

    voices = classify_lyric_tokens(_tokens())
    assert voices == [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]


@pytest.mark.parametrize(
    "value,expected",
    [
        ("31.365s", pytest.approx(31.365)),
        ("1m26.4s", pytest.approx(86.4)),
        ("615ms", pytest.approx(0.615)),
        ("2m0s", pytest.approx(120.0)),
        ("", None),
        ("garbage", None),
    ],
)
def test_parse_groq_duration(value, expected):
    from app.lyrics.groq_client import _parse_groq_duration

    result = _parse_groq_duration(value)
    if expected is None:
        assert result is None
    else:
        assert result == expected


# --- groq_client.py: geometric voice-labeling (the real drift fix) ---------


@pytest.mark.parametrize(
    "text,expected",
    [
        ("SOPRANO", "soprano"),
        ("Soprano", "soprano"),
        ("Sop.", "soprano"),
        ("ALTO", "alto"),
        ("Tenor", "tenor"),
        ("BASS", "bass"),
        ("Piano", "piano"),
        ("Pno.", "piano"),
        ("S.", "soprano"),
        ("A.", "alto"),
        ("T.", "tenor"),
        ("B.", "bass"),
        # Single letters WITHOUT a period must NOT be treated as labels --
        # "A" and "I" are both real, common lyric words on their own.
        ("A", None),
        ("I", None),
        ("a", None),
        ("War", None),
        ("Thor,", None),
    ],
)
def test_label_voice_recognizes_labels_but_not_bare_one_letter_words(text, expected):
    from app.lyrics.groq_client import _label_voice

    assert _label_voice(text) == expected


def test_render_pages_as_text_buckets_lines_by_nearest_label_not_reading_order():
    """The actual bug this geometry fix targets: a real PDF's voice labels
    all cluster together in one column block, before any lyric text at
    all (SOPRANO, ALTO, TENOR, BASS, THEN "I am the God Thor..." for
    every voice back to back) -- so "the text after a label belongs to
    that label" is false. Only the labels' own y-position, matched
    against each line's y-position, tells the voices apart."""
    from app.lyrics.groq_client import _render_pages_as_text

    def tok(text, y0, block, line=0):
        return PdfWordToken(text=text, x0=0, y0=y0, x1=1, y1=y0 + 10, page=0, block_no=block, line_no=line)

    tokens = [
        # Labels bunched together first, exactly like the real PDF.
        tok("SOPRANO", 140, block=0),
        tok("ALTO", 188, block=1),
        tok("TENOR", 235, block=2),
        tok("BASS", 282, block=3),
        # Each voice's own lyric line, at that voice's own y-band, in a
        # DIFFERENT order than the labels above it (so a text-order-based
        # heuristic would get this wrong on purpose).
        tok("Thun-", 283, block=4),  # bass-height text
        tok("der!", 283, block=4),
        tok("War", 141, block=5),  # soprano-height text
        tok("God,", 141, block=5),
        tok("Here", 236, block=6),  # tenor-height text
        tok("Gos-", 189, block=7),  # alto-height text
        tok("pel", 189, block=7),
    ]
    rendered = _render_pages_as_text(tokens)
    assert "[soprano] War God," in rendered
    assert "[alto] Gos- pel" in rendered
    assert "[tenor] Here" in rendered
    assert "[bass] Thun- der!" in rendered
    # Labels are anchors only, never sent as content.
    assert "SOPRANO" not in rendered
    assert "ALTO" not in rendered


def test_render_pages_as_text_drops_piano_lines():
    from app.lyrics.groq_client import _render_pages_as_text

    def tok(text, y0, block):
        return PdfWordToken(text=text, x0=0, y0=y0, x1=1, y1=y0 + 10, page=0, block_no=block, line_no=0)

    tokens = [
        tok("SOPRANO", 140, block=0),
        tok("Piano", 400, block=1),
        tok("War", 141, block=2),
        tok("chord", 401, block=3),  # would bucket nearest "Piano", must be dropped
    ]
    rendered = _render_pages_as_text(tokens)
    assert "[soprano] War" in rendered
    assert "chord" not in rendered
    assert "piano" not in rendered.lower().replace("--- page 1 ---", "")


def test_render_pages_as_text_falls_back_to_unlabeled_when_no_labels_on_page():
    from app.lyrics.groq_client import _render_pages_as_text

    tokens = [
        PdfWordToken(text="War", x0=0, y0=100, x1=1, y1=110, page=0, block_no=0, line_no=0),
        PdfWordToken(text="God,", x0=0, y0=100, x1=1, y1=110, page=0, block_no=0, line_no=0),
    ]
    rendered = _render_pages_as_text(tokens)
    assert "War God," in rendered
    assert "[" not in rendered.replace("--- page 1 ---", "")


def test_render_pages_as_text_includes_page_markers():
    from app.lyrics.groq_client import _render_pages_as_text

    tokens = [
        PdfWordToken(text="SOPRANO", x0=0, y0=140, x1=1, y1=150, page=0, block_no=0, line_no=0),
        PdfWordToken(text="War", x0=0, y0=141, x1=1, y1=151, page=0, block_no=1, line_no=0),
        PdfWordToken(text="SOPRANO", x0=0, y0=140, x1=1, y1=150, page=1, block_no=0, line_no=0),
        PdfWordToken(text="God,", x0=0, y0=141, x1=1, y1=151, page=1, block_no=1, line_no=0),
    ]
    rendered = _render_pages_as_text(tokens)
    assert "--- page 1 ---" in rendered
    assert "--- page 2 ---" in rendered
    assert rendered.index("--- page 1 ---") < rendered.index("[soprano] War") < rendered.index("--- page 2 ---")


def test_chunk_tokens_by_page_keeps_whole_pages_together_under_the_char_budget(monkeypatch):
    from app.lyrics import groq_client

    monkeypatch.setattr(groq_client, "_MAX_CHARS_PER_CHUNK", 4000)
    # Three pages of ~1500 rendered chars each (300 five-char "word "
    # tokens): the first two fit in one 4000-char chunk (3000 total), the
    # third would push it to 4500, so it starts a new chunk on its own.
    tokens = [
        PdfWordToken(text="word", x0=0, y0=0, x1=1, y1=1, page=page, block_no=0, line_no=i)
        for page in range(3)
        for i in range(300)
    ]
    chunks = groq_client._chunk_tokens_by_page(tokens)
    assert len(chunks) == 2
    assert {t.page for t in chunks[0]} == {0, 1}
    assert {t.page for t in chunks[1]} == {2}


def test_classify_lyric_tokens_merges_voices_across_chunks_in_page_order(monkeypatch):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(groq_client, "_MAX_CHARS_PER_CHUNK", 1)  # force one page per chunk
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)

    tokens = [
        PdfWordToken(text="Ky-", x0=0, y0=0, x1=1, y1=1, page=0),
        PdfWordToken(text="ri-", x0=0, y0=0, x1=1, y1=1, page=1),
    ]
    responses = [
        _FakeResponse(
            200,
            {"choices": [{"message": {"content": json.dumps(
                {"voices": [{"voice": "soprano", "syllables": [{"text": "Ky-", "syllabic": "begin"}]}]}
            )}}]},
            headers={"x-ratelimit-reset-tokens": "1ms"},
        ),
        _FakeResponse(
            200,
            {"choices": [{"message": {"content": json.dumps(
                {"voices": [{"voice": "soprano", "syllables": [{"text": "e.", "syllabic": "end"}]}]}
            )}}]},
            headers={"x-ratelimit-reset-tokens": "1ms"},
        ),
    ]
    monkeypatch.setattr(groq_client, "_call_groq", lambda body: responses.pop(0))

    voices = classify_lyric_tokens(tokens)
    assert voices == [
        {"voice": "soprano", "syllables": [{"text": "Ky-", "syllabic": "begin"}, {"text": "e.", "syllabic": "end"}]}
    ]


def test_build_user_prompt_includes_remaining_budget_when_given():
    from app.lyrics.groq_client import _build_user_prompt

    with_budget = _build_user_prompt(_tokens(), {"soprano": 12, "alto": 10})
    assert "soprano: 12 sung notes remaining" in with_budget
    assert "alto: 10 sung notes remaining" in with_budget

    without_budget = _build_user_prompt(_tokens())
    assert "remaining" not in without_budget.lower()


def test_classify_lyric_tokens_passes_a_decrementing_running_budget_to_each_chunk(monkeypatch):
    """Regression coverage for the actual failure this was built to catch:
    a positional-only alignment with no ground truth let one voice's
    classification silently drift out of sync with its notes for the rest
    of a piece. Each chunk should see the REMAINING budget after prior
    chunks' syllables are subtracted, not the original total every time."""
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(groq_client, "_MAX_CHARS_PER_CHUNK", 1)  # force one page per chunk
    monkeypatch.setattr(groq_client.time, "sleep", lambda s: None)

    tokens = [
        PdfWordToken(text="Ky-", x0=0, y0=0, x1=1, y1=1, page=0),
        PdfWordToken(text="ri-", x0=0, y0=0, x1=1, y1=1, page=1),
    ]
    seen_bodies: list[dict] = []

    def _fake_call(body):
        seen_bodies.append(body)
        page = len(seen_bodies)
        text = "Ky-" if page == 1 else "ri-"
        payload = {"voices": [{"voice": "soprano", "syllables": [{"text": text, "syllabic": "begin"}]}]}
        return _FakeResponse(
            200,
            {"choices": [{"message": {"content": json.dumps(payload)}}]},
            headers={"x-ratelimit-reset-tokens": "1ms"},
        )

    monkeypatch.setattr(groq_client, "_call_groq", _fake_call)

    classify_lyric_tokens(tokens, onset_counts={"soprano": 5})

    assert len(seen_bodies) == 2
    assert "soprano: 5 sung notes remaining" in seen_bodies[0]["messages"][1]["content"]
    # After the first chunk returned 1 syllable, the second chunk should see 5 - 1 = 4 remaining.
    assert "soprano: 4 sung notes remaining" in seen_bodies[1]["messages"][1]["content"]


def test_classify_lyric_tokens_logs_a_warning_when_the_final_count_drifts_from_the_target(monkeypatch, caplog):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": content}}]}),
    )

    with caplog.at_level("WARNING", logger="divisi.lyrics"):
        classify_lyric_tokens(_tokens(), onset_counts={"soprano": 50})

    assert any("looks off" in r.message for r in caplog.records)


def test_classify_lyric_tokens_does_not_warn_when_the_final_count_is_close_enough(monkeypatch, caplog):
    from app.core.config import get_settings
    from app.lyrics import groq_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    content = json.dumps(
        {"voices": [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}]}
    )
    monkeypatch.setattr(
        groq_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": content}}]}),
    )

    with caplog.at_level("WARNING", logger="divisi.lyrics"):
        classify_lyric_tokens(_tokens(), onset_counts={"soprano": 1})

    assert not any("looks off" in r.message for r in caplog.records)


@pytest.mark.integration
@pytest.mark.skipif(not os.environ.get("GROQ_API_KEY"), reason="requires a real GROQ_API_KEY")
def test_classify_lyric_tokens_real_groq_call(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "groq_api_key", os.environ["GROQ_API_KEY"])
    tokens = [
        PdfWordToken(text="SOPRANO", x0=0, y0=0, x1=1, y1=1, page=0),
        PdfWordToken(text="Ky-", x0=0, y0=10, x1=1, y1=11, page=0),
        PdfWordToken(text="ri-", x0=2, y0=10, x1=3, y1=11, page=0),
        PdfWordToken(text="e", x0=4, y0=10, x1=5, y1=11, page=0),
        PdfWordToken(text="e-", x0=6, y0=10, x1=7, y1=11, page=0),
        PdfWordToken(text="lei-", x0=8, y0=10, x1=9, y1=11, page=0),
        PdfWordToken(text="son.", x0=10, y0=10, x1=11, y1=11, page=0),
    ]
    voices = classify_lyric_tokens(tokens)
    assert any(v["voice"] == "soprano" and v["syllables"] for v in voices)


# --- route: POST /library/pieces/{id}/generate-lyrics -----------------------


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


_MUSICXML = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure></part>
</score-partwise>"""


def _pdf_bytes_with_lyrics() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "SOPRANO")
    page.insert_text((72, 90), "Ah, sing this line of lyrics")
    data = doc.tobytes()
    doc.close()
    return data


def _upload_musicxml_piece(client, headers, title="Ave Maria"):
    files = {
        "file": ("piece.musicxml", io.BytesIO(_MUSICXML.encode()), "application/xml"),
        "pdf_file": ("piece.pdf", io.BytesIO(_pdf_bytes_with_lyrics()), "application/pdf"),
    }
    res = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "user"},
        files=files,
        headers=headers,
    )
    assert res.status_code == 201
    body = res.json()
    return body["piece"]["id"], body["version"]["id"]


def _stub_classify(monkeypatch, voices):
    from app.api.routes.library import lyrics as lyrics_route

    monkeypatch.setattr(lyrics_route, "classify_lyric_tokens", lambda tokens, onset_counts=None: voices)


def _make_group(client, admin_headers, name="Choir"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _upload_and_distribute_group_piece(client, admin_headers, group_id, title="Ave Maria"):
    """A distributed group piece, same submit->approve->distribute chain
    the Frontend's `uploadTrack` action follows (see
    `Frontend/src/routes/groups/[id]/actions/tracks.ts`)."""
    upload = client.post(
        "/library/pieces",
        data={"title": title, "owner_type": "group", "group_id": group_id},
        files={
            "file": ("piece.musicxml", io.BytesIO(_MUSICXML.encode()), "application/xml"),
            "pdf_file": ("piece.pdf", io.BytesIO(_pdf_bytes_with_lyrics()), "application/pdf"),
        },
        headers=admin_headers,
    )
    assert upload.status_code == 201
    body = upload.json()
    piece_id, version_id = body["piece"]["id"], body["version"]["id"]
    assert client.post(f"/library/versions/{version_id}/submit", headers=admin_headers).status_code == 200
    assert client.post(f"/library/versions/{version_id}/approve", headers=admin_headers).status_code == 200
    assert (
        client.post(
            f"/library/pieces/{piece_id}/versions/{version_id}/distribute", headers=admin_headers
        ).status_code
        == 201
    )
    return piece_id, version_id


def test_generate_lyrics_happy_path_creates_an_unpublished_draft(client, monkeypatch):
    admin = _register_and_login(client, "lyricsowner@example.com")
    group_id = _make_group(client, admin)
    piece_id, live_version_id = _upload_and_distribute_group_piece(client, admin, group_id)
    _stub_classify(monkeypatch, [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}])

    res = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=admin)
    assert res.status_code == 201
    body = res.json()
    assert body["source"] == "modification"
    # Left as a draft, not auto-published: real production use (see
    # PLAN.md, 2026-09-16) showed lyric classification is unreliable
    # enough that an admin needs to review it against the source PDF
    # first (the Frontend's review page) rather than it going live on
    # the same click.
    assert body["status"] == "draft"
    assert body["id"] != live_version_id

    file_res = client.get(f"/library/versions/{body['id']}/file", headers=admin)
    assert file_res.status_code == 200
    assert b"<lyric" in file_res.content
    assert b"Ah" in file_res.content

    # The live (distributed) version is untouched -- a group piece's
    # current version is whatever's most recently *distributed*
    # (`live_version`), and the new draft has no Distribution row yet.
    entries = client.get("/library/pieces", headers=admin).json()
    entry = next(e for e in entries if e["piece_id"] == piece_id)
    assert entry["version_id"] == live_version_id
    assert entry["pending_generated_version_id"] == body["id"]


def test_generate_lyrics_rerun_rejects_the_stale_draft(client, monkeypatch, db_session):
    """A second click before the first draft was reviewed replaces it --
    same "one working-draft slot per piece" rule the OMR pipeline follows
    (`_import_draft_version` in `app/jobs/omr_jobs.py`) -- rather than
    leaving the old one orphaned and unreachable."""
    from app.db.models import PieceVersion

    headers = _register_and_login(client, "lyricsrerun@example.com")
    piece_id, _original_version_id = _upload_musicxml_piece(client, headers)
    _stub_classify(monkeypatch, [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}])

    first = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers).json()
    second = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers).json()
    assert first["id"] != second["id"]
    assert second["status"] == "draft"

    stale = db_session.query(PieceVersion).filter(PieceVersion.id == first["id"]).one()
    assert stale.status.value == "rejected"

    entries = client.get("/library/pieces", headers=headers).json()
    entry = next(e for e in entries if e["piece_id"] == piece_id)
    assert entry["pending_generated_version_id"] == second["id"]


def test_generate_lyrics_requires_review_authority(client, monkeypatch):
    owner_headers = _register_and_login(client, "lyricsowner2@example.com")
    stranger_headers = _register_and_login(client, "lyricsstranger@example.com")
    piece_id, _ = _upload_musicxml_piece(client, owner_headers)
    _stub_classify(monkeypatch, [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}])

    res = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=stranger_headers)
    assert res.status_code == 403


def test_generate_lyrics_404s_with_no_music_file(client):
    headers = _register_and_login(client, "lyricsnomusic@example.com")
    res = client.post(
        "/library/pieces",
        data={"title": "PDF only", "owner_type": "user"},
        files={"pdf_file": ("piece.pdf", io.BytesIO(_pdf_bytes_with_lyrics()), "application/pdf")},
        headers=headers,
    )
    piece_id = res.json()["piece"]["id"]

    generate = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert generate.status_code == 404


def test_generate_lyrics_400s_with_no_pdf(client):
    headers = _register_and_login(client, "lyricsnopdf@example.com")
    res = client.post(
        "/library/pieces",
        data={"title": "Music only", "owner_type": "user"},
        files={"file": ("piece.musicxml", io.BytesIO(_MUSICXML.encode()), "application/xml")},
        headers=headers,
    )
    piece_id = res.json()["piece"]["id"]

    generate = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert generate.status_code == 400
    assert "PDF" in generate.json()["detail"]


def test_generate_lyrics_400s_for_midi_sourced_piece(client):
    headers = _register_and_login(client, "lyricsmidi@example.com")
    # A real (tiny) MIDI file: header + an empty track, enough for the
    # route's byte-sniff to recognize as MIDI before it ever tries to parse it.
    midi_bytes = (
        b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x00\x60"
        b"MTrk\x00\x00\x00\x04\x00\xff\x2f\x00"
    )
    res = client.post(
        "/library/pieces",
        data={"title": "MIDI piece", "owner_type": "user"},
        files={
            "file": ("piece.mid", io.BytesIO(midi_bytes), "audio/midi"),
            "pdf_file": ("piece.pdf", io.BytesIO(_pdf_bytes_with_lyrics()), "application/pdf"),
        },
        headers=headers,
    )
    piece_id = res.json()["piece"]["id"]

    generate = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert generate.status_code == 400
    assert "MIDI" in generate.json()["detail"]


def test_generate_lyrics_400s_for_scanned_pdf_with_no_text_layer(client):
    headers = _register_and_login(client, "lyricsscan@example.com")
    blank_doc = pymupdf.open()
    blank_doc.new_page()
    blank_pdf = blank_doc.tobytes()
    blank_doc.close()

    res = client.post(
        "/library/pieces",
        data={"title": "Scanned piece", "owner_type": "user"},
        files={
            "file": ("piece.musicxml", io.BytesIO(_MUSICXML.encode()), "application/xml"),
            "pdf_file": ("scan.pdf", io.BytesIO(blank_pdf), "application/pdf"),
        },
        headers=headers,
    )
    piece_id = res.json()["piece"]["id"]

    generate = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert generate.status_code == 400
    assert "scan" in generate.json()["detail"].lower()


def test_generate_lyrics_502s_when_groq_call_fails(client, monkeypatch):
    from app.api.routes.library import lyrics as lyrics_route

    headers = _register_and_login(client, "lyricsgroqfail@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    def _raise(_tokens, _onset_counts=None):
        raise LyricExtractionError("upstream exploded")

    monkeypatch.setattr(lyrics_route, "classify_lyric_tokens", _raise)
    res = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert res.status_code == 502
