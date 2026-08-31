import { backendErrorResponse, backendFetch, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** Proxies `DELETE /piece-markup/{id}` — covers both "erase this stroke"
 * and "undo" (see the Backend route's own note). Owner-only on the Backend
 * side. */
export const DELETE: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		await backendFetch(locals.token, `/piece-markup/${params.markId}`, { method: 'DELETE' }, fetch);
		return new Response(null, { status: 204 });
	} catch (err) {
		return backendErrorResponse(err);
	}
};

export const PATCH: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = await request.json();
	try {
		const body = await backendJson(
			locals.token,
			`/piece-markup/${params.markId}`,
			{ method: 'PATCH', body: JSON.stringify(payload) },
			fetch
		);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
