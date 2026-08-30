import { backendErrorResponse, backendFetch, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** F4: proxies `PATCH`/`DELETE /annotations/{id}` — the Backend itself
 * enforces owner-only on both (`_require_owner`), so this route doesn't
 * duplicate that check, just forwards the caller's token. */
export const PATCH: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = (await request.json()) as { position?: string; content?: string };
	try {
		const body = await backendJson(
			locals.token,
			`/annotations/${params.annotationId}`,
			{ method: 'PATCH', body: JSON.stringify(payload) },
			fetch
		);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		await backendFetch(locals.token, `/annotations/${params.annotationId}`, { method: 'DELETE' }, fetch);
		return new Response(null, { status: 204 });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
