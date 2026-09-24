import type { ParsedMIDI } from '../midi/types';
import { parseMidiFile } from '../midi/parser';
import { parseMusicXmlFile } from '../musicxml/parser';
import { extractMusicXmlText, isMxl } from '../musicxml/mxl';

/**
 * Sniffs which parser a music file's raw bytes need and parses it: MIDI
 * files start with the 4-byte `MThd` magic; `.mxl` (compressed MusicXML)
 * with the `PK` ZIP magic is unpacked to its score document first; anything
 * else is treated as plain MusicXML text.
 *
 * Extracted out of `remotePiece.ts`'s `loadRemoteMusicFile` (the only
 * previous caller) so the same dispatch can also run synchronously,
 * client-side, on a File the Tracks-tab upload/edit form just picked --
 * before that form ever submits -- to decide whether the upload needs a
 * detour through the review flow (see `groups/[id]/tabs/TracksTab.svelte`).
 * `loadRemoteMusicFile` now just fetches the bytes and calls this.
 */
export function parseMusicBytes(bytes: Uint8Array): ParsedMIDI {
	let magic = '';
	for (let i = 0; i < 4 && i < bytes.length; i++) magic += String.fromCharCode(bytes[i]);
	if (magic === 'MThd') return parseMidiFile(bytes);
	if (isMxl(bytes)) {
		let xmlText: string;
		try {
			xmlText = extractMusicXmlText(bytes);
		} catch (err) {
			// A truncated / corrupt ZIP (fflate throws a raw `FlateError`) or an
			// archive with no score document: surface it the way an unparseable
			// plain MusicXML does, a thrown `Error` the caller's own catch turns
			// into its normal "couldn't load" / "not ambiguous" state.
			throw new Error(
				`Malformed MusicXML: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		return parseMusicXmlFile(xmlText);
	}
	return parseMusicXmlFile(new TextDecoder().decode(bytes));
}
