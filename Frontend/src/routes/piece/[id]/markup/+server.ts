import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendErrorResponse, backendJson } from '$lib/server/backend';
import { readGuestCookie } from '$lib/server/guestSession';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET`/`POST /piece-markup` — same authenticated-
 * proxy shape as `../annotations/+server.ts`, attaching `locals.token`
 * server-side so the browser never holds the Backend token.
 *
 * GET has one guest exception (mirrors `../notes/+server.ts`): an
 * unauthenticated caller passing `?code=` (a group join code) with
 * `scope=group` gets the read-only F22 cue glyphs via the Backend's guest
 * cues route, with the group's guest token injected from its httpOnly cookie
 * server-side. Only the navigation cues cross that line — personal marks and
 * the rest of the director layer stay members-only. POST stays session-only. */
export const GET: RequestHandler = async ({ params, locals, fetch, url, cookies }) => {
	const scope = url.searchParams.get('scope') === 'group' ? 'group' : 'personal';
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code || scope !== 'group') return new Response(null, { status: 401 });
		const guestUrl = new URL(
			`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/pieces/${encodeURIComponent(params.id)}/cues`
		);
		const token = readGuestCookie(cookies, code);
		if (token) guestUrl.searchParams.set('token', token);
		try {
			const res = await fetch(guestUrl.toString());
			return new Response(res.body, { status: res.status, headers: res.headers });
		} catch {
			return new Response(null, { status: 503 });
		}
	}
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
