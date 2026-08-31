import { describe, expect, it } from 'vitest';
import { clampZoom, MIN_ZOOM, MAX_ZOOM } from './pinchZoom';

// The `pinchZoom` action itself is touch-event + rAF driven and stays
// build + manual-checked (jsdom has no TouchEvent constructor). `clampZoom`
// is the one piece of shared math — exercised here since both the pinch
// gesture and the +/− buttons route every zoom change through it.
describe('clampZoom', () => {
	it('passes through an in-range value, rounded to whole percent', () => {
		expect(clampZoom(1)).toBe(1);
		expect(clampZoom(1.234)).toBe(1.23);
		expect(clampZoom(1.235)).toBe(1.24);
	});

	it('clamps below MIN_ZOOM and above MAX_ZOOM', () => {
		expect(clampZoom(0.1)).toBe(MIN_ZOOM);
		expect(clampZoom(-5)).toBe(MIN_ZOOM);
		expect(clampZoom(3)).toBe(MAX_ZOOM);
		expect(clampZoom(Infinity)).toBe(MAX_ZOOM);
	});

	it('keeps the exact range bounds', () => {
		expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
		expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
	});
});
