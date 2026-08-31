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
 * `<type>`/`<dot>`/`<duration>`, re-fit the measure) and key/clef changes
 * (rewrite `<attributes><key>`/`<clef>`). Both are further in-place DOM
 * mutations on the same `doc` with a `reindex()` afterward — no new model.
 * `.mxl` (zipped MusicXML) is deliberately not handled here; the loader
 * (`loadEditableScore.ts`) rejects it before it can reach this class.
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

	serialize(): string {
		return new XMLSerializer().serializeToString(this.doc);
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
