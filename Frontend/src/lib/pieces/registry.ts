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

/** Static, frontend-only piece list — publicly served with no auth at all
 * (these files sit under `static/`, so anyone can fetch them directly by
 * URL regardless of what routing does). Deliberately kept to just two
 * examples for that reason: Lacrymosa (public-domain demo content) and
 * Challenge of Thor (kept as a working example of this direct-URL path,
 * at the human's request). Every other piece a group actually rehearses
 * — including the rest of what used to live here (Der Abend, Proserpine,
 * Les djinns, Eglamore, The Fay's Song) — is a real Backend `Piece`
 * instead, gated by group membership or a join code the same way user
 * uploads are (see `$lib/pieces/remotePiece.ts`); adding a piece here is
 * exactly the "not safe nor scalable" pattern this list should stay
 * small enough to avoid repeating. */
export const PIECES: Piece[] = [
	{
		id: 'lacrymosa',
		title: 'Lacrymosa',
		composer: 'Mozart, Requiem',
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
