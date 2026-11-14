// jsdom for `DOMParser`, which `parseMusicXmlFile` needs.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseMusicXmlFile } from '../musicxml/parser.ts';
import type { MixPart, VisualState } from './types.ts';
import { convertVisualParts } from './musicXmlConverter.ts';

function pitch(step: string, octave: number, alter = 0): string {
	const alterXML = alter !== 0 ? `<alter>${alter}</alter>` : '';
	return `<pitch><step>${step}</step>${alterXML}<octave>${octave}</octave></pitch>`;
}

function lyric(text: string): string {
	return `<lyric><text>${text}</text></lyric>`;
}

/** One unnamed-divisi soprano staff in 2/4 at quarter = 500ms, `divisions`
 * = 2 (a duration is a count of eighths):
 * - m1 is single-voice chords (onset rule).
 * - m2 writes two `<voice>`s in the same rhythm (voice rule, but nothing
 *   independent to show).
 * - m3-m6 is the "Ezekiel Saw de Wheel" shape: voice 1 holds Bb5 tied
 *   across three barlines, ending its phrase on "wheel.", while voice 2
 *   starts "'Way up in the air." at the same moment in quarters and
 *   eighths. */
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>-6</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="120"/></direction>
      <note>${pitch('D', 5, -1)}<duration>2</duration><voice>1</voice>${lyric('Ezekiel')}</note>
      <note><chord/>${pitch('B', 4, -1)}<duration>2</duration><voice>1</voice></note>
      <note>${pitch('E', 5, -1)}<duration>2</duration><voice>1</voice>${lyric('saw')}</note>
      <note><chord/>${pitch('C', 5)}<duration>2</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note>${pitch('F', 5)}<duration>2</duration><voice>1</voice>${lyric('de')}</note>
      <note>${pitch('G', 5, -1)}<duration>2</duration><voice>1</voice></note>
      <backup><duration>4</duration></backup>
      <note>${pitch('D', 5)}<duration>2</duration><voice>2</voice>${lyric('de')}</note>
      <note>${pitch('E', 5, -1)}<duration>2</duration><voice>2</voice>${lyric('wheel')}</note>
    </measure>
    <measure number="3">
      <note>${pitch('B', 5, -1)}<duration>4</duration><tie type="start"/><voice>1</voice>${lyric('wheel.')}</note>
      <backup><duration>4</duration></backup>
      <note>${pitch('G', 5, -1)}<duration>2</duration><voice>2</voice>${lyric("'Way")}</note>
      <note>${pitch('G', 5, -1)}<duration>2</duration><voice>2</voice>${lyric('up')}</note>
    </measure>
    <measure number="4">
      <note>${pitch('B', 5, -1)}<duration>4</duration><tie type="stop"/><tie type="start"/><voice>1</voice></note>
      <backup><duration>4</duration></backup>
      <note>${pitch('G', 5, -1)}<duration>2</duration><voice>2</voice>${lyric('in')}</note>
      <note>${pitch('G', 5, -1)}<duration>2</duration><voice>2</voice>${lyric('the')}</note>
    </measure>
    <measure number="5">
      <note>${pitch('B', 5, -1)}<duration>4</duration><tie type="stop"/><tie type="start"/><voice>1</voice></note>
      <backup><duration>4</duration></backup>
      <note>${pitch('G', 5)}<duration>1</duration><voice>2</voice>${lyric('air.')}</note>
      <note>${pitch('F', 5)}<duration>1</duration><voice>2</voice></note>
      <note>${pitch('F', 5)}<duration>2</duration><voice>2</voice></note>
    </measure>
    <measure number="6">
      <note>${pitch('B', 5, -1)}<duration>2</duration><tie type="stop"/><voice>1</voice></note>
      <note><rest/><duration>2</duration><voice>1</voice></note>
      <backup><duration>4</duration></backup>
      <note>${pitch('F', 5)}<duration>2</duration><voice>2</voice></note>
      <note><rest/><duration>2</duration><voice>2</voice></note>
    </measure>
  </part>
</score-partwise>`;

const UNITS_PER_MEASURE = 8; // 2/4 on the converter's 16th-note grid

interface WrittenNote {
	voice: string | null;
	pitch: string | null; // e.g. "Bb5", null for a rest
	duration: number;
	chord: boolean;
	tie: string[];
	lyric: string | null;
	stem: string | null;
}

function sopranoMeasures(xml: string): { notes: WrittenNote[]; backups: number[] }[] {
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	const soprano = doc.querySelector('part[id="P1"]')!;
	return [...soprano.querySelectorAll('measure')].map((measure) => {
		const notes = [...measure.querySelectorAll('note')].map((note) => {
			const step = note.querySelector('step')?.textContent;
			const alter = note.querySelector('alter')?.textContent;
			const accidental = alter === '-1' ? 'b' : alter === '1' ? '#' : '';
			return {
				voice: note.querySelector('voice')?.textContent ?? null,
				pitch: step ? `${step}${accidental}${note.querySelector('octave')!.textContent}` : null,
				duration: Number(note.querySelector('duration')!.textContent),
				chord: note.querySelector('chord') !== null,
				tie: [...note.querySelectorAll('tie')].map((t) => t.getAttribute('type')!),
				lyric: note.querySelector('lyric text')?.textContent ?? null,
				stem: note.querySelector('stem')?.textContent ?? null
			};
		});
		const backups = [...measure.querySelectorAll('backup duration')].map((d) => Number(d.textContent));
		return { notes, backups };
	});
}

function voiceTotals(notes: WrittenNote[]): Map<string | null, number> {
	const totals = new Map<string | null, number>();
	for (const note of notes) {
		if (note.chord) continue;
		totals.set(note.voice, (totals.get(note.voice) ?? 0) + note.duration);
	}
	return totals;
}

describe('convertVisualParts on a merged divisi staff', () => {
	const parsed = parseMusicXmlFile(SCORE);
	const states = Object.fromEntries(parsed.parts.map((p) => [p.id, 'active' as VisualState])) as Record<
		MixPart,
		VisualState
	>;
	const measures = sopranoMeasures(convertVisualParts(parsed, states).xml);

	it('splits the soprano into two auto-split desks for the mixer', () => {
		expect(parsed.parts.slice(0, 2).map((p) => p.id)).toEqual(['soprano-1', 'soprano-2']);
	});

	it('keeps measures where both desks share a rhythm as plain chords', () => {
		for (const { notes, backups } of measures.slice(0, 2)) {
			expect(backups).toEqual([]);
			expect(notes.every((n) => n.voice === null && n.stem === null)).toBe(true);
		}
		expect(measures[1].notes.map((n) => [n.pitch, n.chord, n.lyric])).toEqual([
			['D5', false, 'de'],
			['F5', true, null],
			['Eb5', false, 'wheel'],
			['Gb5', true, null]
		]);
	});

	it('writes independent rhythms as two voices that each fill the measure', () => {
		for (const { notes, backups } of measures.slice(2, 6)) {
			expect(backups).toEqual([UNITS_PER_MEASURE]);
			expect(voiceTotals(notes)).toEqual(
				new Map([
					['1', UNITS_PER_MEASURE],
					['2', UNITS_PER_MEASURE]
				])
			);
			for (const n of notes.filter((n) => n.pitch !== null)) expect(n.stem).toBe(n.voice === '1' ? 'up' : 'down');
		}
	});

	it('keeps the moving voice in quarters with its own lyrics', () => {
		const voice2 = (m: number) =>
			measures[m].notes.filter((n) => n.voice === '2').map((n) => [n.pitch, n.duration, n.lyric]);
		expect(voice2(2)).toEqual([
			['Gb5', 4, "'Way"],
			['Gb5', 4, 'up']
		]);
		expect(voice2(3)).toEqual([
			['Gb5', 4, 'in'],
			['Gb5', 4, 'the']
		]);
		expect(voice2(4)).toEqual([
			['G5', 2, 'air.'],
			['F5', 2, null],
			['F5', 4, null]
		]);
		expect(voice2(5)).toEqual([
			['F5', 4, null],
			[null, 4, null]
		]);
	});

	it('ties the held note across every barline within voice 1', () => {
		const voice1 = (m: number) =>
			measures[m].notes.filter((n) => n.voice === '1').map((n) => [n.pitch, n.duration, n.tie]);
		expect(voice1(2)).toEqual([['Bb5', 8, ['start']]]);
		// Its own syllable, not voice 2's, though both attack together.
		expect(measures[2].notes.find((n) => n.voice === '1')!.lyric).toBe('wheel.');
		expect(voice1(3)).toEqual([['Bb5', 8, ['stop', 'start']]]);
		expect(voice1(4)).toEqual([['Bb5', 8, ['stop', 'start']]]);
		expect(voice1(5)).toEqual([
			['Bb5', 4, ['stop']],
			[null, 4, []]
		]);
	});
});
