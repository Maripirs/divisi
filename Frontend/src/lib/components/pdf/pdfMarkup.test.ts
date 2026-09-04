import { describe, expect, it } from 'vitest';
import {
	distanceToSegment,
	distanceToStroke,
	markInteractivity,
	markVisibleOnPage,
	msToMinSec,
	parseMinSec,
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

	// F22: cue interactivity is the same scope-based gate. A personal cue is
	// its creator's to re-time; a group (director) cue only for an owning-group
	// admin aimed at the director layer in annotation mode.
	it('gates a personal cue on ownership', () => {
		expect(markInteractivity('personal', { ...admin, isOwn: true, drawTarget: 'mine' })).toBe(true);
		expect(markInteractivity('personal', { ...admin, isOwn: false })).toBe(false);
	});

	it('gates a group cue on admin + annotation mode + director target', () => {
		expect(markInteractivity('group', admin)).toBe(true);
		expect(markInteractivity('group', { ...admin, drawTarget: 'mine' })).toBe(false);
		expect(markInteractivity('group', { ...admin, isOwningGroupAdmin: false })).toBe(false);
	});
});

describe('markVisibleOnPage', () => {
	const toggles = { showMine: false, showDirector: false, showCues: false };

	it('shows a cue whenever the reference recording is the audio source, whatever the layer toggles', () => {
		// The new F22 contract: a cue loaded for the player (e.g. via the
		// controller's `cueLoader`) renders with "Show director markup" off, as
		// long as the audio source is the reference recording.
		expect(
			markVisibleOnPage({ kind: 'cue', scope: 'group' }, { ...toggles, showCues: true })
		).toBe(true);
		expect(
			markVisibleOnPage(
				{ kind: 'cue', scope: 'group' },
				{ showMine: false, showDirector: false, showCues: true }
			)
		).toBe(true);
	});

	it('hides a cue when the audio source is not the reference recording, even with the director layer on', () => {
		expect(
			markVisibleOnPage({ kind: 'cue', scope: 'group' }, { ...toggles, showDirector: true, showCues: false })
		).toBe(false);
	});

	it('still gates a group stroke on the director toggle and a personal mark on the mine toggle', () => {
		expect(markVisibleOnPage({ kind: 'stroke', scope: 'group' }, { ...toggles, showCues: true })).toBe(false);
		expect(markVisibleOnPage({ kind: 'stroke', scope: 'group' }, { ...toggles, showDirector: true })).toBe(true);
		expect(markVisibleOnPage({ kind: 'text', scope: 'personal' }, { ...toggles, showDirector: true })).toBe(false);
		expect(markVisibleOnPage({ kind: 'text', scope: 'personal' }, { ...toggles, showMine: true })).toBe(true);
	});
});

describe('msToMinSec / parseMinSec', () => {
	it('formats milliseconds as m:ss with a zero-padded seconds field', () => {
		expect(msToMinSec(0)).toBe('0:00');
		expect(msToMinSec(5000)).toBe('0:05');
		expect(msToMinSec(65000)).toBe('1:05');
		expect(msToMinSec(600000)).toBe('10:00');
	});

	it('rounds to the nearest second and floors negatives at zero', () => {
		expect(msToMinSec(1499)).toBe('0:01');
		expect(msToMinSec(1500)).toBe('0:02');
		expect(msToMinSec(-4000)).toBe('0:00');
	});

	it('parses a well-formed m:ss back to milliseconds', () => {
		expect(parseMinSec('0:00')).toBe(0);
		expect(parseMinSec('1:05')).toBe(65000);
		expect(parseMinSec('10:30')).toBe(630000);
		expect(parseMinSec('  2:07 ')).toBe(127000);
	});

	it('rejects malformed timestamps', () => {
		expect(parseMinSec('')).toBeNull();
		expect(parseMinSec('90')).toBeNull();
		expect(parseMinSec('1:60')).toBeNull();
		expect(parseMinSec('1:5')).toBe(65000);
		expect(parseMinSec('a:bb')).toBeNull();
		expect(parseMinSec('1:2:3')).toBeNull();
	});

	it('round-trips a value through format then parse', () => {
		expect(parseMinSec(msToMinSec(93000))).toBe(93000);
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
