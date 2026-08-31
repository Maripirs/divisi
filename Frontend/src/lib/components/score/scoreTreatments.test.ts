// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	clusteredNumbers,
	hasPaint,
	paintSvgElement,
	paintableLeaves,
	renderedStaffBands,
	paintSymbolsInMutedBands
} from './scoreTreatments';

// Scope note: jsdom has no SVG layout engine (`getBBox()` → zero rect) and
// only a stub `getComputedStyle` for SVG presentation attributes (a
// `fill="none"` path still computes to `rgb(0,0,0)`). So the band *geometry*
// (`renderedStaffBands`/`paintSymbolsInMutedBands` past their guard clauses)
// and `hasPaint`'s computed-style fallback are browser-only and not covered
// here — those still ride on `npm run check` + `npm run build` + manual
// smoke. What is locked down below: the pure clustering algorithm, the
// leaf-drilldown, the paint-axis writes, and the early-return guards.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
	const el = document.createElementNS(SVG_NS, tag) as SVGElement;
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	return el;
}

describe('clusteredNumbers', () => {
	it('averages values that sit within tolerance of the running anchor', () => {
		expect(clusteredNumbers([10, 10.5, 11, 40, 41], 2)).toEqual([10.5, 40.5]);
	});

	it('sorts before clustering', () => {
		expect(clusteredNumbers([41, 10, 40, 11, 10.5], 2)).toEqual([10.5, 40.5]);
	});

	it('compares against the previous value, not the cluster mean (drift)', () => {
		// Each step is 2 apart (<= tolerance) so it stays one cluster, even
		// though the last value is 6 from the first.
		expect(clusteredNumbers([0, 2, 4, 6], 2)).toEqual([3]);
	});

	it('splits when the gap exceeds tolerance', () => {
		expect(clusteredNumbers([0, 2, 4.5], 2)).toEqual([1, 4.5]);
	});

	it('returns [] for [] and passes single values straight through', () => {
		expect(clusteredNumbers([], 2)).toEqual([]);
		expect(clusteredNumbers([7], 2)).toEqual([7]);
	});
});

describe('hasPaint', () => {
	it('is true when the attribute carries a real color', () => {
		expect(hasPaint(svgEl('path', { stroke: '#000' }), 'stroke')).toBe(true);
	});

	it('picks up an inline style even with no attribute', () => {
		const el = svgEl('path');
		el.style.fill = 'red';
		expect(hasPaint(el, 'fill')).toBe(true);
	});
});

describe('paintSvgElement', () => {
	it('writes both the attribute and the inline style on a painted axis', () => {
		const el = svgEl('path', { stroke: '#111', fill: '#222' });
		paintSvgElement(el, '#abcabc');
		expect(el.getAttribute('stroke')).toBe('#abcabc');
		expect(el.getAttribute('fill')).toBe('#abcabc');
		expect(el.style.stroke).not.toBe('');
		expect(el.style.fill).not.toBe('');
	});
});

describe('paintableLeaves', () => {
	it('returns the descendant leaf shapes when the element wraps them', () => {
		const group = document.createElementNS(SVG_NS, 'g') as unknown as HTMLElement;
		const path = document.createElementNS(SVG_NS, 'path');
		const use = document.createElementNS(SVG_NS, 'use');
		group.appendChild(path);
		group.appendChild(use);
		expect(paintableLeaves(group)).toEqual([path, use]);
	});

	it('falls back to the element itself when it has no leaf descendants', () => {
		const path = document.createElementNS(SVG_NS, 'path') as unknown as HTMLElement;
		expect(paintableLeaves(path)).toEqual([path]);
	});
});

describe('renderedStaffBands / paintSymbolsInMutedBands guards', () => {
	it('renderedStaffBands returns [] with no svg or no states', () => {
		const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
		expect(renderedStaffBands(null, ['active'], '#a', '#b')).toEqual([]);
		expect(renderedStaffBands(svg, [], '#a', '#b')).toEqual([]);
	});

	it('paintSymbolsInMutedBands is a no-op with no bands or no svg', () => {
		const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
		const symbol = svgEl('path', { fill: '#000' });
		svg.appendChild(symbol);
		paintSymbolsInMutedBands(svg, undefined, [], '#a', '#b');
		paintSymbolsInMutedBands(null, undefined, [{ top: 0, bottom: 10, state: 'muted' }], '#a', '#b');
		expect(symbol.getAttribute('fill')).toBe('#000');
	});
});
