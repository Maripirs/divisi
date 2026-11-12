import { describe, expect, it } from 'vitest';
// The real engine, statically: fine in a test (the app only ever loads it
// lazily, see `engineAdapter.ts`'s file comment).
import { createOnsetIndex, importMusicXml, parsePitch, toMidi, type Pitch } from 'notation-engine';
import {
	buildOnsetGroups,
	groupIndexAt,
	layoutToContainer,
	midiPitchForEngineNote,
	nearestByX,
	printedMeasureNumber,
	staffInkMap,
	stepAcrossStaves,
	stepInVoice,
	systemStaffExtent
} from './engineAdapter';

/** A two-part score: a one-eighth pickup (numbered 0, a measure rest in
 * the lower part) then a full 2/4 bar, so onsets after the pickup show
 * whether it was padded to a whole bar. */
const PICKUP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
	<part-list>
		<score-part id="P1"><part-name>S</part-name></score-part>
		<score-part id="P2"><part-name>A</part-name></score-part>
	</part-list>
	<part id="P1">
		<measure number="0" implicit="yes">
			<attributes><divisions>2</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
			<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
		</measure>
		<measure number="1">
			<note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><type>quarter</type></note>
			<note><rest/><duration>2</duration><type>quarter</type></note>
		</measure>
	</part>
	<part id="P2">
		<measure number="0" implicit="yes">
			<attributes><divisions>2</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
			<note><rest measure="yes"/><duration>1</duration></note>
		</measure>
		<measure number="1">
			<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>half</type></note>
		</measure>
	</part>
</score-partwise>`;

describe('buildOnsetGroups', () => {
	it('groups real notes by written onset, pickup not padded', () => {
		const score = importMusicXml(PICKUP_XML);
		const groups = buildOnsetGroups(score, createOnsetIndex(score));
		expect(groups.map((g) => g.wholes)).toEqual([0, 0.125, 0.375]);
		// The pickup onset holds the soprano G and the alto's measure rest;
		// the downbeat holds both parts' notes.
		expect(groups[0].noteIds).toHaveLength(2);
		expect(groups[1].noteIds).toHaveLength(2);
		expect(groups[2].noteIds).toHaveLength(1);
	});

	it('skips grace notes and notes with no onset', () => {
		const onsets = new Map([
			['a', 0],
			['b', 0.25],
			['c', 0.25]
		]);
		const groups = buildOnsetGroups(
			{
				staves: [
					{
						measures: [
							{
								notes: [
									{ id: 'a', isGrace: false },
									{ id: 'g', isGrace: true },
									{ id: 'b', isGrace: false },
									{ id: 'x', isGrace: false }
								]
							}
						]
					},
					{ measures: [{ notes: [{ id: 'c', isGrace: false }] }] }
				]
			},
			{ onsetWholes: (id) => onsets.get(id) }
		);
		expect(groups).toEqual([
			{ wholes: 0, noteIds: ['a'] },
			{ wholes: 0.25, noteIds: ['b', 'c'] }
		]);
	});
});

describe('groupIndexAt', () => {
	const groups = [0, 0.25, 0.5].map((wholes) => ({ wholes, noteIds: [] }));

	it('lands on the last onset at or before the position', () => {
		expect(groupIndexAt(groups, 0)).toBe(0);
		expect(groupIndexAt(groups, 0.3)).toBe(1);
		expect(groupIndexAt(groups, 9)).toBe(2);
	});

	it('treats an onset a rounding error ahead as reached', () => {
		expect(groupIndexAt(groups, 0.25 - 1e-9)).toBe(1);
	});

	it('is -1 before the first onset or with no onsets', () => {
		expect(groupIndexAt(groups, -0.1)).toBe(-1);
		expect(groupIndexAt([], 1)).toBe(-1);
	});
});

describe('midiPitchForEngineNote', () => {
	it('agrees with the engine’s toMidi', () => {
		for (const text of ['C4', 'A4', 'F#5', 'Bb3', 'C2', 'B#3', 'Cb4']) {
			const pitch = parsePitch(text);
			expect(midiPitchForEngineNote({ pitch })).toBe(toMidi(pitch));
		}
		expect(midiPitchForEngineNote({ pitch: parsePitch('C4') })).toBe(60);
	});

	it('reads pitches through import', () => {
		const score = importMusicXml(PICKUP_XML);
		const soprano = score.staves[0].measures.flatMap((m) => m.notes);
		expect(soprano.map((n) => midiPitchForEngineNote(n))).toEqual([67, 73, null]);
	});

	it('returns null for rests and out-of-range pitches', () => {
		expect(midiPitchForEngineNote({ pitch: null })).toBeNull();
		const tooHigh: Pitch = { step: 'C', alter: 0, octave: 12 };
		expect(midiPitchForEngineNote({ pitch: tooHigh })).toBeNull();
	});
});

describe('printedMeasureNumber', () => {
	it('reports the printed number, falling back to the position', () => {
		expect(printedMeasureNumber({ index: 0, number: '0' })).toBe(0);
		expect(printedMeasureNumber({ index: 4, number: '12a' })).toBe(12);
		expect(printedMeasureNumber({ index: 4 })).toBe(5);
		expect(printedMeasureNumber({ index: 4, number: 'X1' })).toBe(5);
	});

	it('keeps a pickup numbered 0 through import', () => {
		const score = importMusicXml(PICKUP_XML);
		expect(score.staves[1].measures.map(printedMeasureNumber)).toEqual([0, 1]);
	});
});

describe('staffInkMap', () => {
	it('dims muted staves, round-robin over the states', () => {
		const map = staffInkMap(3, ['active', 'muted'], 'ink', 'dim');
		expect([...map!.entries()]).toEqual([
			[0, 'ink'],
			[1, 'dim'],
			[2, 'ink']
		]);
	});

	it('is null with no states', () => {
		expect(staffInkMap(4, [], 'ink', 'dim')).toBeNull();
	});
});

describe('layoutToContainer', () => {
	it('derives scale and origin from one region/box pair', () => {
		const t = layoutToContainer({ x: 100, y: 50, width: 200, height: 80 }, { x: 60, y: 45, width: 100, height: 40 });
		expect(t).toEqual({ scale: 0.5, originX: 10, originY: 20 });
	});
});

describe('systemStaffExtent', () => {
	const layout = {
		staffSpacePx: 10,
		systems: [
			{ measureIndices: [0, 1], topY: 100, staffIndex: 0, spacingScale: 1 },
			{ measureIndices: [0, 1], topY: 200, staffIndex: 1, spacingScale: 1 },
			{ measureIndices: [2], topY: 400, staffIndex: 0, spacingScale: 1 }
		]
	};

	it('spans every staff of the measure’s system', () => {
		expect(systemStaffExtent(layout, 1)).toEqual({ top: 90, bottom: 250 });
		expect(systemStaffExtent(layout, 2)).toEqual({ top: 390, bottom: 450 });
	});

	it('is null for a measure in no system', () => {
		expect(systemStaffExtent(layout, 7)).toBeNull();
	});
});

describe('nearestByX', () => {
	const box = (x: number) => ({ box: { x, y: 0, width: 10, height: 10 } });

	it('picks the box whose centre is closest', () => {
		expect(nearestByX([box(0), box(40), box(100)], 52)).toEqual(box(40));
		expect(nearestByX([], 3)).toBeNull();
	});
});

describe('stepInVoice', () => {
	const score = importMusicXml(PICKUP_XML);
	const [g, cSharp, rest] = score.staves[0].measures.flatMap((m) => m.notes).map((n) => n.id);

	it('walks one voice across barlines, rests included', () => {
		expect(stepInVoice(score, g, 1)).toBe(cSharp);
		expect(stepInVoice(score, cSharp, 1)).toBe(rest);
		expect(stepInVoice(score, rest, -1)).toBe(cSharp);
	});

	it('stays put at either end of the voice', () => {
		expect(stepInVoice(score, g, -1)).toBeNull();
		expect(stepInVoice(score, rest, 1)).toBeNull();
	});

	it('steps a chord as one event and skips grace notes', () => {
		const note = (id: string, chordWithPrevious = false, isGrace = false) => ({ id, voice: 1, chordWithPrevious, isGrace });
		const chordScore = {
			staves: [{ measures: [{ notes: [note('a'), note('b'), note('b2', true), note('grace', false, true), note('c')] }] }]
		};
		expect(stepInVoice(chordScore, 'a', 1)).toBe('b');
		expect(stepInVoice(chordScore, 'b2', 1)).toBe('c');
		expect(stepInVoice(chordScore, 'c', -1)).toBe('b');
	});
});

describe('stepAcrossStaves', () => {
	const score = importMusicXml(PICKUP_XML);
	const onsets = createOnsetIndex(score);
	const onsetOf = (id: string) => onsets.onsetWholes(id);
	const [g, cSharp, rest] = score.staves[0].measures.flatMap((m) => m.notes).map((n) => n.id);
	const [altoRest, e] = score.staves[1].measures.flatMap((m) => m.notes).map((n) => n.id);

	it('lands on the event at the same onset', () => {
		expect(stepAcrossStaves(score, onsetOf, g, 1)).toBe(altoRest);
		expect(stepAcrossStaves(score, onsetOf, cSharp, 1)).toBe(e);
		expect(stepAcrossStaves(score, onsetOf, e, -1)).toBe(cSharp);
	});

	it('falls back to the latest event before the onset', () => {
		// The soprano rest starts mid-way through the alto's half note.
		expect(stepAcrossStaves(score, onsetOf, rest, 1)).toBe(e);
	});

	it('stays put on the top and bottom staff', () => {
		expect(stepAcrossStaves(score, onsetOf, g, -1)).toBeNull();
		expect(stepAcrossStaves(score, onsetOf, e, 1)).toBeNull();
	});
});
