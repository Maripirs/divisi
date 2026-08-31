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
 * `.mxl` (zipped MusicXML, starts with the `PK` ZIP magic) is out of scope:
 * feeding ZIP bytes to `DOMParser` would just yield a confusing parse
 * error, so it's detected up front and surfaced as a clean
 * "unsupported format" instead.
 */
import { parseMidiFile } from '$lib/midi/parser';
import { convertAllParts } from '$lib/midi/musicXmlConverter';
import { EditableScore } from './editableScore';

export type EditableScoreSourceFormat = 'midi' | 'musicxml';

export interface LoadedEditableScore {
	score: EditableScore;
	/** Which on-disk format the bytes turned out to be. `'midi'` means the
	 * model is a `convertAllParts` rendering of the MIDI, not a faithful
	 * copy of an original score. */
	sourceFormat: EditableScoreSourceFormat;
}

/** Thrown for a music file this editor can't open — today only `.mxl`
 * (zipped MusicXML). Carries a stable `format` tag so the caller can show a
 * localized message rather than surfacing raw detail. */
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
 * @throws {UnsupportedMusicFileError} for a `.mxl` (ZIP) payload.
 * @throws {MusicXmlParseError} when the (decoded) MusicXML doesn't parse.
 */
export function loadEditableScore(bytes: ArrayBuffer): LoadedEditableScore {
	const view = new Uint8Array(bytes);

	// `.mxl` is a ZIP container ("PK\x03\x04"). Checked before the MusicXML
	// text path so its bytes never reach `DOMParser`.
	if (magic(view, 2) === 'PK') {
		throw new UnsupportedMusicFileError('mxl');
	}

	if (magic(view, 4) === 'MThd') {
		const parsed = parseMidiFile(view);
		// No `highlightedPart` argument: every part stays "active", so
		// `convertAllParts` emits no `color=` attributes — the model is clean
		// MusicXML with nothing render-only to strip before it's saved.
		const { xml } = convertAllParts(parsed);
		return { score: new EditableScore(xml), sourceFormat: 'midi' };
	}

	const xmlText = new TextDecoder().decode(bytes);
	return { score: new EditableScore(xmlText), sourceFormat: 'musicxml' };
}
