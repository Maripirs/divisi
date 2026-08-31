import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { LibraryEntryOut } from '$lib/server/backendTypes';
import type { RemotePieceMeta } from '$lib/pieces/remotePiece';
import type { RequestHandler } from './$types';

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
 * take tens of seconds — see Backend/plan.md). */
interface RemoteResolution {
	remote: RemotePieceMeta | null;
	unreachable: boolean;
}

/** Bounds how long a single Backend fetch can hang before this counts as
 * "unreachable" rather than waiting indefinitely — chosen well above the
 * ~12s cold-start-to-ready time actually observed against the deployed
 * Backend, so a genuine (if slow) wake-up still succeeds. Living here
 * (rather than blocking `+page.server.ts`'s `load`) is the whole point:
 * this is a plain client-triggered `fetch`, called from `onMount` *after*
 * the page has already painted its "loading" status card — so even the
 * full 20s only ever delays that card resolving, never the first paint.
 * See the "never blank, even with the Backend down" fix this route exists
 * for. */
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

async function resolveGuestRemote(pieceId: string, code: string, fetchFn: typeof fetch): Promise<RemoteResolution> {
	let res: Response;
	try {
		res = await fetchWithTimeout(fetchFn, `${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}`);
	} catch {
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

/** F5: resolves whether `params.id` is a real Backend piece — same
 * "check the user's `/library/pieces` listing" approach `+page.server.ts`
 * used to do inline, before blocking the whole page's first paint on it
 * became the bug this route fixes. Called from `+page.svelte`'s
 * `onMount`, well after a "loading" status card is already on screen. */
export const GET: RequestHandler = async ({ params, locals, fetch, url }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) return json({ remote: null, unreachable: false } satisfies RemoteResolution);
		return json(await resolveGuestRemote(params.id, code, fetch));
	}

	try {
		const entries = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
		const entry = entries.find((e) => e.piece_id === params.id);
		if (!entry) return json({ remote: null, unreachable: false } satisfies RemoteResolution);

		const remote: RemotePieceMeta = {
			pieceId: entry.piece_id,
			title: entry.title,
			composer: entry.composer,
			hasMusic: entry.has_music,
			hasPdf: entry.has_pdf,
			youtubeUrl: entry.youtube_url,
			defaultTempoBpm: entry.default_tempo_bpm
		};
		return json({ remote, unreachable: false } satisfies RemoteResolution);
	} catch (err) {
		if (err instanceof BackendApiError) {
			// `backendFetch` normalizes a genuine network failure into a
			// synthetic 503 — everything else (403/404/etc.) is a real answer
			// from the Backend, just not one with this piece in the caller's
			// library.
			return json({ remote: null, unreachable: err.status === 503 } satisfies RemoteResolution);
		}
		throw err;
	}
};
