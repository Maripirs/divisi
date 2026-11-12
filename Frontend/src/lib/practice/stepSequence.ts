// Step and Pitch mode's walk through a score: one step per written onset of
// the chosen part (or parts), in written order, each with the notes that
// start there and their MIDI pitches.
//
// Pure TypeScript over the engine's `Score` shape: no Svelte, no DOM, no
// engine runtime (type-only imports, like `engineAdapter.ts`), so it can move
// into notation-engine as a public helper once Step and Pitch mode have
// settled its shape (see PLAN.md's Practice modes).

import type { NoteId, OnsetIndex, Pitch } from 'notation-engine';
import { midiPitchForEngineNote, type OnsetGroup } from '$lib/components/score/engineAdapter';

/** The slice of an engine `Score` a step sequence walks. Structural so tests
 * can build one without the engine. */
export interface StepSequenceSource {
	readonly staves: readonly {
		readonly measures: readonly {
			readonly notes: readonly {
				readonly id: NoteId;
				readonly pitch: Pitch | null;
				readonly isGrace: boolean;
				readonly tiedToId: NoteId | null;
			}[];
		}[];
	}[];
}

/**
 * One place to stop. Shaped as an `OnsetGroup` (so `groupIndexAt` finds the
 * step at a position) and as Pitch mode's `PitchStep`.
 * - `wholes`: the written onset, in whole notes from the score start.
 * - `noteIds`: the notes struck there in the chosen staves, chord heads and
 *   every voice included; for a rest step, the rests.
 * - `midiPitches`: their pitches, low to high, without duplicates (two
 *   voices in unison sound one key). Empty for a rest step.
 */
export interface PracticeStep extends OnsetGroup {
	readonly midiPitches: readonly number[];
}

export interface StepSequenceOptions {
	/** Staff indices to walk (`Score.staves`), or `null` for every staff. */
	readonly staves?: readonly number[] | null;
	/** Keep an onset where the chosen staves only rest as a step of its own
	 * (empty `midiPitches`). Off by default: Step mode skips silence. An
	 * onset where a tied note is still held is never a rest step. */
	readonly includeRests?: boolean;
}

// Same rounding as `buildOnsetGroups`, so a step's `wholes` matches the
// onset group the view's cursor uses for the same notes.
function onsetKey(wholes: number): number {
	return Math.round(wholes * 1e6) / 1e6;
}

/**
 * The steps of `staves` in written order (each measure once, repeats not
 * unfolded: the same timeline Listen mode's audio and cursor follow).
 *
 * - A chord is one step, and so are notes in different voices or staves
 *   that start together.
 * - A tie continuation is not a new step: the note was struck where the tie
 *   began. At an onset where one voice continues a tie and another strikes,
 *   the step holds only the struck note.
 * - Grace notes are skipped (they have no written duration to stop on).
 * - Rests are skipped unless `includeRests`.
 */
export function buildStepSequence(
	score: StepSequenceSource,
	index: Pick<OnsetIndex, 'onsetWholes'>,
	options: StepSequenceOptions = {}
): PracticeStep[] {
	const wanted = options.staves ? new Set(options.staves) : null;
	// Every note some other note ties into, score-wide (a tie never crosses
	// staves, but it can cross a barline).
	const continuations = new Set<NoteId>();
	for (const staff of score.staves) {
		for (const measure of staff.measures) {
			for (const note of measure.notes) if (note.tiedToId) continuations.add(note.tiedToId);
		}
	}

	interface Slot {
		struck: NoteId[];
		pitches: Set<number>;
		rests: NoteId[];
		held: boolean;
	}
	const slots = new Map<number, Slot>();
	for (const [staffIndex, staff] of score.staves.entries()) {
		if (wanted && !wanted.has(staffIndex)) continue;
		for (const measure of staff.measures) {
			for (const note of measure.notes) {
				if (note.isGrace) continue;
				const onset = index.onsetWholes(note.id);
				if (onset === undefined) continue;
				const key = onsetKey(onset);
				let slot = slots.get(key);
				if (!slot) {
					slot = { struck: [], pitches: new Set(), rests: [], held: false };
					slots.set(key, slot);
				}
				const midi = midiPitchForEngineNote(note);
				if (midi === null) {
					// A rest, or a pitch out of MIDI range: nothing to sound.
					if (!note.pitch) slot.rests.push(note.id);
				} else if (continuations.has(note.id)) {
					slot.held = true;
				} else {
					slot.struck.push(note.id);
					slot.pitches.add(midi);
				}
			}
		}
	}

	const steps: PracticeStep[] = [];
	for (const [wholes, slot] of slots) {
		if (slot.struck.length > 0) {
			steps.push({ wholes, noteIds: slot.struck, midiPitches: [...slot.pitches].sort((a, b) => a - b) });
		} else if (options.includeRests && !slot.held && slot.rests.length > 0) {
			steps.push({ wholes, noteIds: slot.rests, midiPitches: [] });
		}
	}
	return steps.sort((a, b) => a.wholes - b.wholes);
}

/** One entry of a part picker: a named part and the staves it spans. */
export interface PracticePart {
	readonly name: string | null;
	readonly staves: readonly number[];
}

/**
 * The parts a singer can step through, top to bottom. The engine also
 * records a bracket or brace group (MusicXML's `<part-group>`) as a `Part`
 * spanning its members' staves; those are left out by keeping, for each
 * staff, only the narrowest part holding it. A piano's two staves stay one
 * part.
 */
export function practiceParts(score: {
	readonly parts: readonly { readonly name?: string; readonly staffIndices: readonly number[] }[];
}): PracticePart[] {
	const claimed = new Set<number>();
	const out: PracticePart[] = [];
	const narrowestFirst = [...score.parts].sort((a, b) => a.staffIndices.length - b.staffIndices.length);
	for (const part of narrowestFirst) {
		if (part.staffIndices.length === 0 || part.staffIndices.some((staff) => claimed.has(staff))) continue;
		for (const staff of part.staffIndices) claimed.add(staff);
		out.push({ name: part.name?.trim() || null, staves: [...part.staffIndices].sort((a, b) => a - b) });
	}
	return out.sort((a, b) => a.staves[0] - b.staves[0]);
}

/**
 * MIDI pitches sounding at `wholes` outside `staves` (struck there or held
 * over from earlier), low to high without duplicates: what "also play the
 * other parts" sounds under a step. Empty when `staves` is `null` (every
 * staff is already the step).
 */
export function otherStavesSounding(
	score: StepSequenceSource,
	index: Pick<OnsetIndex, 'notesSoundingAt'>,
	wholes: number,
	staves: readonly number[] | null
): number[] {
	if (!staves) return [];
	const wanted = new Set(staves);
	const sounding = new Set(index.notesSoundingAt(wholes));
	const pitches = new Set<number>();
	for (const [staffIndex, staff] of score.staves.entries()) {
		if (wanted.has(staffIndex)) continue;
		for (const measure of staff.measures) {
			for (const note of measure.notes) {
				if (!sounding.has(note.id)) continue;
				const midi = midiPitchForEngineNote(note);
				if (midi !== null) pitches.add(midi);
			}
		}
	}
	return [...pitches].sort((a, b) => a - b);
}
