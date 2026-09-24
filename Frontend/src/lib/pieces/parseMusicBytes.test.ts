// jsdom for `DOMParser` -- `parseMusicXmlFile` (reached via plain-MusicXML
// and `.mxl` dispatch below) needs a real one, unlike the MIDI-magic path.
// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseMusicBytes } from './parseMusicBytes';

const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Soprano</part-name></score-part></part-list><part id="P1"><measure number="1"></measure></part></score-partwise>`;

/** The smallest legal Standard MIDI File: a format-0 header (one track,
 * 96-tick division) followed by a track holding just an end-of-track meta
 * event -- enough for `midi-file`'s `parseMidi` to succeed with no notes. */
function minimalMidiBytes(): Uint8Array {
	return new Uint8Array([
		0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60,
		0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04, 0x00, 0xff, 0x2f, 0x00
	]);
}

describe('parseMusicBytes', () => {
	it('dispatches MIDI-magic bytes to the MIDI parser', () => {
		const parsed = parseMusicBytes(minimalMidiBytes());
		expect(parsed.notes).toEqual([]);
		expect(parsed.parts.some((p) => p.id === 'accompaniment')).toBe(true);
	});

	it('dispatches plain MusicXML text to the MusicXML parser', () => {
		const parsed = parseMusicBytes(new TextEncoder().encode(SCORE));
		expect(parsed.parts.some((p) => p.id === 'accompaniment')).toBe(true);
	});

	it('unpacks and dispatches an .mxl archive', () => {
		const bytes = zipSync({ 'score.xml': strToU8(SCORE) });
		const parsed = parseMusicBytes(bytes);
		expect(parsed.parts.length).toBeGreaterThan(0);
	});

	it('throws a "Malformed MusicXML" error for a corrupt .mxl archive', () => {
		// PK local-file-header magic with no valid ZIP structure behind it.
		const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
		expect(() => parseMusicBytes(bytes)).toThrow(/Malformed MusicXML/);
	});
});
