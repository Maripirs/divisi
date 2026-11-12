// YIN monophonic pitch detector (de Cheveigné & Kawahara, 2002).
//
// Pure TypeScript over a `Float32Array` frame and a sample rate: no Web
// Audio, no DOM. The mic tracker (Slice 6) owns the audio graph and hands
// frames in; keeping the math here makes it unit-testable on synthetic
// signals and portable.
//
// Steps, as in the paper:
// 1. difference function d(tau) = sum_j (x[j] - x[j + tau])^2
// 2. cumulative mean normalized difference (CMND), which stays near 1 for
//    small lags instead of dipping to 0 at tau = 0, so the search no longer
//    favours very short lags (the classic "octave too high" error)
// 3. absolute threshold: take the first lag whose CMND dips under the
//    threshold, then follow it down to the bottom of that dip. Taking the
//    first dip (shortest period) instead of the global minimum is what stops
//    the detector picking a multiple of the period (an octave too low).
// 4. parabolic interpolation around that lag for sub-sample precision,
//    needed for cent-level accuracy on high notes where the period is only
//    tens of samples.

export interface PitchDetection {
	/** Hz. */
	frequency: number;
	/** 1 minus the CMND at the chosen lag, in [0, 1]. A clean periodic
	 * signal scores close to 1. */
	confidence: number;
}

export interface YinOptions {
	/** Lowest frequency searched, in Hz. Bounds the longest lag. Default 60
	 * (below a bass's low E2 at 82 Hz). */
	minFrequency?: number;
	/** Highest frequency searched, in Hz. Bounds the shortest lag. Default
	 * 1200 (above a soprano's high C6 at 1047 Hz). */
	maxFrequency?: number;
	/** CMND threshold for step 3. The paper suggests 0.1 to 0.15; lower is
	 * stricter. Default 0.12. */
	threshold?: number;
	/** Frames whose RMS falls below this are treated as silence and return
	 * null without running YIN. Default 0.01 (about -40 dBFS). */
	silenceRms?: number;
	/** Optional scratch buffer reused across calls so a per-frame caller
	 * (the mic tracker) does not allocate each frame. Used only when its
	 * length is at least `maxLag + 1`; otherwise a buffer is allocated. */
	buffer?: Float32Array;
}

export const YIN_DEFAULTS = {
	minFrequency: 60,
	maxFrequency: 1200,
	threshold: 0.12,
	silenceRms: 0.01
} as const;

/** The lag range a detection over this frame would search, in samples.
 * Exposed so a caller can size a reusable `buffer` (`maxLag + 1`). The
 * longest lag is capped at half the frame so the difference function always
 * sums over at least half the frame. */
export function yinLagRange(
	frameLength: number,
	sampleRate: number,
	options: Pick<YinOptions, 'minFrequency' | 'maxFrequency'> = {}
): { minLag: number; maxLag: number } {
	const minFrequency = options.minFrequency ?? YIN_DEFAULTS.minFrequency;
	const maxFrequency = options.maxFrequency ?? YIN_DEFAULTS.maxFrequency;
	// One lag of headroom each side so the parabola around a pitch right at
	// the bound still has both neighbours.
	const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency) - 1);
	const maxLag = Math.min(Math.floor(frameLength / 2), Math.ceil(sampleRate / minFrequency) + 1);
	return { minLag, maxLag };
}

/** Detects the fundamental frequency of one frame, or null for silence or
 * when no lag is periodic enough (noise, unvoiced sounds). Cost is
 * O(frameLength * maxLag); fine for 2048-sample frames at audio frame rates. */
export function detectPitch(frame: Float32Array, sampleRate: number, options: YinOptions = {}): PitchDetection | null {
	const threshold = options.threshold ?? YIN_DEFAULTS.threshold;
	const silenceRms = options.silenceRms ?? YIN_DEFAULTS.silenceRms;
	const n = frame.length;
	if (n === 0 || !(sampleRate > 0)) return null;

	let energy = 0;
	for (let i = 0; i < n; i++) energy += frame[i] * frame[i];
	if (Math.sqrt(energy / n) < silenceRms) return null;

	const { minLag, maxLag } = yinLagRange(n, sampleRate, options);
	if (maxLag <= minLag + 1) return null;

	// A fixed integration window for every lag (the paper's W), so d(tau) is
	// comparable across lags.
	const window = n - maxLag;
	const cmnd =
		options.buffer && options.buffer.length >= maxLag + 1 ? options.buffer : new Float32Array(maxLag + 1);

	// Steps 1 and 2 together: the running sum of d gives the CMND directly.
	// The running sum has to start at tau = 1 even though the search starts
	// at minLag, because the normalisation is over all shorter lags.
	cmnd[0] = 1;
	let runningSum = 0;
	for (let tau = 1; tau <= maxLag; tau++) {
		let d = 0;
		for (let j = 0; j < window; j++) {
			const diff = frame[j] - frame[j + tau];
			d += diff * diff;
		}
		runningSum += d;
		cmnd[tau] = runningSum > 0 ? (d * tau) / runningSum : 1;
	}

	// Step 3: first dip under the threshold, then down to its bottom.
	let tau = -1;
	for (let t = minLag; t <= maxLag; t++) {
		if (cmnd[t] < threshold) {
			while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
			tau = t;
			break;
		}
	}
	if (tau < 0) return null;

	// Step 4: parabolic interpolation through (tau - 1, tau, tau + 1).
	let refinedTau = tau;
	let refinedValue = cmnd[tau];
	if (tau > 1 && tau < maxLag) {
		const a = cmnd[tau - 1];
		const b = cmnd[tau];
		const c = cmnd[tau + 1];
		const denominator = a - 2 * b + c;
		if (denominator > 0) {
			const shift = (a - c) / (2 * denominator);
			if (Math.abs(shift) <= 1) {
				refinedTau = tau + shift;
				refinedValue = b - ((a - c) * shift) / 4;
			}
		}
	}

	return {
		frequency: sampleRate / refinedTau,
		confidence: Math.min(1, Math.max(0, 1 - refinedValue))
	};
}
