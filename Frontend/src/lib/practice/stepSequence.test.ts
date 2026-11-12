import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// The real engine, statically: fine in a test (the app only ever loads it
// lazily, see `engineAdapter.ts`'s file comment).
import { createOnsetIndex, importMusicXml, type Note, type Score } from 'notation-engine';
import { groupIndexAt, midiPitchForEngineNote } from '$lib/components/score/engineAdapter';
import type { PitchStep } from './pitchSession';
import { buildStepSequence, otherStavesSounding, practiceParts, type PracticeStep } from './stepSequence';

function fixture(relative: string): Score {
	return importMusicXml(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

// Public-domain demo piece: SATB on one staff each, then a two-staff piano
// part (chords, two voices). Real ties, no grace notes.
const LACRYMOSA = fixture('../../../static/fixtures/demo/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.musicxml');
// Real SFCC pieces, read only. The Fay's Song: chords inside the choir
// staves, and onsets where every part rests. Der Abend: grace notes.
const FAYS_SONG = fixture('../../../../Backend/fixtures/SFCC/The_Fay_s_Song_Massi.musicxml');
const DER_ABEND = fixture('../../../../Backend/fixtures/SFCC/Brahms_Der_Abend.musicxml');

function staffNotes(score: Score, staffIndex: number): Note[] {
	return score.staves[staffIndex].measures.flatMap((measure) => measure.notes);
}

function tiedInto(score: Score): Set<string> {
	const ids = new Set<string>();
	for (const staff of score.staves) {
		for (const measure of staff.measures) for (const note of measure.notes) if (note.tiedToId) ids.add(note.tiedToId);
	}
	return ids;
}

function strictlyIncreasing(steps: readonly PracticeStep[]): boolean {
	return steps.every((step, i) => i === 0 || step.wholes > steps[i - 1].wholes);
}

describe('buildStepSequence on a single-voice part', () => {
	const index = createOnsetIndex(LACRYMOSA);
	const soprano = buildStepSequence(LACRYMOSA, index, { staves: [0] });
	const notes = staffNotes(LACRYMOSA, 0);
	const continuations = tiedInto(LACRYMOSA);

	it('has one step per struck note: rests and tie continuations dropped', () => {
		const struck = notes.filter((note) => !note.isRest && !continuations.has(note.id));
		expect(continuations.size).toBeGreaterThan(0);
		expect(soprano).toHaveLength(struck.length);
		expect(soprano.map((step) => step.noteIds[0])).toEqual(struck.map((note) => note.id));
	});

	it('walks written onsets in order, each with its note’s pitch', () => {
		expect(strictlyIncreasing(soprano)).toBe(true);
		for (const step of soprano) {
			const note = notes.find((n) => n.id === step.noteIds[0])!;
			expect(step.wholes).toBeCloseTo(index.onsetWholes(note.id)!, 6);
			expect(step.midiPitches).toEqual([midiPitchForEngineNote(note)]);
		}
		// The soprano enters after a three-bar 4/4 introduction, on A4.
		expect(soprano[0]).toMatchObject({ wholes: 3, midiPitches: [69] });
	});

	it('never lands on a tie continuation', () => {
		for (const step of soprano) for (const id of step.noteIds) expect(continuations.has(id)).toBe(false);
	});

	it('is a list of onset groups and of Pitch mode steps', () => {
		for (const [i, step] of soprano.entries()) expect(groupIndexAt(soprano, step.wholes)).toBe(i);
		const pitchSteps: readonly PitchStep[] = soprano;
		expect(pitchSteps.every((step) => step.midiPitches.length === 1)).toBe(true);
	});
});

describe('buildStepSequence with chords and several parts', () => {
	const index = createOnsetIndex(FAYS_SONG);

	it('makes a chord one step', () => {
		// Staff 1 (the alto line) has divisi chords: every chord head shares
		// its anchor's step.
		const steps = buildStepSequence(FAYS_SONG, index, { staves: [1] });
		const notes = staffNotes(FAYS_SONG, 1);
		const stepOf = new Map(steps.flatMap((step) => step.noteIds.map((id) => [id, step] as const)));
		let chords = 0;
		for (const [i, note] of notes.entries()) {
			if (!note.chordWithPrevious || !stepOf.has(note.id)) continue;
			const anchor = notes.slice(0, i).findLast((n) => !n.chordWithPrevious)!;
			// An anchor that continues a tie is in no step, but the struck
			// head still stops at its onset.
			if (stepOf.has(anchor.id)) expect(stepOf.get(note.id)).toBe(stepOf.get(anchor.id));
			else expect(stepOf.get(note.id)!.wholes).toBeCloseTo(index.onsetWholes(anchor.id)!, 6);
			chords++;
		}
		expect(chords).toBeGreaterThan(0);
		expect(steps[0]).toMatchObject({ wholes: 0.125, midiPitches: [62, 67] });
		expect(strictlyIncreasing(steps)).toBe(true);
	});

	it('merges every chosen staff into one walk', () => {
		const one = buildStepSequence(FAYS_SONG, index, { staves: [0] });
		const two = buildStepSequence(FAYS_SONG, index, { staves: [2] });
		const both = buildStepSequence(FAYS_SONG, index, { staves: [0, 2] });
		const union = [...new Set([...one, ...two].map((step) => step.wholes))].sort((a, b) => a - b);
		expect(both.map((step) => step.wholes)).toEqual(union);
		// A shared onset carries both parts' notes and pitches.
		const shared = both.find((step) => one.some((s) => s.wholes === step.wholes) && two.some((s) => s.wholes === step.wholes))!;
		const fromOne = one.find((s) => s.wholes === shared.wholes)!;
		const fromTwo = two.find((s) => s.wholes === shared.wholes)!;
		expect(new Set(shared.noteIds)).toEqual(new Set([...fromOne.noteIds, ...fromTwo.noteIds]));
		expect(shared.midiPitches).toEqual([...new Set([...fromOne.midiPitches, ...fromTwo.midiPitches])].sort((a, b) => a - b));
	});

	it('walks every staff with no filter', () => {
		const all = buildStepSequence(FAYS_SONG, index);
		const filtered = buildStepSequence(FAYS_SONG, index, { staves: [0, 1, 2, 3] });
		expect(all).toEqual(filtered);
		expect(buildStepSequence(FAYS_SONG, index, { staves: null })).toEqual(all);
	});

	it('keeps all-rest onsets only when asked', () => {
		const sung = buildStepSequence(FAYS_SONG, index);
		const withRests = buildStepSequence(FAYS_SONG, index, { includeRests: true });
		const rests = withRests.filter((step) => step.midiPitches.length === 0);
		expect(rests.length).toBeGreaterThan(0);
		expect(withRests).toHaveLength(sung.length + rests.length);
		expect(strictlyIncreasing(withRests)).toBe(true);
		for (const rest of rests) {
			expect(sung.some((step) => step.wholes === rest.wholes)).toBe(false);
			// Nothing is held over a rest step either.
			expect(index.notesSoundingAt(rest.wholes)).toEqual([]);
		}
	});
});

describe('buildStepSequence with grace notes', () => {
	it('skips them', () => {
		const graces = new Set(
			DER_ABEND.staves.flatMap((staff) => staff.measures.flatMap((m) => m.notes.filter((n) => n.isGrace).map((n) => n.id)))
		);
		expect(graces.size).toBeGreaterThan(0);
		const steps = buildStepSequence(DER_ABEND, createOnsetIndex(DER_ABEND));
		for (const step of steps) for (const id of step.noteIds) expect(graces.has(id)).toBe(false);
		expect(strictlyIncreasing(steps)).toBe(true);
	});
});

/** Voice 1 holds a half note tied over the barline while voice 2 strikes
 * on the downbeat, then voice 1's tie ends under a voice 2 rest. */
const TIE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
	<part-list><score-part id="P1"><part-name>S</part-name></score-part></part-list>
	<part id="P1">
		<measure number="1">
			<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
			<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice><type>half</type><notations><tied type="start"/></notations></note>
			<backup><duration>2</duration></backup>
			<note><rest/><duration>2</duration><voice>2</voice><type>half</type></note>
		</measure>
		<measure number="2">
			<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><type>quarter</type><notations><tied type="stop"/></notations></note>
			<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
			<backup><duration>2</duration></backup>
			<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type></note>
			<note><rest/><duration>1</duration><voice>2</voice><type>quarter</type></note>
		</measure>
		<measure number="3">
			<note><rest/><duration>2</duration><voice>1</voice><type>half</type></note>
		</measure>
	</part>
</score-partwise>`;

describe('buildStepSequence with a tie under another voice', () => {
	const score = importMusicXml(TIE_XML);
	const index = createOnsetIndex(score);

	it('keeps only the struck note where a tie continues', () => {
		const steps = buildStepSequence(score, index);
		expect(steps.map((step) => [step.wholes, step.midiPitches])).toEqual([
			[0, [72]],
			[0.5, [64]],
			[0.75, [74]]
		]);
	});

	it('makes a rest step only of real silence', () => {
		const steps = buildStepSequence(score, index, { includeRests: true });
		// Onset 0.75 has voice 2's rest but voice 1 strikes D; onset 1 is the
		// last bar's rest.
		expect(steps.map((step) => [step.wholes, step.midiPitches])).toEqual([
			[0, [72]],
			[0.5, [64]],
			[0.75, [74]],
			[1, []]
		]);
	});
});

describe('practiceParts', () => {
	it('lists each voice and the piano once, leaving out bracket groups', () => {
		expect(LACRYMOSA.parts.some((part) => part.staffIndices.length === 4)).toBe(true);
		expect(practiceParts(LACRYMOSA)).toEqual([
			{ name: 'Soprano', staves: [0] },
			{ name: 'Alto', staves: [1] },
			{ name: 'Tenor', staves: [2] },
			{ name: 'Bass', staves: [3] },
			{ name: 'Piano', staves: [4, 5] }
		]);
	});

	it('keeps an unnamed part, with no name', () => {
		expect(practiceParts({ parts: [{ name: ' ', staffIndices: [0] }, { staffIndices: [] }] })).toEqual([
			{ name: null, staves: [0] }
		]);
	});
});

describe('otherStavesSounding', () => {
	const index = createOnsetIndex(LACRYMOSA);
	const soprano = buildStepSequence(LACRYMOSA, index, { staves: [0] });

	it('sounds the other parts, held notes included, under a step', () => {
		const first = soprano[0];
		const others = otherStavesSounding(LACRYMOSA, index, first.wholes, [0]);
		const expected = new Set<number>();
		for (const [staffIndex, staff] of LACRYMOSA.staves.entries()) {
			if (staffIndex === 0) continue;
			for (const measure of staff.measures) {
				for (const note of measure.notes) {
					if (!index.notesSoundingAt(first.wholes).includes(note.id)) continue;
					const midi = midiPitchForEngineNote(note);
					if (midi !== null) expected.add(midi);
				}
			}
		}
		expect(others.length).toBeGreaterThan(0);
		expect(others).toEqual([...expected].sort((a, b) => a - b));
	});

	it('is empty when every staff is already the step', () => {
		expect(otherStavesSounding(LACRYMOSA, index, soprano[0].wholes, null)).toEqual([]);
	});
});
