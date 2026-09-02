import { describe, it, expect } from 'vitest';
import { mapReport, pageStatus, seamPages, type ReviewPageRaw } from './reviewPages';

type ReportPage = { page: number; ok: boolean; error: string | null; start_measure: number | null; measure_count: number | null };

const page = (over: Partial<ReportPage>): ReportPage => ({
	page: 1,
	ok: true,
	error: null,
	start_measure: null,
	measure_count: null,
	...over
});

describe('mapReport', () => {
	it('uses B18 start_measure / measure_count when present', () => {
		const out = mapReport([
			page({ page: 1, start_measure: 1, measure_count: 4 }),
			page({ page: 2, start_measure: 5, measure_count: 3 }),
			page({ page: 3, start_measure: 8, measure_count: 6 })
		]);
		expect(out).toEqual([
			{ page: 1, ok: true, startMeasure: 1, measureCount: 4, offsetsKnown: true },
			{ page: 2, ok: true, startMeasure: 5, measureCount: 3, offsetsKnown: true },
			{ page: 3, ok: true, startMeasure: 8, measureCount: 6, offsetsKnown: true }
		]);
	});

	it('marks entries built without B18 offsets, one per page (pre-B18 report)', () => {
		const out = mapReport([
			page({ page: 1, measure_count: null }),
			page({ page: 2, measure_count: null }),
			page({ page: 3, measure_count: null })
		]);
		// One entry per page so approve / skip + the Publish gate still work...
		expect(out.map((p) => p.page)).toEqual([1, 2, 3]);
		// ...but flagged so the editor skips the band highlight + auto-scroll.
		expect(out.every((p) => p.offsetsKnown === false)).toBe(true);
	});

	it('carries a failed page through at count 0, anchored at the next page start', () => {
		const out = mapReport([
			page({ page: 1, start_measure: 1, measure_count: 4 }),
			page({ page: 2, ok: false, error: 'boom', start_measure: 5, measure_count: 0 }),
			page({ page: 3, start_measure: 5, measure_count: 6 })
		]);
		expect(out[1]).toEqual({
			page: 2,
			ok: false,
			startMeasure: 5,
			measureCount: 0,
			offsetsKnown: true
		});
		expect(out[2].startMeasure).toBe(5);
	});
});

describe('pageStatus', () => {
	const p: ReviewPageRaw = { page: 1, ok: true, startMeasure: 1, measureCount: 4, offsetsKnown: true };
	const failed: ReviewPageRaw = {
		page: 2,
		ok: false,
		startMeasure: 5,
		measureCount: 0,
		offsetsKnown: true
	};

	it('approval wins over everything', () => {
		expect(pageStatus(failed, { approved: true, atSeam: true })).toBe('approved');
	});
	it('a failed transcription is failed when not approved', () => {
		expect(pageStatus(failed, { approved: false, atSeam: false })).toBe('failed');
	});
	it('an ok page at a seam is review', () => {
		expect(pageStatus(p, { approved: false, atSeam: true })).toBe('review');
	});
	it('an ok page away from a seam is untouched', () => {
		expect(pageStatus(p, { approved: false, atSeam: false })).toBe('untouched');
	});
});

describe('seamPages', () => {
	it('collects the first page of every unresolved segment', () => {
		const set = seamPages({
			unresolved_boundaries: [
				{ before_page: 4, merged_measure: 10, reason: 'part count' },
				{ before_page: 9, merged_measure: 22, reason: 'page 8 failed' }
			]
		});
		expect([...set].sort()).toEqual([4, 9]);
	});
});
