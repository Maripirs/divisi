// Step mode's cursor: where the singer is in a step sequence, moved one step
// at a time by the previous / next buttons and the arrow keys, or jumped by
// a tap on the score.
//
// Pure TypeScript, no Svelte, the same shape as `pitchSession.ts`: a small
// class holding the steps, exposing an immutable `StepSessionState`
// snapshot (what a Svelte `$state.raw` should hold). Sounding a step is the
// page's job; every move here just says where the cursor now is.

import { groupIndexAt, type OnsetGroup } from '$lib/components/score/engineAdapter';

export interface StepSessionState {
	/** The current step, or -1 when there are no steps at all. */
	readonly stepIndex: number;
	readonly stepCount: number;
	/** No earlier step (also true with no steps). */
	readonly atFirst: boolean;
	/** No later step (also true with no steps). */
	readonly atLast: boolean;
}

function snapshot(stepIndex: number, stepCount: number): StepSessionState {
	return { stepIndex, stepCount, atFirst: stepIndex <= 0, atLast: stepIndex >= stepCount - 1 };
}

/**
 * Walks a list of steps (`buildStepSequence`'s, or anything onset-shaped).
 * Moves clamp at either end rather than wrapping: a singer pressing "next"
 * on the last note should stay on it, not be thrown back to bar one.
 */
export class StepSession<S extends OnsetGroup = OnsetGroup> {
	#steps: readonly S[];
	#state: StepSessionState;

	/** Starts on the step at or before `atWholes` (the position Listen mode
	 * left off at), or the first step when `atWholes` is before them all. */
	constructor(steps: readonly S[], atWholes = 0) {
		this.#steps = steps;
		this.#state = snapshot(this.#indexAt(atWholes), steps.length);
	}

	get steps(): readonly S[] {
		return this.#steps;
	}

	get state(): StepSessionState {
		return this.#state;
	}

	/** The current step, or null with no steps. */
	get currentStep(): S | null {
		return this.#steps[this.#state.stepIndex] ?? null;
	}

	/** One step forward (`1`) or back (`-1`), staying put at either end. */
	step(direction: 1 | -1): StepSessionState {
		return this.goTo(this.#state.stepIndex + direction);
	}

	/** Jumps to a step, clamped to the sequence. */
	goTo(stepIndex: number): StepSessionState {
		if (this.#steps.length === 0) return this.#state;
		const clamped = Math.min(this.#steps.length - 1, Math.max(0, Math.floor(stepIndex)));
		if (clamped !== this.#state.stepIndex) this.#state = snapshot(clamped, this.#steps.length);
		return this.#state;
	}

	/** Jumps to the step at or before `wholes` (a tapped note's onset, which
	 * may belong to a part not being stepped), or the first step. */
	goToOnset(wholes: number): StepSessionState {
		return this.goTo(this.#indexAt(wholes));
	}

	/** Swaps in a new sequence (another part picked, or the score reloaded)
	 * and stays at the same place in the music: the step at or before the
	 * current one's onset. */
	setSteps(steps: readonly S[]): StepSessionState {
		const at = this.currentStep?.wholes ?? 0;
		this.#steps = steps;
		this.#state = snapshot(this.#indexAt(at), steps.length);
		return this.#state;
	}

	#indexAt(wholes: number): number {
		if (this.#steps.length === 0) return -1;
		return Math.max(0, groupIndexAt(this.#steps, wholes));
	}
}

/** One key to sound, `volume` in [0, 1] (see `MidiPlayer.previewChord`). */
export interface StepNoteSound {
	readonly midiPitch: number;
	readonly volume: number;
}

/** What landing on a step sounds: the step's own pitches at full volume,
 * then the other parts' (`otherStavesSounding`) at `othersVolume`, minus
 * any key the step already sounds (one key cannot play at two volumes). */
export function stepSounds(
	own: readonly number[],
	others: readonly number[],
	othersVolume: number
): StepNoteSound[] {
	const sounds: StepNoteSound[] = own.map((midiPitch) => ({ midiPitch, volume: 1 }));
	const taken = new Set(own);
	for (const midiPitch of others) {
		if (taken.has(midiPitch)) continue;
		taken.add(midiPitch);
		sounds.push({ midiPitch, volume: othersVolume });
	}
	return sounds;
}
