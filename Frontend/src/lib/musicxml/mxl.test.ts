import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractMusicXmlText, isMxl } from './mxl';

const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1"><measure number="1"></measure></part></score-partwise>`;

const CONTAINER = (path: string) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;

function mxl(files: Record<string, string>): Uint8Array {
	return zipSync(
		Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))
	);
}

describe('isMxl', () => {
	it('recognizes the ZIP local-file-header magic', () => {
		expect(isMxl(mxl({ 'score.xml': SCORE }))).toBe(true);
	});

	it('rejects plain MusicXML / MIDI bytes', () => {
		expect(isMxl(strToU8(SCORE))).toBe(false);
		expect(isMxl(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))).toBe(false);
	});
});

describe('extractMusicXmlText', () => {
	it('follows container.xml to the named rootfile', () => {
		const bytes = mxl({
			'META-INF/container.xml': CONTAINER('the-score.musicxml'),
			'the-score.musicxml': SCORE,
			// a decoy at the path the fallback heuristic would pick first
			'aaa-decoy.xml': '<nope/>'
		});
		expect(extractMusicXmlText(bytes)).toContain('score-partwise');
		expect(extractMusicXmlText(bytes)).not.toContain('nope');
	});

	it('falls back to the first score entry outside META-INF/ when container.xml is absent', () => {
		const bytes = mxl({ 'whatever.xml': SCORE });
		expect(extractMusicXmlText(bytes)).toContain('score-partwise');
	});

	it('strips a leading BOM', () => {
		const bytes = mxl({ 'score.xml': `﻿${SCORE}` });
		expect(extractMusicXmlText(bytes).charCodeAt(0)).toBe('<'.charCodeAt(0));
	});

	it('throws when the archive has no score document', () => {
		const bytes = mxl({ 'META-INF/container.xml': CONTAINER('missing.xml') });
		expect(() => extractMusicXmlText(bytes)).toThrow(/no root score document/);
	});
});
