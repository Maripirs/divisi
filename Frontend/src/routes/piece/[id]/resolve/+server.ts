import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { readGuestCookie } from '$lib/server/guestSession';
import type { GroupOut, GroupRole, LibraryEntryOut } from '$lib/server/backendTypes';
import type { RemotePieceMeta } from '$lib/pieces/remotePiece';
import type { PiecePresentation } from '$lib/pieces/types';
import type { RequestHandler } from './$types';

interface GuestPieceResponse {
	piece_id: string;
	title: string;
	composer: string | null;
	youtube_url: string | null;
	presentation: PiecePresentation | null;
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
	/** Whether this caller is an `admin` of the piece's owning group. F20 uses
	 * it as the authority the Backend requires to create/edit/delete the
	 * group's piece notes (B16); F21 uses it to allow drawing into the shared
	 * "director" markup layer (B17). Members still see both read-only;
	 * absent/`false` hides the authoring controls (and is always false for a
	 * personal piece or a guest). `canManagePieceNotes` is kept as a
	 * back-compat alias of the same value. */
	isOwningGroupAdmin?: boolean;
	canManagePieceNotes?: boolean;
	/** Guest path only: the piece's group has a guest password set and this
	 * browser has no valid guest-token cookie for it yet (the Backend's
	 * `/guest/{code}` answered 401). `+page.svelte` shows an inline password
	 * gate for this rather than the misleading "no piece found" card. */
	passwordRequired?: boolean;
}

/** The caller's role in this piece's owning group, or `null` for a
 * personal piece, a group the caller isn't in, or any Backend hiccup
 * resolving it. Feeds `canManagePieceNotes` below — never throws, since
 * that flag only decides whether to show UI and should fail closed. */
async function resolveOwningGroupRole(
	entry: LibraryEntryOut,
	token: string,
	fetchFn: typeof fetch
): Promise<GroupRole | null> {
	if (entry.owner_type !== 'group') return null;
	try {
		const groups = await backendJson<GroupOut[]>(token, '/groups', undefined, fetchFn);
		return groups.find((g) => g.id === entry.owner_id)?.role ?? null;
	} catch {
		return null;
	}
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

/** Whether a Backend status means "ask again in a moment", not "the answer
 * is genuinely no". `backendFetch` normalizes a thrown fetch (connection
 * refused, DNS, our own timeout) into a synthetic 503, but a Render
 * free-tier instance waking from an idle spin-down also serves real
 * 502/504 (and sometimes 500 off a cold DB) HTML from its edge for a few
 * seconds before the app is ready. Treating those as "no such piece in
 * your library" is the bug behind the "No piece found with that id" card
 * that a refresh then clears — none of them are an actual answer about
 * this piece, so they map to `unreachable` (retry) instead. A 401/403/404
 * still falls through to `notFound`, which is correct for those. */
function isTransientBackendStatus(status: number): boolean {
	return status >= 500 || status === 429 || status === 408;
}

async function resolveGuestRemote(
	pieceId: string,
	code: string,
	token: string | null,
	fetchFn: typeof fetch
): Promise<RemoteResolution> {
	// A valid guest token proves this browser cleared the group's password
	// gate on `/join/[code]`; forwarding it here is what makes a
	// password-protected group's piece links resolve at all. A group with no
	// guest password ignores it.
	const url = new URL(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}`);
	if (token) url.searchParams.set('token', token);
	let res: Response;
	try {
		res = await fetchWithTimeout(fetchFn, url.toString());
	} catch {
		return { remote: null, unreachable: true };
	}
	// 401 == the group has a guest password and this browser has no (valid)
	// token for it yet. Distinct from "no such piece": prompt for the
	// password instead of claiming the link is dead.
	if (res.status === 401) return { remote: null, unreachable: false, passwordRequired: true };
	if (!res.ok) return { remote: null, unreachable: isTransientBackendStatus(res.status) };
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
			defaultTempoBpm: null,
			presentation: entry.presentation ?? null,
			// A guest resolution has no group context, and there's no guest
			// path to piece notes anyway (the Backend requires a member).
			groupId: null
		},
		unreachable: false
	};
}

/** F5: resolves whether `params.id` is a real Backend piece — same
 * "check the user's `/library/pieces` listing" approach `+page.server.ts`
 * used to do inline, before blocking the whole page's first paint on it
 * became the bug this route fixes. Called from `+page.svelte`'s
 * `onMount`, well after a "loading" status card is already on screen. */
export const GET: RequestHandler = async ({ params, locals, fetch, url, cookies }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) return json({ remote: null, unreachable: false } satisfies RemoteResolution);
		const token = readGuestCookie(cookies, code);
		return json(await resolveGuestRemote(params.id, code, token, fetch));
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
			defaultTempoBpm: entry.default_tempo_bpm,
			presentation: entry.presentation ?? null,
			groupId: entry.owner_type === 'group' ? entry.owner_id : null
		};
		const groupRole = await resolveOwningGroupRole(entry, locals.token, fetch);
		const isOwningGroupAdmin = groupRole === 'admin';
		return json({
			remote,
			unreachable: false,
			isOwningGroupAdmin,
			canManagePieceNotes: isOwningGroupAdmin
		} satisfies RemoteResolution);
	} catch (err) {
		if (err instanceof BackendApiError) {
			// A synthetic 503 (network failure) or a real 5xx/429/408 off a
			// cold-starting Backend both mean "no answer yet", not "this
			// piece isn't yours" (see isTransientBackendStatus). A 403/404 is
			// a real answer and still lands on the notFound card.
			return json({
				remote: null,
				unreachable: isTransientBackendStatus(err.status)
			} satisfies RemoteResolution);
		}
		throw err;
	}
};
