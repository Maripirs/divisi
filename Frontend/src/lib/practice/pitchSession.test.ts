import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '$lib/audio/pitch/notes';
import { PitchSession, type PitchFrame, type PitchSessionState, type PitchStep } from './pitchSession';

const C4 = 60;
const D4 = 62;
const E4 = 64;
const G4 = 67;

/** A frame singing `midi` (fractional for detuning), confident. */
function sung(timeMs: number, midi: number, confidence = 0.95): PitchFrame {
	return { timeMs, frequency: midiToFrequency(midi), confidence };
}

function silent(timeMs: number): PitchFrame {
	return { timeMs, frequency: null, confidence: 0 };
}

/** Feeds frames every `stepMs` from `fromMs` up to and including `toMs`,
 * returning every state seen. */
function feed(
	session: PitchSession,
	fromMs: number,
	toMs: number,
	stepMs: number,
	frameAt: (t: number) => PitchFrame
): PitchSessionState[] {
	const states: PitchSessionState[] = [];
	for (let t = fromMs; t <= toMs; t += stepMs) states.push(session.update(frameAt(t)));
	return states;
}

const steps = (...pitches: number[][]): PitchStep[] => pitches.map((midiPitches) => ({ midiPitches }));

describe('PitchSession: holding', () => {
	it('starts listening on the first step with its target', () => {
		const session = new PitchSession(steps([C4], [D4]));
		expect(session.state).toEqual({
			stepIndex: 0,
			status: 'listening',
			holdProgress: 0,
			centsOff: null,
			targetMidi: C4
		});
	});

	it('advances exactly once after a clean hold of holdMs', () => {
		const session = new PitchSession(steps([C4], [D4], [E4]));
		// 10 ms frames: the hold starts at t=0 and completes at t=400.
		const states = feed(session, 0, 600, 10, (t) => sung(t, C4));
		const matchedAt = states.findIndex((s) => s.status === 'matched');
		expect(matchedAt).toBe(40);
		expect(states.filter((s) => s.status === 'matched')).toHaveLength(1);
		expect(states[matchedAt].stepIndex).toBe(0);
		expect(states[matchedAt].holdProgress).toBe(1);
		// Just before: holding, progress nearly full.
		expect(states[matchedAt - 1].status).toBe('holding');
		expect(states[matchedAt - 1].holdProgress).toBeCloseTo(0.975, 6);
		// After: on D4, which C4 does not match, and stays there.
		expect(states.slice(matchedAt + 1).every((s) => s.stepIndex === 1 && s.status === 'listening')).toBe(true);
		expect(session.state.targetMidi).toBe(D4);
	});

	it('reports holdProgress growing and centsOff relative to the target', () => {
		const session = new PitchSession(steps([C4], [D4]));
		const s = feed(session, 0, 200, 20, (t) => sung(t, C4 + 0.1)).at(-1)!;
		expect(s.status).toBe('holding');
		expect(s.holdProgress).toBeCloseTo(0.5, 6);
		expect(s.centsOff).toBeCloseTo(10, 6);
	});

	it('treats tolerance as inclusive on both sides, and out of tolerance as listening', () => {
		const session = new PitchSession(steps([C4], [D4]));
		expect(session.update(sung(0, C4 - 0.29)).status).toBe('holding');
		session.reset();
		const off = session.update(sung(0, C4 + 0.35));
		expect(off.status).toBe('listening');
		expect(off.centsOff).toBeCloseTo(35, 6);
	});

	it('resets the hold when the singer wobbles out and back', () => {
		const session = new PitchSession(steps([C4], [D4]));
		// In tune 0..300, 60 cents sharp 320..500 (well past grace), back in tune.
		const states = feed(session, 0, 1200, 20, (t) => (t > 300 && t <= 500 ? sung(t, C4 + 0.6) : sung(t, C4)));
		const at = (t: number) => states[t / 20];
		expect(at(300).holdProgress).toBeCloseTo(0.75, 6);
		expect(at(500).status).toBe('listening');
		expect(at(500).holdProgress).toBe(0);
		// A fresh hold from 520 completes at 920, not at 400 or 600.
		expect(at(900).status).toBe('holding');
		expect(at(920).status).toBe('matched');
		expect(states.filter((s) => s.status === 'matched')).toHaveLength(1);
	});
});

describe('PitchSession: dropout grace', () => {
	it('bridges a single dropped frame within grace', () => {
		const session = new PitchSession(steps([C4], [D4]));
		const states = feed(session, 0, 400, 20, (t) => (t === 200 ? silent(t) : sung(t, C4)));
		const dropped = states[200 / 20];
		expect(dropped.status).toBe('holding');
		expect(dropped.centsOff).toBeNull();
		// Progress freezes over the gap, then picks up where the hold left off.
		expect(dropped.holdProgress).toBeCloseTo(180 / 400, 6);
		expect(states[400 / 20].status).toBe('matched');
	});

	it('bridges a single off-pitch or low-confidence frame too', () => {
		for (const bad of [(t: number) => sung(t, C4 + 1), (t: number) => sung(t, C4, 0.3)]) {
			const session = new PitchSession(steps([C4], [D4]));
			const states = feed(session, 0, 400, 20, (t) => (t === 200 ? bad(t) : sung(t, C4)));
			expect(states.at(-1)!.status).toBe('matched');
		}
	});

	it('resets on a dropout longer than the grace', () => {
		const session = new PitchSession(steps([C4], [D4]));
		// Silent 200..300: 120 ms since the last in-tune frame at 180.
		const states = feed(session, 0, 800, 20, (t) => (t >= 200 && t <= 300 ? silent(t) : sung(t, C4)));
		expect(states[260 / 20].status).toBe('holding'); // 80 ms gap, still in grace
		expect(states[280 / 20].status).toBe('listening'); // 100 ms gap, broken
		expect(states[400 / 20].status).toBe('holding');
		// New hold from 320 completes at 720.
		expect(states[700 / 20].status).toBe('holding');
		expect(states[720 / 20].status).toBe('matched');
	});

	it('has no grace when dropoutGraceMs is 0', () => {
		const session = new PitchSession(steps([C4], [D4]), { dropoutGraceMs: 0 });
		const states = feed(session, 0, 400, 20, (t) => (t === 200 ? silent(t) : sung(t, C4)));
		expect(states[200 / 20].status).toBe('listening');
		expect(states.at(-1)!.status).toBe('holding');
	});
});

describe('PitchSession: octaves and chords', () => {
	it('fails the wrong octave without anyOctave', () => {
		const session = new PitchSession(steps([C4], [D4]));
		const states = feed(session, 0, 600, 20, (t) => sung(t, C4 - 12));
		expect(states.every((s) => s.status === 'listening')).toBe(true);
		expect(session.state.centsOff).toBeCloseTo(-1200, 6);
	});

	it('passes the wrong octave with anyOctave, needle relative to the pitch class', () => {
		const session = new PitchSession(steps([C4], [D4]), { anyOctave: true });
		const first = session.update(sung(0, C4 - 12 + 0.1));
		expect(first.status).toBe('holding');
		expect(first.centsOff).toBeCloseTo(10, 6);
		expect(first.targetMidi).toBe(C4);
		const states = feed(session, 20, 600, 20, (t) => sung(t, C4 + 24));
		expect(states.some((s) => s.status === 'matched')).toBe(true);
	});

	it('folds anyOctave cents into the nearest octave', () => {
		const session = new PitchSession(steps([C4], [D4]), { anyOctave: true });
		// B3 is 100 cents below C4 in any octave, not 1100 above.
		expect(session.update(sung(0, 59)).centsOff).toBeCloseTo(-100, 6);
	});

	it('accepts any member of a chord step and aims the needle at the nearest one', () => {
		for (const member of [C4, E4, G4]) {
			const session = new PitchSession(steps([C4, E4, G4], [D4]));
			const first = session.update(sung(0, member + 0.05));
			expect(first.targetMidi).toBe(member);
			expect(first.centsOff).toBeCloseTo(5, 6);
			const states = feed(session, 20, 400, 20, (t) => sung(t, member));
			expect(states.at(-1)!.status).toBe('matched');
		}
	});
});

describe('PitchSession: rests, confidence and the end', () => {
	it('skips leading rests immediately', () => {
		const session = new PitchSession(steps([], [], [E4]));
		expect(session.state.stepIndex).toBe(2);
		expect(session.state.targetMidi).toBe(E4);
	});

	it('skips rests after a match without waiting', () => {
		const session = new PitchSession(steps([C4], [], [], [E4], [G4]));
		feed(session, 0, 400, 20, (t) => sung(t, C4));
		expect(session.state.status).toBe('matched');
		const next = session.update(sung(420, E4));
		expect(next.stepIndex).toBe(3);
		expect(next.status).toBe('holding');
	});

	it('finishes when only rests are left', () => {
		const session = new PitchSession(steps([C4], [], []));
		const states = feed(session, 0, 400, 20, (t) => sung(t, C4));
		expect(states.at(-1)!.status).toBe('finished');
		expect(new PitchSession(steps([], [])).state.status).toBe('finished');
		expect(new PitchSession([]).state.status).toBe('finished');
	});

	it('ignores low-confidence frames', () => {
		const session = new PitchSession(steps([C4], [D4]));
		const states = feed(session, 0, 800, 20, (t) => sung(t, C4, 0.5));
		expect(states.every((s) => s.status === 'listening' && s.centsOff === null)).toBe(true);
		// The threshold is a setting.
		session.setSettings({ minConfidence: 0.4 });
		expect(session.update(sung(820, C4, 0.5)).status).toBe('holding');
	});

	it('ignores nonsense frequencies', () => {
		const session = new PitchSession(steps([C4]));
		for (const frequency of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(session.update({ timeMs: 0, frequency, confidence: 1 }).centsOff).toBeNull();
		}
	});

	it('leads from the last step to finished and stays there', () => {
		const session = new PitchSession(steps([C4], [D4]));
		feed(session, 0, 400, 20, (t) => sung(t, C4));
		const states = feed(session, 420, 1000, 20, (t) => sung(t, D4));
		const finishedAt = states.findIndex((s) => s.status === 'finished');
		// D4's hold starts at 420 (the frame that moved off the match) and
		// completes at 820.
		expect(420 + finishedAt * 20).toBe(820);
		expect(states[finishedAt]).toMatchObject({ stepIndex: 1, holdProgress: 1, targetMidi: null });
		expect(states.slice(finishedAt).every((s) => s.status === 'finished')).toBe(true);
		expect(session.currentStep).toBeNull();
	});
});

describe('PitchSession: navigation and settings', () => {
	it('goTo jumps to a step and clears the hold', () => {
		const session = new PitchSession(steps([C4], [D4], [E4]));
		feed(session, 0, 200, 20, (t) => sung(t, C4));
		expect(session.state.status).toBe('holding');
		const s = session.goTo(2);
		expect(s).toEqual({ stepIndex: 2, status: 'listening', holdProgress: 0, centsOff: null, targetMidi: E4 });
		// The hold restarts from scratch on the new step.
		const states = feed(session, 220, 620, 20, (t) => sung(t, E4));
		expect(states.at(-2)!.status).toBe('holding');
		expect(states.at(-1)!.status).toBe('finished');
	});

	it('goTo clamps, skips a rest forward, and finishes past the end', () => {
		const session = new PitchSession(steps([C4], [], [E4]));
		expect(session.goTo(-3).stepIndex).toBe(0);
		expect(session.goTo(1).stepIndex).toBe(2);
		expect(session.goTo(99).status).toBe('finished');
	});

	it('reset returns to the start from anywhere, including finished', () => {
		const session = new PitchSession(steps([C4]));
		feed(session, 0, 400, 20, (t) => sung(t, C4));
		expect(session.state.status).toBe('finished');
		expect(session.reset()).toEqual({ stepIndex: 0, status: 'listening', holdProgress: 0, centsOff: null, targetMidi: C4 });
		expect(session.currentStep).toEqual({ midiPitches: [C4] });
	});

	it('setSettings changes tolerance and hold time on the fly', () => {
		const session = new PitchSession(steps([C4], [D4]), { holdMs: 1000 });
		expect(session.update(sung(0, C4 + 0.4)).status).toBe('listening');
		session.setSettings({ toleranceCents: 50 });
		expect(session.update(sung(20, C4 + 0.4)).status).toBe('holding');
		session.setSettings({ holdMs: 100 });
		const states = feed(session, 40, 120, 20, (t) => sung(t, C4 + 0.4));
		expect(states.at(-2)!.status).toBe('holding');
		expect(states.at(-1)!.status).toBe('matched');
		expect(session.settings).toMatchObject({ toleranceCents: 50, holdMs: 100, anyOctave: false });
	});

	it('accepts richer step objects and hands them back', () => {
		interface RichStep extends PitchStep {
			onset: number;
			noteIds: string[];
		}
		const rich: RichStep[] = [
			{ onset: 0, noteIds: ['n1'], midiPitches: [C4] },
			{ onset: 0.25, noteIds: ['n2'], midiPitches: [D4] }
		];
		const session = new PitchSession(rich);
		const step: RichStep | null = session.currentStep;
		expect(step?.noteIds).toEqual(['n1']);
	});
});
