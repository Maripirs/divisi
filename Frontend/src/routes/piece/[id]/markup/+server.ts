import { backendErrorResponse, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET`/`POST /piece-markup` — same authenticated-
 * proxy shape as `../annotations/+server.ts`. Always requires a session
 * (no guest path — marks are personal, same as annotations). */
export const GET: RequestHandler = async ({ params, locals, fetch, url }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const scope = url.searchParams.get('scope') === 'group' ? 'group' : 'personal';
	try {
		const body = await backendJson(
			locals.token,
			`/piece-markup?piece_id=${encodeURIComponent(params.id)}&scope=${scope}`,
			undefined,
			fetch
		);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};

/** `piece_id` comes from the route param, not the request body — see
 * `../annotations/+server.ts`'s identical note on why. */
export const POST: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = await request.json();
	try {
		const body = await backendJson(
			locals.token,
			'/piece-markup',
			{ method: 'POST', body: JSON.stringify({ piece_id: params.id, ...payload }) },
			fetch
		);
		return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
