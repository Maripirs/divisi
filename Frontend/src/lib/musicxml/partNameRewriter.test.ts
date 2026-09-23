import { describe, expect, it } from 'vitest';
import { applyPartNameAssignments, midiPitchToNoteName } from './partNameRewriter.ts';

const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
	<part-list>
		<score-part id="P1"><part-name print-object="no">Part 1</part-name></score-part>
		<score-part id="P2"><part-name>Part 2</part-name></score-part>
		<score-part id="P3"><part-name>Piano</part-name></score-part>
	</part-list>
	<part id="P1"><measure number="1"></measure></part>
	<part id="P2"><measure number="1"></measure></part>
	<part id="P3"><measure number="1"></measure></part>
</score-partwise>`;

describe('applyPartNameAssignments', () => {
	it('updates the part-name text for each assigned score-part and strips print-object="no"', () => {
		const result = applyPartNameAssignments(SCORE, [
			{ partId: 'P1', label: 'Soprano 1' },
			{ partId: 'P2', label: 'Soprano 2' }
		]);

		expect(result).toContain('<score-part id="P1"><part-name>Soprano 1</part-name></score-part>');
		expect(result).toContain('<score-part id="P2"><part-name>Soprano 2</part-name></score-part>');
		expect(result).not.toContain('print-object="no"');
	});

	it('leaves every other part of the file byte-for-byte unchanged', () => {
		const result = applyPartNameAssignments(SCORE, [{ partId: 'P1', label: 'Soprano 1' }]);

		// P3 (untouched) and every part's own <measure> body are unaffected.
		expect(result).toContain('<score-part id="P3"><part-name>Piano</part-name></score-part>');
		expect(result).toContain('<part id="P1"><measure number="1"></measure></part>');
		expect(result).toContain('<part id="P2"><measure number="1"></measure></part>');
		expect(result).toContain('<part id="P3"><measure number="1"></measure></part>');
		// Only the two targeted <part-name> elements changed -- everything
		// else, including the doctype-less XML declaration, is identical.
		expect(result.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
	});

	it('XML-escapes the label and ignores an assignment for a part id not present in the file', () => {
		const result = applyPartNameAssignments(SCORE, [
			{ partId: 'P1', label: 'A & B <weird>' },
			{ partId: 'P404', label: 'Nope' }
		]);

		expect(result).toContain('<part-name>A &amp; B &lt;weird&gt;</part-name>');
		expect(result).not.toContain('Nope');
	});

	it('is a no-op given no assignments', () => {
		expect(applyPartNameAssignments(SCORE, [])).toBe(SCORE);
	});
});

describe('midiPitchToNoteName', () => {
	it('converts using C4 = 60 (middle C)', () => {
		expect(midiPitchToNoteName(60)).toBe('C4');
		expect(midiPitchToNoteName(69)).toBe('A4');
		expect(midiPitchToNoteName(61)).toBe('C#4');
		expect(midiPitchToNoteName(48)).toBe('C3');
		expect(midiPitchToNoteName(0)).toBe('C-1');
	});
});
