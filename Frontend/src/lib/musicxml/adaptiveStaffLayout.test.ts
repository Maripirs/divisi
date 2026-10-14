// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildAdaptiveStaffSections } from './adaptiveStaffLayout';
import type { ParsedMIDI, MixPart, VisualState } from '../midi/types';

const names = ['Soprano', 'Alto', 'Tenor 1', 'Tenor 2', 'Bass 1', 'Bass 2'];
const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

function note(step: string, lyric: string, duration = 4): string {
	return `<note><pitch><step>${step}</step><octave>3</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type><lyric><text>${lyric}</text></lyric></note>`;
}

function measure(number: number, partIndex: number): string {
	const shared = partIndex === 3 ? 'C' : partIndex >= 4 ? 'G' : 'A';
	const pitch = number === 2 && partIndex === 3 ? 'B' :
		number === 2 && partIndex === 5 ? 'F' :
		number === 1 && partIndex === 5 ? 'F' : shared;
	const attrs = number === 1 ? '<attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>' :
		number === 2 ? '<attributes><key><fifths>-1</fifths></key></attributes>' : '';
	return `<measure number="${number}">${attrs}${note(pitch, `word${number}`, number === 1 ? 4 : 12)}</measure>`;
}

function fixture(): ParsedMIDI {
	const partList = ids.map((id, i) => `<score-part id="${id}"><part-name>${names[i]}</part-name></score-part>`).join('');
	const parts = ids.map((id, i) => `<part id="${id}">${[1, 2, 3].map((n) => measure(n, i)).join('')}</part>`).join('');
	const sourceMusicXml = `<score-partwise><identification><miscellaneous><miscellaneous-field name="divisi-staff-layout">{"splitMeasures":[2,2],"sharedPairs":[["P3","P4"],["P5","P6"]]}</miscellaneous-field></miscellaneous></identification><part-list>${partList}</part-list>${parts}</score-partwise>`;
	const mixIds = ['soprano', 'alto', 'tenor_1', 'tenor_2', 'bass_1', 'bass_2'] as MixPart[];
	return {
		sourceMusicXml,
		notes: [], backingNotes: [], lyrics: [], tempoBPM: 120,
		timeSignature: { numerator: 3, denominator: 4 }, keySignatureFifths: 0,
		parts: [],
		trackParts: Object.fromEntries(mixIds.map((id, i) => [i, id])),
		voicePartChannels: {}, ambiguousParts: []
	};
}

describe('changing staff layouts', () => {
	it('keeps both singers in one Bass staff in shared bars and restores six staves for the split', () => {
		const parsed = fixture();
		const states = Object.fromEntries(Object.values(parsed.trackParts).map((id) => [id, 'active'])) as Record<MixPart, VisualState>;
		const sections = buildAdaptiveStaffSections(parsed, states, '#888888');
		expect(sections).not.toBeNull();
		expect(sections!.map((section) => [section.firstMeasure, section.lastMeasure])).toEqual([[1, 1], [2, 2], [3, 3]]);
		expect(sections![0].xml).toMatch(/^<\?xml version=/);
		expect(sections!.map((section) => new DOMParser().parseFromString(section.xml, 'application/xml').querySelectorAll('part').length)).toEqual([4, 6, 4]);
		expect(sections!.map((section) => section.startWholeNotes)).toEqual([0, 0.25, 1]);
		const first = new DOMParser().parseFromString(sections![0].xml, 'application/xml');
		expect([...first.querySelectorAll('part-list > score-part > part-name')].map((name) => name.textContent)).toEqual(['Soprano', 'Alto', 'Tenor', 'Bass']);
		const bass = first.querySelector('part[id="P5"] > measure')!;
		expect(bass.querySelectorAll('note')).toHaveLength(2);
		expect(bass.querySelector('backup > duration')?.textContent).toBe('4');
		expect([...bass.querySelectorAll('note > voice')].map((v) => v.textContent)).toEqual(['1', '2']);
		const split = new DOMParser().parseFromString(sections![1].xml, 'application/xml');
		expect(split.querySelector('part[id="P4"] > measure > attributes > divisions')?.textContent).toBe('4');
		expect(split.querySelector('part[id="P4"] > measure > attributes > key > fifths')?.textContent).toBe('-1');
	});

	it('keeps the second desk visible when the first desk is hidden', () => {
		const parsed = fixture();
		const states = Object.fromEntries(Object.values(parsed.trackParts).map((id) => [id, 'active'])) as Record<MixPart, VisualState>;
		states.tenor_1 = 'off';
		states.bass_1 = 'off';
		const sections = buildAdaptiveStaffSections(parsed, states, '#888888')!;
		const shared = new DOMParser().parseFromString(sections[0].xml, 'application/xml');
		expect([...shared.querySelectorAll('part')].map((part) => part.id)).toEqual(['P1', 'P2', 'P4', 'P6']);
	});

	it('hides a chord-split part when all of its desks are off', () => {
		const parsed = fixture();
		const states = Object.fromEntries(Object.values(parsed.trackParts).map((id) => [id, 'off'])) as Record<MixPart, VisualState>;
		delete (states as Record<string, VisualState>).soprano;
		Object.assign(states, { 'soprano-1': 'off', 'soprano-2': 'off', tenor_1: 'active', tenor_2: 'active' });
		const sections = buildAdaptiveStaffSections(parsed, states, '#888888')!;
		const shared = new DOMParser().parseFromString(sections[0].xml, 'application/xml');
		expect([...shared.querySelectorAll('part')].map((part) => part.id)).toEqual(['P3']);
	});

	it('returns null for a declared layout without a part-list', () => {
		const parsed = fixture();
		parsed.sourceMusicXml = parsed.sourceMusicXml!.replace(/<part-list>.*<\/part-list>/, '');
		const states = Object.fromEntries(Object.values(parsed.trackParts).map((id) => [id, 'active'])) as Record<MixPart, VisualState>;
		expect(buildAdaptiveStaffSections(parsed, states, '#888888')).toBeNull();
	});
});
