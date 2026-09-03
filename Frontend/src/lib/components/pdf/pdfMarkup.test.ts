import { describe, expect, it } from 'vitest';
import {
	distanceToSegment,
	distanceToStroke,
	markInteractivity,
	scopeForDrawTarget,
	strokePathD
} from './pdfMarkup.svelte';

// Scope note: only the pure geometry helpers are covered here. The factory
// (`createPdfMarkupController`) owns runes state and is exercised by
// `npm run check` + `npm run build` + a manual markup smoke, same split steps
// 1-2 used for the browser-only paths.

describe('strokePathD', () => {
	it('returns an empty string for no points', () => {
		expect(strokePathD([])).toBe('');
	});

	it('emits a single move for one point', () => {
		expect(strokePathD([[0.1, 0.2]])).toBe('M0.1 0.2');
	});

	it('moves to the first point and lines to the rest', () => {
		expect(
			strokePathD([
				[0, 0],
				[0.5, 0.25],
				[1, 0.5]
			])
		).toBe('M0 0 L0.5 0.25 L1 0.5');
	});
});

describe('distanceToSegment', () => {
	it('is zero when the point sits on the segment', () => {
		expect(distanceToSegment([0, 0], [1, 0], [0.5, 0])).toBe(0);
	});

	it('is the perpendicular offset for a point beside the segment', () => {
		expect(distanceToSegment([0, 0], [1, 0], [0.5, 0.3])).toBeCloseTo(0.3);
	});

	it('clamps past the end of the segment to the nearer endpoint', () => {
		expect(distanceToSegment([0, 0], [1, 0], [2, 0])).toBeCloseTo(1);
		expect(distanceToSegment([0, 0], [1, 0], [-1, 0])).toBeCloseTo(1);
	});

	it('measures distance to the point when the segment has zero length', () => {
		expect(distanceToSegment([1, 1], [1, 1], [1, 4])).toBeCloseTo(3);
	});
});

describe('scopeForDrawTarget', () => {
	it('maps the director target to the group scope, everything else to personal', () => {
		expect(scopeForDrawTarget('director')).toBe('group');
		expect(scopeForDrawTarget('mine')).toBe('personal');
	});
});

describe('markInteractivity', () => {
	const admin = { isOwn: false, isOwningGroupAdmin: true, annotationMode: true, drawTarget: 'director' as const };

	it('lets a creator edit their own personal mark regardless of draw target', () => {
		expect(
			markInteractivity('personal', { ...admin, isOwn: true, drawTarget: 'mine' })
		).toBe(true);
	});

	it('never lets someone edit a personal mark that is not theirs', () => {
		expect(markInteractivity('personal', { ...admin, isOwn: false })).toBe(false);
	});

	it('lets an owning-group admin edit a group mark while aimed at the director layer', () => {
		expect(markInteractivity('group', admin)).toBe(true);
	});

	it('keeps the group layer read-only for a non-admin member', () => {
		expect(markInteractivity('group', { ...admin, isOwningGroupAdmin: false })).toBe(false);
	});

	it('keeps the group layer read-only for an admin whose draw target is their own markup', () => {
		expect(markInteractivity('group', { ...admin, drawTarget: 'mine' })).toBe(false);
	});

	it('keeps the group layer read-only for an admin not in annotation mode', () => {
		expect(markInteractivity('group', { ...admin, annotationMode: false })).toBe(false);
	});
});

describe('distanceToStroke', () => {
	it('is Infinity for a stroke with fewer than two points', () => {
		expect(distanceToStroke([], [0, 0])).toBe(Infinity);
		expect(distanceToStroke([[0, 0]], [0, 0])).toBe(Infinity);
	});

	it('returns the minimum distance across every segment', () => {
		const stroke: [number, number][] = [
			[0, 0],
			[1, 0],
			[1, 1]
		];
		// Nearest to the second segment (x = 1), 0.2 away.
		expect(distanceToStroke(stroke, [0.8, 0.5])).toBeCloseTo(0.2);
		// Nearest to the first segment (y = 0), 0.1 away.
		expect(distanceToStroke(stroke, [0.3, 0.1])).toBeCloseTo(0.1);
	});
});
