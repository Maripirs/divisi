import type { ParsedMIDI } from '../midi/types';
import { parseMidiFile } from '../midi/parser';
import { parseMusicXmlFile } from '../musicxml/parser';
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
}

/** Sniffs which parser a fetched music file needs: MIDI files start with
 * the 4-byte `MThd` magic; anything else here is assumed to be MusicXML
 * (the only two formats `POST /library/pieces` accepts). */
async function loadRemoteMusicFile(url: string): Promise<ParsedMIDI> {
	const buffer = await fetch(url).then((r) => r.arrayBuffer());
	const bytes = new Uint8Array(buffer);
	let magic = '';
	for (let i = 0; i < 4 && i < bytes.length; i++) magic += String.fromCharCode(bytes[i]);
	const isMidi = magic === 'MThd';
	if (isMidi) return parseMidiFile(bytes);
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
