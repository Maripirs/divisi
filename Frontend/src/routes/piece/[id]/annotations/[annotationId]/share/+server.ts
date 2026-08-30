import { backendErrorResponse, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** F4: proxies `GET`/`POST /annotations/{id}/share` — listing and adding a
 * share, both owner-only on the Backend side. */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		const body = await backendJson(locals.token, `/annotations/${params.annotationId}/shares`, undefined, fetch);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};

export const POST: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = (await request.json()) as { email: string };
	try {
		const body = await backendJson(
			locals.token,
			`/annotations/${params.annotationId}/share`,
			{ method: 'POST', body: JSON.stringify(payload) },
			fetch
		);
		return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
