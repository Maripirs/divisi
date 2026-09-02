/**
 * F14 spike — a throwaway "editable model" for MusicXML that mutates the
 * parsed XML DOM in place, so OpenSheetMusicDisplay stays a pure view
 * (re-`load()` + `render()` the serialized string after every edit).
 *
 * The point of the spike is only to prove the "click a note -> change it ->
 * re-render" loop on OSMD without adding a heavier engine (Verovio/MEI).
 * Scope is deliberately the path-1 correction set: transpose a note by a
 * semitone and delete a note (turn it into a rest so measure timing is
 * preserved). Not production code — no `.mxl` (zip) handling, minimal
 * accidental spelling, chord edges only half-covered. See
 * `Frontend/plan.md` F14 for the decision this feeds.
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

export class EditableScore {
	private readonly doc: Document;
	private notes: EditableNote[] = [];
	private readonly elFor = new Map<number, Element>();

	constructor(xml: string) {
		const parsed = new DOMParser().parseFromString(xml, 'application/xml');
		if (parsed.querySelector('parsererror')) {
			throw new Error('MusicXML did not parse: ' + text(parsed.querySelector('parsererror')));
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

	/** Move a note by `semitones` (+/- 1 in the spike UI): rewrite
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
	 * downstream shifts. Spike-level chord handling: if this was a chord's
	 * anchor note, promote the next chord member so the chord survives. */
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

	serialize(): string {
		return new XMLSerializer().serializeToString(this.doc);
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
