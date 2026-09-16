import { describe, expect, it } from 'vitest';
import type { MIDILyricEvent, MIDINote, MixPart, VisualState, VoicePartInfo } from '../midi/types.ts';
import { mergeSplitDesksForDisplay, splitChordalDivisi } from './voicePartAssignment.ts';

// Base parts list shape every test starts from: plain SATB + accompaniment,
// the same unsplit shape `assignVoiceParts` produces for a file that names
// no split at all.
const flatParts: VoicePartInfo[] = [
	{ id: 'soprano', base: 'soprano', label: 'Soprano' },
	{ id: 'alto', base: 'alto', label: 'Alto' },
	{ id: 'tenor', base: 'tenor', label: 'Tenor' },
	{ id: 'bass', base: 'bass', label: 'Bass' },
	{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
];

function note(pitch: number, startMs: number, partId: string, durationMs = 500): MIDINote {
	return { pitch, startMs, durationMs, partId };
}

describe('splitChordalDivisi', () => {
	it('splits a base voice whose every onset has exactly 2 notes, higher pitch on desk 1', () => {
		const notes: MIDINote[] = [
			note(67, 0, 'soprano'), // G4
			note(60, 0, 'soprano'), // C4
			note(69, 500, 'soprano'), // A4
			note(62, 500, 'soprano') // D4
		];
		const result = splitChordalDivisi(flatParts, notes, []);

		expect(result.parts.map((p) => p.id)).toEqual([
			'soprano-1',
			'soprano-2',
			'alto',
			'tenor',
			'bass',
			'accompaniment'
		]);
		const soprano1 = result.parts.find((p) => p.id === 'soprano-1')!;
		const soprano2 = result.parts.find((p) => p.id === 'soprano-2')!;
		expect(soprano1).toEqual({ id: 'soprano-1', base: 'soprano', subIndex: 1, label: 'Soprano 1', autoSplit: true });
		expect(soprano2).toEqual({ id: 'soprano-2', base: 'soprano', subIndex: 2, label: 'Soprano 2', autoSplit: true });

		const desk1Notes = result.notes.filter((n) => n.partId === 'soprano-1').map((n) => n.pitch);
		const desk2Notes = result.notes.filter((n) => n.partId === 'soprano-2').map((n) => n.pitch);
		expect(desk1Notes).toEqual([67, 69]);
		expect(desk2Notes).toEqual([60, 62]);
		expect(result.notes.some((n) => n.partId === 'soprano')).toBe(false);
	});

	it('duplicates a 1-note onset onto both desks while still splitting 2-note onsets by pitch rank', () => {
		const notes: MIDINote[] = [
			note(67, 0, 'alto'), // 2-note onset: G4/C4
			note(60, 0, 'alto'),
			note(64, 500, 'alto') // 1-note onset (unison moment): E4
		];
		const result = splitChordalDivisi(flatParts, notes, []);

		const desk1 = result.notes.filter((n) => n.partId === 'alto-1');
		const desk2 = result.notes.filter((n) => n.partId === 'alto-2');
		expect(desk1.map((n) => n.pitch)).toEqual([67, 64]);
		expect(desk2.map((n) => n.pitch)).toEqual([60, 64]);
		// Both desks carry the unison note at the same pitch/timing.
		expect(desk1.find((n) => n.startMs === 500)?.pitch).toBe(desk2.find((n) => n.startMs === 500)?.pitch);
	});

	it('leaves a monophonic base voice unsplit', () => {
		const notes: MIDINote[] = [note(60, 0, 'tenor'), note(62, 500, 'tenor'), note(64, 1000, 'tenor')];
		const result = splitChordalDivisi(flatParts, notes, []);

		expect(result.parts).toEqual(flatParts);
		expect(result.notes).toEqual(notes);
	});

	it('bails out entirely when any onset stacks more than 2 notes, even with clean 2-note onsets elsewhere', () => {
		const notes: MIDINote[] = [
			note(67, 0, 'bass'),
			note(60, 0, 'bass'),
			note(72, 500, 'bass'),
			note(65, 500, 'bass'),
			note(58, 500, 'bass') // 3-note onset
		];
		const result = splitChordalDivisi(flatParts, notes, []);

		expect(result.parts).toEqual(flatParts);
		expect(result.notes).toEqual(notes);
		expect(result.notes.some((n) => n.partId === 'bass-1')).toBe(false);
	});

	it('duplicates a lyric at a split onset onto both desk ids', () => {
		const notes: MIDINote[] = [note(67, 0, 'soprano'), note(60, 0, 'soprano')];
		const lyrics: MIDILyricEvent[] = [{ text: 'Glo-', timeMs: 0, partId: 'soprano' }];
		const result = splitChordalDivisi(flatParts, notes, lyrics);

		expect(result.lyrics).toEqual([
			{ text: 'Glo-', timeMs: 0, partId: 'soprano-1' },
			{ text: 'Glo-', timeMs: 0, partId: 'soprano-2' }
		]);
	});

	it('is a no-op for a base voice already absent from parts (already name-split)', () => {
		const alreadySplitParts: VoicePartInfo[] = [
			{ id: 'soprano-1', base: 'soprano', subIndex: 1, label: 'Soprano 1' },
			{ id: 'soprano-2', base: 'soprano', subIndex: 2, label: 'Soprano 2' },
			{ id: 'alto', base: 'alto', label: 'Alto' },
			{ id: 'tenor', base: 'tenor', label: 'Tenor' },
			{ id: 'bass', base: 'bass', label: 'Bass' },
			{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
		];
		const notes: MIDINote[] = [note(67, 0, 'soprano-1'), note(60, 0, 'soprano-2')];
		const result = splitChordalDivisi(alreadySplitParts, notes, []);

		expect(result.parts).toEqual(alreadySplitParts);
		expect(result.notes).toEqual(notes);
	});
});

describe('mergeSplitDesksForDisplay', () => {
	function activeStates(parts: VoicePartInfo[]): Record<MixPart, VisualState> {
		return Object.fromEntries(parts.map((p) => [p.id, 'active' as VisualState]));
	}

	it('reverses a clean 2-note-onset split back into one chord on the base id', () => {
		const notes: MIDINote[] = [
			note(67, 0, 'soprano'), // G4
			note(60, 0, 'soprano'), // C4
			note(69, 500, 'soprano'), // A4
			note(62, 500, 'soprano') // D4
		];
		const split = splitChordalDivisi(flatParts, notes, []);
		const result = mergeSplitDesksForDisplay(split.parts, split.notes, split.lyrics, activeStates(split.parts));

		expect(result.parts.map((p) => p.id)).toEqual(['soprano', 'alto', 'tenor', 'bass', 'accompaniment']);
		expect(result.parts.find((p) => p.id === 'soprano')).toEqual({
			id: 'soprano',
			base: 'soprano',
			subIndex: undefined,
			label: 'Soprano'
		});

		const sopranoNotes = result.notes.filter((n) => n.partId === 'soprano');
		expect(sopranoNotes.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([60, 62, 67, 69]);
		expect(result.notes.some((n) => n.partId === 'soprano-1' || n.partId === 'soprano-2')).toBe(false);
	});

	it('reverses a unison-duplicated onset into one note, not two', () => {
		const notes: MIDINote[] = [
			note(67, 0, 'alto'), // 2-note onset
			note(60, 0, 'alto'),
			note(64, 500, 'alto') // 1-note (unison) onset, duplicated onto both desks by the split
		];
		const split = splitChordalDivisi(flatParts, notes, []);
		const result = mergeSplitDesksForDisplay(split.parts, split.notes, split.lyrics, activeStates(split.parts));

		const altoNotes = result.notes.filter((n) => n.partId === 'alto');
		expect(altoNotes.filter((n) => n.startMs === 500)).toHaveLength(1);
		expect(altoNotes.filter((n) => n.startMs === 500)[0].pitch).toBe(64);
		expect(altoNotes).toHaveLength(3); // 2 notes from the chord onset + 1 deduped unison note
	});

	it('dedupes a lyric duplicated onto both desks back to one', () => {
		const notes: MIDINote[] = [note(67, 0, 'soprano'), note(60, 0, 'soprano')];
		const lyrics: MIDILyricEvent[] = [{ text: 'Glo-', timeMs: 0, partId: 'soprano' }];
		const split = splitChordalDivisi(flatParts, notes, lyrics);
		const result = mergeSplitDesksForDisplay(split.parts, split.notes, split.lyrics, activeStates(split.parts));

		expect(result.lyrics).toEqual([{ text: 'Glo-', timeMs: 0, partId: 'soprano' }]);
	});

	it('is a no-op when there is no split pair to merge', () => {
		const notes: MIDINote[] = [note(60, 0, 'tenor')];
		const result = mergeSplitDesksForDisplay(flatParts, notes, [], activeStates(flatParts));

		expect(result.parts).toEqual(flatParts);
		expect(result.notes).toEqual(notes);
	});

	it('leaves a file-named divisi split alone (not produced by splitChordalDivisi)', () => {
		// Same "Soprano 1"/"Soprano 2" shape a real two-staff source file
		// produces via `assignVoiceParts` -- no `autoSplit` flag, since the
		// file named this split itself rather than `splitChordalDivisi`
		// inventing it for mixer purposes only.
		const namedSplitParts: VoicePartInfo[] = [
			{ id: 'soprano-1', base: 'soprano', subIndex: 1, label: 'Soprano 1' },
			{ id: 'soprano-2', base: 'soprano', subIndex: 2, label: 'Soprano 2' },
			{ id: 'alto', base: 'alto', label: 'Alto' },
			{ id: 'tenor', base: 'tenor', label: 'Tenor' },
			{ id: 'bass', base: 'bass', label: 'Bass' },
			{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
		];
		const notes: MIDINote[] = [note(67, 0, 'soprano-1'), note(60, 0, 'soprano-2')];
		const result = mergeSplitDesksForDisplay(namedSplitParts, notes, [], activeStates(namedSplitParts));

		expect(result.parts).toEqual(namedSplitParts);
		expect(result.notes).toEqual(notes);
	});

	it('does not mutate its inputs', () => {
		const notes: MIDINote[] = [note(67, 0, 'soprano'), note(60, 0, 'soprano')];
		const split = splitChordalDivisi(flatParts, notes, []);
		const partsBefore = JSON.parse(JSON.stringify(split.parts));
		const notesBefore = JSON.parse(JSON.stringify(split.notes));
		const lyricsBefore = JSON.parse(JSON.stringify(split.lyrics));
		const statesBefore = activeStates(split.parts);
		const statesBeforeCopy = { ...statesBefore };

		mergeSplitDesksForDisplay(split.parts, split.notes, split.lyrics, statesBefore);

		expect(split.parts).toEqual(partsBefore);
		expect(split.notes).toEqual(notesBefore);
		expect(split.lyrics).toEqual(lyricsBefore);
		expect(statesBefore).toEqual(statesBeforeCopy);
	});

	describe('visual state merge rule', () => {
		const cases: [VisualState, VisualState, VisualState][] = [
			['off', 'off', 'off'],
			['muted', 'muted', 'muted'],
			['active', 'active', 'active'],
			['active', 'muted', 'active'],
			['muted', 'active', 'active'],
			['off', 'active', 'active'],
			['active', 'off', 'active'],
			['off', 'muted', 'active'],
			['muted', 'off', 'active']
		];

		it.each(cases)('desk1=%s, desk2=%s -> %s', (desk1State, desk2State, expected) => {
			const notes: MIDINote[] = [note(67, 0, 'soprano'), note(60, 0, 'soprano')];
			const split = splitChordalDivisi(flatParts, notes, []);
			const states = activeStates(split.parts);
			states['soprano-1'] = desk1State;
			states['soprano-2'] = desk2State;

			const result = mergeSplitDesksForDisplay(split.parts, split.notes, split.lyrics, states);

			expect(result.visualStates['soprano']).toBe(expected);
		});
	});
});
