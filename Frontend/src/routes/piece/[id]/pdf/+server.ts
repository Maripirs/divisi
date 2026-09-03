import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { readGuestCookie } from '$lib/server/guestSession';
import type { RequestHandler } from './$types';

/** F5: proxies the Backend's `GET /library/versions/{id}/pdf` — see
 * `../file/+server.ts` for why this resolves `id` (a `Piece` id) to its
 * current version first. A guest (no `locals.token`, `?code=` present
 * instead — see `remotePiece.ts`'s `buildRemotePiece`) proxies straight to
 * the Backend's unauthenticated `GET /guest/{code}/pieces/{id}/pdf`
 * instead, which is already keyed by piece id, no version lookup needed. */
export const GET: RequestHandler = async ({ params, locals, fetch, url, cookies }) => {
	try {
		if (!locals.token) {
			const code = url.searchParams.get('code');
			if (!code) return new Response(null, { status: 401 });
			// A valid guest-token cookie (set once the browser cleared the
			// group's password gate) is what lets a password-protected group's
			// PDF proxy through; a group with no guest password ignores it.
			const guestUrl = new URL(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/pieces/${params.id}/pdf`);
			const token = readGuestCookie(cookies, code);
			if (token) guestUrl.searchParams.set('token', token);
			const res = await fetch(guestUrl.toString());
			return new Response(res.body, { status: res.status, headers: res.headers });
		}

		const library = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		if (!library.ok) return new Response(null, { status: library.status });
		const entries = (await library.json()) as Array<{ piece_id: string; version_id: string }>;
		const entry = entries.find((e) => e.piece_id === params.id);
		if (!entry) return new Response(null, { status: 404 });

		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${entry.version_id}/pdf`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		// Same as `../file/+server.ts` — a genuine network failure, not a
		// resolved-but-non-2xx response, gets a clean 503 rather than an
		// unhandled exception; `PdfView`'s own load-error state handles the
		// rest client-side.
		return new Response(null, { status: 503 });
	}
};
