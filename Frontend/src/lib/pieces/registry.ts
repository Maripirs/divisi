import { parseMidiFile } from '../midi/parser';
import { parseMusicXmlFile } from '../musicxml/parser';
import type { Piece } from './types';

async function loadMidi(url: string) {
	const bytes = await fetch(url).then((r) => r.arrayBuffer());
	return parseMidiFile(new Uint8Array(bytes));
}

/** `tempoOverrideBPM` covers pieces whose MusicXML export carries no
 * `<sound tempo>` direction at all (see `Frontend/plan.md`'s log) — there's
 * no tempo data to recover, so the parser's 120 BPM fallback is a guess and
 * usually wrong. These values are hand-supplied by the human from the
 * piece's real tempo, not derived from the file. */
async function loadMusicXml(url: string, tempoOverrideBPM?: number) {
	const text = await fetch(url).then((r) => r.text());
	const parsed = parseMusicXmlFile(text);
	return tempoOverrideBPM === undefined ? parsed : { ...parsed, tempoBPM: tempoOverrideBPM };
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
		load: () => loadMusicXml('/fixtures/SFCC/The_Challenge_of_Thor_Elgar.musicxml', 104)
	},
	{
		id: 'der-abend',
		title: 'Der Abend',
		composer: 'Brahms',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Brahms_Der_Abend.pdf',
		// No <sound tempo> in this export. Printed marking "Ruhig", ♩ = 56-62;
		// concert timings run 4:30-5:00 and spacious/soloistic — using the
		// low end.
		load: () => loadMusicXml('/fixtures/SFCC/Brahms_Der_Abend.musicxml', 58)
	},
	{
		id: 'proserpine',
		title: 'Proserpine',
		composer: 'Coleridge-Taylor',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf',
		// No <sound tempo> in this export and no printed number found. ♩ =
		// 76-84 estimated from recordings (2:29-4:00 range); midpoint lines
		// up with a ~2:45 concert target.
		load: () => loadMusicXml('/fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.musicxml', 80)
	},
	{
		id: 'les-djinns',
		title: 'Les djinns, Op. 12',
		composer: 'Fauré',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/Faure__-_Les_djinns__Op._12.pdf',
		// No <sound tempo> in this export. ♩ = 138 per the Mutopia MIDI
		// source, consistent with the ~4:05 Plasson recording.
		load: () => loadMusicXml('/fixtures/SFCC/Faure__-_Les_djinns__Op._12.musicxml', 138)
	},
	{
		id: 'eglamore',
		title: 'Eglamore',
		composer: 'Gardiner',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/GARDINER_Eglamore.pdf',
		// No <sound tempo> in this export. Printed marking is dotted-quarter
		// = 88-96 (6/8); MusicXML tempo is always quarter-notes/min, so
		// ×1.5 → 132-144. Leaned toward the faster/jaunty end per the
		// source ballad's character.
		load: () => loadMusicXml('/fixtures/SFCC/GARDINER_Eglamore.musicxml', 141)
	},
	{
		id: 'the-fays-song',
		title: "The Fay's Song",
		composer: 'Massi',
		collection: 'sfcc',
		pdfUrl: '/fixtures/SFCC/The_Fay_s_Song_Massi.pdf',
		// No <sound tempo> in this export and no printed number/recording
		// found. ♩ = 92-104 estimated; leaned forward, light character.
		load: () => loadMusicXml('/fixtures/SFCC/The_Fay_s_Song_Massi.musicxml', 100)
	}
];

// Lacrymosa hidden from the library listing (still reachable by direct URL
// via `getPiece`) — temporarily pulled from view.
export const DEMO_PIECES = PIECES.filter(
	(piece) => piece.collection === 'demo' && piece.id !== 'lacrymosa'
);
export const SFCC_PIECES = PIECES.filter((piece) => piece.collection === 'sfcc');

export function getPiece(id: string): Piece | undefined {
	return PIECES.find((p) => p.id === id);
}

/** Matches a real Backend `Piece.title` (a group's rehearsal track, from
 * `/library/pieces`) against this bundled registry by title, so a track
 * that happens to be one of these pieces gets a working Practice button
 * instead of the "not wired up yet" note — see Frontend/plan.md's backlog
 * item on wiring the player to real Backend pieces generally, which this
 * doesn't attempt (still the bundled fixture, not the Backend's own
 * uploaded file). Case-sensitive exact match is enough for now; nothing
 * upstream normalizes titles otherwise. */
export function getPieceByTitle(title: string): Piece | undefined {
	return PIECES.find((p) => p.title === title);
}
