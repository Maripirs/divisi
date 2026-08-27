import { parseMidiFile } from '../midi/parser';
import { parseMusicXmlFile } from '../musicxml/parser';
import type { Piece } from './types';

async function loadMidi(url: string) {
	const bytes = await fetch(url).then((r) => r.arrayBuffer());
	return parseMidiFile(new Uint8Array(bytes));
}

async function loadMusicXml(url: string) {
	const text = await fetch(url).then((r) => r.text());
	return parseMusicXmlFile(text);
}

/** Static, frontend-only piece list — same "no backend" philosophy as F1's
 * single bundled fixture, just more than one entry now. Swap for a Backend
 * fetch in F2 without changing anything that consumes `Piece`. */
export const PIECES: Piece[] = [
	{
		id: 'lacrymosa',
		title: 'Lacrymosa',
		composer: 'Mozart — Requiem',
		load: () => loadMidi('/fixtures/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.mid')
	},
	{
		id: 'challenge-of-thor',
		title: 'The Challenge of Thor',
		composer: 'Elgar',
		// This piece's MIDI crams all parts + accompaniment onto one track
		// across 12 channels with no track names — the MIDI voice-part
		// heuristic can't disambiguate that (see Frontend/plan.md's log) —
		// so it's sourced from its MusicXML export instead, which has one
		// `<part>` per staff.
		load: () => loadMusicXml('/fixtures/The_Challenge_of_Thor_Elgar.musicxml')
	}
];

export function getPiece(id: string): Piece | undefined {
	return PIECES.find((p) => p.id === id);
}
