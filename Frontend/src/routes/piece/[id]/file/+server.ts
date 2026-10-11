import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { readGuestCookie } from '$lib/server/guestSession';
import { fetchPieceOwner } from '$lib/server/groupJoin';
import { normalizeJoinCode } from '$lib/joinCode';
import type { RequestHandler } from './$types';

/** F5: proxies the Backend's `GET /library/versions/{id}/file` — `id` here
 * is actually a `Piece` id, not a version id, so this first resolves the
 * piece's current version through `/library/pieces` (same approach
 * `+page.server.ts` uses) before streaming the file back. Authenticated:
 * attaches `locals.token` server-side so the browser never needs to know
 * the Backend's token at all, same pattern as `backendFetch`. A guest (no
 * `locals.token`, `?code=` present instead — see `remotePiece.ts`'s
 * `buildRemotePiece`) proxies straight to the Backend's unauthenticated
 * `GET /guest/{code}/pieces/{id}/file` instead, already keyed by piece id,
 * no version lookup needed. */
export const GET: RequestHandler = async ({ params, locals, fetch, url, cookies }) => {
	try {
		const rawCode = url.searchParams.get('code');
		const code = rawCode ? normalizeJoinCode(rawCode) : null;
		// The guest proxy, keyed only by the join code. Used by a guest, and
		// as a fallback for a logged-in caller whose library doesn't have
		// this piece but who holds a join code for it (see
		// `../resolve/+server.ts`'s `viaJoinCode`), so the player never
		// resolves a piece it then can't load.
		const proxyGuest = async (joinCode: string): Promise<Response> => {
			// A valid guest-token cookie (set once the browser cleared the
			// group's password gate) is what lets a password-protected group's
			// file proxy through; a group with no guest password ignores it.
			const guestUrl = new URL(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(joinCode)}/pieces/${params.id}/file`);
			const token = readGuestCookie(cookies, joinCode);
			if (token) guestUrl.searchParams.set('token', token);
			const res = await fetch(guestUrl.toString());
			return new Response(res.body, { status: res.status, headers: res.headers });
		};
		if (!locals.token) {
			if (!code) return new Response(null, { status: 401 });
			return await proxyGuest(code);
		}

		const library = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		if (!library.ok) {
			if (code && library.status < 500) return await proxyGuest(code);
			return new Response(null, { status: library.status });
		}
		const entries = (await library.json()) as Array<{ piece_id: string; version_id: string }>;
		const entry = entries.find((e) => e.piece_id === params.id);
		if (!entry) {
			if (code) return await proxyGuest(code);
			// A bare piece link (no `?code=`) for a group this account isn't
			// in and couldn't self-join (`../resolve/+server.ts` already tried,
			// and handed `+page.svelte` the code it then puts on this URL; this
			// covers a caller that skipped that step). Same owner lookup.
			const { owner } = await fetchPieceOwner(params.id, fetch);
			return owner ? await proxyGuest(owner.join_code) : new Response(null, { status: 404 });
		}

		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${entry.version_id}/file`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		// The Backend is unreachable — a real network failure, not a
		// resolved-but-non-2xx response (those are already handled by the
		// `!res.ok` checks above via the real status they carry). The
		// player's own `loadRemoteMusicFile`/`PdfView` already show a
		// friendly load-error state for a failed fetch, so a clean 503 here
		// (rather than an unhandled exception reaching the platform) is all
		// this proxy needs to do.
		return new Response(null, { status: 503 });
	}
};
