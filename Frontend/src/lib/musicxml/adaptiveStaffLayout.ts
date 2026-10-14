import type { MixPart, ParsedMIDI, VisualState } from '../midi/types';

/** A self-contained piece of one score. Timestamps remain in the full
 * piece's whole-note clock, so seeking and annotations cross layout changes. */
export interface StaffLayoutSection {
	xml: string;
	startWholeNotes: number;
	endWholeNotes: number;
	staffVisualStates: VisualState[];
	firstMeasure: number;
	lastMeasure: number;
}

interface LayoutDeclaration {
	splitMeasures: [number, number];
	sharedPairs: [string, string][];
}

const FIELD_NAME = 'divisi-staff-layout';
const ATTRIBUTE_ORDER = ['divisions', 'key', 'time', 'staves', 'clef', 'transpose', 'staff-details'];

function childElements(parent: Element, name?: string): Element[] {
	return [...parent.children].filter((child) => !name || child.localName === name);
}

function parseLayout(doc: Document): LayoutDeclaration | null {
	const field = [...doc.querySelectorAll('identification > miscellaneous > miscellaneous-field')]
		.find((el) => el.getAttribute('name') === FIELD_NAME);
	if (!field) return null;
	let value: unknown;
	try {
		value = JSON.parse(field.textContent ?? '');
	} catch {
		return null;
	}
	if (!value || typeof value !== 'object') return null;
	const { splitMeasures, sharedPairs } = value as Partial<LayoutDeclaration>;
	if (!Array.isArray(splitMeasures) || splitMeasures.length !== 2 ||
		!splitMeasures.every((n) => Number.isInteger(n) && n > 0) || splitMeasures[0] > splitMeasures[1] ||
		!Array.isArray(sharedPairs) || !sharedPairs.length ||
		!sharedPairs.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((id) => typeof id === 'string' && id))) {
		return null;
	}
	return { splitMeasures: splitMeasures as [number, number], sharedPairs: sharedPairs as [string, string][] };
}

/** MusicXML's backup/forward elements let a measure contain multiple
 * voices. The farthest reached time gives its actual duration, including
 * pickups and short transition bars. */
function measureDuration(measure: Element): number {
	let cursor = 0;
	let end = 0;
	for (const child of childElements(measure)) {
		const duration = Number(child.querySelector(':scope > duration')?.textContent ?? 0);
		if (child.localName === 'backup') cursor -= duration;
		else if (child.localName === 'forward') cursor += duration;
		else if (child.localName === 'note' && !child.querySelector(':scope > chord')) cursor += duration;
		end = Math.max(end, cursor);
	}
	return end;
}

function divisionsAt(measures: Element[], index: number): number {
	for (let i = index; i >= 0; i--) {
		const raw = measures[i].querySelector(':scope > attributes > divisions')?.textContent;
		if (raw && Number(raw) > 0) return Number(raw);
	}
	return 1;
}

/** A fragment starts a new OSMD document, so restate the clef, key, meter,
 * and divisions in its first measure. Keep a change printed on that very
 * measure (for example Northern Land's key change at measure 21). */
function seedAttributes(sourceMeasures: Element[], startIndex: number, first: Element): void {
	const latest = new Map<string, Element>();
	for (let i = 0; i <= startIndex; i++) {
		for (const attrs of childElements(sourceMeasures[i], 'attributes')) {
			for (const child of childElements(attrs)) latest.set(child.localName, child);
		}
	}
	const existing = childElements(first, 'attributes')[0];
	const attrs = first.ownerDocument.createElement('attributes');
	for (const name of ATTRIBUTE_ORDER) {
		const child = latest.get(name);
		if (child) attrs.appendChild(first.ownerDocument.importNode(child, true));
	}
	if (existing) first.replaceChild(attrs, existing);
	else first.insertBefore(attrs, first.firstChild);
}

function notesMatch(first: Element, second: Element): boolean {
	const notesA = childElements(first, 'note');
	const notesB = childElements(second, 'note');
	if (notesA.length !== notesB.length) return false;
	const serializer = new XMLSerializer();
	return notesA.every((note, index) => serializer.serializeToString(note) === serializer.serializeToString(notesB[index]));
}

function tintNotes(measure: Element, color?: string): void {
	if (!color) return;
	for (const note of childElements(measure, 'note')) note.setAttribute('color', color);
}

/** Preserve both independent lines on one staff during shared-staff bars.
 * Identical desk copies become one written line; differing bars use a
 * second MusicXML voice with a backup, keeping their pitches and lyrics. */
function mergeSharedMeasure(primary: Element, secondary: Element, primaryColor?: string, secondaryColor?: string): void {
	if (notesMatch(primary, secondary)) {
		tintNotes(primary, primaryColor === undefined || secondaryColor === undefined ? undefined : primaryColor);
		return;
	}
	tintNotes(primary, primaryColor);
	const duration = measureDuration(primary);
	const backup = primary.ownerDocument.createElement('backup');
	const length = primary.ownerDocument.createElement('duration');
	length.textContent = String(duration);
	backup.appendChild(length);
	const barline = childElements(primary, 'barline')[0] ?? null;
	primary.insertBefore(backup, barline);
	for (const sourceNote of childElements(secondary, 'note')) {
		const note = primary.ownerDocument.importNode(sourceNote, true);
		let voice = childElements(note, 'voice')[0];
		if (!voice) {
			voice = primary.ownerDocument.createElement('voice');
			const durationNode = childElements(note, 'duration')[0];
			note.insertBefore(voice, durationNode?.nextSibling ?? note.firstChild);
		}
		voice.textContent = '2';
		if (secondaryColor) note.setAttribute('color', secondaryColor);
		primary.insertBefore(note, barline);
	}
}

const VISIBILITY: VisualState[] = ['off', 'muted', 'active'];

/** `trackParts` keeps the pre-split id for a part the parser split into
 * chordal desks (`soprano` while the mixer has `soprano-1`/`soprano-2`).
 * Such a part stays one written staff here, so it shows as its most
 * visible desk. */
function partVisualState(visualStates: Record<MixPart, VisualState>, mixId: MixPart): VisualState {
	const own = visualStates[mixId];
	if (own) return own;
	const desks = (Object.keys(visualStates) as MixPart[])
		.filter((id) => id.startsWith(`${mixId}-`))
		.map((id) => visualStates[id]);
	if (!desks.length) return 'active';
	return desks.reduce((best, state) => (VISIBILITY.indexOf(state) > VISIBILITY.indexOf(best) ? state : best));
}

/** Returns null for ordinary scores. An explicit layout declaration keeps
 * the score's intended split ranges reproducible and avoids guessing from
 * a momentary unison inside a longer divisi passage. */
export function buildAdaptiveStaffSections(
	parsed: ParsedMIDI,
	visualStates: Record<MixPart, VisualState>,
	mutedNoteColor: string
): StaffLayoutSection[] | null {
	if (!parsed.sourceMusicXml) return null;
	const doc = new DOMParser().parseFromString(parsed.sourceMusicXml, 'application/xml');
	if (doc.querySelector('parsererror')) return null;
	const layout = parseLayout(doc);
	if (!layout) return null;
	const partListElement = doc.querySelector('part-list');
	if (!partListElement) return null;
	const scoreParts = childElements(partListElement, 'score-part');
	const sourceParts = childElements(doc.documentElement, 'part');
	if (!sourceParts.length || sourceParts.length !== scoreParts.length) return null;
	const byId = new Map(sourceParts.map((part) => [part.getAttribute('id')!, part]));
	if (layout.sharedPairs.some(([first, second]) => !byId.has(first) || !byId.has(second))) return null;
	const measuresById = new Map(sourceParts.map((part) => [part.getAttribute('id')!, childElements(part, 'measure')]));
	const referenceMeasures = measuresById.get(sourceParts[0].getAttribute('id')!)!;
	const count = referenceMeasures.length;
	if (count === 0 || layout.splitMeasures[1] > count ||
		[...measuresById.values()].some((measures) => measures.length !== count)) return null;
	const measureNumbers = referenceMeasures.map((m) => Number(m.getAttribute('number')));
	if (measureNumbers.some((n, i) => n !== i + 1)) return null;

	const partStates = new Map<string, VisualState>();
	for (const [index, part] of sourceParts.entries()) {
		const partId = part.getAttribute('id')!;
		const mixId = parsed.trackParts[index] ?? 'accompaniment';
		partStates.set(partId, partVisualState(visualStates, mixId));
	}
	const firstOfPair = new Map(layout.sharedPairs);
	const secondOfPair = new Map(layout.sharedPairs.map(([first, second]) => [second, first]));
	const ranges: Array<[number, number, boolean]> = [
		[1, layout.splitMeasures[0] - 1, true],
		[layout.splitMeasures[0], layout.splitMeasures[1], false],
		[layout.splitMeasures[1] + 1, count, true]
	].filter(([first, last]) => first <= last) as Array<[number, number, boolean]>;

	let elapsed = 0;
	const starts = referenceMeasures.map((measure, i) => {
		const start = elapsed;
		elapsed += measureDuration(measure) / divisionsAt(referenceMeasures, i) / 4;
		return start;
	});
	const serializer = new XMLSerializer();
	return ranges.map(([firstMeasure, lastMeasure, shared]) => {
		const sectionDoc = new DOMParser().parseFromString('<score-partwise version="4.0"><part-list/></score-partwise>', 'application/xml');
		const root = sectionDoc.documentElement;
		const partList = root.querySelector('part-list')!;
		const staffVisualStates: VisualState[] = [];
		for (const [index, sourcePart] of sourceParts.entries()) {
			const id = sourcePart.getAttribute('id')!;
			const state = partStates.get(id)!;
			if (state === 'off') continue;
			const primaryId = shared ? secondOfPair.get(id) : undefined;
			if (primaryId && partStates.get(primaryId) !== 'off') continue;
			const secondId = shared ? firstOfPair.get(id) : undefined;
			const combine = secondId && partStates.get(secondId) !== 'off';
			const combinedState: VisualState = combine && partStates.get(secondId) === 'active' ? 'active' : state;
			staffVisualStates.push(combinedState);
			const scorePart = sectionDoc.importNode(scoreParts[index], true);
			if (combine) {
				const name = scorePart.querySelector('part-name');
				if (name) name.textContent = (name.textContent ?? '').replace(/\s*1$/, '');
				const abbreviation = scorePart.querySelector('part-abbreviation');
				if (abbreviation) abbreviation.textContent = (abbreviation.textContent ?? '').replace(/\s*1$/, '');
			}
			partList.appendChild(scorePart);
			const outputPart = sectionDoc.createElement('part');
			outputPart.setAttribute('id', id);
			const sourceMeasures = measuresById.get(id)!;
			const secondMeasures = combine ? measuresById.get(secondId)! : undefined;
			for (let number = firstMeasure; number <= lastMeasure; number++) {
				const measure = sectionDoc.importNode(sourceMeasures[number - 1], true);
				for (const print of childElements(measure, 'print')) measure.removeChild(print);
				if (number === firstMeasure) seedAttributes(sourceMeasures, number - 1, measure);
				if (secondMeasures) {
					mergeSharedMeasure(
						measure,
						secondMeasures[number - 1],
						state === 'muted' ? mutedNoteColor : undefined,
						partStates.get(secondId!) === 'muted' ? mutedNoteColor : undefined
					);
				} else tintNotes(measure, state === 'muted' ? mutedNoteColor : undefined);
				outputPart.appendChild(measure);
			}
			root.appendChild(outputPart);
		}
		return {
			xml: `<?xml version="1.0" encoding="utf-8"?>\n${serializer.serializeToString(sectionDoc)}`,
			startWholeNotes: starts[firstMeasure - 1],
			endWholeNotes: lastMeasure === count ? elapsed : starts[lastMeasure],
			staffVisualStates,
			firstMeasure,
			lastMeasure
		};
	});
}
