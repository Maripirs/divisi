import { backendJson, BackendApiError } from '$lib/server/backend';
import type { LibraryEntryOut } from '$lib/server/backendTypes';
import type { RemotePieceMeta } from '$lib/pieces/remotePiece';
import type { PageServerLoad } from './$types';

/** F5: resolves whether `params.id` is a real Backend piece (a group's
 * uploaded track) so `+page.svelte` can build a `remotePiece` for it —
 * same "check the user's `/library/pieces` listing" approach used
 * elsewhere, rather than a dedicated `GET /library/pieces/{id}` (which
 * doesn't exist). `remote: null` covers every case that should just fall
 * back to `$lib/pieces/registry.ts`'s bundled fixtures unchanged: a guest
 * with no session at all (this route is also reached via join-code links,
 * which carry no `locals.token`), a logged-in user opening a bundled demo
 * piece (its id never matches a real `piece_id`), or the Backend being
 * briefly unreachable. */
export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.token) return { id: params.id, remote: null as RemotePieceMeta | null };

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
