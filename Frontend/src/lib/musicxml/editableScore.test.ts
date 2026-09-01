// @vitest-environment jsdom
//
// F14 task 3c: unit coverage for the key-signature, clef, and per-note
// accidental edits on `EditableScore`. These mutate the parsed MusicXML
// `Document` in place, so the assertions re-parse `serialize()` output and
// inspect the DOM rather than string-matching the serializer's whitespace.
// `jsdom` supplies `DOMParser` / `XMLSerializer`, which the default `node`
// test environment does not.

import { describe, expect, it } from 'vitest';
import { EditableScore } from './editableScore';

/** 1 part, 2 measures. Measure 0 carries a full `<attributes>` (divisions,
 * key of 0, 4/4, treble clef); measure 1 is bare (notes only), the shape a
 * mid-piece key/clef change has to build an `<attributes>` for. Note indices:
 * 0-3 in measure 0, 4-7 in measure 1, with note 7 a rest. */
const ONE_PART = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><rest/><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

/** Measure 1 here already has an `<attributes>` (a meter change) with
 * `<divisions>` and `<time>` but no `<key>`, so a mid-piece key insert has to
 * land the new `<key>` between them. */
const ONE_PART_MID_METER = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

/** 2 parts, 2 measures each — a key change must reach both parts. */
const TWO_PARTS = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>One</part-name></score-part>
    <score-part id="P2"><part-name>Two</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

/** A 2-staff part (piano): `<staves>2</staves>` plus a numbered `<clef>` per
 * staff, so clef edits must use and match the `number` attribute. Note
 * indices: 0 = staff 1 / m0, 1 = staff 2 / m0, 2 = staff 1 / m1,
 * 3 = staff 2 / m1. */
const TWO_STAVES = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

/** Measure 0 has an `<attributes>` with no `<key>` at all. */
const NO_KEY = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

const reparse = (xml: string): Document =>
	new DOMParser().parseFromString(xml, 'application/xml');
const childTags = (el: Element): string[] => Array.from(el.children).map((c) => c.tagName);
const roundTrip = (score: EditableScore): Document => reparse(score.serialize());
const measures = (doc: Document): Element[] =>
	Array.from(doc.querySelectorAll('part[id="P1"] > measure'));

describe('EditableScore.setAccidental', () => {
	it('writes <alter> and <accidental> in DTD child order', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setAccidental(0, 1)).toBe(true);

		const note = roundTrip(score).querySelectorAll('note')[0];
		const pitch = note.querySelector('pitch')!;
		expect(childTags(pitch)).toEqual(['step', 'alter', 'octave']);
		expect(pitch.querySelector('alter')!.textContent).toBe('1');

		const tags = childTags(note);
		expect(tags).toContain('accidental');
		expect(tags.indexOf('accidental')).toBeGreaterThan(tags.indexOf('type'));
		expect(note.querySelector('accidental')!.textContent).toBe('sharp');
	});

	it('clearing to natural removes <alter> but writes <accidental>natural', () => {
		const score = new EditableScore(ONE_PART);
		score.setAccidental(0, -2);
		expect(score.setAccidental(0, 0)).toBe(true);

		const note = roundTrip(score).querySelectorAll('note')[0];
		expect(note.querySelector('pitch > alter')).toBeNull();
		expect(childTags(note.querySelector('pitch')!)).toEqual(['step', 'octave']);
		expect(note.querySelector('accidental')!.textContent).toBe('natural');
	});

	it('refuses a rest, an out-of-range alter, and a no-op', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setAccidental(7, 1)).toBe(false); // note 7 is a rest
		expect(score.setAccidental(0, 3)).toBe(false); // outside -2..2
		expect(score.setAccidental(0, 0)).toBe(false); // already natural / no alter
		// none of the refusals touched the DOM
		expect(score.serialize()).toBe(new EditableScore(ONE_PART).serialize());
	});
});

describe('EditableScore.setKey', () => {
	it('rewrites the existing <key> in measure 0 in place', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setKey(0, 2)).toBe(true);

		const attrs = measures(roundTrip(score))[0].querySelectorAll(':scope > attributes');
		expect(attrs.length).toBe(1);
		expect(attrs[0].querySelectorAll(':scope > key').length).toBe(1);
		expect(attrs[0].querySelector('key > fifths')!.textContent).toBe('2');
	});

	it('inserts a mid-piece key change with <attributes> at measure start', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setKey(4, 3)).toBe(true);

		const m1 = measures(roundTrip(score))[1];
		expect(childTags(m1)[0]).toBe('attributes');
		const key = m1.querySelector(':scope > attributes > key')!;
		expect(key.hasAttribute('number')).toBe(false);
		expect(key.querySelector('fifths')!.textContent).toBe('3');
		// measure 0 is untouched
		expect(measures(roundTrip(score))[0].querySelector('key > fifths')!.textContent).toBe('0');
	});

	it('inserts the new <key> before <time> when the measure already has <attributes>', () => {
		const score = new EditableScore(ONE_PART_MID_METER);
		expect(score.setKey(1, 4)).toBe(true);

		const attrs = measures(roundTrip(score))[1].querySelector(':scope > attributes')!;
		expect(childTags(attrs)).toEqual(['divisions', 'key', 'time']);
		expect(attrs.querySelector('key > fifths')!.textContent).toBe('4');
	});

	it('applies the key change to every part', () => {
		const score = new EditableScore(TWO_PARTS);
		expect(score.setKey(0, -3)).toBe(true);

		const doc = roundTrip(score);
		for (const id of ['P1', 'P2']) {
			const m0 = doc.querySelector(`part[id="${id}"] > measure`)!;
			expect(m0.querySelector('attributes > key > fifths')!.textContent).toBe('-3');
		}
	});

	it('refuses a no-op and an out-of-range fifths', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setKey(0, 0)).toBe(false);
		expect(score.setKey(0, 8)).toBe(false);
		expect(score.serialize()).toBe(new EditableScore(ONE_PART).serialize());
	});
});

describe('EditableScore.setClef', () => {
	it('changes the measure-0 clef in place (single staff, no number attr)', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setClef(0, { sign: 'F', line: 4 })).toBe(true);

		const clefs = measures(roundTrip(score))[0].querySelectorAll('attributes > clef');
		expect(clefs.length).toBe(1);
		expect(clefs[0].hasAttribute('number')).toBe(false);
		expect(childTags(clefs[0])).toEqual(['sign', 'line']);
		expect(clefs[0].querySelector('sign')!.textContent).toBe('F');
		expect(clefs[0].querySelector('line')!.textContent).toBe('4');
	});

	it('inserts a mid-piece clef change into a bare measure', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.setClef(4, { sign: 'C', line: 3 })).toBe(true);

		const m1 = measures(roundTrip(score))[1];
		expect(childTags(m1)[0]).toBe('attributes');
		const clef = m1.querySelector(':scope > attributes > clef')!;
		expect(clef.hasAttribute('number')).toBe(false);
		expect(clef.querySelector('sign')!.textContent).toBe('C');
		expect(clef.querySelector('line')!.textContent).toBe('3');
	});

	it('writes and matches the number attribute for a multi-staff part', () => {
		const score = new EditableScore(TWO_STAVES);
		// note 1 is on staff 2 (bass, F/4) -> switch it to C/4
		expect(score.setClef(1, { sign: 'C', line: 4 })).toBe(true);

		const doc = roundTrip(score);
		const staff2 = doc.querySelector('measure > attributes > clef[number="2"]')!;
		expect(staff2.querySelector('sign')!.textContent).toBe('C');
		expect(staff2.querySelector('line')!.textContent).toBe('4');
		// staff 1 clef left alone
		const staff1 = doc.querySelector('measure > attributes > clef[number="1"]')!;
		expect(staff1.querySelector('sign')!.textContent).toBe('G');

		// a mid-piece change on staff 1 carries number="1"
		expect(score.setClef(2, { sign: 'C', line: 3 })).toBe(true);
		const m1clef = roundTrip(score)
			.querySelectorAll('part > measure')[1]
			.querySelector(':scope > attributes > clef')!;
		expect(m1clef.getAttribute('number')).toBe('1');
		expect(m1clef.querySelector('sign')!.textContent).toBe('C');
	});

	it('refuses a no-op', () => {
		const single = new EditableScore(ONE_PART);
		expect(single.setClef(0, { sign: 'G', line: 2 })).toBe(false);
		const multi = new EditableScore(TWO_STAVES);
		expect(multi.setClef(0, { sign: 'G', line: 2 })).toBe(false); // staff 1 already G/2
		expect(multi.setClef(1, { sign: 'F', line: 4 })).toBe(false); // staff 2 already F/4
	});
});

describe('EditableScore.keyAt / clefAt', () => {
	it('reports the in-effect key, including after a mid-piece change', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.keyAt(0)).toBe(0);
		expect(score.keyAt(4)).toBe(0);

		expect(score.setKey(4, 5)).toBe(true);
		expect(score.keyAt(4)).toBe(5); // measure 1 onward
		expect(score.keyAt(0)).toBe(0); // measure 0 unchanged
	});

	it('returns null when the score declares no key at all', () => {
		expect(new EditableScore(NO_KEY).keyAt(0)).toBeNull();
	});

	it('reports the in-effect clef per staff, including after a mid-piece change', () => {
		const score = new EditableScore(TWO_STAVES);
		expect(score.clefAt(0)).toEqual({ sign: 'G', line: 2 }); // staff 1
		expect(score.clefAt(1)).toEqual({ sign: 'F', line: 4 }); // staff 2

		expect(score.setClef(3, { sign: 'C', line: 4 })).toBe(true); // staff 2, measure 1
		expect(score.clefAt(3)).toEqual({ sign: 'C', line: 4 });
		expect(score.clefAt(1)).toEqual({ sign: 'F', line: 4 }); // measure 0 unchanged
		expect(score.clefAt(2)).toEqual({ sign: 'G', line: 2 }); // staff 1 unaffected
	});
});

describe('EditableScore.exportMusicXml', () => {
	it('prepends the XML declaration and a partwise DOCTYPE, and stays parseable', () => {
		const score = new EditableScore(ONE_PART);
		score.transpose(0, 2);
		const out = score.exportMusicXml();

		expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
		expect(out).toContain('<!DOCTYPE score-partwise PUBLIC');
		expect(out.endsWith('\n')).toBe(true);

		const doc = reparse(out);
		expect(doc.querySelector('parsererror')).toBeNull();
		expect(doc.querySelectorAll('note').length).toBe(8);
		// the edit is carried through
		expect(doc.querySelectorAll('note')[0].querySelector('pitch > step')!.textContent).toBe('D');
	});

	it('does not add a second DOCTYPE when the serialized tree already carries one', () => {
		const withDoctype = ONE_PART.replace(
			'<score-partwise version="4.0">',
			'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0">'
		);
		const out = new EditableScore(withDoctype).exportMusicXml();
		expect(out.match(/<!DOCTYPE/g)?.length ?? 0).toBe(1);
	});
});

// F15: mapping a paged OMR report's boundary measure number to an onset the
// editor's seam markers and playback cursor share.
describe('EditableScore.measureOnset', () => {
	it('returns the start onset (whole notes) of a 1-based measure number', () => {
		const score = new EditableScore(ONE_PART); // divisions 1, quarter notes
		expect(score.measureOnset(1)).toBe(0);
		expect(score.measureOnset(2)).toBe(1); // measure 1 starts one whole note in
	});

	it('lines up across parts (every merged part shares the measure count)', () => {
		const score = new EditableScore(TWO_PARTS); // whole notes, one bar each
		expect(score.measureOnset(1)).toBe(0);
		expect(score.measureOnset(2)).toBe(1);
	});

	it('returns null past the end of the score and for a non-positive number', () => {
		const score = new EditableScore(ONE_PART);
		expect(score.measureOnset(3)).toBeNull();
		expect(score.measureOnset(0)).toBeNull();
	});
});
