"""Page-by-page OMR: split the PDF into one-page PDFs, run the engine on
each independently, then merge the per-page MusicXML.

Why bother: Audiveris treats a multi-page PDF as a single "book" and
refuses to export *anything* if one page crashes a step (the RHYTHMS-step
NullPointerException is a common one). Running each page as its own book
isolates that: a bad page fails alone and the rest still produce output.

The merge only joins pages where the join is *obvious*: consecutive pages
with the same number of parts, matched top-to-bottom by position, with
measures renumbered end-to-end. A run of such pages becomes one
"segment". Where the join is not obvious — the part count changes, a
part appears or vanishes, or a page failed / has no measures — the merge
stops and a new segment begins. Those boundaries are left for a human to
resolve later (see Frontend F15, which overlays them in the editor)
rather than guessed at.

Output (in `output_dir`):
  - `pages/pNN/` — each page's own transcription + engine log.
  - `segments/segment-NN.musicxml` + `.mid` — one per confident run,
    with the page range and the reason the previous segment ended.
  - `score.musicxml` + `score.mid` — if everything landed in a single
    segment, that segment. Otherwise a *provisional* whole-score merge
    (all pages force-joined by position, short parts rest-padded) so
    there's still something to hand downstream, flagged `needs_review`.
    This is the file B16's job runner auto-imports as the draft.
  - `paged-report.json` — the full breakdown.

Ties / slurs / directions that spanned a page break are lost regardless.

Ported from the standalone `omr-local` tool (`omr_local/paged.py`), which
validated the approach against a real 21-page choral scan (20/21 pages
recovered into 4 segments). Adapted here to `get_settings()` and divisi's
two-arg engine signature.
"""

from __future__ import annotations

import copy
import json
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf
from music21 import converter, note, stream

from app.omr.audiveris import OmrEngineError, OmrEngineUnavailable
from app.omr.pipeline import _ENGINES, _musicxml_to_midi, _normalize_to_musicxml

__all__ = ["PageResult", "Segment", "PagedReport", "run_omr_paged", "rerun_page"]

# Deterministic filename every page's normalized MusicXML is copied to
# inside its `pages/pNN/` dir, so a later re-run (B17 `rerun_page`) can
# find the other pages' output without re-parsing the report for paths.
_PAGE_XML_NAME = "page.musicxml"


@dataclass
class PageResult:
    page: int  # 1-based
    ok: bool
    musicxml_path: Path | None = None
    error: str | None = None
    # Where this page's bars land in the provisional whole-score merge
    # (`score.musicxml`), same 1-based numbering as `Segment.boundary_measure`.
    # `_finalize_paged_run` fills these in from the actual merge, so a
    # failed page gets `measure_count == 0` and a `start_measure` equal to
    # the next real page's (an anchor for "insert N bars" in Frontend F19).
    start_measure: int | None = None
    measure_count: int | None = None


@dataclass
class Segment:
    index: int  # 1-based
    pages: list[int]  # page numbers merged into this segment
    parts: int  # part count shared by every page in the segment
    musicxml_path: Path | None = None
    midi_path: Path | None = None
    # Why the *previous* segment ended and this one began. None for the
    # first segment. This is the "not obvious" bit left for a human.
    start_reason: str | None = None
    # 1-based measure number in the provisional whole-score merge where
    # this segment begins. None for the first segment. The anchor the
    # editor maps to an onset to place a seam marker (Frontend F15).
    boundary_measure: int | None = None

    def as_dict(self, base: Path) -> dict:
        return {
            "index": self.index,
            "pages": self.pages,
            "parts": self.parts,
            "start_reason": self.start_reason,
            "boundary_measure": self.boundary_measure,
            "musicxml": str(self.musicxml_path.relative_to(base)) if self.musicxml_path else None,
            "midi": str(self.midi_path.relative_to(base)) if self.midi_path else None,
        }


@dataclass
class PagedReport:
    pages: list[PageResult] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    # True when the pages did not all merge into one segment, i.e. at
    # least one page boundary needs a human to decide how (or whether) to
    # join it. `score.musicxml` is then only a provisional guess.
    needs_review: bool = False
    output_dir: Path | None = None
    # Set when even the provisional whole-score merge could not be
    # written (malformed OMR output). The segment files may still be fine.
    combined_error: str | None = None

    @property
    def ok_count(self) -> int:
        return sum(1 for p in self.pages if p.ok)

    @property
    def failed_pages(self) -> list[int]:
        return [p.page for p in self.pages if not p.ok]

    def as_dict(self) -> dict:
        base = self.output_dir or Path(".")
        return {
            "total": len(self.pages),
            "ok": self.ok_count,
            "failed_pages": self.failed_pages,
            "needs_review": self.needs_review,
            "combined_error": self.combined_error,
            "segments": [s.as_dict(base) for s in self.segments],
            "unresolved_boundaries": [
                {
                    "before_page": s.pages[0],
                    "merged_measure": s.boundary_measure,
                    "reason": s.start_reason,
                }
                for s in self.segments[1:]
            ],
            "pages": [
                {
                    "page": p.page,
                    "ok": p.ok,
                    "error": p.error,
                    "start_measure": p.start_measure,
                    "measure_count": p.measure_count,
                }
                for p in self.pages
            ],
        }


def split_pages(source_path: Path, work_dir: Path) -> list[Path]:
    """One single-page PDF per page of `source_path`, written into
    `work_dir`. A non-PDF (plain image) is returned as-is, single item."""
    if source_path.suffix.lower() != ".pdf":
        return [source_path]

    work_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(source_path)
    try:
        out: list[Path] = []
        for i in range(doc.page_count):
            one = pymupdf.open()
            one.insert_pdf(doc, from_page=i, to_page=i)
            page_pdf = work_dir / f"page-{i + 1:02d}.pdf"
            one.save(page_pdf)
            one.close()
            out.append(page_pdf)
        return out
    finally:
        doc.close()


def _run_engine_on_page(page_pdf: Path, page_dir: Path, engine: str) -> Path:
    """Run the chosen engine on one page and return its normalized
    `.musicxml`, copied to a deterministic name (`_PAGE_XML_NAME`) in
    `page_dir`. Raises `OmrEngineUnavailable` if the engine binary is
    missing (caller aborts), `OmrEngineError` if the page fails to parse
    (caller records and continues)."""
    if engine not in _ENGINES:
        raise ValueError(f"Unknown OMR engine '{engine}'")
    raw = _ENGINES[engine](page_pdf, page_dir)
    xml = _normalize_to_musicxml(raw, page_dir)
    final = page_dir / _PAGE_XML_NAME
    if xml.resolve() != final.resolve():
        final.write_bytes(xml.read_bytes())
    return final


def _transcribe_page(page: int, page_pdf: Path, page_dir: Path, engine: str) -> PageResult:
    """One page through the engine, as a `PageResult`. `OmrEngineUnavailable`
    propagates (the whole run can't proceed); any other failure is recorded
    on the result so the rest of the book still produces output."""
    page_dir.mkdir(parents=True, exist_ok=True)
    try:
        xml = _run_engine_on_page(page_pdf, page_dir, engine)
    except OmrEngineUnavailable:
        raise
    except OmrEngineError as exc:
        return PageResult(page=page, ok=False, error=str(exc))
    except Exception as exc:  # noqa: BLE001 - one page's failure must not sink the rest
        return PageResult(page=page, ok=False, error=repr(exc))
    return PageResult(page=page, ok=True, musicxml_path=xml)


def _full_measure_rest(number: int) -> stream.Measure:
    """A placeholder empty bar for a page/part that produced nothing.
    A plain whole rest, which every MusicXML consumer renders as an empty
    measure — deliberately not trying to match the real bar length, since
    an arbitrary quarterLength is often not expressible as a single rest
    and this is only a marker anyway."""
    m = stream.Measure(number=number)
    r = note.Rest(type="whole")
    r.fullMeasure = True
    m.append(r)
    return m


def _part_count(page_xml: Path) -> int:
    return len(list(converter.parse(str(page_xml)).parts))


def merge_musicxml(
    page_musicxml: list[tuple[int, Path]], out_path: Path
) -> tuple[Path, list[str], dict[int, int]]:
    """Force-merge per-page MusicXML files (in page order) into one score
    at `out_path`, matching parts by position and rest-padding short or
    absent ones so every part stays the same length.

    Used two ways: within a segment, where every page has the same part
    count and this is exact; and for the whole-score *provisional* merge,
    where it papers over the boundaries `run_omr_paged` chose not to
    resolve. `page_musicxml` is `(page_number, xml_path)` pairs. Returns
    `(out_path, notes, per_page_measures)` — `per_page_measures` maps each
    input page number to how many bars it contributed to this merge (0 for
    a page with no detectable measures), so the caller can tile page
    offsets over the result. `sum(per_page_measures.values())` equals the
    measure count of `out_path`."""
    merged = stream.Score()
    canonical: list[stream.Part] = []
    review: list[str] = []
    per_page_measures: dict[int, int] = {}
    prev_part_count: int | None = None
    # Measures every canonical part is expected to hold after each page,
    # so a part that first shows up on a later page can be back-filled to
    # line up, and every part stays the same length.
    total_measures = 0

    for page_no, page_xml in page_musicxml:
        page_score = converter.parse(str(page_xml))
        page_parts = list(page_score.parts)
        page_measure_counts = [
            len(p.getElementsByClass(stream.Measure)) for p in page_parts
        ]
        page_len = max(page_measure_counts, default=0)
        if page_len == 0:
            review.append(f"page {page_no}: no measures detected, skipped in merge")
            per_page_measures[page_no] = 0
            continue

        if prev_part_count is not None and len(page_parts) != prev_part_count:
            review.append(
                f"page {page_no}: {len(page_parts)} part(s) vs {prev_part_count} on the page "
                f"before — matched by position, check the seam"
            )
        prev_part_count = len(page_parts)

        # Grow the canonical part list if this page found more parts,
        # back-filling the newcomer so it lines up with the pages before.
        while len(canonical) < len(page_parts):
            src = page_parts[len(canonical)]
            cp = stream.Part()
            src_id = src.id if isinstance(src.id, str) else None
            cp.id = src_id or f"P{len(canonical) + 1}"
            inst = src.getInstrument(returnDefault=False)
            if inst is not None:
                cp.insert(0, copy.deepcopy(inst))
            for _ in range(total_measures):
                cp.append(_full_measure_rest(0))
            if total_measures:
                review.append(
                    f"page {page_no}: part {len(canonical) + 1} first appears here; "
                    f"{total_measures} earlier measure(s) padded for it"
                )
            canonical.append(cp)
            merged.insert(0, cp)

        for idx, cp in enumerate(canonical):
            got = 0
            if idx < len(page_parts):
                measures = list(page_parts[idx].getElementsByClass(stream.Measure))
                for m in measures:
                    # Deep-copy: appending a live Measure that still belongs
                    # to the parsed page Stream makes music21's writer blow
                    # up ("object already found in this Stream") when it
                    # re-runs makeRests/makeTies over the merged score.
                    cp.append(copy.deepcopy(m))
                got = len(measures)
            else:
                review.append(
                    f"page {page_no}: part {idx + 1} absent here, padded {page_len} empty measure(s)"
                )
            for _ in range(page_len - got):
                cp.append(_full_measure_rest(0))

        per_page_measures[page_no] = page_len
        total_measures += page_len

    # Cumulative, gap-free measure numbers.
    for cp in canonical:
        for n, m in enumerate(cp.getElementsByClass(stream.Measure), start=1):
            m.number = n

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # makeNotation=False: the measures came from Audiveris/oemer already
    # fully notated. Letting music21 re-run makeRests/makeTies over the
    # stitched score both wastes time and crashes on measures whose
    # duration doesn't match their contents (common in a rough OMR page).
    merged.write("musicxml", fp=str(out_path), makeNotation=False)
    return out_path, review, per_page_measures


def _page_len(page_xml: Path) -> int:
    """Measure count a page contributes to the merge: the longest part on
    it (parts on a rough page can disagree; the merge rest-pads to this)."""
    score = converter.parse(str(page_xml))
    return max(
        (len(p.getElementsByClass(stream.Measure)) for p in score.parts), default=0
    )


def _segment_pages(page_results: list[PageResult]) -> list[Segment]:
    """Group the successful pages into runs that merge obviously: same
    part count, no failed/empty page in between. Each break records why,
    and `boundary_measure` — the 1-based measure number in the provisional
    whole-score merge where the new segment's first page begins, so the
    editor can anchor a seam marker there."""
    segments: list[Segment] = []
    cur: Segment | None = None
    pending_reason: str | None = None
    # Cumulative `_page_len` of every clean page already assigned to a
    # segment, in provisional-merge numbering.
    measures_so_far = 0

    for pr in page_results:
        if not pr.ok or pr.musicxml_path is None:
            if cur is not None:
                segments.append(cur)
                cur = None
            pending_reason = f"page {pr.page} failed to transcribe"
            continue

        try:
            n = _part_count(pr.musicxml_path)
            plen = _page_len(pr.musicxml_path)
        except Exception:  # noqa: BLE001 - unreadable page output -> treat like a failed page
            if cur is not None:
                segments.append(cur)
                cur = None
            pending_reason = f"page {pr.page} produced unreadable MusicXML"
            continue

        if plen == 0:
            if cur is not None:
                segments.append(cur)
                cur = None
            pending_reason = f"page {pr.page} has no measures"
            continue

        if cur is not None and n == cur.parts:
            cur.pages.append(pr.page)
            measures_so_far += plen
            continue

        if cur is not None:
            segments.append(cur)
        reason = pending_reason
        if reason is None and cur is not None:
            reason = (
                f"page {pr.page} has {n} part(s), the run before it had {cur.parts} "
                f"— how they line up is a judgement call"
            )
        first_segment = not segments
        cur = Segment(
            index=len(segments) + 1,
            pages=[pr.page],
            parts=n,
            start_reason=None if first_segment else reason,
            boundary_measure=None if first_segment else measures_so_far + 1,
        )
        pending_reason = None
        measures_so_far += plen

    if cur is not None:
        segments.append(cur)
    return segments


def _page_dir(output_dir: Path, page: int) -> Path:
    return output_dir / "pages" / f"p{page:02d}"


def _split_page_pdf(output_dir: Path, page: int) -> Path:
    """The one-page PDF `split_pages` wrote for `page`, still on disk from
    the original run (`pages/page-NN.pdf`). B17 per-page re-run feeds this
    back through the engine without re-splitting the source."""
    return output_dir / "pages" / f"page-{page:02d}.pdf"


def _assign_page_offsets(pages: list[PageResult], per_page_measures: dict[int, int]) -> None:
    """Set `start_measure` (1-based) / `measure_count` on every page from
    `per_page_measures` (page number -> bars it put into the provisional
    whole-score merge). Walking in page order makes the offsets tile the
    merge with no gaps or overlaps; a page absent from the map (it failed,
    or the merge dropped it) counts 0 and inherits the running offset, so
    its `start_measure` is exactly where the next real page begins.

    When `per_page_measures` is empty the whole-score merge failed (malformed
    OMR output). There is no real tiling to write, so leave every page's
    offsets unset rather than writing a degenerate "start 1, span 0" report,
    which Frontend F19 would take at face value and collapse every page onto
    bar 1."""
    if not per_page_measures:
        return
    running = 1
    for p in pages:
        count = per_page_measures.get(p.page, 0)
        p.start_measure = running
        p.measure_count = count
        running += count


def _finalize_paged_run(
    report: PagedReport, output_dir: Path
) -> tuple[Path | None, Path | None]:
    """Given `report.pages` (every page's `PageResult`), (re)build
    everything derived from them: the segment groupings + files, the
    provisional whole-score `score.musicxml`/`score.mid`, `needs_review`,
    and `paged-report.json`. Returns `(score_musicxml, score_midi)` — the
    musicxml is None only when even the force-merge failed. Used by both
    the initial run and `rerun_page`."""
    seg_dir = output_dir / "segments"
    good_pairs: list[tuple[int, Path]] = [
        (p.page, p.musicxml_path) for p in report.pages if p.ok and p.musicxml_path
    ]
    page_xml = {p.page: p.musicxml_path for p in report.pages if p.ok and p.musicxml_path}

    def _safe_merge(
        pairs: list[tuple[int, Path]], xml_out: Path, midi_name: str
    ) -> tuple[Path | None, Path | None, str | None, dict[int, int]]:
        """Merge + derive MIDI, but never let one bad page abort the run.
        Returns `(musicxml, midi, error, per_page_measures)` — paths None
        and error set when the merge or MIDI step blew up on malformed OMR
        output; `per_page_measures` is empty then too."""
        try:
            mx, _, per_page = merge_musicxml(pairs, xml_out)
        except Exception as exc:  # noqa: BLE001
            return None, None, f"merge failed: {exc}", {}
        try:
            _musicxml_to_midi(mx, xml_out.parent)  # writes <dir>/score.mid
            md = (xml_out.parent / "score.mid").replace(xml_out.parent / midi_name)
        except Exception as exc:  # noqa: BLE001
            return mx, None, f"MIDI derivation failed: {exc}", per_page
        return mx, md, None, per_page

    # Old segment files from a prior run would mislead the report if this
    # run produces fewer segments — clear and rewrite.
    if seg_dir.exists():
        shutil.rmtree(seg_dir)

    segments = _segment_pages(report.pages)
    for seg in segments:
        seg_pairs = [(pg, page_xml[pg]) for pg in seg.pages]
        mx, md, err, _ = _safe_merge(
            seg_pairs,
            seg_dir / f"segment-{seg.index:02d}.musicxml",
            f"segment-{seg.index:02d}.mid",
        )
        seg.musicxml_path, seg.midi_path = mx, md
        if err:
            seg.start_reason = (seg.start_reason + "; " if seg.start_reason else "") + err

    report.segments = segments
    report.needs_review = (
        bool(report.failed_pages)
        or len(segments) > 1
        or any(s.musicxml_path is None for s in segments)
    )

    report.combined_error = None
    musicxml_path, midi_path, combined_err, page_measures = _safe_merge(
        good_pairs, output_dir / "score.musicxml", "score.mid"
    )
    if combined_err:
        report.combined_error = combined_err

    # Tile the provisional whole-score merge across every page (failed
    # ones included) so Frontend F19 can scroll to a page's bar range
    # without counting `<measure>`s itself.
    _assign_page_offsets(report.pages, page_measures)

    (output_dir / "paged-report.json").write_text(
        json.dumps(report.as_dict(), indent=2), encoding="utf-8"
    )
    return musicxml_path, midi_path


def run_omr_paged(
    source_path: Path,
    output_dir: Path,
    engine: str | None = None,
    on_page_done: Callable[[int, int], None] | None = None,
) -> tuple[Path, Path, PagedReport]:
    """Split `source_path` per page, OMR each page, merge the obvious
    runs, and leave the non-obvious boundaries as separate segments for a
    human. Returns `(musicxml_path, midi_path, report)` inside
    `output_dir`; `report.needs_review` is True when there is more than
    one segment (so `score.musicxml` is only a provisional guess).

    `on_page_done(done, total)` — if given — is called after each page is
    transcribed (success or failure), for a best-effort progress readout
    (B17). It must not raise.

    Paged mode is Audiveris-only. If the engine binary isn't installed,
    `OmrEngineUnavailable` propagates so the caller can fall back to the
    single-run pipeline.
    """
    chosen = engine or "audiveris"
    output_dir.mkdir(parents=True, exist_ok=True)

    page_pdfs = split_pages(source_path, output_dir / "pages")
    total = len(page_pdfs)
    report = PagedReport(output_dir=output_dir)

    for i, page_pdf in enumerate(page_pdfs, start=1):
        report.pages.append(_transcribe_page(i, page_pdf, _page_dir(output_dir, i), chosen))
        if on_page_done is not None:
            on_page_done(i, total)

    if not any(p.ok for p in report.pages):
        raise OmrEngineError(
            f"paged run: every page failed ({total} pages). "
            f"See pages/*/audiveris.log or oemer.log."
        )

    musicxml_path, midi_path = _finalize_paged_run(report, output_dir)
    if musicxml_path is None:
        # Nothing merged, but the per-page and per-segment files are on
        # disk — surface that rather than a bare traceback.
        raise OmrEngineError(
            f"paged run: pages transcribed but no merge succeeded ({report.combined_error}). "
            f"Per-page MusicXML is in {output_dir / 'pages'}/."
        )
    return musicxml_path, midi_path, report


def _reload_page_results(output_dir: Path) -> list[PageResult]:
    """Reconstruct every page's `PageResult` from what the original run
    left on disk: the stored `paged-report.json` for the page list + each
    failed page's error text, and each `pages/pNN/page.musicxml` for the
    ones that succeeded."""
    report_path = output_dir / "paged-report.json"
    if not report_path.is_file():
        raise FileNotFoundError(report_path)
    prior = json.loads(report_path.read_text(encoding="utf-8"))

    results: list[PageResult] = []
    for entry in prior.get("pages", []):
        page = entry["page"]
        xml = _page_dir(output_dir, page) / _PAGE_XML_NAME
        if xml.is_file():
            results.append(PageResult(page=page, ok=True, musicxml_path=xml))
        else:
            results.append(
                PageResult(page=page, ok=False, error=entry.get("error") or "page failed to transcribe")
            )
    return results


def rerun_page(
    output_dir: Path, page_no: int, engine: str | None = None
) -> tuple[PageResult, PagedReport]:
    """Re-transcribe a single page of a finished paged run, reusing the
    one-page PDF still on disk (`pages/page-NN.pdf`), then rebuild the
    segments, the provisional whole-score merge, and `paged-report.json`
    from the updated per-page set. Returns `(the page's new PageResult,
    the rebuilt PagedReport)`.

    Raises `FileNotFoundError` if the split PDF or the prior report is
    gone, `ValueError` if `page_no` isn't a page of this run,
    `OmrEngineUnavailable` if the engine binary is missing.
    """
    chosen = engine or "audiveris"
    page_pdf = _split_page_pdf(output_dir, page_no)
    if not page_pdf.is_file():
        raise FileNotFoundError(page_pdf)

    results = _reload_page_results(output_dir)
    if not any(r.page == page_no for r in results):
        raise ValueError(f"page {page_no} is not part of this run")

    page_dir = _page_dir(output_dir, page_no)
    if page_dir.exists():
        shutil.rmtree(page_dir)
    new_pr = _transcribe_page(page_no, page_pdf, page_dir, chosen)

    results = sorted(
        [r for r in results if r.page != page_no] + [new_pr], key=lambda r: r.page
    )
    report = PagedReport(output_dir=output_dir, pages=results)
    _finalize_paged_run(report, output_dir)
    return new_pr, report
