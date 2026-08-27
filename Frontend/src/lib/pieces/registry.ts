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
		collection: 'demo',
		pdfUrl: '/fixtures/demo/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.pdf',
		// Sourced from MusicXML, not the bundled MIDI (still present alongside
		// it, unused) — the MIDI export dropped this piece's lyrics, while the
		// MusicXML export (from the same MuseScore project) kept them.
		load: () => loadMusicXml('/fixtures/demo/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.musicxml')
	},
	{
		id: 'challenge-of-thor',
		title: 'The Challenge of Thor',
		composer: 'Elgar',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/The_Challenge_of_Thor_Elgar.pdf',
		// This piece's MIDI crams all parts + accompaniment onto one track
		// across 12 channels with no track names — the MIDI voice-part
		// heuristic can't disambiguate that (see Frontend/plan.md's log) —
		// so it's sourced from its MusicXML export instead, which has one
		// `<part>` per staff.
		load: () => loadMusicXml('/fixtures/SFCC/The_Challenge_of_Thor_Elgar.musicxml')
	},
	{
		id: 'der-abend',
		title: 'Der Abend',
		composer: 'Brahms',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Brahms_Der_Abend.pdf',
		load: () => loadMusicXml('/fixtures/SFCC/Brahms_Der_Abend.musicxml')
	},
	{
		id: 'proserpine',
		title: 'Proserpine',
		composer: 'Coleridge-Taylor',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf',
		load: () => loadMusicXml('/fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.musicxml')
	},
	{
		id: 'les-djinns',
		title: 'Les djinns, Op. 12',
		composer: 'Fauré',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Faure__-_Les_djinns__Op._12.pdf',
		load: () => loadMusicXml('/fixtures/SFCC/Faure__-_Les_djinns__Op._12.musicxml')
	},
	{
		id: 'eglamore',
		title: 'Eglamore',
		composer: 'Gardiner',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/GARDINER_Eglamore.pdf',
		load: () => loadMusicXml('/fixtures/SFCC/GARDINER_Eglamore.musicxml')
	},
	{
		id: 'the-fays-song',
		title: "The Fay's Song",
		composer: 'Massi',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/The_Fay_s_Song_Massi.pdf',
		load: () => loadMusicXml('/fixtures/SFCC/The_Fay_s_Song_Massi.musicxml')
	}
];

export const DEMO_PIECES = PIECES.filter((piece) => piece.collection === 'demo');
export const SFCC_PIECES = PIECES.filter((piece) => piece.collection === 'sfcc');

export function getPiece(id: string): Piece | undefined {
	return PIECES.find((p) => p.id === id);
}
