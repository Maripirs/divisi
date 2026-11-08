import { describe, expect, it } from 'vitest';
import { midiPitchForOsmdNote } from './osmdNotePitch';

function pitched(halfTone: number) {
	return { isRest: () => false, halfTone };
}

describe('midiPitchForOsmdNote', () => {
	it('maps OSMD halfTone to MIDI with middle C as 60', () => {
		// OSMD: C4 (xml octave 4 -> internal octave 1) = 0 + 12 * (1 + 3) = 48.
		expect(midiPitchForOsmdNote(pitched(48))).toBe(60);
		// A4 = 57 in OSMD (its own calcFrequency's 440 Hz reference).
		expect(midiPitchForOsmdNote(pitched(57))).toBe(69);
	});

	it('returns null for rests', () => {
		expect(midiPitchForOsmdNote({ isRest: () => true, halfTone: 0 })).toBeNull();
	});

	it('returns null for out-of-range pitches', () => {
		expect(midiPitchForOsmdNote(pitched(-20))).toBeNull();
		expect(midiPitchForOsmdNote(pitched(120))).toBeNull();
		expect(midiPitchForOsmdNote(pitched(Number.NaN))).toBeNull();
	});
});
