import { backendErrorResponse, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** F4: proxies the Backend's `GET /annotations?piece_id=...` / `POST
 * /annotations` — same authenticated-proxy shape as `../file/+server.ts`,
 * attaching `locals.token` server-side so the browser never needs the
 * Backend's token at all. Annotations only ever apply to a real Backend
 * piece (`params.id` is that piece's real id here, not a bundled fixture's
 * short slug — `+page.svelte` only shows annotation UI when `data.remote`
 * is set), and always require a session — no guest path, unlike the
 * file/pdf proxies. */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		const body = await backendJson(
			locals.token,
			`/annotations?piece_id=${encodeURIComponent(params.id)}`,
			undefined,
			fetch
		);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};

/** `piece_id` is taken from the route param, not the request body — a
 * client-supplied `piece_id` would let it annotate a different piece than
 * the one this route's URL names. */
export const POST: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = (await request.json()) as { position: string; content: string };
	try {
		const body = await backendJson(
			locals.token,
			'/annotations',
			{ method: 'POST', body: JSON.stringify({ piece_id: params.id, ...payload }) },
			fetch
		);
		return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
