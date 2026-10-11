import { describe, expect, it } from 'vitest';
import {
	defaultSectionFilter,
	filterBySection,
	hasSectionTags,
	matchesSection,
	parsePartScope,
	serializePartScope,
	toggleSection
} from './sections';

describe('parsePartScope', () => {
	it('reads null/empty as All', () => {
		expect(parsePartScope(null)).toEqual([]);
		expect(parsePartScope(undefined)).toEqual([]);
		expect(parsePartScope('')).toEqual([]);
	});

	it('returns SATB order, deduped, case/space tolerant', () => {
		expect(parsePartScope('bass, Tenor,tenor')).toEqual(['tenor', 'bass']);
	});

	it('ignores unknown tokens, and reads a value with none recognized as All', () => {
		expect(parsePartScope('alto,baritone')).toEqual(['alto']);
		expect(parsePartScope('Tenor 1')).toEqual([]);
	});

	it('reads all four as All', () => {
		expect(parsePartScope('soprano,alto,tenor,bass')).toEqual([]);
	});
});

describe('serializePartScope', () => {
	it('is null for All', () => {
		expect(serializePartScope([])).toBeNull();
		expect(serializePartScope(['bass', 'alto', 'tenor', 'soprano'])).toBeNull();
	});

	it('is canonical SATB order, deduped', () => {
		expect(serializePartScope(['bass', 'tenor', 'bass'])).toBe('tenor,bass');
	});

	it('round-trips through parse', () => {
		expect(parsePartScope(serializePartScope(['alto', 'soprano']))).toEqual(['soprano', 'alto']);
	});
});

describe('toggleSection', () => {
	it('All clears every section', () => {
		expect(toggleSection(['tenor', 'bass'], 'all')).toEqual([]);
	});

	it('adds and removes a section', () => {
		expect(toggleSection([], 'bass')).toEqual(['bass']);
		expect(toggleSection(['bass'], 'tenor')).toEqual(['tenor', 'bass']);
		expect(toggleSection(['tenor', 'bass'], 'tenor')).toEqual(['bass']);
	});

	it('collapses all four back to All', () => {
		expect(toggleSection(['soprano', 'alto', 'tenor'], 'bass')).toEqual([]);
	});
});

describe('filtering', () => {
	const notes = [
		{ id: 'tb', sections: ['tenor', 'bass'] as const },
		{ id: 'all', sections: [] as const },
		{ id: 'a', sections: ['alto'] as const }
	];
	const ids = (list: { id: string }[]) => list.map((n) => n.id);

	it('a section shows its own notes plus All notes', () => {
		expect(ids(filterBySection(notes, 'bass'))).toEqual(['tb', 'all']);
		expect(ids(filterBySection(notes, 'alto'))).toEqual(['all', 'a']);
		expect(ids(filterBySection(notes, 'soprano'))).toEqual(['all']);
	});

	it('everyone shows every note', () => {
		expect(ids(filterBySection(notes, 'everyone'))).toEqual(['tb', 'all', 'a']);
		expect(matchesSection(['alto'], 'everyone')).toBe(true);
	});

	it('hides the chip row when nothing is tagged', () => {
		expect(hasSectionTags(notes)).toBe(true);
		expect(hasSectionTags([{ sections: [] }, { sections: [] }])).toBe(false);
		expect(hasSectionTags([])).toBe(false);
	});
});

describe('defaultSectionFilter', () => {
	it('uses the saved voice only once chosen', () => {
		expect(defaultSectionFilter({ voicePart: 'tenor', voicePartChosen: true })).toBe('tenor');
		expect(defaultSectionFilter({ voicePart: 'soprano', voicePartChosen: false })).toBe('everyone');
	});
});
