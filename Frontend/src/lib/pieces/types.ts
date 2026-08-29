import type { ParsedMIDI } from '../midi/types';

/** Library-listing metadata for one piece — enough to render a picker card
 * without loading the piece itself. */
export interface PieceSummary {
	id: string;
	title: string;
	composer: string;
	/** Optional: a real Backend piece can have a PDF, a music file, or both
	 * (see `$lib/pieces/remotePiece.ts`) — the bundled demo/SFCC pieces
	 * always have one, so this stays required-in-practice for those. */
	pdfUrl?: string;
	/** Real Backend pieces only (`group`); bundled fixtures stay `demo`/
	 * `sfcc`. Widened rather than replaced so every existing bundled-piece
	 * check (`collection === 'demo'`) keeps working unchanged. */
	collection: 'demo' | 'sfcc' | 'group';
	/** YouTube reference-audio link, shown in its own always-visible area
	 * regardless of which of music-file/PDF exist — see `+page.svelte`. */
	youtubeUrl?: string;
}

/** A pickable piece. `load()` resolves to the same `ParsedMIDI` shape
 * regardless of source format (MIDI today, MusicXML for pieces whose only
 * clean source is a score export) — everything downstream (the audio
 * player, `musicXmlConverter`) only ever sees that shape, so the library/
 * player UI doesn't need to know or care which parser produced it.
 * Optional: a PDF-only piece (no music file uploaded) is a valid `Piece`
 * with no `load` at all — the player falls back to a PDF-only view with
 * no playback controls. */
export interface Piece extends PieceSummary {
	load?(): Promise<ParsedMIDI>;
}
