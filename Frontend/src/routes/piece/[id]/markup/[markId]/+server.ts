import { backendErrorResponse, backendFetch } from '$lib/server/backend';
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
