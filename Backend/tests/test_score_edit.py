"""AI-assisted measure-range edits (`Backend/app/scoreedit/`): extraction/
splicing in music21 (`apply.py`), the Groq call (`client.py`, network
mocked), and the `POST /library/pieces/{id}/edit-measures` route wiring
them together.

Mirrors `test_lyrics.py`'s shape throughout, including reusing its route-
level helpers (`_register_and_login`, `_make_group`,
`_upload_and_distribute_group_piece`, `_upload_musicxml_piece`) rather
than duplicating them.
"""

from __future__ import annotations

import io

import pytest
from music21 import converter, stream

from app.scoreedit.apply import SpliceValidationError, extract_range, splice_range
from app.scoreedit.client import ScoreEditError, _extract_musicxml, edit_measures
from tests.test_lyrics import (
    _make_group,
    _register_and_login,
    _upload_and_distribute_group_piece,
    _upload_musicxml_piece,
)

# --- apply.py: extraction/splicing in music21 -------------------------------

_TWO_PART_THREE_MEASURE_MUSICXML = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list>
  <score-part id="P1"><part-name>Soprano</part-name></score-part>
  <score-part id="P2"><part-name>Alto</part-name></score-part>
</part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
<measure number="2">
<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
<measure number="3">
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
<part id="P2">
<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
<measure number="2">
<note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
<measure number="3">
<note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""


def _score() -> stream.Score:
    return converter.parse(_TWO_PART_THREE_MEASURE_MUSICXML)


def test_extract_range_returns_only_the_selected_measures_for_every_part():
    fragment = extract_range(_score(), 2, 2)
    assert len(fragment.parts) == 2
    for part in fragment.parts:
        measures = list(part.getElementsByClass(stream.Measure))
        assert [m.number for m in measures] == [2]


def test_extract_range_carries_clef_key_time_context_even_when_not_starting_at_measure_1():
    """The real risk this covers: a range that doesn't start at measure 1
    would have no <attributes> of its own in the raw MusicXML, but
    `Part.measures` should still hand back a fragment music21 considers
    self-contained (a real time signature, not a default guess)."""
    fragment = extract_range(_score(), 3, 3)
    part = fragment.parts[0]
    ts = part.flatten().getElementsByClass("TimeSignature").first()
    assert ts is not None
    assert (ts.numerator, ts.denominator) == (4, 4)


def _replacement_xml(measure_number: int, soprano_pitch: str, alto_pitch: str) -> str:
    return f"""<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list>
  <score-part id="P1"><part-name>Soprano</part-name></score-part>
  <score-part id="P2"><part-name>Alto</part-name></score-part>
</part-list>
<part id="P1">
<measure number="{measure_number}"><attributes><divisions>1</divisions></attributes>
<note><pitch>{soprano_pitch}</pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
<part id="P2">
<measure number="{measure_number}"><attributes><divisions>1</divisions></attributes>
<note><pitch>{alto_pitch}</pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""


def test_splice_range_replaces_only_the_selected_measure_in_every_part():
    score = _score()
    replacement = _replacement_xml(2, "<step>F</step><octave>4</octave>", "<step>G</step><octave>3</octave>")
    splice_range(score, 2, 2, replacement)

    soprano, alto = score.parts
    assert [(m.number, [n.nameWithOctave for n in m.notes]) for m in soprano.getElementsByClass(stream.Measure)] == [
        (1, ["C4"]),
        (2, ["F4"]),
        (3, ["E4"]),
    ]
    assert [(m.number, [n.nameWithOctave for n in m.notes]) for m in alto.getElementsByClass(stream.Measure)] == [
        (1, ["C3"]),
        (2, ["G3"]),
        (3, ["E3"]),
    ]


def test_splice_range_leaves_everything_outside_the_range_untouched():
    score = _score()
    replacement = _replacement_xml(1, "<step>A</step><octave>4</octave>", "<step>B</step><octave>3</octave>")
    splice_range(score, 1, 1, replacement)

    soprano = score.parts[0]
    measures = list(soprano.getElementsByClass(stream.Measure))
    # Measures 2 and 3 (outside the spliced range) still have their
    # original pitches.
    assert [n.nameWithOctave for n in measures[1].notes] == ["D4"]
    assert [n.nameWithOctave for n in measures[2].notes] == ["E4"]


def test_splice_range_rejects_a_part_count_mismatch():
    score = _score()
    one_part_replacement = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1">
<measure number="2"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""
    with pytest.raises(SpliceValidationError, match="part"):
        splice_range(score, 2, 2, one_part_replacement)


def test_splice_range_rejects_a_measure_count_mismatch():
    score = _score()
    # Selection is one measure (2-2), but this replacement hands back two.
    two_measure_replacement = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list>
  <score-part id="P1"><part-name>Soprano</part-name></score-part>
  <score-part id="P2"><part-name>Alto</part-name></score-part>
</part-list>
<part id="P1">
<measure number="2"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
<measure number="3">
<note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
</part>
<part id="P2">
<measure number="2"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""
    with pytest.raises(SpliceValidationError, match="measure"):
        splice_range(score, 2, 2, two_measure_replacement)


def test_splice_range_rejects_unparseable_replacement_xml():
    score = _score()
    with pytest.raises(SpliceValidationError):
        splice_range(score, 2, 2, "not xml at all")


def test_splice_range_never_mutates_the_score_when_validation_fails():
    """A mismatch on one part must not leave the other part half-spliced
    -- shape is validated for every part before anything is removed."""
    score = _score()
    # Soprano's replacement measure count is right, alto's is wrong.
    mismatched = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list>
  <score-part id="P1"><part-name>Soprano</part-name></score-part>
  <score-part id="P2"><part-name>Alto</part-name></score-part>
</part-list>
<part id="P1">
<measure number="2"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
<part id="P2">
<measure number="2"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
<measure number="3">
<note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
</part>
</score-partwise>"""
    with pytest.raises(SpliceValidationError):
        splice_range(score, 2, 2, mismatched)

    soprano = score.parts[0]
    # Soprano's original measure 2 (D4) is still there, untouched, even
    # though its own replacement measure would have validated fine on
    # its own -- the whole splice is all-or-nothing.
    measures = list(soprano.getElementsByClass(stream.Measure))
    assert [n.nameWithOctave for n in measures[1].notes] == ["D4"]


# --- client.py: the Groq call (network mocked) ------------------------------


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


def test_extract_musicxml_pulls_a_fragment_out_of_prose_and_code_fences():
    fragment = "<score-partwise><part id=\"P1\"></part></score-partwise>"
    wrapped = f"Sure, here you go:\n```xml\n{fragment}\n```\nHope that helps!"
    result = _extract_musicxml(wrapped)
    assert result is not None
    assert fragment in result


def test_extract_musicxml_returns_none_for_unrecognizable_content():
    assert _extract_musicxml("not xml at all") is None


def test_edit_measures_returns_the_fragment_from_a_clean_response(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    fragment = "<score-partwise><part id=\"P1\"></part></score-partwise>"
    monkeypatch.setattr(
        scoreedit_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": fragment}}]}),
    )
    result = edit_measures("<score-partwise></score-partwise>", "make it forte")
    assert "<part id=\"P1\">" in result


def test_edit_measures_raises_on_non_200(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(scoreedit_client, "_call_groq", lambda body: _FakeResponse(500, text="boom"))
    with pytest.raises(ScoreEditError):
        edit_measures("<score-partwise></score-partwise>", "make it forte")


def test_edit_measures_raises_on_unparseable_content(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(
        scoreedit_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": "no xml here"}}]}),
    )
    with pytest.raises(ScoreEditError):
        edit_measures("<score-partwise></score-partwise>", "make it forte")


def test_edit_measures_raises_when_no_api_key_configured(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "groq_api_key", "")
    with pytest.raises(ScoreEditError):
        edit_measures("<score-partwise></score-partwise>", "make it forte")


def test_edit_measures_uses_misaki_first_and_never_calls_groq(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "misaki_llm_key", "test-misaki-key")
    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    fragment = "<score-partwise><part id=\"P1\"><measure>misaki</measure></part></score-partwise>"
    monkeypatch.setattr(
        scoreedit_client,
        "_call_misaki",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": fragment}}]}),
    )

    def _fail_if_called(body):
        raise AssertionError("Groq should never be called when Misaki succeeds")

    monkeypatch.setattr(scoreedit_client, "_call_groq", _fail_if_called)

    result = edit_measures("<score-partwise></score-partwise>", "make it forte")
    assert "misaki" in result


def test_edit_measures_falls_back_to_groq_when_misaki_fails(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "misaki_llm_key", "test-misaki-key")
    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")
    monkeypatch.setattr(scoreedit_client, "_call_misaki", lambda body: _FakeResponse(500, text="boom"))
    fragment = "<score-partwise><part id=\"P1\"><measure>groq</measure></part></score-partwise>"
    monkeypatch.setattr(
        scoreedit_client,
        "_call_groq",
        lambda body: _FakeResponse(200, {"choices": [{"message": {"content": fragment}}]}),
    )

    result = edit_measures("<score-partwise></score-partwise>", "make it forte")
    assert "groq" in result


def test_edit_measures_raises_when_misaki_fails_and_groq_not_configured(monkeypatch):
    from app.core.config import get_settings
    from app.scoreedit import client as scoreedit_client

    monkeypatch.setattr(get_settings(), "misaki_llm_key", "test-misaki-key")
    monkeypatch.setattr(get_settings(), "groq_api_key", "")
    monkeypatch.setattr(scoreedit_client, "_call_misaki", lambda body: _FakeResponse(500, text="boom"))

    with pytest.raises(ScoreEditError):
        edit_measures("<score-partwise></score-partwise>", "make it forte")


def test_groq_body_uses_reasoning_effort_low_and_the_configured_model():
    from app.core.config import get_settings
    from app.scoreedit.client import _groq_body

    body = _groq_body("<score-partwise></score-partwise>", "make it forte")
    assert body["reasoning_effort"] == "low"
    assert body["model"] == get_settings().groq_score_edit_model
    assert "make it forte" in body["messages"][1]["content"]


# --- route: POST /library/pieces/{id}/edit-measures --------------------------


def _stub_edit_measures(monkeypatch, replacement_xml: str):
    from app.api.routes.library import edit as edit_route

    monkeypatch.setattr(edit_route, "edit_measures", lambda fragment_xml, message: replacement_xml)


def test_edit_measures_route_happy_path_creates_an_unpublished_draft(client, monkeypatch):
    admin = _register_and_login(client, "scoreeditowner@example.com")
    group_id = _make_group(client, admin)
    piece_id, live_version_id = _upload_and_distribute_group_piece(client, admin, group_id)

    replacement = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""
    _stub_edit_measures(monkeypatch, replacement)

    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "make it a G instead"},
        headers=admin,
    )
    assert res.status_code == 201
    body = res.json()
    assert body["source"] == "modification"
    assert body["status"] == "draft"
    assert body["id"] != live_version_id

    file_res = client.get(f"/library/versions/{body['id']}/file", headers=admin)
    assert file_res.status_code == 200
    assert b">G<" in file_res.content

    entries = client.get("/library/pieces", headers=admin).json()
    entry = next(e for e in entries if e["piece_id"] == piece_id)
    assert entry["version_id"] == live_version_id
    assert entry["pending_generated_version_id"] == body["id"]


def test_edit_measures_route_rerun_rejects_the_stale_draft(client, monkeypatch, db_session):
    from app.db.models import PieceVersion

    headers = _register_and_login(client, "scoreeditrerun@example.com")
    piece_id, _original_version_id = _upload_musicxml_piece(client, headers)

    replacement = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""
    _stub_edit_measures(monkeypatch, replacement)

    body = {"measure_start": 1, "measure_end": 1, "message": "make it a G instead"}
    first = client.post(f"/library/pieces/{piece_id}/edit-measures", json=body, headers=headers).json()
    second = client.post(f"/library/pieces/{piece_id}/edit-measures", json=body, headers=headers).json()
    assert first["id"] != second["id"]
    assert second["status"] == "draft"

    stale = db_session.query(PieceVersion).filter(PieceVersion.id == first["id"]).one()
    assert stale.status.value == "rejected"


def test_edit_measures_route_edits_the_pending_draft_not_the_live_version(client, monkeypatch):
    """An AI edit complements whatever's currently being reviewed -- see
    `edit.py`'s own doc comment. With a draft already pending (from a
    first edit here, but the same is true of a "Generate lyrics" draft),
    a second edit must be based on THAT draft's content, not the
    unrelated live version underneath it."""
    from app.api.routes.library import edit as edit_route

    admin = _register_and_login(client, "scoreeditcomplement@example.com")
    group_id = _make_group(client, admin)
    piece_id, live_version_id = _upload_and_distribute_group_piece(client, admin, group_id)

    def _make_replacement(note: str) -> str:
        return f"""<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>{note}</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
</measure>
</part>
</score-partwise>"""

    body = {"measure_start": 1, "measure_end": 1, "message": "change the note"}

    _stub_edit_measures(monkeypatch, _make_replacement("G"))
    first = client.post(f"/library/pieces/{piece_id}/edit-measures", json=body, headers=admin).json()
    assert first["status"] == "draft"

    captured_fragments: list[str] = []
    monkeypatch.setattr(
        edit_route,
        "edit_measures",
        lambda fragment_xml, message: (captured_fragments.append(fragment_xml), _make_replacement("A"))[1],
    )
    second = client.post(f"/library/pieces/{piece_id}/edit-measures", json=body, headers=admin).json()
    assert second["status"] == "draft"
    assert second["id"] != first["id"]

    # The fragment sent for the second edit came from the first edit's own
    # draft (">G<"), not the untouched live version (">C<") -- proves the
    # route based this edit on the pending draft, not `live_version`.
    assert len(captured_fragments) == 1
    assert ">G<" in captured_fragments[0]
    assert ">C<" not in captured_fragments[0]

    # And the live version itself is still exactly what it always was --
    # neither edit ever touched it, only ever the draft chain above it.
    live_file = client.get(f"/library/versions/{live_version_id}/file", headers=admin)
    assert b">C<" in live_file.content


def test_edit_measures_route_requires_review_authority(client, monkeypatch):
    owner_headers = _register_and_login(client, "scoreeditowner2@example.com")
    stranger_headers = _register_and_login(client, "scoreeditstranger@example.com")
    piece_id, _ = _upload_musicxml_piece(client, owner_headers)

    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "make it forte"},
        headers=stranger_headers,
    )
    assert res.status_code == 403


def test_edit_measures_route_400s_when_measure_end_before_measure_start(client):
    headers = _register_and_login(client, "scoreeditbadrange@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 3, "measure_end": 1, "message": "make it forte"},
        headers=headers,
    )
    assert res.status_code == 400


def test_edit_measures_route_400s_with_no_message(client):
    headers = _register_and_login(client, "scoreeditnomessage@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "   "},
        headers=headers,
    )
    assert res.status_code == 400


def test_edit_measures_route_400s_when_measure_range_not_found(client):
    headers = _register_and_login(client, "scoreeditoutofrange@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    # `_upload_musicxml_piece`'s fixture MusicXML has just one measure.
    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 5, "measure_end": 5, "message": "make it forte"},
        headers=headers,
    )
    assert res.status_code == 400


def test_edit_measures_route_404s_with_no_music_file(client):
    headers = _register_and_login(client, "scoreeditnomusic@example.com")
    res = client.post(
        "/library/pieces",
        data={"title": "No music", "owner_type": "user"},
        files={"pdf_file": ("piece.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=headers,
    )
    piece_id = res.json()["piece"]["id"]

    edit = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "make it forte"},
        headers=headers,
    )
    assert edit.status_code == 404


def test_edit_measures_route_502s_when_groq_call_fails(client, monkeypatch):
    from app.api.routes.library import edit as edit_route

    headers = _register_and_login(client, "scoreeditgroqfail@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    def _raise(_fragment_xml, _message):
        raise ScoreEditError("upstream exploded")

    monkeypatch.setattr(edit_route, "edit_measures", _raise)
    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "make it forte"},
        headers=headers,
    )
    assert res.status_code == 502


def test_edit_measures_route_422s_on_a_shape_mismatch(client, monkeypatch):
    """The route surfaces `SpliceValidationError` (e.g. the AI tried to
    add a measure) as a clean 422, never a corrupted write."""
    headers = _register_and_login(client, "scoreeditbadshape@example.com")
    piece_id, _ = _upload_musicxml_piece(client, headers)

    two_measure_replacement = """<?xml version="1.0"?>
<score-partwise version="3.1">
<part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
<measure number="2">
<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
</measure>
</part>
</score-partwise>"""
    _stub_edit_measures(monkeypatch, two_measure_replacement)

    res = client.post(
        f"/library/pieces/{piece_id}/edit-measures",
        json={"measure_start": 1, "measure_end": 1, "message": "add an extra measure"},
        headers=headers,
    )
    assert res.status_code == 422
