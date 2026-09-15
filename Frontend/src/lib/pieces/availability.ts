import type { Piece } from './types';

/** F42/F43: "what can a viewer actually do with this piece" — one shared
 * home for logic that used to live as separate `{@const}` derivations in
 * `TracksTab.svelte` (member) and `join/[code]/+page.svelte` (guest),
 * which risked drifting apart. Accounts for both a real Backend piece's
 * own has-music/has-pdf/YouTube-link flags and a bundled-registry fallback
 * (see `registry.ts`'s `getPieceByTitle`) — a demo piece like Lacrymosa has
 * none of the Backend flags set, yet clearly offers a player/PDF. */
export interface PieceResourceFlags {
	hasPlayer: boolean;
	hasReference: boolean;
	hasPdf: boolean;
}

export function pieceAvailability(
	hasMusic: boolean,
	hasPdf: boolean,
	youtubeUrl: string | null | undefined,
	bundled: Piece | undefined
): PieceResourceFlags {
	return {
		hasPlayer: hasMusic || !!bundled?.load,
		hasReference: !!youtubeUrl || !!bundled?.youtubeUrl,
		hasPdf: hasPdf || !!bundled?.pdfUrl
	};
}

/** F43: count of resources available (0-3), the sort key for "most-resourced
 * pieces first" on the member Tracks tab and the guest join-page list. */
export function resourceCount(flags: PieceResourceFlags): number {
	return Number(flags.hasPlayer) + Number(flags.hasReference) + Number(flags.hasPdf);
}
