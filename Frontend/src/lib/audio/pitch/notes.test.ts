import { describe, expect, it } from 'vitest';
import { frequencyToMidi, midiToFrequency, nearestNote } from './notes';

describe('frequencyToMidi', () => {
	it('maps reference pitches to their MIDI numbers', () => {
		expect(frequencyToMidi(440)).toBeCloseTo(69, 10);
		expect(frequencyToMidi(261.6255653)).toBeCloseTo(60, 6);
		expect(frequencyToMidi(82.4068892)).toBeCloseTo(40, 6);
	});

	it('is fractional between notes', () => {
		// A quarter tone above A4.
		expect(frequencyToMidi(440 * Math.pow(2, 0.5 / 12))).toBeCloseTo(69.5, 10);
	});

	it('honours a different A4', () => {
		expect(frequencyToMidi(442, 442)).toBeCloseTo(69, 10);
		expect(frequencyToMidi(440, 442)).toBeLessThan(69);
	});

	it('round-trips through midiToFrequency', () => {
		for (const midi of [40, 57.3, 60, 69, 84]) {
			expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 10);
		}
	});
});

describe('nearestNote', () => {
	it('returns the note and zero cents on an exact pitch', () => {
		const { midi, cents } = nearestNote(440);
		expect(midi).toBe(69);
		expect(cents).toBeCloseTo(0, 8);
	});

	it('reports flat as negative and sharp as positive cents', () => {
		// C4 measured at 258 Hz is about 24 cents flat.
		const flat = nearestNote(258);
		expect(flat.midi).toBe(60);
		expect(flat.cents).toBeCloseTo(-24.16, 2);

		const sharp = nearestNote(midiToFrequency(60.3));
		expect(sharp.midi).toBe(60);
		expect(sharp.cents).toBeCloseTo(30, 6);
	});

	it('rounds to the closer neighbour past 50 cents', () => {
		const { midi, cents } = nearestNote(midiToFrequency(60.7));
		expect(midi).toBe(61);
		expect(cents).toBeCloseTo(-30, 6);
	});
});
