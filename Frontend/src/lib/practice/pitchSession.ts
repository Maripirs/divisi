// Pitch mode's session logic: feed it pitch detection frames over time and
// it decides when the singer has held the current step's note in tune long
// enough to advance.
//
// Pure TypeScript on plain numbers: no mic, no Web Audio, no Svelte. The mic
// tracker (Slice 6) produces the frames; the Pitch mode UI (Slice 8) reads
// the state to draw the tuner needle and colour the matched note.
//
// Why a small class rather than a reducer: the steps and settings are
// long-lived context, while the hold bookkeeping (when the hold began, when
// the last in-tune frame arrived) is internal detail the UI should not see
// or have to thread back in. A class keeps that private and exposes only an
// immutable `PitchSessionState` snapshot, which is what a Svelte `$state`
// should hold. Every method is still deterministic in its inputs (no clocks,
// timestamps come from the frames), so tests drive it with synthetic frames.

import { frequencyToMidi } from '$lib/audio/pitch/notes';

/** The least a step needs for pitch matching. An empty `midiPitches` is a
 * rest. Slice 3's richer step (onset, note ids) satisfies this as is. */
export interface PitchStep {
	readonly midiPitches: readonly number[];
}

/** One detector reading. `timeMs` must not go backwards within a session. */
export interface PitchFrame {
	timeMs: number;
	/** Hz, or null when the detector found no pitch (silence, noise). */
	frequency: number | null;
	/** Detector confidence in [0, 1]. */
	confidence: number;
}

export interface PitchSessionSettings {
	/** How far off (either way) still counts as in tune. */
	toleranceCents: number;
	/** How long the note must be held in tune to advance. */
	holdMs: number;
	/** Accept the right note in any octave (pitch class plus cents). For
	 * singers whose range sits an octave from the written part, e.g. a tenor
	 * reading a treble-clef line. */
	anyOctave: boolean;
	/** Frames below this confidence are treated like no pitch at all. */
	minConfidence: number;
	/** A gap of bad frames (off pitch, low confidence or null) no longer than
	 * this, measured from the last in-tune frame, does not break a hold. One
	 * noisy frame from the detector should not cost the singer their note. */
	dropoutGraceMs: number;
}

export const DEFAULT_PITCH_SESSION_SETTINGS: Readonly<PitchSessionSettings> = {
	toleranceCents: 30,
	holdMs: 400,
	anyOctave: false,
	minConfidence: 0.8,
	dropoutGraceMs: 80
};

export type PitchSessionStatus = 'listening' | 'holding' | 'matched' | 'finished';

export interface PitchSessionState {
	/** The step being sung. Stays on the matched step while `status` is
	 * 'matched'. Once 'finished' it is the last step matched, or the last
	 * index when a `goTo` or trailing rests ran off the end. */
	readonly stepIndex: number;
	/** 'listening': waiting for an in-tune note. 'holding': in tune, timer
	 * running (also through a dropout within grace). 'matched': this step was
	 * just held long enough; the next frame moves on. 'finished': every step
	 * is done. */
	readonly status: PitchSessionStatus;
	/** 0 to 1, how much of `holdMs` has been held. */
	readonly holdProgress: number;
	/** Signed cents from the sung pitch to the nearest target note (folded
	 * into +-600 with `anyOctave`), or null with no usable pitch this frame.
	 * Drives the tuner needle. */
	readonly centsOff: number | null;
	/** The target note the needle is relative to: the chord member nearest
	 * the sung pitch, or the step's first pitch when nothing usable is sung.
	 * Null once finished. */
	readonly targetMidi: number | null;
}

/** Cents from `sungMidi` to `targetMidi`; folded into [-600, 600) when any
 * octave is accepted, so a note sung an octave down reads as 0. */
function centsFrom(sungMidi: number, targetMidi: number, anyOctave: boolean): number {
	const cents = (sungMidi - targetMidi) * 100;
	if (!anyOctave) return cents;
	const folded = (((cents + 600) % 1200) + 1200) % 1200;
	return folded - 600;
}

/**
 * Runs Pitch mode over a list of steps.
 *
 * Rests auto-advance immediately: whenever the session lands on a rest
 * (at the start, after a match, on `goTo`), it skips straight past it, so
 * the state never sits on a rest and a rest never waits for a frame. Trailing
 * rests lead straight to 'finished'.
 *
 * A match is reported for one frame ('matched', still on that step) so the
 * UI can show it; the following frame advances and is already judged against
 * the next step. A repeated note therefore has to be held again for the full
 * `holdMs`. Matching the last step goes straight to 'finished'.
 */
export class PitchSession<S extends PitchStep = PitchStep> {
	readonly steps: readonly S[];
	#settings: PitchSessionSettings;
	#state: PitchSessionState;
	/** Time of the first in-tune frame of the current hold, or null. */
	#holdStartMs: number | null = null;
	/** Time of the latest in-tune frame of the current hold, or null. */
	#lastInTuneMs: number | null = null;

	constructor(steps: readonly S[], settings: Partial<PitchSessionSettings> = {}) {
		this.steps = steps;
		this.#settings = { ...DEFAULT_PITCH_SESSION_SETTINGS, ...settings };
		this.#state = this.#landOn(0);
	}

	get state(): PitchSessionState {
		return this.#state;
	}

	get settings(): Readonly<PitchSessionSettings> {
		return this.#settings;
	}

	/** The step being sung, or null once finished. */
	get currentStep(): S | null {
		return this.#state.status === 'finished' ? null : this.steps[this.#state.stepIndex];
	}

	/** Merges new settings. A hold in progress carries on under the new
	 * settings rather than restarting, so nudging the tolerance mid-note does
	 * not punish the singer. */
	setSettings(settings: Partial<PitchSessionSettings>): void {
		this.#settings = { ...this.#settings, ...settings };
	}

	/** Back to the first step, hold cleared. */
	reset(): PitchSessionState {
		return this.goTo(0);
	}

	/** Jumps to a step (clamped), hold cleared. A rest skips forward; an
	 * index past the end finishes. */
	goTo(stepIndex: number): PitchSessionState {
		this.#state = this.#landOn(Math.max(0, Math.floor(stepIndex)));
		return this.#state;
	}

	/** Feeds one detector frame and returns the new state. */
	update(frame: PitchFrame): PitchSessionState {
		if (this.#state.status === 'finished') return this.#state;
		if (this.#state.status === 'matched') {
			this.#state = this.#landOn(this.#state.stepIndex + 1);
			if (this.#state.status === 'finished') return this.#state;
		}

		const settings = this.#settings;
		const targets = this.steps[this.#state.stepIndex].midiPitches;
		const usable =
			frame.frequency !== null &&
			Number.isFinite(frame.frequency) &&
			frame.frequency > 0 &&
			frame.confidence >= settings.minConfidence;

		let centsOff: number | null = null;
		let targetMidi = targets[0];
		if (usable) {
			const sungMidi = frequencyToMidi(frame.frequency!);
			for (const target of targets) {
				const cents = centsFrom(sungMidi, target, settings.anyOctave);
				if (centsOff === null || Math.abs(cents) < Math.abs(centsOff)) {
					centsOff = cents;
					targetMidi = target;
				}
			}
		}
		const inTune = centsOff !== null && Math.abs(centsOff) <= settings.toleranceCents;
		const t = frame.timeMs;

		// A gap longer than the grace since the last in-tune frame breaks the
		// hold, whether this frame is good (it starts a new hold) or bad.
		if (this.#lastInTuneMs !== null && t - this.#lastInTuneMs > settings.dropoutGraceMs) {
			this.#clearHold();
		}

		if (!inTune) {
			const holding = this.#holdStartMs !== null;
			this.#state = {
				stepIndex: this.#state.stepIndex,
				status: holding ? 'holding' : 'listening',
				// Within grace the progress freezes at its last in-tune value.
				holdProgress: holding ? this.#state.holdProgress : 0,
				centsOff,
				targetMidi
			};
			return this.#state;
		}

		if (this.#holdStartMs === null) this.#holdStartMs = t;
		this.#lastInTuneMs = t;
		const progress = settings.holdMs > 0 ? Math.min(1, (t - this.#holdStartMs) / settings.holdMs) : 1;

		if (progress < 1) {
			this.#state = { stepIndex: this.#state.stepIndex, status: 'holding', holdProgress: progress, centsOff, targetMidi };
			return this.#state;
		}

		this.#clearHold();
		const isLast = this.#nextSungStep(this.#state.stepIndex + 1) >= this.steps.length;
		this.#state = {
			stepIndex: this.#state.stepIndex,
			status: isLast ? 'finished' : 'matched',
			holdProgress: 1,
			centsOff,
			targetMidi: isLast ? null : targetMidi
		};
		return this.#state;
	}

	#clearHold(): void {
		this.#holdStartMs = null;
		this.#lastInTuneMs = null;
	}

	/** First non-rest step at or after `index`, or `steps.length`. */
	#nextSungStep(index: number): number {
		let i = index;
		while (i < this.steps.length && this.steps[i].midiPitches.length === 0) i++;
		return i;
	}

	/** A fresh listening state on the first sung step at or after `index`. */
	#landOn(index: number): PitchSessionState {
		this.#clearHold();
		const i = this.#nextSungStep(index);
		if (i >= this.steps.length) {
			return {
				stepIndex: Math.max(0, this.steps.length - 1),
				status: 'finished',
				holdProgress: 0,
				centsOff: null,
				targetMidi: null
			};
		}
		return { stepIndex: i, status: 'listening', holdProgress: 0, centsOff: null, targetMidi: this.steps[i].midiPitches[0] };
	}
}
