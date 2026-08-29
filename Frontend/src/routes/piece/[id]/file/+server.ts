import { PUBLIC_API_BASE_URL } from '$env/static/public';
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
export const GET: RequestHandler = async ({ params, locals, fetch, url }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) return new Response(null, { status: 401 });
		const res = await fetch(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/pieces/${params.id}/file`);
		return new Response(res.body, { status: res.status, headers: res.headers });
	}

	const library = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces`, {
		headers: { Authorization: `Bearer ${locals.token}` }
	});
	if (!library.ok) return new Response(null, { status: library.status });
	const entries = (await library.json()) as Array<{ piece_id: string; version_id: string }>;
	const entry = entries.find((e) => e.piece_id === params.id);
	if (!entry) return new Response(null, { status: 404 });

	const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${entry.version_id}/file`, {
		headers: { Authorization: `Bearer ${locals.token}` }
	});
	return new Response(res.body, { status: res.status, headers: res.headers });
};
