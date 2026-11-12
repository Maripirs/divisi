// Pure glue between Divisi's score-view contract (a whole-note clock,
// per-staff visual states, printed measure numbers, MIDI pitches) and
// notation-engine's note-id based model, for `EngineScoreView.svelte`.
//
// Type-only imports from the engine on purpose: the engine is loaded with a
// dynamic `import()` inside the view's `onMount` so it stays out of the OSMD
// path's bundle and out of SSR. Anything here that needed an engine runtime
// value would pull the whole engine into whichever chunk imports this file.

import type { LaidOutScore, NoteId, OnsetIndex, Pitch, Rect } from 'notation-engine';
import type { VisualState } from '$lib/midi/types';

// Whole notes. Far below the shortest real note (a 1/128 is ~0.008), far
// above float rounding error; same slack as ScoreView's cursor stepping.
const EPSILON = 1e-6;

/** The slice of an engine `Score` the onset grouping walks. Structural so
 * tests can build one without the engine. */
export interface OnsetSource {
	readonly staves: readonly {
		readonly measures: readonly { readonly notes: readonly { readonly id: NoteId; readonly isGrace: boolean }[] }[];
	}[];
}

/** Every note (rests included) that starts at one written onset. */
export interface OnsetGroup {
	readonly wholes: number;
	readonly noteIds: readonly NoteId[];
}

/** Groups every non-grace note by its written onset (the engine's
 * `OnsetIndex.onsetWholes`), sorted by time. The engine's own
 * `notesSoundingAt` answers "what is sounding now", which includes notes
 * held over from earlier onsets and skips rests; OSMD's cursor instead sits
 * on the most recent onset, rests included, and that is what Divisi's
 * cursor, clicks and markers are built around. Grace notes share their
 * principal's onset, so they add nothing a cursor could land on. */
export function buildOnsetGroups(score: OnsetSource, index: Pick<OnsetIndex, 'onsetWholes'>): OnsetGroup[] {
	const byOnset = new Map<number, NoteId[]>();
	for (const staff of score.staves) {
		for (const measure of staff.measures) {
			for (const note of measure.notes) {
				if (note.isGrace) continue;
				const onset = index.onsetWholes(note.id);
				if (onset === undefined) continue;
				const key = Math.round(onset * 1e6) / 1e6;
				const ids = byOnset.get(key);
				if (ids) ids.push(note.id);
				else byOnset.set(key, [note.id]);
			}
		}
	}
	return [...byOnset.entries()]
		.map(([wholes, noteIds]) => ({ wholes, noteIds }))
		.sort((a, b) => a.wholes - b.wholes);
}

/** Index of the last group at or before `wholes` (OSMD cursor semantics:
 * the cursor sits on the most recent onset, never between two), or -1
 * before the first one. `wholes` usually comes back from a ms round trip,
 * so an onset a rounding error ahead still counts as reached. */
export function groupIndexAt(groups: readonly OnsetGroup[], wholes: number): number {
	let lo = 0;
	let hi = groups.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (groups[mid].wholes <= wholes + EPSILON) {
			found = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return found;
}

const STEP_SEMITONES: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** An engine note's MIDI number (middle C, C4, is 60), or `null` for a rest.
 * The engine equivalent of `midiPitchForOsmdNote`; written out rather than
 * calling the engine's `toMidi` so this module needs no engine runtime (see
 * the file comment). The test checks it agrees with `toMidi`. */
export function midiPitchForEngineNote(note: { readonly pitch: Pitch | null }): number | null {
	const pitch = note.pitch;
	if (!pitch) return null;
	const midi = 12 * (pitch.octave + 1) + STEP_SEMITONES[pitch.step] + pitch.alter;
	// Defensive, as for OSMD: never send an out-of-range key to the synth.
	if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;
	return midi;
}

/** The number `onMeasureClick` reports: MusicXML's printed `<measure
 * number>` (the engine keeps it verbatim as `Measure.number`), the same
 * value OSMD's `MeasureNumberXML` gives. A label like "12a" reports 12; a
 * measure without one falls back to its 1-based position. */
export function printedMeasureNumber(measure: { readonly index: number; readonly number?: string }): number {
	const printed = parseInt(measure.number ?? '', 10);
	return Number.isNaN(printed) ? measure.index + 1 : printed;
}

/** Ink per staff for `renderer.setStaffColors`: muted staves in
 * `mutedInk`, the rest in `activeInk`. `states` is per engraved staff, top
 * to bottom, indexed round-robin when there are more staves than states,
 * the same reading ScoreView's `renderedStaffBands` gives them. `null`
 * (every staff in the renderer's own foreground) when there are no states. */
export function staffInkMap(
	staffCount: number,
	states: readonly VisualState[],
	activeInk: string,
	mutedInk: string
): Map<number, string> | null {
	if (states.length === 0) return null;
	const colors = new Map<number, string>();
	for (let staff = 0; staff < staffCount; staff++) {
		colors.set(staff, states[staff % states.length] === 'muted' ? mutedInk : activeInk);
	}
	return colors;
}

/** Maps layout coordinates to the view's container coordinates (the space
 * `noteBox`/`measureBox` report in). The engine only exposes boxes, not
 * the scale and origin behind them, so derive both from one measure whose
 * layout region and on-screen box are both known. */
export interface LayoutToContainer {
	readonly scale: number;
	readonly originX: number;
	readonly originY: number;
}

export function layoutToContainer(region: Rect, box: Rect): LayoutToContainer {
	const scale = region.width > 0 ? box.width / region.width : 1;
	return { scale, originX: box.x - region.x * scale, originY: box.y - region.y * scale };
}

/** Top and bottom (layout y) of the staves of the system holding
 * `measureIndex`: from a space above the top staff's top line to a space
 * below the bottom staff's bottom line, i.e. the span OSMD's playback cursor
 * covers. `null` for a measure no system holds. */
export function systemStaffExtent(
	layout: Pick<LaidOutScore, 'systems' | 'staffSpacePx'>,
	measureIndex: number
): { top: number; bottom: number } | null {
	const rows = layout.systems.filter((row) => row.measureIndices.includes(measureIndex));
	if (rows.length === 0) return null;
	const space = layout.staffSpacePx;
	return {
		top: Math.min(...rows.map((row) => row.topY)) - space,
		bottom: Math.max(...rows.map((row) => row.topY)) + 5 * space
	};
}

/** The entry whose box centre is nearest `x` horizontally: given the notes
 * of the clicked measure, the one a click in empty staff space meant (the
 * engine's `hitTest` has no tolerance, where OSMD's `GetNearestNote` has
 * one). `null` when `boxes` is empty. */
export function nearestByX<T extends { readonly box: Rect }>(boxes: readonly T[], x: number): T | null {
	let best: T | null = null;
	let bestDistance = Infinity;
	for (const entry of boxes) {
		const distance = Math.abs(entry.box.x + entry.box.width / 2 - x);
		if (distance < bestDistance) {
			best = entry;
			bestDistance = distance;
		}
	}
	return best;
}

/** The slice of an engine `Score` keyboard stepping walks. Structural so
 * tests can build one without the engine. */
export interface StepSource {
	readonly staves: readonly {
		readonly measures: readonly {
			readonly notes: readonly {
				readonly id: NoteId;
				readonly voice: number;
				readonly chordWithPrevious: boolean;
				readonly isGrace: boolean;
			}[];
		}[];
	}[];
}

type StepNote = StepSource['staves'][number]['measures'][number]['notes'][number];

/** Where `noteId` sits: its staff, and its event (a chord member counts as
 * its anchor, the nearest earlier head of its measure and voice that does
 * not join the previous note). Grace notes are skipped: they have no onset
 * on the whole-note clock, so a step could not seek to one. */
function locateEvent(score: StepSource, noteId: NoteId): { staffIndex: number; anchor: StepNote } | undefined {
	for (const [staffIndex, staff] of score.staves.entries()) {
		for (const measure of staff.measures) {
			const at = measure.notes.findIndex((note) => note.id === noteId);
			if (at < 0) continue;
			const note = measure.notes[at];
			if (!note.chordWithPrevious) return { staffIndex, anchor: note };
			for (let i = at - 1; i >= 0; i--) {
				const earlier = measure.notes[i];
				if (earlier.voice === note.voice && !earlier.chordWithPrevious) return { staffIndex, anchor: earlier };
			}
			return { staffIndex, anchor: note };
		}
	}
	return undefined;
}

/** Left/Right: the next (`+1`) or previous (`-1`) event in `noteId`'s own
 * staff and voice, across barlines, landing on a chord's anchor. `null` at
 * either end of the voice. notation-engine's read-mode stepping (its demo's
 * `stepSelection`). */
export function stepInVoice(score: StepSource, noteId: NoteId, direction: 1 | -1): NoteId | null {
	const found = locateEvent(score, noteId);
	if (!found) return null;
	const { staffIndex, anchor } = found;
	const events = score.staves[staffIndex].measures.flatMap((measure) =>
		measure.notes.filter((note) => note.voice === anchor.voice && !note.chordWithPrevious && !note.isGrace)
	);
	const at = events.indexOf(anchor);
	if (at < 0) return null;
	return events[at + direction]?.id ?? null;
}

/** Up/Down: the event on the staff above (`-1`) or below (`+1`) that starts
 * at `noteId`'s onset or, failing that, the latest one before it (rests
 * count, grace notes do not; on a tie between voices the first seen wins).
 * `null` on the top or bottom staff. notation-engine's read-mode stepping
 * (its demo's `stepStaff`). */
export function stepAcrossStaves(
	score: StepSource,
	onsetOf: (noteId: NoteId) => number | undefined,
	noteId: NoteId,
	direction: 1 | -1
): NoteId | null {
	const found = locateEvent(score, noteId);
	const at = found && onsetOf(found.anchor.id);
	const staff = found && score.staves[found.staffIndex + direction];
	if (!staff || at === undefined) return null;
	let best: { id: NoteId; onset: number } | null = null;
	for (const measure of staff.measures) {
		for (const note of measure.notes) {
			if (note.isGrace || note.chordWithPrevious) continue;
			const onset = onsetOf(note.id);
			if (onset === undefined) continue;
			if (onset <= at + EPSILON && (best === null || onset > best.onset + EPSILON)) best = { id: note.id, onset };
		}
	}
	return best?.id ?? null;
}
