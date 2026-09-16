import { describe, expect, it } from 'vitest';
import type { MixPart, ParsedMIDI, VisualState } from './types.ts';
import { convertVisualParts } from './musicXmlConverter.ts';

/**
 * A minimal SATB piece whose soprano voice `splitChordalDivisi` would have
 * auto-split into `soprano-1`/`soprano-2` (a real 2-note onset at ms 0) --
 * exercising the "merge back for display" path in `convertVisualParts`
 * without needing a full parse. `autoSplit: true` on both soprano desks is
 * what marks this as an auto-split pair rather than a file-named one (see
 * `VoicePartInfo.autoSplit`'s doc comment).
 */
function splitPiece(): ParsedMIDI {
	return {
		notes: [
			{ pitch: 67, startMs: 0, durationMs: 500, partId: 'soprano-1' },
			{ pitch: 60, startMs: 0, durationMs: 500, partId: 'soprano-2' },
			{ pitch: 57, startMs: 0, durationMs: 500, partId: 'alto' },
			{ pitch: 53, startMs: 0, durationMs: 500, partId: 'tenor' },
			{ pitch: 45, startMs: 0, durationMs: 500, partId: 'bass' }
		],
		backingNotes: [],
		lyrics: [],
		tempoBPM: 120,
		timeSignature: { numerator: 4, denominator: 4 },
		keySignatureFifths: 0,
		parts: [
			{ id: 'soprano-1', base: 'soprano', subIndex: 1, label: 'Soprano 1', autoSplit: true },
			{ id: 'soprano-2', base: 'soprano', subIndex: 2, label: 'Soprano 2', autoSplit: true },
			{ id: 'alto', base: 'alto', label: 'Alto' },
			{ id: 'tenor', base: 'tenor', label: 'Tenor' },
			{ id: 'bass', base: 'bass', label: 'Bass' },
			{ id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' }
		],
		trackParts: {},
		voicePartChannels: {}
	};
}

function activeStates(parsed: ParsedMIDI): Record<MixPart, VisualState> {
	return Object.fromEntries(parsed.parts.map((p) => [p.id, 'active' as VisualState]));
}

describe('convertVisualParts', () => {
	it('renders exactly one staff per base voice for an auto-split piece, not two', () => {
		const parsed = splitPiece();
		const result = convertVisualParts(parsed, activeStates(parsed));

		// One <score-part>/<part> pair per base voice (soprano, alto, tenor,
		// bass, accompaniment) — never one per desk.
		expect(result.xml.match(/<score-part /g)).toHaveLength(5);
		expect(result.xml).not.toContain('Soprano 1');
		expect(result.xml).not.toContain('Soprano 2');
		expect(result.xml).toContain('<part-name>Soprano</part-name>');

		// The merged soprano staff carries both pitches of the original
		// 2-note onset as one chord (a <chord/> note alongside a plain one).
		const [sopranoPart] = result.xml.split('<part id="P1">')[1].split('</part>');
		expect(sopranoPart).toContain('<chord/>');
	});

	it('does not mutate the parsed.parts/notes/lyrics the mixer reads', () => {
		const parsed = splitPiece();
		const partsBefore = JSON.parse(JSON.stringify(parsed.parts));
		const notesBefore = JSON.parse(JSON.stringify(parsed.notes));
		const lyricsBefore = JSON.parse(JSON.stringify(parsed.lyrics));
		const states = activeStates(parsed);
		const statesBefore = { ...states };

		convertVisualParts(parsed, states);

		expect(parsed.parts).toEqual(partsBefore);
		expect(parsed.notes).toEqual(notesBefore);
		expect(parsed.lyrics).toEqual(lyricsBefore);
		expect(states).toEqual(statesBefore);
	});

	it('still renders two staves for a file-named split (no autoSplit flag)', () => {
		const parsed = splitPiece();
		parsed.parts = parsed.parts.map((p) => {
			if (p.id !== 'soprano-1' && p.id !== 'soprano-2') return p;
			const { autoSplit: _autoSplit, ...rest } = p;
			return rest;
		});

		const result = convertVisualParts(parsed, activeStates(parsed));

		expect(result.xml.match(/<score-part /g)).toHaveLength(6);
		expect(result.xml).toContain('<part-name>Soprano 1</part-name>');
		expect(result.xml).toContain('<part-name>Soprano 2</part-name>');
	});
});
