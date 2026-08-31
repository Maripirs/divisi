"""Unit tests for app/omr/{pipeline,oemer}.py that don't need a real
Audiveris/oemer install: MusicXML normalization, MusicXML->MIDI
conversion (real music21, not mocked), PDF page rasterization (real
PyMuPDF, not mocked), and the engine-selection/fallback logic (with the
actual engine calls monkeypatched — deliberately, not because the real
binaries are unavailable; either or both may be installed on a given dev
machine now, see Backend/README.md's OMR engines section).
"""

import zipfile
from pathlib import Path

import pymupdf
import pytest
from music21 import note, stream

from app.omr import pipeline
from app.omr.audiveris import OmrEngineError, OmrEngineUnavailable
from app.omr.oemer import _rasterize_first_page


def _write_test_musicxml(path: Path) -> None:
    s = stream.Stream()
    s.append(note.Note("C4", quarterLength=1))
    s.append(note.Note("D4", quarterLength=1))
    s.write("musicxml", fp=str(path))


def test_normalize_to_musicxml_passes_through_plain_files(tmp_path):
    xml_path = tmp_path / "score.musicxml"
    _write_test_musicxml(xml_path)

    result = pipeline._normalize_to_musicxml(xml_path, tmp_path)

    assert result == xml_path


def test_normalize_to_musicxml_extracts_compressed_mxl(tmp_path):
    inner_xml = tmp_path / "inner.musicxml"
    _write_test_musicxml(inner_xml)

    mxl_path = tmp_path / "score.mxl"
    with zipfile.ZipFile(mxl_path, "w") as zf:
        zf.writestr("META-INF/container.xml", "<container/>")
        zf.writestr("score.xml", inner_xml.read_text())

    output_dir = tmp_path / "out"
    output_dir.mkdir()
    result = pipeline._normalize_to_musicxml(mxl_path, output_dir)

    assert result == output_dir / "score.musicxml"
    assert b"<score-partwise" in result.read_bytes()


def test_normalize_to_musicxml_rejects_empty_mxl(tmp_path):
    mxl_path = tmp_path / "empty.mxl"
    with zipfile.ZipFile(mxl_path, "w") as zf:
        zf.writestr("META-INF/container.xml", "<container/>")

    with pytest.raises(OmrEngineError):
        pipeline._normalize_to_musicxml(mxl_path, tmp_path)


def test_musicxml_to_midi_produces_a_real_midi_file(tmp_path):
    xml_path = tmp_path / "score.musicxml"
    _write_test_musicxml(xml_path)

    midi_path = pipeline._musicxml_to_midi(xml_path, tmp_path)

    assert midi_path.exists()
    assert midi_path.read_bytes()[:4] == b"MThd"


def test_rasterize_first_page_produces_a_png(tmp_path):
    pdf_path = tmp_path / "blank.pdf"
    doc = pymupdf.open()
    doc.new_page()
    doc.save(str(pdf_path))
    doc.close()

    image_path = _rasterize_first_page(pdf_path, tmp_path)

    assert image_path.exists()
    assert image_path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_run_omr_falls_through_when_first_engine_unavailable(tmp_path, monkeypatch):
    calls = []

    def fake_audiveris(source_path, output_dir):
        calls.append("audiveris")
        raise OmrEngineUnavailable("not installed")

    def fake_oemer(source_path, output_dir):
        calls.append("oemer")
        xml_path = output_dir / "score.musicxml"
        _write_test_musicxml(xml_path)
        return xml_path

    monkeypatch.setitem(pipeline._ENGINES, "audiveris", fake_audiveris)
    monkeypatch.setitem(pipeline._ENGINES, "oemer", fake_oemer)

    musicxml_path, midi_path = pipeline.run_omr(tmp_path / "in.pdf", tmp_path, engine="audiveris")

    assert calls == ["audiveris", "oemer"]
    assert musicxml_path.exists()
    assert midi_path.exists()


def test_run_omr_does_not_fall_through_on_a_real_engine_error(tmp_path, monkeypatch):
    calls = []

    def fake_audiveris(source_path, output_dir):
        calls.append("audiveris")
        raise OmrEngineError("garbled scan, could not transcribe")

    def fake_oemer(source_path, output_dir):
        calls.append("oemer")
        raise AssertionError("should never be reached — a real parse failure must not be masked")

    monkeypatch.setitem(pipeline._ENGINES, "audiveris", fake_audiveris)
    monkeypatch.setitem(pipeline._ENGINES, "oemer", fake_oemer)

    with pytest.raises(OmrEngineError):
        pipeline.run_omr(tmp_path / "in.pdf", tmp_path, engine="audiveris")

    assert calls == ["audiveris"]


def test_run_omr_raises_when_no_engine_is_installed(tmp_path, monkeypatch):
    # Force the "nothing on PATH" branch deterministically rather than
    # relying on neither binary actually being installed — that's no
    # longer a safe assumption on every dev machine (see Backend/README.md's
    # OMR engines section), so a real local install shouldn't break this.
    monkeypatch.setattr("shutil.which", lambda name: None)
    with pytest.raises(OmrEngineUnavailable):
        pipeline.run_omr(tmp_path / "in.pdf", tmp_path)


def test_run_omr_rejects_unknown_engine_name(tmp_path):
    with pytest.raises(ValueError):
        pipeline.run_omr(tmp_path / "in.pdf", tmp_path, engine="ocrolus")
