// jsdom for `DOMParser`, which `parseMusicXmlFile` needs.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseMusicXmlFile } from './parser.ts';

function pitch(step: string, octave: number): string {
	return `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
}

/** One unnamed-divisi soprano staff, 3/4 at quarter = 500ms (1500ms per
 * measure, `divisions` = 1 so a duration is a count of quarters):
 * - m1 is single-voice: a C5/A4 chord, then a lone G4 (onset rule).
 * - m2-m3 write two `<voice>`s interleaved with `<backup>`, in different
 *   rhythms: voice 1 rests, then holds E5 tied across the barline, then D5;
 *   voice 2 moves in quarters, then holds E4 (voice rule). */
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="120"/></direction>
      <note>${pitch('C', 5)}<duration>2</duration><voice>1</voice></note>
      <note><chord/>${pitch('A', 4)}<duration>2</duration><voice>1</voice></note>
      <note>${pitch('G', 4)}<duration>1</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><rest/><duration>1</duration><voice>1</voice></note>
      <note>${pitch('E', 5)}<duration>2</duration><tie type="start"/><voice>1</voice></note>
      <backup><duration>3</duration></backup>
      <note>${pitch('A', 4)}<duration>1</duration><voice>2</voice><lyric><text>Ah</text></lyric></note>
      <note>${pitch('G', 4)}<duration>1</duration><voice>2</voice></note>
      <note>${pitch('F', 4)}<duration>1</duration><voice>2</voice></note>
    </measure>
    <measure number="3">
      <note>${pitch('E', 5)}<duration>2</duration><tie type="stop"/><voice>1</voice></note>
      <note>${pitch('D', 5)}<duration>1</duration><voice>1</voice></note>
      <backup><duration>3</duration></backup>
      <note>${pitch('E', 4)}<duration>3</duration><voice>2</voice></note>
    </measure>
  </part>
</score-partwise>`;

describe('parseMusicXmlFile unnamed divisi', () => {
	const parsed = parseMusicXmlFile(SCORE);
	const desk = (id: string) =>
		parsed.notes.filter((n) => n.partId === id).map((n) => [n.startMs, n.pitch, n.durationMs]);

	it('splits a single-staff part by voice in 2-voice measures and by onset elsewhere', () => {
		expect(parsed.parts.map((p) => p.id)).toEqual(['soprano-1', 'soprano-2', 'alto', 'tenor', 'bass', 'accompaniment']);
		expect(desk('soprano-1')).toEqual([
			[0, 72, 1000], // m1 chord, upper note
			[1000, 67, 500], // m1 lone G4, cloned
			[2000, 76, 2000], // m2 E5 tied into m3: one merged note, desk 1 only
			[4000, 74, 500]
		]);
		expect(desk('soprano-2')).toEqual([
			[0, 69, 1000], // m1 chord, lower note
			[1000, 67, 500], // m1 lone G4, cloned
			[1500, 69, 500], // m2 voice 2 alone while voice 1 rests
			[2000, 67, 500],
			[2500, 65, 500],
			[3000, 64, 1500]
		]);
	});

	it('gives a voice-rule lyric only to its own desk', () => {
		expect(parsed.lyrics).toEqual([{ text: 'Ah', timeMs: 1500, partId: 'soprano-2' }]);
	});

	it('strips the parse-time voice/measure hints from the returned notes', () => {
		for (const n of parsed.notes) expect(Object.keys(n).sort()).toEqual(['durationMs', 'partId', 'pitch', 'startMs']);
	});
});
