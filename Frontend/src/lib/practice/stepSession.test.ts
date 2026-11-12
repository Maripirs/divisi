import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOnsetIndex, importMusicXml } from 'notation-engine';
import { buildStepSequence } from './stepSequence';
import { StepSession, stepSounds } from './stepSession';

const steps = [0, 0.25, 0.75, 1].map((wholes) => ({ wholes, noteIds: [`n${wholes}`] }));

describe('StepSession', () => {
	it('starts on the step at or before the position, else the first', () => {
		expect(new StepSession(steps).state).toEqual({ stepIndex: 0, stepCount: 4, atFirst: true, atLast: false });
		expect(new StepSession(steps, 0.5).state.stepIndex).toBe(1);
		expect(new StepSession(steps, 0.75).state.stepIndex).toBe(2);
		expect(new StepSession(steps, 9).state).toEqual({ stepIndex: 3, stepCount: 4, atFirst: false, atLast: true });
		expect(new StepSession(steps.slice(1), 0).state.stepIndex).toBe(0);
	});

	it('steps forward and back, clamping at either end', () => {
		const session = new StepSession(steps);
		expect(session.step(-1).stepIndex).toBe(0);
		expect(session.step(1).stepIndex).toBe(1);
		expect(session.currentStep).toBe(steps[1]);
		session.step(1);
		const last = session.step(1);
		expect(last).toMatchObject({ stepIndex: 3, atLast: true, atFirst: false });
		// Staying put hands back the same snapshot, so a Svelte `$state.raw`
		// holding it does not even notice.
		expect(session.step(1)).toBe(last);
		expect(session.step(-1).stepIndex).toBe(2);
	});

	it('never mutates a snapshot it handed out', () => {
		const session = new StepSession(steps);
		const before = session.state;
		session.step(1);
		expect(before.stepIndex).toBe(0);
	});

	it('jumps by index and by onset', () => {
		const session = new StepSession(steps);
		expect(session.goTo(2.7).stepIndex).toBe(2);
		expect(session.goTo(-5).stepIndex).toBe(0);
		expect(session.goTo(99).stepIndex).toBe(3);
		// A tap on another part's note between two steps lands on the earlier.
		expect(session.goToOnset(0.5).stepIndex).toBe(1);
		expect(session.goToOnset(-1).stepIndex).toBe(0);
	});

	it('keeps its place in the music when the steps change', () => {
		const session = new StepSession(steps, 0.75);
		// Another part: no step at 0.75, so the one before it.
		const other = [0, 0.5, 1].map((wholes) => ({ wholes, noteIds: [`m${wholes}`] }));
		expect(session.setSteps(other)).toEqual({ stepIndex: 1, stepCount: 3, atFirst: false, atLast: false });
		expect(session.currentStep).toBe(other[1]);
		expect(session.steps).toBe(other);
	});

	it('copes with no steps at all', () => {
		const session = new StepSession<(typeof steps)[number]>([]);
		expect(session.state).toEqual({ stepIndex: -1, stepCount: 0, atFirst: true, atLast: true });
		expect(session.currentStep).toBeNull();
		expect(session.step(1).stepIndex).toBe(-1);
		expect(session.goToOnset(1).stepIndex).toBe(-1);
		expect(session.setSteps(steps).stepIndex).toBe(0);
	});

	it('walks a real part end to end', () => {
		const score = importMusicXml(
			readFileSync(
				new URL('../../../static/fixtures/demo/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.musicxml', import.meta.url),
				'utf8'
			)
		);
		const alto = buildStepSequence(score, createOnsetIndex(score), { staves: [1] });
		const session = new StepSession(alto);
		const visited = [session.currentStep!.wholes];
		while (!session.state.atLast) visited.push(alto[session.step(1).stepIndex].wholes);
		expect(visited).toEqual(alto.map((step) => step.wholes));
		while (!session.state.atFirst) session.step(-1);
		expect(session.currentStep).toBe(alto[0]);
	});
});

describe('stepSounds', () => {
	it('sounds the step loud and the other parts quieter, each key once', () => {
		expect(stepSounds([60, 64], [48, 64, 55, 48], 0.4)).toEqual([
			{ midiPitch: 60, volume: 1 },
			{ midiPitch: 64, volume: 1 },
			{ midiPitch: 48, volume: 0.4 },
			{ midiPitch: 55, volume: 0.4 }
		]);
	});

	it('is just the step with no other parts', () => {
		expect(stepSounds([67], [], 0.4)).toEqual([{ midiPitch: 67, volume: 1 }]);
		expect(stepSounds([], [], 0.4)).toEqual([]);
	});
});
