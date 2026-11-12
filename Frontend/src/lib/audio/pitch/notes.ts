// Frequency <-> MIDI helpers for pitch detection and the tuner needle.
// Pure math on plain numbers so they can be reused anywhere (including a
// future Android port) without pulling in audio or DOM types.

/** Concert pitch most choirs tune to. */
export const DEFAULT_A4_HZ = 440;

/** MIDI note number of A4. */
const A4_MIDI = 69;

/** A frequency as a fractional MIDI number (A4 = 69, C4 = 60). Fractional so
 * callers can keep the cents offset; 69.5 is a quarter tone above A4. */
export function frequencyToMidi(frequency: number, a4 = DEFAULT_A4_HZ): number {
	return A4_MIDI + 12 * Math.log2(frequency / a4);
}

/** The frequency of a (possibly fractional) MIDI number. */
export function midiToFrequency(midi: number, a4 = DEFAULT_A4_HZ): number {
	return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** The nearest equal-tempered note and how far off it the frequency is.
 * `cents` is signed (negative = flat) and lies in [-50, 50]. */
export function nearestNote(frequency: number, a4 = DEFAULT_A4_HZ): { midi: number; cents: number } {
	const exact = frequencyToMidi(frequency, a4);
	const midi = Math.round(exact);
	return { midi, cents: (exact - midi) * 100 };
}
