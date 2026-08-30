import { redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { LibraryEntryOut } from '$lib/server/backendTypes';
import { getPiece } from '$lib/pieces/registry';
import type { RemotePieceMeta } from '$lib/pieces/remotePiece';
import { lh } from '$lib/i18n';
import type { PageServerLoad } from './$types';

interface GuestPieceResponse {
	piece_id: string;
	title: string;
	composer: string | null;
	youtube_url: string | null;
	has_music: boolean;
	has_pdf: boolean;
}

/** Whether a real Backend piece resolved, and — when it didn't — *why*, so
 * `+page.svelte` can tell "the Backend answered and there's genuinely no
 * such piece" apart from "the Backend never answered at all" (most often
 * Render's free-tier instance waking up from an idle spin-down, which can
 * take tens of seconds — see Backend/plan.md). Showing "piece not found"
 * for the second case is actively misleading (the piece is fine, the
 * server just hasn't answered yet) — this flag is what lets the page show
 * "couldn't reach the server, try again" instead. */
interface RemoteResolution {
	remote: RemotePieceMeta | null;
	unreachable: boolean;
}

/** Bounds how long a single Backend fetch can hang before this counts as
 * "unreachable" rather than waiting indefinitely — chosen well above the
 * ~12s cold-start-to-ready time actually observed against the deployed
 * Backend, so a genuine (if slow) wake-up still succeeds. */
const BACKEND_FETCH_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(fetchFn: typeof fetch, url: string): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS);
	try {
		return await fetchFn(url, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
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
): Promise<RemoteResolution> {
	let res: Response;
	try {
		res = await fetchWithTimeout(fetchFn, `${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}`);
	} catch {
		// A thrown fetch (network failure, or our own timeout aborting it)
		// means the Backend never actually answered — distinct from the
		// `!res.ok` branch below, where it did (even a bad join code gets a
		// clean 404, not this).
		return { remote: null, unreachable: true };
	}
	if (!res.ok) return { remote: null, unreachable: false };
	const body = (await res.json()) as { pieces: GuestPieceResponse[] };
	const entry = body.pieces.find((p) => p.piece_id === pieceId);
	if (!entry) return { remote: null, unreachable: false };
	return {
		remote: {
			pieceId: entry.piece_id,
			title: entry.title,
			composer: entry.composer,
			hasMusic: entry.has_music,
			hasPdf: entry.has_pdf,
			youtubeUrl: entry.youtube_url,
			defaultTempoBpm: null
		},
		unreachable: false
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
		if (!code) {
			// A bundled demo/SFCC piece needs no login at all — unchanged. A
			// real Backend piece (e.g. a choir member sharing a track link)
			// does: send the visitor to log in (or register) and land right
			// back on this exact piece afterward, rather than silently
			// falling back to "no remote piece found" the way a cold,
			// logged-out visit used to.
			if (getPiece(params.id)) return { id: params.id, remote: null as RemotePieceMeta | null, unreachable: false };
			throw redirect(303, lh(`/login?redirectTo=/piece/${params.id}`));
		}
		const { remote, unreachable } = await resolveGuestRemote(params.id, code, fetch);
		return { id: params.id, remote, unreachable };
	}

	try {
		const entries = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
		const entry = entries.find((e) => e.piece_id === params.id);
		if (!entry) return { id: params.id, remote: null as RemotePieceMeta | null, unreachable: false };

		const remote: RemotePieceMeta = {
			pieceId: entry.piece_id,
			title: entry.title,
			composer: entry.composer,
			hasMusic: entry.has_music,
			hasPdf: entry.has_pdf,
			youtubeUrl: entry.youtube_url,
			defaultTempoBpm: entry.default_tempo_bpm
		};
		return { id: params.id, remote, unreachable: false };
	} catch (err) {
		if (err instanceof BackendApiError) {
			// `backendFetch` normalizes a genuine network failure into a
			// synthetic 503 (see its own doc comment) — everything else
			// (403/404/etc.) is a real answer from the Backend, just not one
			// with this piece in the caller's library.
			return { id: params.id, remote: null as RemotePieceMeta | null, unreachable: err.status === 503 };
		}
		throw err;
	}
};
