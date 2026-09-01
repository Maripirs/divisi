"""B16 paged OMR: segmenting, the force-merge, and `run_omr_paged`'s
end-to-end shape with the engine stubbed per page (no Audiveris/oemer
install needed). Real `music21` throughout, not mocked.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from music21 import converter, note, stream

from app.omr import paged
from app.omr.paged import (
    PageResult,
    _segment_pages,
    merge_musicxml,
    rerun_page,
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

    out, _, per_page = merge_musicxml([(1, p1), (2, p2)], tmp_path / "merged.musicxml")

    merged = converter.parse(str(out))
    parts = list(merged.parts)
    assert len(parts) == 2
    for part in parts:
        numbers = [m.number for m in part.getElementsByClass(stream.Measure)]
        assert numbers == [1, 2, 3, 4, 5]
    # Per-page bar counts tile the merged score.
    assert per_page == {1: 3, 2: 2}
    assert sum(per_page.values()) == 5


def test_merge_rest_pads_a_part_that_appears_late(tmp_path):
    p1 = _write_score(tmp_path / "p1.musicxml", parts=2, measures=2)
    p2 = _write_score(tmp_path / "p2.musicxml", parts=3, measures=2)

    out, notes, _ = merge_musicxml([(1, p1), (2, p2)], tmp_path / "merged.musicxml")

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
        pdfs = []
        for i in range(1, page_total + 1):
            p = work_dir / f"page-{i:02d}.pdf"
            p.write_bytes(b"%PDF-1.4 fake page")
            pdfs.append(p)
        return pdfs

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


# --- B17: per-page progress + per-page re-run --------------------------


def test_on_page_done_fires_once_per_page(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 2: (4, 3), 3: (4, 3)})
    calls: list[tuple[int, int]] = []

    run_omr_paged(
        tmp_path / "src.pdf", tmp_path / "out", on_page_done=lambda d, t: calls.append((d, t))
    )

    assert calls == [(1, 3), (2, 3), (3, 3)]


def test_rerun_page_recovers_a_failed_page_and_rewrites_the_report(tmp_path, monkeypatch):
    layout = {1: (4, 3), 2: (4, 3)}  # page 3 absent -> fails on the first run
    _stub_engine(monkeypatch, layout, total=3)
    out = tmp_path / "out"

    _mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", out)
    assert report.failed_pages == [3]
    assert report.needs_review is True

    layout[3] = (4, 2)  # now it transcribes, matching part count
    new_pr, rebuilt = rerun_page(out, 3)

    assert new_pr.ok is True
    assert rebuilt.failed_pages == []
    assert rebuilt.needs_review is False
    on_disk = json.loads((out / "paged-report.json").read_text())
    assert on_disk["failed_pages"] == []
    assert on_disk["ok"] == 3
    assert len(on_disk["segments"]) == 1


def test_rerun_page_that_still_fails_keeps_needs_review(tmp_path, monkeypatch):
    layout = {1: (4, 3), 2: (4, 3)}  # page 3 stays broken
    _stub_engine(monkeypatch, layout, total=3)
    out = tmp_path / "out"
    run_omr_paged(tmp_path / "src.pdf", out)

    new_pr, rebuilt = rerun_page(out, 3)

    assert new_pr.ok is False
    assert rebuilt.failed_pages == [3]
    assert rebuilt.needs_review is True


def test_rerun_page_out_of_range_raises(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 2: (4, 3)}, total=2)
    out = tmp_path / "out"
    run_omr_paged(tmp_path / "src.pdf", out)

    with pytest.raises(FileNotFoundError):
        rerun_page(out, 9)


# --- B18: per-page measure offsets in the report ----------------------


def _report_pages(report) -> list[dict]:
    return report.as_dict()["pages"]


def test_page_offsets_tile_the_provisional_merge(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 2: (4, 2), 3: (4, 4)})

    mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", tmp_path / "out")

    pages = _report_pages(report)
    assert [(p["start_measure"], p["measure_count"]) for p in pages] == [
        (1, 3),
        (4, 2),
        (6, 4),
    ]
    # No gaps or overlaps: each page starts where the previous one ended.
    for prev, nxt in zip(pages, pages[1:]):
        assert nxt["start_measure"] == prev["start_measure"] + prev["measure_count"]
    # And the counts sum to the measure count of `score.musicxml`.
    merged = converter.parse(str(mx))
    merge_len = max(len(p.getElementsByClass(stream.Measure)) for p in merged.parts)
    assert sum(p["measure_count"] for p in pages) == merge_len


def test_failed_page_gets_zero_count_at_the_next_pages_start(tmp_path, monkeypatch):
    _stub_engine(monkeypatch, {1: (4, 3), 3: (4, 3)}, total=3)  # page 2 fails

    _mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", tmp_path / "out")

    by_page = {p["page"]: p for p in _report_pages(report)}
    assert by_page[2]["measure_count"] == 0
    assert by_page[2]["start_measure"] == by_page[3]["start_measure"] == 4


def test_rerun_page_rewrites_downstream_offsets(tmp_path, monkeypatch):
    layout = {1: (4, 3), 3: (4, 2)}  # page 2 fails on the first run
    _stub_engine(monkeypatch, layout, total=3)
    out = tmp_path / "out"

    _mx, _mid, report = run_omr_paged(tmp_path / "src.pdf", out)
    before = {p["page"]: p["start_measure"] for p in _report_pages(report)}
    assert before == {1: 1, 2: 4, 3: 4}

    layout[2] = (4, 4)  # now page 2 transcribes with 4 bars
    _new_pr, rebuilt = rerun_page(out, 2)

    pages = {p["page"]: p for p in _report_pages(rebuilt)}
    assert (pages[2]["start_measure"], pages[2]["measure_count"]) == (4, 4)
    # Page 3 shifted from bar 4 to bar 8 now that page 2 contributes 4 bars.
    assert pages[3]["start_measure"] == 8
    on_disk = json.loads((out / "paged-report.json").read_text())
    assert [p["start_measure"] for p in on_disk["pages"]] == [1, 4, 8]
