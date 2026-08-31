import { describe, expect, it } from 'vitest';
import type { ParsedMIDI, VisualState } from '$lib/midi/types';
import {
	collapseToBaseRecord,
	expandBaseRecord,
	isFocusPart,
	materializePartRecord,
	matchingDisplayMode,
	matchingMixMode,
	presetBalances,
	presetVisualStates,
	sameBalances,
	sameVisualStates
} from './mixMath';

type Parts = ParsedMIDI['parts'];

// One desk per SATB voice plus accompaniment — the unsplit shape.
const flatParts: Parts = [
	{ id: 'soprano', base: 'soprano', label: 'Soprano' },
	{ id: 'alto', base: 'alto', label: 'Alto' },
	{ id: 'tenor', base: 'tenor', label: 'Tenor' },
	{ id: 'bass', base: 'bass', label: 'Bass' },
	{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
];

// Soprano split into two desks.
const splitParts: Parts = [
	{ id: 'soprano-1', base: 'soprano', subIndex: 1, label: 'Soprano 1' },
	{ id: 'soprano-2', base: 'soprano', subIndex: 2, label: 'Soprano 2' },
	{ id: 'alto', base: 'alto', label: 'Alto' },
	{ id: 'tenor', base: 'tenor', label: 'Tenor' },
	{ id: 'bass', base: 'bass', label: 'Bass' },
	{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
];

const baseZeros = { soprano: 0, alto: 0, tenor: 0, bass: 0, accompaniment: 0 };

describe('expandBaseRecord', () => {
	it('fans a base-keyed record out to every part id', () => {
		const out = expandBaseRecord(splitParts, { ...baseZeros, soprano: 0.5 });
		expect(out).toEqual({
			'soprano-1': 0.5,
			'soprano-2': 0.5,
			alto: 0,
			tenor: 0,
			bass: 0,
			accompaniment: 0
		});
	});
});

describe('materializePartRecord', () => {
	it('keeps an existing per-desk value and inherits the base value for a new desk', () => {
		const current = { 'soprano-1': 0.9 } as Record<string, number>;
		const out = materializePartRecord(splitParts, current, { ...baseZeros, soprano: 0.3 });
		expect(out['soprano-1']).toBe(0.9);
		expect(out['soprano-2']).toBe(0.3);
		expect(out.alto).toBe(0);
	});
});

describe('collapseToBaseRecord', () => {
	it('takes the first desk of each base as the base representative', () => {
		const record = {
			'soprano-1': 0.7,
			'soprano-2': 0.2,
			alto: 0.5,
			tenor: 0.5,
			bass: 0.5,
			accompaniment: 0.5
		};
		expect(collapseToBaseRecord(splitParts, record)).toEqual({
			soprano: 0.7,
			alto: 0.5,
			tenor: 0.5,
			bass: 0.5,
			accompaniment: 0.5
		});
	});
});

describe('isFocusPart', () => {
	it('matches every desk of the focus voice when subPart is null', () => {
		expect(isFocusPart(splitParts[0], 'soprano', null)).toBe(true);
		expect(isFocusPart(splitParts[1], 'soprano', null)).toBe(true);
		expect(isFocusPart(splitParts[2], 'soprano', null)).toBe(false);
	});
	it('narrows to a single desk when subPart is set', () => {
		expect(isFocusPart(splitParts[0], 'soprano', 'soprano-1')).toBe(true);
		expect(isFocusPart(splitParts[1], 'soprano', 'soprano-1')).toBe(false);
	});
});

describe('presetVisualStates', () => {
	it('flat marks every part active', () => {
		const out = presetVisualStates(flatParts, 'flat', 'alto', null);
		expect(Object.values(out).every((s) => s === 'active')).toBe(true);
	});
	it('highlighted keeps focus active and mutes the rest', () => {
		const out = presetVisualStates(flatParts, 'highlighted', 'alto', null);
		expect(out.alto).toBe('active');
		expect(out.soprano).toBe('muted');
	});
	it('solo turns non-focus parts off', () => {
		const out = presetVisualStates(flatParts, 'solo', 'alto', null);
		expect(out.alto).toBe('active');
		expect(out.soprano).toBe('off');
	});
	it('respects subPart narrowing on a split voice', () => {
		const out = presetVisualStates(splitParts, 'solo', 'soprano', 'soprano-1');
		expect(out['soprano-1']).toBe('active');
		expect(out['soprano-2']).toBe('off');
	});
});

describe('presetBalances', () => {
	it('everyone keeps all parts at 0.5', () => {
		const out = presetBalances(flatParts, 'everyone', 'alto', null);
		expect(Object.values(out).every((v) => v === 0.5)).toBe(true);
	});
	it('minusMe silences the focus voice only', () => {
		const out = presetBalances(flatParts, 'minusMe', 'alto', null);
		expect(out.alto).toBe(0);
		expect(out.soprano).toBe(0.5);
	});
	it('mostlyMe boosts focus to 1 and drops the rest to 0.15', () => {
		const out = presetBalances(flatParts, 'mostlyMe', 'alto', null);
		expect(out.alto).toBe(1);
		expect(out.soprano).toBe(0.15);
	});
});

describe('matchingMixMode', () => {
	it('recognises a preset it produced', () => {
		const balances = presetBalances(flatParts, 'minusMe', 'tenor', null);
		expect(matchingMixMode(flatParts, balances, 'tenor', null)).toBe('minusMe');
	});
	it('falls back to custom once a value is nudged', () => {
		const balances = presetBalances(flatParts, 'everyone', 'tenor', null);
		balances.bass = 0.42;
		expect(matchingMixMode(flatParts, balances, 'tenor', null)).toBe('custom');
	});
});

describe('matchingDisplayMode', () => {
	it('recognises a preset it produced', () => {
		const states = presetVisualStates(flatParts, 'highlighted', 'soprano', null);
		expect(matchingDisplayMode(flatParts, states, 'soprano', null)).toBe('highlighted');
	});
	it('falls back to custom once a state is nudged', () => {
		const states = presetVisualStates(flatParts, 'flat', 'soprano', null);
		states.bass = 'off';
		expect(matchingDisplayMode(flatParts, states, 'soprano', null)).toBe('custom');
	});
});

describe('sameBalances / sameVisualStates', () => {
	it('compares only the ids present in parts', () => {
		const a = { soprano: 0.5, alto: 0.5, tenor: 0.5, bass: 0.5, accompaniment: 0.5, stale: 9 };
		const b = { soprano: 0.5, alto: 0.5, tenor: 0.5, bass: 0.5, accompaniment: 0.5 };
		expect(sameBalances(flatParts, a, b)).toBe(true);
	});
	it('detects a real difference', () => {
		const a: Record<string, VisualState> = {
			soprano: 'active',
			alto: 'active',
			tenor: 'active',
			bass: 'active',
			accompaniment: 'active'
		};
		const b = { ...a, tenor: 'muted' as VisualState };
		expect(sameVisualStates(flatParts, a, b)).toBe(false);
	});
});
