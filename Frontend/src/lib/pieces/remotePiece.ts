import type { ParsedMIDI } from '../midi/types';
import { parseMidiFile } from '../midi/parser';
import { parseMusicXmlFile } from '../musicxml/parser';
import { extractMusicXmlText, isMxl } from '../musicxml/mxl';
import type { Piece } from './types';

/** Metadata for one real Backend piece, as resolved server-side by
 * `routes/piece/[id]/+page.server.ts` from `/library/pieces`. Deliberately
 * narrow (no raw storage paths) — the player only ever reaches actual
 * bytes through the proxy routes below. */
export interface RemotePieceMeta {
	pieceId: string;
	title: string;
	composer: string | null;
	hasMusic: boolean;
	hasPdf: boolean;
	youtubeUrl: string | null;
	defaultTempoBpm: number | null;
	/** F20: the owning group's id when this is a group-owned piece, else
	 * null (a personal library piece, or a guest resolution with no group
	 * context). The piece page's "Rehearsal Notes" panel needs it to hit the
	 * Backend's group-scoped B16 list endpoint. */
	groupId: string | null;
}

/** Sniffs which parser a fetched music file needs: MIDI files start with
 * the 4-byte `MThd` magic; `.mxl` (compressed MusicXML) with the `PK` ZIP
 * magic is unpacked to its score document first; anything else is treated
 * as plain MusicXML text. */
async function loadRemoteMusicFile(url: string): Promise<ParsedMIDI> {
	const buffer = await fetch(url).then((r) => r.arrayBuffer());
	const bytes = new Uint8Array(buffer);
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
			// plain MusicXML does, a thrown `Error` the caller's `piece.load()`
			// catch turns into its normal "couldn't load" state.
			throw new Error(
				`Malformed MusicXML: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		return parseMusicXmlFile(xmlText);
	}
	return parseMusicXmlFile(new TextDecoder().decode(bytes));
}

/** Builds a `Piece` from a real Backend piece's metadata — the F5-scoped
 * remote counterpart to `$lib/pieces/registry.ts`'s bundled fixtures.
 * `pdfUrl` only appears when the piece actually has a PDF; `load` only
 * exists when it has a music file, so a PDF-only piece is a valid `Piece`
 * with no `load` at all (see `types.ts`). Both proxy routes below
 * (`/piece/[id]/file`, `/piece/[id]/pdf`) attach the caller's own session
 * server-side for a logged-in member, so no token needs to leak into
 * these URLs — a guest instead carries `guestCode` through as a query
 * param, since there's no session for the proxy route to attach. */
export function buildRemotePiece(meta: RemotePieceMeta, guestCode?: string | null): Piece {
	const suffix = guestCode ? `?code=${encodeURIComponent(guestCode)}` : '';
	const fileUrl = `/piece/${meta.pieceId}/file${suffix}`;
	const pdfUrl = `/piece/${meta.pieceId}/pdf${suffix}`;
	return {
		id: meta.pieceId,
		title: meta.title,
		composer: meta.composer ?? '',
		collection: 'group',
		...(meta.hasPdf ? { pdfUrl } : {}),
		...(meta.youtubeUrl ? { youtubeUrl: meta.youtubeUrl } : {}),
		...(meta.hasMusic ? { load: () => loadRemoteMusicFile(fileUrl) } : {})
	};
}
