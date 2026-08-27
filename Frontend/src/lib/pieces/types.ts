import type { ParsedMIDI } from '../midi/types';

/** Library-listing metadata for one piece — enough to render a picker card
 * without loading the piece itself. */
export interface PieceSummary {
	id: string;
	title: string;
	composer: string;
	pdfUrl: string;
	collection: 'demo' | 'sfcc';
}

/** A pickable piece. `load()` resolves to the same `ParsedMIDI` shape
 * regardless of source format (MIDI today, MusicXML for pieces whose only
 * clean source is a score export) — everything downstream (the audio
 * player, `musicXmlConverter`) only ever sees that shape, so the library/
 * player UI doesn't need to know or care which parser produced it. */
export interface Piece extends PieceSummary {
	load(): Promise<ParsedMIDI>;
}
