import { backendErrorResponse, backendFetch } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** F4: proxies `DELETE /annotations/{id}/share/{userId}` (unshare) — owner-
 * only on the Backend side. */
export const DELETE: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		await backendFetch(
			locals.token,
			`/annotations/${params.annotationId}/share/${params.userId}`,
			{ method: 'DELETE' },
			fetch
		);
		return new Response(null, { status: 204 });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
