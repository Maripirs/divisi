import type { ParsedMIDI } from '../midi/types';
import type { Piece, PiecePresentation } from './types';
import { parseMusicBytes } from './parseMusicBytes';

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
	/** Admin-set first-open presentation hint, or null for the automatic
	 * pane-shape default. See `PiecePresentation`. */
	presentation: PiecePresentation | null;
	/** F20: the owning group's id when this is a group-owned piece, else
	 * null (a personal library piece, or a guest resolution with no group
	 * context). The piece page's "Rehearsal Notes" panel needs it to hit the
	 * Backend's group-scoped B16 list endpoint. */
	groupId: string | null;
}

/** Fetches a music file and parses it via `parseMusicBytes`'s magic-byte
 * dispatch (MIDI / `.mxl` / plain MusicXML). A parse failure surfaces as a
 * thrown `Error` the caller's `piece.load()` catch turns into its normal
 * "couldn't load" state. */
async function loadRemoteMusicFile(url: string): Promise<ParsedMIDI> {
	const buffer = await fetch(url).then((r) => r.arrayBuffer());
	return parseMusicBytes(new Uint8Array(buffer));
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
		...(meta.presentation ? { presentation: meta.presentation } : {}),
		...(meta.hasMusic ? { load: () => loadRemoteMusicFile(fileUrl) } : {})
	};
}
