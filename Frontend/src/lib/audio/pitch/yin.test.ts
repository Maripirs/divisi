import { describe, expect, it } from 'vitest';
import { frequencyToMidi, midiToFrequency } from './notes';
import { detectPitch, yinLagRange } from './yin';

const FRAME = 2048;
const RATES = [44100, 48000];

/** Signed distance in cents from `expected` to `actual`. */
function centsBetween(actual: number, expected: number): number {
	return (frequencyToMidi(actual) - frequencyToMidi(expected)) * 100;
}

/** A sum of sine partials, each `[harmonic number, amplitude]` of `f0`. */
function harmonics(f0: number, sampleRate: number, partials: [number, number][], phase = 0.3): Float32Array {
	const out = new Float32Array(FRAME);
	for (let i = 0; i < FRAME; i++) {
		const t = i / sampleRate;
		let v = 0;
		for (const [h, a] of partials) v += a * Math.sin(2 * Math.PI * h * f0 * t + phase * h);
		out[i] = v;
	}
	return out;
}

function sine(f: number, sampleRate: number, amplitude = 0.5): Float32Array {
	return harmonics(f, sampleRate, [[1, amplitude]]);
}

/** Mulberry32: tiny seeded PRNG so the noise tests are deterministic. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function whiteNoise(amplitude: number, seed: number): Float32Array {
	const rand = mulberry32(seed);
	const out = new Float32Array(FRAME);
	for (let i = 0; i < FRAME; i++) out[i] = amplitude * (rand() * 2 - 1);
	return out;
}

describe('detectPitch: pure sines', () => {
	// E2 (bass low E), A2, C4, A4, C6 (soprano high C), plus a few between.
	const NOTES = [
		['E2', 40],
		['A2', 45],
		['D3', 50],
		['C4', 60],
		['A4', 69],
		['E5', 76],
		['C6', 84]
	] as const;

	for (const sampleRate of RATES) {
		for (const [name, midi] of NOTES) {
			it(`detects ${name} within 1 cent at ${sampleRate} Hz`, () => {
				const f = midiToFrequency(midi);
				const result = detectPitch(sine(f, sampleRate), sampleRate);
				expect(result).not.toBeNull();
				expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(1);
				expect(result!.confidence).toBeGreaterThan(0.95);
			});
		}
	}

	it('detects a slightly detuned pitch, not the nearest note', () => {
		// 24 cents flat C4, the drift Slice 1 is chasing.
		const result = detectPitch(sine(258, 44100), 44100);
		expect(Math.abs(centsBetween(result!.frequency, 258))).toBeLessThan(1);
	});
});

describe('detectPitch: harmonics and octave errors', () => {
	for (const sampleRate of RATES) {
		it(`reports the fundamental of a voice-like harmonic tone at ${sampleRate} Hz`, () => {
			const f = midiToFrequency(57); // A3
			const signal = harmonics(f, sampleRate, [
				[1, 0.5],
				[2, 0.35],
				[3, 0.25],
				[4, 0.15],
				[5, 0.1]
			]);
			const result = detectPitch(signal, sampleRate);
			expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(2);
		});

		it(`reports the fundamental, not the octave above, when the 2nd harmonic dominates at ${sampleRate} Hz`, () => {
			// The 2nd harmonic at twice the fundamental's amplitude: four times
			// its energy. (Far weaker fundamentals, around 1:4 amplitude, sit at
			// the threshold and can read an octave high; that is YIN's known
			// limit and real voices rarely go there.)
			const f = midiToFrequency(50); // D3
			const signal = harmonics(f, sampleRate, [
				[1, 0.3],
				[2, 0.6],
				[4, 0.1]
			]);
			const result = detectPitch(signal, sampleRate);
			expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(2);
		});
	}

	it('does not report the octave below on a pure high tone', () => {
		// The lag search could also find a dip at twice the period; YIN takes
		// the first dip, so this must stay at the true pitch.
		const f = midiToFrequency(72);
		const result = detectPitch(sine(f, 48000), 48000);
		expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(1);
	});

	it('recovers a missing fundamental from harmonics 2 to 5', () => {
		const f = 110; // A2, absent from the signal
		const signal = harmonics(f, 44100, [
			[2, 0.4],
			[3, 0.35],
			[4, 0.25],
			[5, 0.15]
		]);
		const result = detectPitch(signal, 44100);
		expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(2);
	});
});

describe('detectPitch: vibrato', () => {
	for (const sampleRate of RATES) {
		it(`stays near the centre pitch with 50 cent, 5.5 Hz vibrato at ${sampleRate} Hz`, () => {
			const centreMidi = 64; // E4
			const depthCents = 50;
			const rateHz = 5.5;
			// Several starting points in the vibrato cycle: the frame (about
			// 45 ms) covers a quarter of a cycle, so the reading moves around
			// the centre but must stay within the vibrato's own swing.
			for (let k = 0; k < 8; k++) {
				const startPhase = (k / 8) * 2 * Math.PI;
				const frame = new Float32Array(FRAME);
				let phase = 0;
				for (let i = 0; i < FRAME; i++) {
					const t = i / sampleRate;
					const cents = depthCents * Math.sin(2 * Math.PI * rateHz * t + startPhase);
					const f = midiToFrequency(centreMidi + cents / 100);
					phase += (2 * Math.PI * f) / sampleRate;
					frame[i] = 0.5 * Math.sin(phase);
				}
				const result = detectPitch(frame, sampleRate);
				expect(result).not.toBeNull();
				expect(Math.abs(centsBetween(result!.frequency, midiToFrequency(centreMidi)))).toBeLessThanOrEqual(
					depthCents + 5
				);
			}
		});
	}
});

describe('detectPitch: rejection', () => {
	it('returns null for digital silence', () => {
		expect(detectPitch(new Float32Array(FRAME), 44100)).toBeNull();
	});

	it('returns null for low-level white noise (under the silence gate)', () => {
		expect(detectPitch(whiteNoise(0.005, 1), 44100)).toBeNull();
	});

	it('returns null for loud white noise (nothing periodic)', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			expect(detectPitch(whiteNoise(0.5, seed), 48000)).toBeNull();
		}
	});

	it('returns null for an empty frame or a bad sample rate', () => {
		expect(detectPitch(new Float32Array(0), 44100)).toBeNull();
		expect(detectPitch(sine(440, 44100), 0)).toBeNull();
	});

	it('still detects a quiet tone above the silence gate', () => {
		const result = detectPitch(sine(220, 44100, 0.03), 44100);
		expect(Math.abs(centsBetween(result!.frequency, 220))).toBeLessThan(1);
	});

	it('detects a sine with light noise on top', () => {
		const f = midiToFrequency(62);
		const signal = sine(f, 44100);
		const noise = whiteNoise(0.02, 7);
		for (let i = 0; i < FRAME; i++) signal[i] += noise[i];
		const result = detectPitch(signal, 44100);
		expect(Math.abs(centsBetween(result!.frequency, f))).toBeLessThan(5);
	});
});

describe('detectPitch: options', () => {
	it('ignores pitches outside the frequency bounds', () => {
		// A 1500 Hz tone with the default 1200 Hz ceiling: its period is too
		// short to search, so the first dip found is at twice the period.
		// With the bound raised it is found directly.
		const raised = detectPitch(sine(1500, 48000), 48000, { maxFrequency: 2000 });
		expect(Math.abs(centsBetween(raised!.frequency, 1500))).toBeLessThan(1);
		const bounded = detectPitch(sine(1500, 48000), 48000);
		expect(bounded === null || Math.abs(centsBetween(bounded.frequency, 1500)) > 100).toBe(true);
	});

	it('reuses a caller buffer and gives the same answer', () => {
		const { maxLag } = yinLagRange(FRAME, 44100);
		const buffer = new Float32Array(maxLag + 1);
		const signal = sine(330, 44100);
		const a = detectPitch(signal, 44100, { buffer });
		const b = detectPitch(signal, 44100);
		expect(a).toEqual(b);
		// And a too-small buffer is not used (no out-of-bounds writes).
		expect(detectPitch(signal, 44100, { buffer: new Float32Array(4) })).toEqual(b);
	});

	it('honours a custom silence gate', () => {
		const quiet = sine(220, 44100, 0.03);
		expect(detectPitch(quiet, 44100, { silenceRms: 0.05 })).toBeNull();
	});
});
