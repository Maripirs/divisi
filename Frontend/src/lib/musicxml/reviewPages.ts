/**
 * F19: page-by-page review of a generated draft.
 *
 * A paged OMR run (`Backend/app/omr/paged.py`) transcribes a multi-page PDF one
 * page at a time and merges the pages into one provisional whole-score draft.
 * The `/paged-report` for that run lists every source page with the bar range it
 * contributed to the merge (`start_measure` / `measure_count`, B18). This module
 * turns that list into the model the editor's Pages step walks: one entry per
 * page, its bar range, and its review status.
 *
 * Pure functions only (no runes, no DOM) so this unit-tests under the node
 * vitest config, same as `editHistory.ts`.
 */

import type { PagedReport } from '$lib/server/backendTypes';

/** One source page, with where its bars landed in the provisional merge.
 * `startMeasure` is 1-based; a failed page has `measureCount === 0` and
 * `startMeasure` pointing at where the next real page begins (the anchor an
 * "insert N bars" fill uses). */
export type ReviewPageRaw = {
	page: number;
	ok: boolean;
	startMeasure: number;
	measureCount: number;
};

/** Client-side review status of a page. `skipped` is a deliberate "move on
 * without approving" — it unlocks the Seams step but still blocks Publish, so
 * it renders like `untouched` but is a distinct state. */
export type PageStatus = 'approved' | 'failed' | 'review' | 'untouched';

/** Build the review-page list from a paged report. Uses B18's per-page
 * `start_measure` / `measure_count` when present; on an older report (both
 * null) it walks a running 1-based offset from the counts so the list still
 * covers the score end to end. */
export function mapReport(pages: PagedReport['pages']): ReviewPageRaw[] {
	let running = 1;
	return pages.map((p) => {
		const count = p.measure_count ?? 0;
		const start = p.start_measure ?? running;
		running = start + count;
		return { page: p.page, ok: p.ok, startMeasure: Math.max(1, start), measureCount: Math.max(0, count) };
	});
}

/** The status of one page given its client-side review state and whether a
 * seam sits at its leading edge. Approval wins; then a failed transcription;
 * then a page that opens a new merged segment ("review"); otherwise untouched
 * (skipped included — the caller tracks that separately for the Publish gate). */
export function pageStatus(
	p: ReviewPageRaw,
	opts: { approved: boolean; atSeam: boolean }
): PageStatus {
	if (opts.approved) return 'approved';
	if (!p.ok) return 'failed';
	if (opts.atSeam) return 'review';
	return 'untouched';
}

/** The set of page numbers that sit at an unresolved seam (each seam names the
 * first page of the segment it opens, `before_page`). */
export function seamPages(report: Pick<PagedReport, 'unresolved_boundaries'>): Set<number> {
	return new Set(report.unresolved_boundaries.map((b) => b.before_page));
}
