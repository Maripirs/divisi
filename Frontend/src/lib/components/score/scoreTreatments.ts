// Pure DOM-paint helpers lifted out of `ScoreView.svelte` (see CLEANUP.md
// round 2, step 1). None of these touch component state: they take the SVG
// root / elements / resolved colors they need as arguments and either compute
// a value or mutate the elements passed in. `ScoreView` still owns *when* to
// call them (after every OSMD render / cursor step) and *which* colors to
// pass (from its `themeFor()` / `highlightedMutedInk()`).

import type { VisualState } from '$lib/midi/types';

/** One rendered staff's vertical extent on the page, plus whether the piece's
 * voice-part visual state has it muted — `renderedStaffBands` derives these
 * from the engraved staff lines, `paintSymbolsInMutedBands` then recolors
 * every symbol that falls inside one. */
export interface StaffBand {
	top: number;
	bottom: number;
	state: VisualState;
}

/** `getNoteheadSVGs()`/`getStemSVG()` return VexFlow's SVG *groups*
 * (`<g class="vf-notehead">` etc), not the painted shape itself — the group
 * can nest the actual `<path>`/`<use>` one or more levels deep, and that leaf
 * already carries its own explicit `fill`/`stroke` attribute from OSMD's
 * coloring pass. A CSS class only styles the element it's added to, not
 * descendants that already have their own conflicting attribute, so
 * `.current-note` has to land on the leaf(s), not the wrapping group
 * (confirmed via devtools: `getNoteheadSVGs()` was returning real
 * `g.vf-notehead` elements, but adding the class to the group left noteheads
 * unpainted while stems — whose own getter already drills into `children[0]`
 * — worked fine). */
export function paintableLeaves(element: HTMLElement): HTMLElement[] {
	const leaves = [
		...element.querySelectorAll<HTMLElement>(
			'path, use, text, rect, polygon, polyline, circle, ellipse'
		)
	];
	return leaves.length > 0 ? leaves : [element];
}

/** Collapses a list of near-equal numbers into one average per cluster, where
 * "near" is `<= tolerance` apart from the previous value in sorted order.
 * Used to fold the many sub-pixel Y positions of a single engraved staff line
 * (drawn as several `<path>` segments) into one line coordinate. */
export function clusteredNumbers(values: number[], tolerance: number): number[] {
	const sorted = [...values].sort((a, b) => a - b);
	const clusters: number[][] = [];
	for (const value of sorted) {
		const cluster = clusters[clusters.length - 1];
		const anchor = cluster?.[cluster.length - 1];
		if (!cluster || anchor === undefined || Math.abs(value - anchor) > tolerance) clusters.push([value]);
		else cluster.push(value);
	}
	return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
}

/** `getBBox()` throws on detached/`display:none` SVG nodes and doesn't exist
 * on non-graphics elements — both come back as `null` here rather than
 * bubbling. */
export function svgBox(element: SVGElement): DOMRect | null {
	if (!('getBBox' in element)) return null;
	try {
		return (element as SVGGraphicsElement).getBBox();
	} catch {
		return null;
	}
}

/** Recolors an SVG element, but only along axes it's actually painted on —
 * setting `fill` on a stroke-only glyph (or vice versa) would make invisible
 * geometry suddenly show. Writes both the attribute and the inline style so
 * it wins over OSMD's own coloring pass regardless of which one that used. */
export function paintSvgElement(element: SVGElement, color: string): void {
	if (hasPaint(element, 'stroke')) {
		element.setAttribute('stroke', color);
		element.style.stroke = color;
	}
	if (hasPaint(element, 'fill')) {
		element.setAttribute('fill', color);
		element.style.fill = color;
	}
}

/** True if `element` paints along `attribute` by any route — attribute,
 * inline style, or inherited/computed — and that paint isn't `none`/
 * `transparent`. */
export function hasPaint(element: SVGElement, attribute: 'stroke' | 'fill'): boolean {
	const value = element.getAttribute(attribute);
	const styleValue = element.style[attribute];
	const computed = getComputedStyle(element)[attribute];
	return [value, styleValue, computed].some(
		(paint) => !!paint && paint !== 'none' && paint !== 'transparent'
	);
}

/** Reconstructs one band per engraved staff from the SVG's staff lines, and
 * (as a side effect) recolors those lines to `activeColor`/`mutedColor` by
 * the band they fall in. `svg` is `ScoreView`'s rendered OSMD root; `states`
 * is the per-staff visual state, indexed round-robin if there are more staves
 * than states. Returns `[]` when there's no SVG or no states. */
export function renderedStaffBands(
	svg: SVGSVGElement | null,
	states: VisualState[],
	activeColor: string,
	mutedColor: string
): StaffBand[] {
	if (!svg || states.length === 0) return [];
	const lineCandidates = [...svg.querySelectorAll<SVGElement>('path, line')]
		.map((element) => ({ element, box: svgBox(element) }))
		.filter((entry): entry is { element: SVGElement; box: DOMRect } => entry.box !== null)
		.filter(({ box }) => box.width >= 48 && box.height <= 1);
	const lineYs = clusteredNumbers(
		lineCandidates.map(({ box }) => box.y + box.height / 2),
		2
	);
	const staffLineGroups: number[][] = [];
	let currentGroup: number[] = [];

	for (const y of lineYs) {
		const previous = currentGroup[currentGroup.length - 1];
		if (previous === undefined || y - previous <= 14) {
			currentGroup.push(y);
		} else {
			if (currentGroup.length >= 5) staffLineGroups.push(currentGroup);
			currentGroup = [y];
		}
	}
	if (currentGroup.length >= 5) staffLineGroups.push(currentGroup);

	const staffCenters = staffLineGroups.map((group) => (group[0] + group[group.length - 1]) / 2);
	const bands = staffLineGroups.map((group, index) => {
		const topLine = group[0];
		const bottomLine = group[group.length - 1];
		const previous = staffCenters[index - 1];
		const current = staffCenters[index];
		const next = staffCenters[index + 1];
		return {
			top: previous === undefined ? topLine - 30 : (previous + current) / 2,
			bottom: next === undefined ? bottomLine + 30 : (current + next) / 2,
			state: states[index % states.length] ?? 'active'
		};
	});

	for (const { element, box } of lineCandidates) {
		const centerY = box.y + box.height / 2;
		const band = bands.find((candidate) => centerY >= candidate.top && centerY <= candidate.bottom);
		if (band) paintSvgElement(element, band.state === 'muted' ? mutedColor : activeColor);
	}
	return bands;
}

/** Recolors every symbol in `svg` by the band it sits in — `inactiveColor`
 * for muted bands, `activeColor` otherwise. Skips the playback cursor
 * element (and its subtree) and zero-area nodes. No-op when `bands` is
 * empty. */
export function paintSymbolsInMutedBands(
	svg: SVGSVGElement | null,
	cursorElement: Node | undefined,
	bands: StaffBand[],
	activeColor: string,
	inactiveColor: string
): void {
	if (bands.length === 0 || !svg) return;
	const symbols = svg.querySelectorAll<SVGElement>(
		'path, line, text, rect, polygon, polyline, circle, ellipse'
	);
	for (const symbol of symbols) {
		if (symbol === cursorElement || cursorElement?.contains(symbol)) continue;
		const box = svgBox(symbol);
		if (!box || box.width + box.height === 0) continue;
		const centerY = box.y + box.height / 2;
		const band = bands.find((candidate) => centerY >= candidate.top && centerY <= candidate.bottom);
		if (!band) continue;
		paintSvgElement(symbol, band.state === 'muted' ? inactiveColor : activeColor);
	}
}
