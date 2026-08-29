import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { LibraryEntryOut } from '$lib/server/backendTypes';
import type { RemotePieceMeta } from '$lib/pieces/remotePiece';
import type { PageServerLoad } from './$types';

interface GuestPieceResponse {
	piece_id: string;
	title: string;
	composer: string | null;
	youtube_url: string | null;
	has_music: boolean;
	has_pdf: boolean;
}

/** Guest counterpart to the authenticated lookup below — same idea, but
 * against the Backend's unauthenticated `/guest/{code}` route (no
 * `locals.token` to attach, and a guest never has an `/library/pieces`
 * listing at all). `code` comes from the join-code link the group's
 * Tracks tab / `/join/[code]` build (`?code=`), same param
 * `AppHeader`/other guest surfaces already thread through. */
async function resolveGuestRemote(
	pieceId: string,
	code: string,
	fetchFn: typeof fetch
): Promise<RemotePieceMeta | null> {
	const res = await fetchFn(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}`);
	if (!res.ok) return null;
	const body = (await res.json()) as { pieces: GuestPieceResponse[] };
	const entry = body.pieces.find((p) => p.piece_id === pieceId);
	if (!entry) return null;
	return {
		pieceId: entry.piece_id,
		title: entry.title,
		composer: entry.composer,
		hasMusic: entry.has_music,
		hasPdf: entry.has_pdf,
		youtubeUrl: entry.youtube_url,
		defaultTempoBpm: null
	};
}

/** F5: resolves whether `params.id` is a real Backend piece (a group's
 * uploaded track) so `+page.svelte` can build a `remotePiece` for it —
 * same "check the user's `/library/pieces` listing" approach used
 * elsewhere, rather than a dedicated `GET /library/pieces/{id}` (which
 * doesn't exist). `remote: null` covers every case that should just fall
 * back to `$lib/pieces/registry.ts`'s bundled fixtures unchanged: a
 * logged-in user opening a bundled demo piece (its id never matches a
 * real `piece_id`), or the Backend being briefly unreachable. A guest
 * (no `locals.token`) with a `?code=` param — this route is also reached
 * via join-code links — resolves through the guest group listing instead. */
export const load: PageServerLoad = async ({ params, locals, fetch, url }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) return { id: params.id, remote: null as RemotePieceMeta | null };
		const remote = await resolveGuestRemote(params.id, code, fetch);
		return { id: params.id, remote };
	}

	try {
		const entries = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
		const entry = entries.find((e) => e.piece_id === params.id);
		if (!entry) return { id: params.id, remote: null as RemotePieceMeta | null };

		const remote: RemotePieceMeta = {
			pieceId: entry.piece_id,
			title: entry.title,
			composer: entry.composer,
			hasMusic: entry.has_music,
			hasPdf: entry.has_pdf,
			youtubeUrl: entry.youtube_url,
			defaultTempoBpm: entry.default_tempo_bpm
		};
		return { id: params.id, remote };
	} catch (err) {
		if (err instanceof BackendApiError) return { id: params.id, remote: null as RemotePieceMeta | null };
		throw err;
	}
};
