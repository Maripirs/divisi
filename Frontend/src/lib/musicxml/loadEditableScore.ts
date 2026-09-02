/**
 * F14: turns the raw bytes of a track's current music file into an
 * `EditableScore` the notation editor can render and mutate. Format
 * detection mirrors the player's `loadRemoteMusicFile`
 * (`$lib/pieces/remotePiece.ts`): the 4-byte `MThd` magic means a Standard
 * MIDI File, anything else is treated as MusicXML text — those being the
 * only two formats `POST /library/pieces` accepts.
 *
 * A MIDI source has no written notation of its own, so it goes through the
 * same MIDI -> MusicXML conversion the player uses for its score view
 * (`convertAllParts`) before becoming an editable model. That conversion is
 * lossy by nature (see the caveat on `convert` below), which is exactly why
 * this editor exists — the admin corrects the rough result and saves it.
 *
 * `.mxl` (zipped MusicXML, starts with the `PK` ZIP magic) is unpacked to
 * its plain-text score document first (`extractMusicXmlText`), then follows
 * the same path as an uncompressed `.musicxml` upload. The editor always
 * saves back as plain `.musicxml`, so an `.mxl` source self-heals on the
 * first save.
 */
import { parseMidiFile } from '$lib/midi/parser';
import { convertAllParts } from '$lib/midi/musicXmlConverter';
import { EditableScore } from './editableScore';
import { extractMusicXmlText, isMxl } from './mxl';

export type EditableScoreSourceFormat = 'midi' | 'musicxml';

export interface LoadedEditableScore {
	score: EditableScore;
	/** Which on-disk format the bytes turned out to be. `'midi'` means the
	 * model is a `convertAllParts` rendering of the MIDI, not a faithful
	 * copy of an original score. */
	sourceFormat: EditableScoreSourceFormat;
}

/** Thrown for a music file this editor can't open. Carries a stable
 * `format` tag so the caller can show a localized message rather than
 * surfacing raw detail. Not currently reachable — MIDI, MusicXML, and
 * `.mxl` all load — but kept as the typed home for any format added to the
 * upload allow-list ahead of editor support. */
export class UnsupportedMusicFileError extends Error {
	readonly format: string;
	constructor(format: string) {
		super(`Unsupported music file format: ${format}`);
		this.name = 'UnsupportedMusicFileError';
		this.format = format;
	}
}

function magic(bytes: Uint8Array, length: number): string {
	let out = '';
	for (let i = 0; i < length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
	return out;
}

/**
 * @throws {Error} when a `.mxl` payload holds no readable score document.
 * @throws {MusicXmlParseError} when the (decoded) MusicXML doesn't parse.
 */
export function loadEditableScore(bytes: ArrayBuffer): LoadedEditableScore {
	const view = new Uint8Array(bytes);

	if (magic(view, 4) === 'MThd') {
		const parsed = parseMidiFile(view);
		// No `highlightedPart` argument: every part stays "active", so
		// `convertAllParts` emits no `color=` attributes — the model is clean
		// MusicXML with nothing render-only to strip before it's saved.
		const { xml } = convertAllParts(parsed);
		return { score: new EditableScore(xml), sourceFormat: 'midi' };
	}

	// `.mxl` is a ZIP container ("PK\x03\x04"): unpack it to the score
	// document's text so it never reaches `DOMParser` as raw ZIP bytes.
	const xmlText = isMxl(view) ? extractMusicXmlText(view) : new TextDecoder().decode(bytes);
	return { score: new EditableScore(xmlText), sourceFormat: 'musicxml' };
}
