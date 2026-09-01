/**
 * F14: the editable model behind the in-app notation editor. It keeps the
 * track's music as a parsed MusicXML `Document` and mutates that DOM in
 * place, so OpenSheetMusicDisplay stays a pure view — after every edit the
 * caller re-`load()`s + `render()`s `serialize()`'s output. Mutating the DOM
 * (rather than rebuilding XML from a parsed intermediate) leaves every
 * element the editor never touches — layout hints, structure, whatever the
 * OMR step emitted that this app doesn't model — exactly as it came in,
 * which is the whole point for "clean up a rough generated score".
 *
 * Ported from the F14 spike (`src/lib/spike/musicXmlEdit.ts`), same
 * DOM-mutation approach. Scope here is what editor tasks 2-4 need: build the
 * model, resolve an OSMD click back to a `<note>`, transpose a note by a
 * semitone, and delete a note (turn it into a rest so measure timing is
 * preserved).
 *
 * Extends here: later editor tasks add duration edits (rewrite
 * `<type>`/`<dot>`/`<duration>`, re-fit the measure), key/clef changes
 * (rewrite `<attributes><key>`/`<clef>`, one measure or a whole bar range via
 * `setClefRange`), per-note accidentals (rewrite
 * `<pitch><alter>` + `<note><accidental>`), and F16's measure-level edits
 * (`insertMeasures`/`deleteMeasure`/`spliceMeasuresFromXml` — the first
 * structural add/remove of `<measure>`s, for filling a failed-OMR-page
 * seam). All are further in-place DOM mutations on the same `doc` with a
 * `reindex()` afterward — no new model.
 * This class only ever sees plain MusicXML text; the loader
 * (`loadEditableScore.ts`) converts MIDI and unpacks `.mxl` before
 * constructing it.
 */

const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_SPELLING: Array<{ step: string; alter: number }> = [
	{ step: 'C', alter: 0 },
	{ step: 'C', alter: 1 },
	{ step: 'D', alter: 0 },
	{ step: 'D', alter: 1 },
	{ step: 'E', alter: 0 },
	{ step: 'F', alter: 0 },
	{ step: 'F', alter: 1 },
	{ step: 'G', alter: 0 },
	{ step: 'G', alter: 1 },
	{ step: 'A', alter: 0 },
	{ step: 'A', alter: 1 },
	{ step: 'B', alter: 0 }
];
const FLAT_SPELLING: Array<{ step: string; alter: number }> = [
	{ step: 'C', alter: 0 },
	{ step: 'D', alter: -1 },
	{ step: 'D', alter: 0 },
	{ step: 'E', alter: -1 },
	{ step: 'E', alter: 0 },
	{ step: 'F', alter: 0 },
	{ step: 'G', alter: -1 },
	{ step: 'G', alter: 0 },
	{ step: 'A', alter: -1 },
	{ step: 'A', alter: 0 },
	{ step: 'B', alter: -1 },
	{ step: 'B', alter: 0 }
];

export interface NotePitch {
	step: string;
	alter: number;
	octave: number;
}

/** The five written-accidental values the editor offers, keyed by `alter`.
 * These are the `<note><accidental>` tokens that pair with each
 * `<pitch><alter>` amount; `natural` is written explicitly (rather than
 * dropping the element) so a corrected note cancels a prior key/measure
 * accidental on the page. */
const ACCIDENTAL_TOKEN: Record<string, string> = {
	'-2': 'double-flat',
	'-1': 'flat',
	'0': 'natural',
	'1': 'sharp',
	'2': 'double-sharp'
};

/** A clef the toolbar can set, as its `<sign>` + `<line>` pair. */
export interface ClefSpec {
	sign: string;
	line: number;
}

/** The five note values the duration editor offers. Tuplets and rarer
 * values (breve, 32nd) are out of scope for this pass; `noteDuration`
 * reports `type: null` when it meets one. `dots` pairs with these: 0, 1, or
 * 2 augmentation dots. */
export type DurationType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th';
const DURATION_TYPES: readonly DurationType[] = ['whole', 'half', 'quarter', 'eighth', '16th'];

/** How many quarter notes one of each `DurationType` lasts, before dots.
 * A whole note at the measure's `<divisions>` is `divisions * 4`; each step
 * down halves it. */
const TYPE_IN_QUARTERS: Record<DurationType, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 0.5,
	'16th': 0.25
};

export interface EditableNote {
	/** Position in document order across every `<note>` in the score — a
	 * stable id that survives edits, since edits mutate a note in place and
	 * never add or remove `<note>` elements. */
	index: number;
	partId: string;
	/** 0-based measure position within the part. */
	measureIndex: number;
	staff: number;
	voice: string;
	/** Absolute onset from the start of the part, in whole notes — the same
	 * unit OSMD's `sourceNote.getAbsoluteTimestamp().RealValue` reports. */
	onsetWholeNotes: number;
	isRest: boolean;
	isChord: boolean;
	pitch: NotePitch | null;
}

function text(el: Element | null | undefined): string {
	return el?.textContent?.trim() ?? '';
}

function pitchOf(noteEl: Element): NotePitch | null {
	const p = noteEl.querySelector(':scope > pitch');
	if (!p) return null;
	const step = text(p.querySelector(':scope > step'));
	const octave = Number(text(p.querySelector(':scope > octave')));
	const alterText = text(p.querySelector(':scope > alter'));
	if (!step || Number.isNaN(octave)) return null;
	return { step, alter: alterText ? Number(alterText) : 0, octave };
}

function toMidi(pitch: NotePitch): number {
	return (pitch.octave + 1) * 12 + STEP_SEMITONE[pitch.step] + pitch.alter;
}

function fromMidi(midi: number, preferFlats: boolean): NotePitch {
	const table = preferFlats ? FLAT_SPELLING : SHARP_SPELLING;
	const spelled = table[((midi % 12) + 12) % 12];
	const octave = Math.floor(midi / 12) - 1;
	return { step: spelled.step, alter: spelled.alter, octave };
}

/** Thrown by the constructor when `DOMParser` can't make sense of the input
 * (`<parsererror>` in the result). The loader turns this into the editor's
 * "couldn't read this file" state. */
export class MusicXmlParseError extends Error {
	constructor(detail: string) {
		super('MusicXML did not parse: ' + detail);
		this.name = 'MusicXmlParseError';
	}
}

export class EditableScore {
	private readonly doc: Document;
	private notes: EditableNote[] = [];
	private readonly elFor = new Map<number, Element>();

	constructor(xml: string) {
		const parsed = new DOMParser().parseFromString(xml, 'application/xml');
		if (parsed.querySelector('parsererror')) {
			throw new MusicXmlParseError(text(parsed.querySelector('parsererror')));
		}
		this.doc = parsed;
		this.reindex();
	}

	/** Rebuild `notes`/`elFor` by walking every part and accumulating
	 * divisions so each `<note>` gets an absolute whole-note onset. Called
	 * once at construction and again after any structural edit. */
	private reindex(): void {
		this.notes = [];
		this.elFor.clear();
		let index = 0;

		for (const part of Array.from(this.doc.querySelectorAll('score-partwise > part'))) {
			const partId = part.getAttribute('id') ?? '';
			let divisions = 1;
			let partStartDivisions = 0;

			const measures = Array.from(part.querySelectorAll(':scope > measure'));
			for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
				const measure = measures[measureIndex];
				let cursor = 0; // divisions from the measure start
				let measureLength = 0;
				let lastOnset = 0; // for <chord> notes, which share the prior onset

				for (const child of Array.from(measure.children)) {
					if (child.tagName === 'attributes') {
						const d = text(child.querySelector(':scope > divisions'));
						if (d) divisions = Number(d);
						continue;
					}
					if (child.tagName === 'backup') {
						cursor -= Number(text(child.querySelector(':scope > duration')));
						continue;
					}
					if (child.tagName === 'forward') {
						cursor += Number(text(child.querySelector(':scope > duration')));
						measureLength = Math.max(measureLength, cursor);
						continue;
					}
					if (child.tagName !== 'note') continue;

					const isChord = child.querySelector(':scope > chord') != null;
					const isGrace = child.querySelector(':scope > grace') != null;
					const isRest = child.querySelector(':scope > rest') != null;
					const durText = text(child.querySelector(':scope > duration'));
					const duration = isGrace || !durText ? 0 : Number(durText);
					const onsetDivisions = isChord ? lastOnset : cursor;
					const staff = Number(text(child.querySelector(':scope > staff')) || '1');
					const voice = text(child.querySelector(':scope > voice')) || '1';

					this.notes.push({
						index,
						partId,
						measureIndex,
						staff,
						voice,
						onsetWholeNotes: (partStartDivisions + onsetDivisions) / (divisions * 4),
						isRest,
						isChord,
						pitch: pitchOf(child)
					});
					this.elFor.set(index, child);
					index++;

					if (!isChord && !isGrace) {
						lastOnset = cursor;
						cursor += duration;
						measureLength = Math.max(measureLength, cursor);
					}
				}

				partStartDivisions += measureLength;
			}
		}
	}

	list(): readonly EditableNote[] {
		return this.notes;
	}

	get(index: number): EditableNote | undefined {
		return this.notes[index];
	}

	/** Best match for an OSMD click: the pitched note in the same part and
	 * staff whose onset is closest to `onsetWholeNotes`, breaking ties by
	 * octave nearness (a chord puts several notes at one onset). OSMD
	 * numbers staves globally, so the caller passes the staff index *within
	 * the instrument* and the resolved part id. */
	findByOnset(
		onsetWholeNotes: number,
		target: { partId?: string; staff?: number; octave?: number }
	): EditableNote | undefined {
		let best: EditableNote | undefined;
		let bestScore = Number.POSITIVE_INFINITY;
		for (const note of this.notes) {
			if (note.isRest || !note.pitch) continue;
			if (target.partId && note.partId !== target.partId) continue;
			if (target.staff != null && note.staff !== target.staff) continue;
			const onsetGap = Math.abs(note.onsetWholeNotes - onsetWholeNotes);
			const octaveGap = target.octave != null ? Math.abs(note.pitch.octave - target.octave) / 16 : 0;
			const score = onsetGap + octaveGap;
			if (score < bestScore) {
				bestScore = score;
				best = note;
			}
		}
		return best;
	}

	/** Onset (in whole notes, the same unit as `onsetWholeNotes` and OSMD's
	 * `getAbsoluteTimestamp().RealValue`) where a given 1-based measure
	 * number begins. Used by F15 to anchor a seam marker at the merged
	 * measure the Backend's paged report calls a boundary — B16 renumbers
	 * the provisional merge's measures 1..N gap-free and every part shares
	 * the count, so `measureIndex === measureNumber - 1` lines up across
	 * parts. Returns null if the score has no measure that high. */
	measureOnset(measureNumber: number): number | null {
		const target = measureNumber - 1;
		if (target < 0) return null;
		let atTarget = Number.POSITIVE_INFINITY;
		let afterTarget = Number.POSITIVE_INFINITY;
		for (const note of this.notes) {
			if (note.measureIndex === target) atTarget = Math.min(atTarget, note.onsetWholeNotes);
			else if (note.measureIndex > target)
				afterTarget = Math.min(afterTarget, note.onsetWholeNotes);
		}
		if (Number.isFinite(atTarget)) return atTarget;
		if (Number.isFinite(afterTarget)) return afterTarget;
		return null;
	}

	/** Move a note by `semitones` (+/- 1 in the editor UI): rewrite
	 * `<step>`/`<alter>`/`<octave>` and sync the drawn `<accidental>`. */
	transpose(index: number, semitones: number): void {
		const el = this.elFor.get(index);
		const pitchEl = el?.querySelector(':scope > pitch');
		const current = el ? pitchOf(el) : null;
		if (!el || !pitchEl || !current) return;

		const next = fromMidi(toMidi(current) + semitones, semitones < 0);
		this.setChild(pitchEl, 'step', next.step);
		if (next.alter === 0) {
			pitchEl.querySelector(':scope > alter')?.remove();
		} else {
			this.setChild(pitchEl, 'alter', String(next.alter), 'octave');
		}
		this.setChild(pitchEl, 'octave', String(next.octave));

		el.querySelector(':scope > accidental')?.remove();
		if (next.alter !== 0) {
			const acc = this.doc.createElement('accidental');
			acc.textContent = next.alter > 0 ? 'sharp' : 'flat';
			const anchor = el.querySelector(':scope > dot:last-of-type') ?? el.querySelector(':scope > type');
			anchor?.after(acc);
		}
		this.reindex();
	}

	/** Delete = turn the note into a rest of the same duration, so nothing
	 * downstream shifts. Chord handling: if this was a chord's anchor note,
	 * promote the next chord member so the chord survives. */
	deleteToRest(index: number): void {
		const el = this.elFor.get(index);
		if (!el) return;

		if (!el.querySelector(':scope > chord')) {
			const sibling = el.nextElementSibling;
			if (sibling?.tagName === 'note') sibling.querySelector(':scope > chord')?.remove();
		}

		for (const tag of [
			'chord',
			'pitch',
			'unpitched',
			'tie',
			'accidental',
			'stem',
			'beam',
			'notations',
			'lyric',
			'notehead'
		]) {
			for (const child of Array.from(el.querySelectorAll(':scope > ' + tag))) child.remove();
		}
		if (!el.querySelector(':scope > rest')) {
			el.insertBefore(this.doc.createElement('rest'), el.firstChild);
		}
		this.reindex();
	}

	/** Insert `count` empty measures (one full-measure rest per staff) into
	 * every part immediately after the 0-based `afterMeasureIndex` — pass
	 * `-1` to insert before the first measure. Each new bar's rest length is
	 * the prevailing `<divisions>` × `<time>` at that point in the part;
	 * `<measure number>` is re-sequenced 1..N across every part afterward.
	 * These are real `<measure>`s the user then overwrites (F16 uses them to
	 * open room at a failed-OMR-page seam) — nothing marker-ish in the saved
	 * MusicXML.
	 *
	 * Returns `false` without mutating on `count < 1` or an
	 * `afterMeasureIndex` outside `[-1, maxMeasures - 1]`. */
	insertMeasures(afterMeasureIndex: number, count: number): boolean {
		if (!Number.isInteger(count) || count < 1) return false;
		if (!Number.isInteger(afterMeasureIndex)) return false;
		const parts = Array.from(this.doc.querySelectorAll('score-partwise > part'));
		if (parts.length === 0) return false;
		const maxMeasures = Math.max(
			...parts.map((p) => p.querySelectorAll(':scope > measure').length)
		);
		if (afterMeasureIndex < -1 || afterMeasureIndex > maxMeasures - 1) return false;

		for (const part of parts) {
			const measures = Array.from(part.querySelectorAll(':scope > measure'));
			const refIndex = Math.min(afterMeasureIndex, measures.length - 1);
			const meter = this.prevailingMeterAt(part, refIndex);
			const staffCount = this.stavesCount(part);
			let anchor: Element | null = refIndex >= 0 ? measures[refIndex] : null;
			for (let i = 0; i < count; i++) {
				const measure = this.buildEmptyMeasure(meter, staffCount);
				if (anchor) anchor.after(measure);
				else part.insertBefore(measure, measures[0] ?? null);
				anchor = measure;
			}
		}
		this.renumberMeasures();
		this.reindex();
		return true;
	}

	/** Remove the 0-based `measureIndex` measure from every part, then
	 * re-sequence `<measure number>`. Returns `false` without mutating when
	 * `measureIndex` is out of range for any part, or the delete would
	 * leave a part with no measures at all. */
	deleteMeasure(measureIndex: number): boolean {
		if (!Number.isInteger(measureIndex) || measureIndex < 0) return false;
		const parts = Array.from(this.doc.querySelectorAll('score-partwise > part'));
		if (parts.length === 0) return false;
		for (const part of parts) {
			const count = part.querySelectorAll(':scope > measure').length;
			if (measureIndex >= count || count <= 1) return false;
		}
		for (const part of parts) {
			Array.from(part.querySelectorAll(':scope > measure'))[measureIndex]?.remove();
		}
		this.renumberMeasures();
		this.reindex();
		return true;
	}

	/** Splice a re-transcribed OMR page's measures into the working model at
	 * a seam (F16's "Re-run this page"). `xml` is that page's own MusicXML;
	 * its parts are matched to this score's by position (same rule the
	 * Backend's paged merge uses). Each existing part gets the matching
	 * incoming part's `<measure>`s inserted after `afterMeasureIndex`;
	 * parts with no counterpart in the incoming page get the same number of
	 * empty bars so every part stays the same length. `<measure number>` is
	 * re-sequenced afterward.
	 *
	 * Returns `false` without mutating on unparseable `xml`, an `xml` with
	 * no measures, or an `afterMeasureIndex` outside `[-1, maxMeasures - 1]`. */
	spliceMeasuresFromXml(afterMeasureIndex: number, xml: string): boolean {
		if (!Number.isInteger(afterMeasureIndex)) return false;
		const incoming = new DOMParser().parseFromString(xml, 'application/xml');
		if (incoming.querySelector('parsererror')) return false;
		const incomingParts = Array.from(incoming.querySelectorAll('score-partwise > part'));
		const incomingMeasures = incomingParts.map((p) =>
			Array.from(p.querySelectorAll(':scope > measure'))
		);
		const spanLength = Math.max(0, ...incomingMeasures.map((m) => m.length));
		if (spanLength === 0) return false;

		const parts = Array.from(this.doc.querySelectorAll('score-partwise > part'));
		if (parts.length === 0) return false;
		const maxMeasures = Math.max(
			...parts.map((p) => p.querySelectorAll(':scope > measure').length)
		);
		if (afterMeasureIndex < -1 || afterMeasureIndex > maxMeasures - 1) return false;

		parts.forEach((part, partIndex) => {
			const measures = Array.from(part.querySelectorAll(':scope > measure'));
			const refIndex = Math.min(afterMeasureIndex, measures.length - 1);
			const meter = this.prevailingMeterAt(part, refIndex);
			const staffCount = this.stavesCount(part);
			const source = incomingMeasures[partIndex] ?? [];
			let anchor: Element | null = refIndex >= 0 ? measures[refIndex] : null;
			for (let i = 0; i < spanLength; i++) {
				const src = source[i];
				const measure = src
					? (this.doc.importNode(src, true) as Element)
					: this.buildEmptyMeasure(meter, staffCount);
				if (anchor) anchor.after(measure);
				else part.insertBefore(measure, measures[0] ?? null);
				anchor = measure;
			}
		});
		this.renumberMeasures();
		this.reindex();
		return true;
	}

	/** Change the selected note's written duration: rewrite `<type>`, replace
	 * its `<dot>` run, recompute `<duration>` from the measure's active
	 * `<divisions>`, then re-fit the measure so the bar still adds up.
	 *
	 * Returns `false` without mutating when the edit can't be represented
	 * cleanly: a grace note (no `<duration>` to rewrite), a value that isn't
	 * a whole number of `<divisions>` (e.g. a dotted eighth at
	 * `divisions=1`), a no-op (already this type and dot count), or a
	 * lengthening the following rest can't absorb without overwriting a note
	 * or overfilling the bar. The caller turns that into a transient notice.
	 *
	 * Chords: MusicXML gives every note of a chord one shared duration, so
	 * this applies `type`/`dots`/`<duration>` to every member of the chord
	 * the selected note belongs to, not just the clicked notehead.
	 */
	setDuration(index: number, opts: { type: DurationType; dots: 0 | 1 | 2 }): boolean {
		const el = this.elFor.get(index);
		if (!el) return false;
		// Grace notes carry no <duration>; there is nothing to re-fit.
		if (el.querySelector(':scope > grace')) return false;

		const group = this.chordGroup(el);
		const anchor = group[0];
		const durEl = anchor.querySelector(':scope > duration');
		if (!durEl) return false;

		// No-op: already exactly this notation. Refuse so the caller doesn't
		// flag the score dirty for nothing.
		const currentType = text(anchor.querySelector(':scope > type'));
		const currentDots = anchor.querySelectorAll(':scope > dot').length;
		if (currentType === opts.type && currentDots === opts.dots) return false;

		// New <duration> in divisions: the base value for the <type>, times
		// the dotted multiplier (1 dot = 1.5x, 2 dots = 1.75x).
		const divisions = this.activeDivisionsFor(anchor);
		const base = divisions * TYPE_IN_QUARTERS[opts.type];
		const dotMultiplier = 2 - Math.pow(2, -opts.dots);
		const nextDuration = base * dotMultiplier;
		const rounded = Math.round(nextDuration);
		if (rounded <= 0 || Math.abs(nextDuration - rounded) > 1e-9) return false;

		const delta = rounded - Number(text(durEl));

		// Walk the same-voice run that follows the chord in this measure and
		// collect the rests before the next pitched note. A <backup>,
		// <forward>, or pitched note ends the run. Those rests are the only
		// slack we can spend (note got longer) or stretch (note got shorter).
		const voice = text(anchor.querySelector(':scope > voice'));
		const last = group[group.length - 1];
		const followingRests: Element[] = [];
		for (let sib = last.nextElementSibling; sib; sib = sib.nextElementSibling) {
			const tag = sib.tagName;
			if (tag === 'backup' || tag === 'forward') break;
			if (tag !== 'note') continue; // <direction>, <barline>, <print>, ...
			const sibVoice = text(sib.querySelector(':scope > voice'));
			if (voice && sibVoice && sibVoice !== voice) break;
			if (!sib.querySelector(':scope > rest')) break; // next pitched note
			followingRests.push(sib);
		}
		const availableRest = followingRests.reduce(
			(sum, r) => sum + Number(text(r.querySelector(':scope > duration'))),
			0
		);
		// Lengthening past the slack would overwrite the next note or spill
		// out of the bar. Refuse before touching the DOM.
		if (delta > 0 && availableRest < delta) return false;

		// Past this point the edit is committed; mutate in place.

		// All chord members share one duration / type / dot count.
		for (const member of group) {
			this.setChild(member, 'duration', String(rounded));
			this.setTypeAndDots(member, opts.type, opts.dots);
		}

		if (delta < 0) {
			// Shorter note: hand the freed divisions to the first following
			// rest, or drop in a new rest if there isn't one.
			if (followingRests.length > 0) {
				this.resizeRest(followingRests[0], -delta, divisions);
			} else {
				last.after(this.buildRest(-delta, voice, anchor, divisions));
			}
		} else if (delta > 0) {
			// Longer note: eat into the following rests, removing any it
			// fully consumes.
			let need = delta;
			for (const rest of followingRests) {
				if (need <= 0) break;
				const have = Number(text(rest.querySelector(':scope > duration')));
				if (have <= need) {
					rest.remove();
					need -= have;
				} else {
					this.resizeRest(rest, -need, divisions);
					need = 0;
				}
			}
		}

		this.reindex();
		return true;
	}

	/** The written duration of a note, for the toolbar's active state and
	 * for re-applying with a changed dot count. `type` is `null` when the
	 * `<type>` is outside the editor's five values (breve, 32nd, ...). */
	noteDuration(index: number): { type: DurationType | null; dots: 0 | 1 | 2 } | null {
		const el = this.elFor.get(index);
		if (!el) return null;
		const raw = text(el.querySelector(':scope > type'));
		const type = (DURATION_TYPES as readonly string[]).includes(raw)
			? (raw as DurationType)
			: null;
		const dots = Math.min(2, el.querySelectorAll(':scope > dot').length) as 0 | 1 | 2;
		return { type, dots };
	}

	/** Set the selected note's written accidental and its sounding pitch to
	 * `alter` (one of -2..2). This operates on the *single* selected notehead,
	 * not the whole chord — in MusicXML every `<note>` of a chord carries its
	 * own `<pitch>` and `<accidental>`, so a chord's noteheads are altered one
	 * at a time.
	 *
	 * Two edits land together, both in DTD child order:
	 *  - `<pitch>`: rewrite `<alter>` (after `<step>`, before `<octave>`), or
	 *    remove it when `alter` is 0, keeping `<step>`/`<octave>` untouched so
	 *    only the chromatic inflection moves.
	 *  - `<note>`: set `<accidental>` (after the `<type>`/`<dot>` run, before
	 *    `<time-modification>`/`<stem>`/...) to the token matching `alter`,
	 *    `natural` included.
	 *
	 * Returns `false` without mutating on a rest, on a note with no `<pitch>`
	 * (unpitched percussion), on an `alter` outside -2..2, or on a no-op
	 * (already exactly this alter) — the caller turns that into a notice.
	 */
	setAccidental(index: number, alter: number): boolean {
		if (!Number.isInteger(alter) || alter < -2 || alter > 2) return false;
		const el = this.elFor.get(index);
		if (!el) return false;
		if (el.querySelector(':scope > rest')) return false;
		const pitchEl = el.querySelector(':scope > pitch');
		const current = pitchOf(el);
		if (!pitchEl || !current) return false;
		if (current.alter === alter) return false;

		if (alter === 0) {
			pitchEl.querySelector(':scope > alter')?.remove();
		} else {
			this.setChild(pitchEl, 'alter', String(alter), 'octave');
		}

		this.setAccidentalElement(el, ACCIDENTAL_TOKEN[String(alter)]);
		this.reindex();
		return true;
	}

	/** Set the key signature at the selected note's measure across *every*
	 * part — a key change is a global musical event, not a per-staff one.
	 * `fifths` is the signed count of sharps (+) or flats (-), -7..7.
	 *
	 * For each `score-partwise > part`, the `<measure>` at the selected note's
	 * `measureIndex` gets a find-or-created `<attributes>` and, inside it, a
	 * find-or-created `<key>` with **no `number` attribute** (so it applies to
	 * all staves), whose `<fifths>` is set. Parts with fewer measures than the
	 * selected index are skipped. Editing measure 0 rewrites the piece-initial
	 * key; a later measure inserts a key change from that bar onward and leaves
	 * any downstream explicit key changes alone.
	 *
	 * Returns `false` without mutating on a `fifths` outside -7..7 or a no-op
	 * (that `fifths` is already the value in effect at that measure).
	 */
	setKey(index: number, fifths: number): boolean {
		if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) return false;
		const note = this.notes[index];
		if (!note) return false;
		if (this.keyAt(index) === fifths) return false;

		for (const part of Array.from(this.doc.querySelectorAll('score-partwise > part'))) {
			const measures = Array.from(part.querySelectorAll(':scope > measure'));
			const measure = measures[note.measureIndex];
			if (!measure) continue; // this part is shorter than the selected bar
			const attributes = this.findOrCreateAttributes(measure);
			let key = Array.from(attributes.querySelectorAll(':scope > key')).find(
				(k) => !k.hasAttribute('number')
			);
			if (!key) {
				key = this.doc.createElement('key');
				// <attributes> order: divisions?, key*, time*, staves?, ... — a
				// new <key> goes before the first sibling that follows keys.
				this.insertInAttributes(attributes, key, [
					'time',
					'staves',
					'part-symbol',
					'instruments',
					'clef',
					'staff-details',
					'transpose'
				]);
			}
			// <key> (traditional) order: cancel?, fifths, mode? — keep <fifths>
			// ahead of any <mode>.
			this.setChild(key, 'fifths', String(fifths), 'mode');
		}

		this.reindex();
		return true;
	}

	/** Set the clef for the selected note's part **and staff only** (unlike a
	 * key, a clef is a per-staff choice). `spec` is a `<sign>` + `<line>` pair;
	 * the toolbar's presets are Treble G/2, Bass F/4, Alto C/3, Tenor C/4.
	 *
	 * In the selected note's own measure, a find-or-created `<attributes>` gets
	 * a find-or-created `<clef>` for this staff: the `number` attribute is used
	 * (and matched on) only when the part has more than one staff, so a
	 * single-staff part keeps its unnumbered `<clef>`. `<sign>` and `<line>`
	 * are set in DTD order (`sign, line, clef-octave-change`) and any
	 * `<clef-octave-change>` is removed (the presets are all plain clefs).
	 * Measure 0 edits the initial clef; a later measure inserts a clef change
	 * from that bar onward.
	 *
	 * Returns `false` without mutating on a no-op (that staff's clef in effect
	 * is already this sign + line).
	 */
	setClef(index: number, spec: ClefSpec): boolean {
		const note = this.notes[index];
		const noteEl = this.elFor.get(index);
		if (!note || !noteEl) return false;
		const measure = noteEl.closest('measure');
		const part = noteEl.closest('part');
		if (!measure || !part) return false;

		const current = this.clefAt(index);
		if (current && current.sign === spec.sign && current.line === spec.line) return false;

		const multiStaff = this.stavesCount(part) > 1;
		const attributes = this.findOrCreateAttributes(measure);

		let clef = Array.from(attributes.querySelectorAll(':scope > clef')).find((c) => {
			const num = c.getAttribute('number');
			if (multiStaff) return num != null && num !== '' && Number(num) === note.staff;
			return num == null || num === '';
		});
		if (!clef) {
			clef = this.doc.createElement('clef');
			if (multiStaff) clef.setAttribute('number', String(note.staff));
			// <attributes> order: ... instruments?, clef*, staff-details*, ...
			this.insertInAttributes(attributes, clef, ['staff-details', 'transpose']);
		}
		// <clef> order: sign, line?, clef-octave-change? — keep <line> ahead of
		// any octave-shift child, then drop the octave shift entirely.
		this.setChild(clef, 'sign', spec.sign, 'line');
		this.setChild(clef, 'line', String(spec.line), 'clef-octave-change');
		clef.querySelector(':scope > clef-octave-change')?.remove();

		this.reindex();
		return true;
	}

	/** The `<fifths>` in effect for the selected note: scan its part's measures
	 * top-to-bottom for the last `<key>` at or before its measure. `0` when a
	 * `<key>` exists but has no `<fifths>` text; `null` only when no `<key>` is
	 * found at all (or the note/part can't be resolved). Feeds the toolbar's
	 * key readout and the `setKey` no-op guard. */
	keyAt(index: number): number | null {
		const note = this.notes[index];
		if (!note) return null;
		const part = this.partById(note.partId);
		if (!part) return null;
		const measures = Array.from(part.querySelectorAll(':scope > measure'));
		let fifths: number | null = null;
		for (let i = 0; i <= note.measureIndex && i < measures.length; i++) {
			for (const attr of Array.from(measures[i].querySelectorAll(':scope > attributes'))) {
				for (const key of Array.from(attr.querySelectorAll(':scope > key'))) {
					const raw = text(key.querySelector(':scope > fifths'));
					fifths = raw === '' ? 0 : Number(raw);
				}
			}
		}
		return fifths;
	}

	/** The clef in effect for the selected note's staff: the same top-down
	 * scan as `keyAt`, matching the `<clef>` `number` to the note's staff when
	 * the part has more than one staff (an unnumbered clef then belongs to
	 * staff 1). `null` when no clef is found. Feeds the toolbar's clef
	 * active-state and the `setClef` no-op guard. */
	clefAt(index: number): ClefSpec | null {
		const note = this.notes[index];
		if (!note) return null;
		const part = this.partById(note.partId);
		if (!part) return null;
		const multiStaff = this.stavesCount(part) > 1;
		const measures = Array.from(part.querySelectorAll(':scope > measure'));
		let result: ClefSpec | null = null;
		for (let i = 0; i <= note.measureIndex && i < measures.length; i++) {
			for (const attr of Array.from(measures[i].querySelectorAll(':scope > attributes'))) {
				for (const clef of Array.from(attr.querySelectorAll(':scope > clef'))) {
					const num = clef.getAttribute('number');
					if (num != null && num !== '') {
						if (Number(num) !== note.staff) continue;
					} else if (multiStaff && note.staff !== 1) {
						continue;
					}
					const sign = text(clef.querySelector(':scope > sign'));
					if (!sign) continue;
					const lineText = text(clef.querySelector(':scope > line'));
					result = { sign, line: lineText === '' ? 0 : Number(lineText) };
				}
			}
		}
		return result;
	}

	serialize(): string {
		return new XMLSerializer().serializeToString(this.doc);
	}

	/** A complete, standalone MusicXML document for saving or download.
	 * `serialize()` is the fast path the OSMD re-render uses and its output
	 * is fine to feed straight back to `osmd.load()`, but `XMLSerializer`
	 * drops the `<?xml?>` declaration and (in some engines) the DOCTYPE — a
	 * file written to disk and handed to another program wants both. Re-adds
	 * the declaration always, and a partwise DOCTYPE when the serialized
	 * tree doesn't already carry one. */
	exportMusicXml(): string {
		const body = this.serialize().replace(/^﻿/, '').trimStart();
		const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
		const doctype =
			'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ' +
			'"http://www.musicxml.org/dtds/partwise.dtd">';
		const parts = [declaration];
		if (!/^<!DOCTYPE/i.test(body)) parts.push(doctype);
		parts.push(body);
		return parts.join('\n') + '\n';
	}

	/** Every `<note>` of the chord the given note belongs to, anchor first.
	 * A chord is a run of sibling `<note>`s where the second onward carry
	 * `<chord/>`; a lone note returns just itself. */
	private chordGroup(el: Element): Element[] {
		let anchor = el;
		if (el.querySelector(':scope > chord')) {
			for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
				if (p.tagName !== 'note') break;
				anchor = p;
				if (!p.querySelector(':scope > chord')) break;
			}
		}
		const group = [anchor];
		for (let n = anchor.nextElementSibling; n; n = n.nextElementSibling) {
			if (n.tagName !== 'note' || !n.querySelector(':scope > chord')) break;
			group.push(n);
		}
		return group;
	}

	/** The `<divisions>` in effect for `noteEl`'s measure: the last one
	 * declared in an `<attributes>` at or before it, scanning this part's
	 * measures from the top (divisions carry forward until changed). Kept
	 * separate from `reindex()`'s walk, which also has to track
	 * `<backup>`/`<forward>` for onsets this doesn't need. */
	private activeDivisionsFor(noteEl: Element): number {
		const part = noteEl.closest('part');
		const measure = noteEl.closest('measure');
		if (!part || !measure) return 1;
		const measures = Array.from(part.querySelectorAll(':scope > measure'));
		const target = measures.indexOf(measure);
		let divisions = 1;
		for (let i = 0; i <= target; i++) {
			const kids = Array.from(measures[i].children);
			for (const attr of kids) {
				if (attr.tagName !== 'attributes') continue;
				// In the note's own measure, a later <attributes> doesn't apply.
				if (i === target && kids.indexOf(attr) > kids.indexOf(noteEl)) break;
				const d = text(attr.querySelector(':scope > divisions'));
				if (d) divisions = Number(d);
			}
		}
		return divisions;
	}

	/** Rewrite `<type>` and rebuild the `<dot>` run for one `<note>`, keeping
	 * DTD child order: `... voice, type, dot*, accidental, ...`. */
	private setTypeAndDots(noteEl: Element, type: DurationType, dots: number): void {
		let typeEl = noteEl.querySelector(':scope > type');
		if (!typeEl) {
			typeEl = this.doc.createElement('type');
			const before =
				noteEl.querySelector(':scope > accidental') ??
				noteEl.querySelector(':scope > time-modification') ??
				noteEl.querySelector(':scope > stem') ??
				noteEl.querySelector(':scope > notehead') ??
				noteEl.querySelector(':scope > staff') ??
				noteEl.querySelector(':scope > beam') ??
				noteEl.querySelector(':scope > notations') ??
				noteEl.querySelector(':scope > lyric');
			if (before) noteEl.insertBefore(typeEl, before);
			else noteEl.appendChild(typeEl);
		}
		typeEl.textContent = type;
		for (const d of Array.from(noteEl.querySelectorAll(':scope > dot'))) d.remove();
		let after: Element = typeEl;
		for (let i = 0; i < dots; i++) {
			const dot = this.doc.createElement('dot');
			after.after(dot);
			after = dot;
		}
	}

	/** A fresh `<rest>` note of `duration` divisions in `voice`, mirroring
	 * the anchor's `<staff>` and carrying a best-fit `<type>` so it doesn't
	 * render as a whole-measure rest. Child order: rest, duration, voice,
	 * type, staff. */
	private buildRest(duration: number, voice: string, anchor: Element, divisions: number): Element {
		const note = this.doc.createElement('note');
		note.appendChild(this.doc.createElement('rest'));
		const dur = this.doc.createElement('duration');
		dur.textContent = String(duration);
		note.appendChild(dur);
		if (voice) {
			const v = this.doc.createElement('voice');
			v.textContent = voice;
			note.appendChild(v);
		}
		const type = this.durationToType(duration, divisions);
		if (type) {
			const t = this.doc.createElement('type');
			t.textContent = type;
			note.appendChild(t);
		}
		const staff = anchor.querySelector(':scope > staff');
		if (staff) {
			const s = this.doc.createElement('staff');
			s.textContent = staff.textContent;
			note.appendChild(s);
		}
		return note;
	}

	/** Resize an existing `<rest>` note by `deltaDivisions` (may be negative)
	 * and refresh its `<type>` so the glyph roughly matches the new length. */
	private resizeRest(restEl: Element, deltaDivisions: number, divisions: number): void {
		const durEl = restEl.querySelector(':scope > duration');
		if (!durEl) return;
		const next = Number(text(durEl)) + deltaDivisions;
		durEl.textContent = String(next);
		const type = this.durationToType(next, divisions);
		if (type) this.setTypeAndDots(restEl, type, 0);
		else restEl.querySelector(':scope > type')?.remove();
	}

	/** Largest plain `DurationType` that fits `duration` divisions, for
	 * labelling a rest. A compound length (a grown rest that is now a dotted
	 * value) just takes the next size down; the `<duration>` stays exact. */
	private durationToType(duration: number, divisions: number): DurationType | null {
		if (divisions <= 0) return null;
		const quarters = duration / divisions;
		if (quarters >= 4) return 'whole';
		if (quarters >= 2) return 'half';
		if (quarters >= 1) return 'quarter';
		if (quarters >= 0.5) return 'eighth';
		if (quarters > 0) return '16th';
		return null;
	}

	/** Replace `noteEl`'s `<accidental>` with one carrying `token`, placed in
	 * DTD child order: after the `<dot>` run / `<type>` / `<voice>` if any of
	 * those exist, otherwise before the first of the elements that follow
	 * `<accidental>` in a `<note>` (`<time-modification>`, `<stem>`, ...). */
	private setAccidentalElement(noteEl: Element, token: string): void {
		noteEl.querySelector(':scope > accidental')?.remove();
		const acc = this.doc.createElement('accidental');
		acc.textContent = token;
		const after =
			noteEl.querySelector(':scope > dot:last-of-type') ??
			noteEl.querySelector(':scope > type') ??
			noteEl.querySelector(':scope > voice');
		if (after) {
			after.after(acc);
			return;
		}
		const before =
			noteEl.querySelector(':scope > time-modification') ??
			noteEl.querySelector(':scope > stem') ??
			noteEl.querySelector(':scope > notehead') ??
			noteEl.querySelector(':scope > staff') ??
			noteEl.querySelector(':scope > beam') ??
			noteEl.querySelector(':scope > notations') ??
			noteEl.querySelector(':scope > lyric');
		if (before) noteEl.insertBefore(acc, before);
		else noteEl.appendChild(acc);
	}

	/** Find a `<measure>`'s `<attributes>`, or create one at the start of the
	 * measure (after a leading `<print>` and/or `<barline location="left">` if
	 * present, otherwise before the first child) and return it. Shared by
	 * `setKey` and `setClef`; a measure that already has `<attributes>` (the
	 * usual case for measure 0, with its divisions/key/time/clef) is mutated in
	 * place — no second `<attributes>` is ever added. */
	private findOrCreateAttributes(measure: Element): Element {
		const existing = measure.querySelector(':scope > attributes');
		if (existing) return existing;
		const attributes = this.doc.createElement('attributes');
		let anchor: Element | null = null;
		for (const child of Array.from(measure.children)) {
			if (child.tagName === 'print') {
				anchor = child;
				continue;
			}
			if (child.tagName === 'barline' && child.getAttribute('location') === 'left') {
				anchor = child;
				continue;
			}
			break;
		}
		if (anchor) anchor.after(attributes);
		else measure.insertBefore(attributes, measure.firstChild);
		return attributes;
	}

	/** Insert `child` into `<attributes>` before the first existing sibling
	 * whose tag appears in `laterTags` (the elements that follow `child` in the
	 * `<attributes>` DTD content model), or append it when none are present. */
	private insertInAttributes(attributes: Element, child: Element, laterTags: string[]): void {
		for (const tag of laterTags) {
			const ref = attributes.querySelector(':scope > ' + tag);
			if (ref) {
				attributes.insertBefore(child, ref);
				return;
			}
		}
		attributes.appendChild(child);
	}

	/** The `<part>` with the given `id`, or `null`. Matched by iterating rather
	 * than a selector so an unusual id can't break an attribute selector. */
	private partById(partId: string): Element | null {
		for (const part of Array.from(this.doc.querySelectorAll('score-partwise > part'))) {
			if ((part.getAttribute('id') ?? '') === partId) return part;
		}
		return null;
	}

	/** How many staves `part` declares: the first `<attributes><staves>` value
	 * found scanning its measures top-down, or 1 when none is declared. Decides
	 * whether `setClef`/`clefAt` use and match the `<clef>` `number` attribute. */
	private stavesCount(part: Element): number {
		for (const measure of Array.from(part.querySelectorAll(':scope > measure'))) {
			for (const attr of Array.from(measure.querySelectorAll(':scope > attributes'))) {
				const raw = text(attr.querySelector(':scope > staves'));
				if (raw) return Number(raw);
			}
		}
		return 1;
	}

	/** `{ divisions, beats, beatType }` in effect at the part's measure at
	 * `measureIndex`: the last `<divisions>` and `<time>` declared in an
	 * `<attributes>` at or before it. Reads measure 0 when `measureIndex`
	 * is negative (an insert-at-start bar takes the piece's initial meter).
	 * Defaults 1 / 4 / 4 when nothing is declared. */
	private prevailingMeterAt(
		part: Element,
		measureIndex: number
	): { divisions: number; beats: number; beatType: number } {
		let divisions = 1;
		let beats = 4;
		let beatType = 4;
		const measures = Array.from(part.querySelectorAll(':scope > measure'));
		if (measures.length === 0) return { divisions, beats, beatType };
		const upto = Math.max(0, Math.min(measureIndex, measures.length - 1));
		for (let i = 0; i <= upto; i++) {
			for (const attr of Array.from(measures[i].querySelectorAll(':scope > attributes'))) {
				const d = text(attr.querySelector(':scope > divisions'));
				if (d) divisions = Number(d);
				const time = attr.querySelector(':scope > time');
				if (time) {
					const b = text(time.querySelector(':scope > beats'));
					const bt = text(time.querySelector(':scope > beat-type'));
					if (b) beats = Number(b);
					if (bt) beatType = Number(bt);
				}
			}
		}
		return { divisions, beats, beatType };
	}

	/** A `<measure>` holding one full-measure rest per staff (a `<backup>`
	 * separates staves), each rest's `<duration>` a whole bar at `meter`.
	 * `number` is a placeholder — `renumberMeasures` fixes it. */
	private buildEmptyMeasure(
		meter: { divisions: number; beats: number; beatType: number },
		staffCount: number
	): Element {
		const measure = this.doc.createElement('measure');
		measure.setAttribute('number', '0');
		const barDuration = Math.max(
			1,
			Math.round((meter.divisions * 4 * meter.beats) / meter.beatType)
		);
		const staves = Math.max(1, staffCount);
		for (let staff = 1; staff <= staves; staff++) {
			if (staff > 1) {
				const backup = this.doc.createElement('backup');
				const d = this.doc.createElement('duration');
				d.textContent = String(barDuration);
				backup.appendChild(d);
				measure.appendChild(backup);
			}
			const note = this.doc.createElement('note');
			const rest = this.doc.createElement('rest');
			rest.setAttribute('measure', 'yes');
			note.appendChild(rest);
			const dur = this.doc.createElement('duration');
			dur.textContent = String(barDuration);
			note.appendChild(dur);
			const voice = this.doc.createElement('voice');
			voice.textContent = String(staff);
			note.appendChild(voice);
			if (staves > 1) {
				const s = this.doc.createElement('staff');
				s.textContent = String(staff);
				note.appendChild(s);
			}
			measure.appendChild(note);
		}
		return measure;
	}

	/** Re-sequence `<measure number>` to 1..N in each part after a
	 * structural edit. Numbers are per-part, but a B16-merged score shares
	 * the count across parts so they line up. */
	private renumberMeasures(): void {
		for (const part of Array.from(this.doc.querySelectorAll('score-partwise > part'))) {
			let n = 1;
			for (const measure of Array.from(part.querySelectorAll(':scope > measure'))) {
				measure.setAttribute('number', String(n));
				n++;
			}
		}
	}

	private setChild(parent: Element, tag: string, value: string, insertBeforeTag?: string): void {
		let child = parent.querySelector(':scope > ' + tag);
		if (!child) {
			child = this.doc.createElement(tag);
			const before = insertBeforeTag ? parent.querySelector(':scope > ' + insertBeforeTag) : null;
			if (before) parent.insertBefore(child, before);
			else parent.appendChild(child);
		}
		child.textContent = value;
	}
}
