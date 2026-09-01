"""B16 paged OMR: segmenting, the force-merge, and `run_omr_paged`'s
end-to-end shape with the engine stubbed per page (no Audiveris/oemer
install needed). Real `music21` throughout, not mocked.
"""

from __future__ import annotations

from pathlib import Path

from music21 import converter, note, stream

from app.omr import paged
from app.omr.paged import (
    PageResult,
    _segment_pages,
    merge_musicxml,
    run_omr_paged,
)


def _write_score(path: Path, parts: int, measures: int) -> Path:
    sc = stream.Score()
    for k in range(parts):
        p = stream.Part(id=f"P{k + 1}")
        for i in range(1, measures + 1):
            m = stream.Measure(number=i)
            m.append(note.Note("C4", quarterLength=4))
            p.append(m)
        sc.insert(0, p)
    path.parent.mkdir(parents=True, exist_ok=True)
    sc.write("musicxml", fp=str(path))
    return path


# --- merge_musicxml -------------------------------------------------------


def test_merge_renumbers_measures_end_to_end(tmp_path):
    p1 = _write_score(tmp_path / "p1.musicxml", parts=2, measures=3)
    p2 = _write_score(tmp_path / "p2.musicxml", parts=2, measures=2)

    out, _ = merge_musicxml([(1, p1), (2, p2)], tmp_path / "merged.musicxml")

    merged = converter.parse(str(out))
    parts = list(merged.parts)
    assert len(parts) == 2
    for part in parts:
        numbers = [m.number for m in part.getElementsByClass(stream.Measure)]
        assert numbers == [1, 2, 3, 4, 5]


def test_merge_rest_pads_a_part_that_appears_late(tmp_path):
    p1 = _write_score(tmp_path / "p1.musicxml", parts=2, measures=2)
    p2 = _write_score(tmp_path / "p2.musicxml", parts=3, measures=2)

    out, notes = merge_musicxml([(1, p1), (2, p2)], tmp_path / "merged.musicxml")

    merged = converter.parse(str(out))
    parts = list(merged.parts)
    assert len(parts) == 3
    # Every part is the same length after the merge (2 + 2 measures).
    for part in parts:
        assert len(part.getElementsByClass(stream.Measure)) == 4
    assert any("first appears here" in n for n in notes)


# --- _segment_pages -----------------------------------------------------


def _ok_page(tmp_path: Path, page: int, parts: int, measures: int) -> PageResult:
    xml = _write_score(tmp_path / f"page{page}.musicxml", parts, measures)
    return PageResult(page=page, ok=True, musicxml_path=xml)


def test_segments_group_by_matching_part_count(tmp_path):
    pages = [
        _ok_page(tmp_path, 1, parts=4, measures=3),
        _ok_page(tmp_path, 2, parts=4, measures=3),
        _ok_page(tmp_path, 3, parts=5, measures=3),
    ]

    segs = _segment_pages(pages)

    assert [s.pages for s in segs] == [[1, 2], [3]]
    assert segs[0].start_reason is None
    assert segs[0].boundary_measure is None
    # Pages 1 + 2 contribute 3 + 3 measures, so segment 2 opens at bar 7.
    assert segs[1].boundary_measure == 7
    assert "part(s)" in segs[1].start_reason


def test_a_failed_page_ends_the_run_and_names_itself(tmp_path):
    pages = [
        _ok_page(tmp_path, 1, parts=4, measures=2),
        PageResult(page=2, ok=False, error="audiveris failed (exit 1)"),
        _ok_page(tmp_path, 3, parts=4, measures=2),
    ]

    segs = _segment_pages(pages)

    assert [s.pages for s in segs] == [[1], [3]]
    assert segs[1].start_reason == "page 2 failed to transcribe"
    assert segs[1].boundary_measure == 3


# --- run_omr_paged (engine stubbed) -----------------------------------


def _stub_engine(monkeypatch, layout: dict[int, tuple[int, int]], total: int | None = None):
    """`layout` maps 1-based page number -> (parts, measures). A page not
    in the map raises, i.e. "that page failed to transcribe". `total` is
    how many pages the PDF has (default: the highest page in `layout`)."""
    page_total = total or max(layout)

    def fake_split_pages(source_path, work_dir):
        work_dir.mkdir(parents=True, exist_ok=True)
        return [work_dir / f"page-{i:02d}.pdf" for i in range(1, page_total + 1)]

    def fake_run_engine_on_page(page_pdf, page_dir, engine):
        n = int(Path(page_dir).name.lstrip("p"))
        if n not in layout:
            from app.omr.pipeline import OmrEngineError

            raise OmrEngineError(f"page {n} blew up")
        parts, measures = layout[n]
        return _write_score(page_dir / "page.musicxml", parts, measures)

    monkeypatch.setattr(paged, "split_pages", fake_split_pages)
    monkeypatch.setattr(paged, "_run_engine_on_page", fake_run_engine_on_page)


def test_all_pages_match_lands_one_segment_no_review(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 2: (4, 3), 3: (4, 3)})

    mx, mid, report = run_omr_paged(tmp_path / "src.pdf", tmp_path / "out")

    assert mx.is_file() and mid.is_file()
    assert report.needs_review is False
    assert len(report.segments) == 1
    assert report.segments[0].pages == [1, 2, 3]
    assert (tmp_path / "out" / "paged-report.json").is_file()


def test_part_count_change_needs_review_with_boundary(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 2: (4, 3), 3: (5, 3)})

    mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", tmp_path / "out")

    assert mx.is_file()
    assert report.needs_review is True
    assert [s.pages for s in report.segments] == [[1, 2], [3]]

    data = report.as_dict()
    assert data["unresolved_boundaries"] == [
        {
            "before_page": 3,
            "merged_measure": 7,
            "reason": report.segments[1].start_reason,
        }
    ]
    # Every clean page still made it into the provisional whole-score merge.
    merged = converter.parse(str(mx))
    assert max(len(p.getElementsByClass(stream.Measure)) for p in merged.parts) == 9


def test_one_failed_page_still_yields_the_rest(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 3: (4, 3)})  # page 2 missing -> fails

    mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", tmp_path / "out")

    assert mx.is_file()
    assert report.failed_pages == [2]
    assert report.needs_review is True
    assert [s.pages for s in report.segments] == [[1], [3]]
