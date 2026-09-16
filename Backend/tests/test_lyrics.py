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
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())


def test_classify_lyric_tokens_raises_when_no_api_key_configured(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "groq_api_key", "")
    with pytest.raises(LyricExtractionError):
        classify_lyric_tokens(_tokens())


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

    monkeypatch.setattr(lyrics_route, "classify_lyric_tokens", lambda tokens: voices)


def test_generate_lyrics_happy_path_creates_a_published_version(client, monkeypatch):
    headers = _register_and_login(client, "lyricsowner@example.com")
    piece_id, _version_id = _upload_musicxml_piece(client, headers)
    _stub_classify(monkeypatch, [{"voice": "soprano", "syllables": [{"text": "Ah", "syllabic": "single"}]}])

    res = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert body["source"] == "modification"
    # Auto-published: this only ever adds lyric annotations on top of
    # already-approved note/rhythm data (see the route's own doc comment).
    assert body["status"] == "approved"

    file_res = client.get(f"/library/versions/{body['id']}/file", headers=headers)
    assert file_res.status_code == 200
    assert b"<lyric" in file_res.content
    assert b"Ah" in file_res.content


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

    def _raise(_tokens):
        raise LyricExtractionError("upstream exploded")

    monkeypatch.setattr(lyrics_route, "classify_lyric_tokens", _raise)
    res = client.post(f"/library/pieces/{piece_id}/generate-lyrics", headers=headers)
    assert res.status_code == 502
