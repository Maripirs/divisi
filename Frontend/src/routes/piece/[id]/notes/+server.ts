import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendErrorResponse, backendJson } from '$lib/server/backend';
import { readGuestCookie } from '$lib/server/guestSession';
import type { RequestHandler } from './$types';

/** F20: the "Piece Notes" panel's group-source proxy — the Backend's B16
 * `GET`/`POST /groups/{group_id}/pieces/{piece_id}/rehearsal-notes` — with
 * the same authenticated-proxy shape as `../annotations/+server.ts`,
 * attaching `locals.token` server-side so the browser never holds the
 * Backend token. Always requires a session (no guest path — the Backend
 * route requires a member, gated on the group's Weekly Notes page access).
 *
 * `piece_id` comes from the route param; `groupId` (the owning group) is
 * supplied by the caller — the Backend still verifies the piece actually
 * belongs to that group and 404s otherwise, so a wrong id only ever fails
 * closed.
 *
 * GET has one guest exception: an unauthenticated caller passing `?code=`
 * (a group join code) instead of `?groupId=` gets the read-only "From the
 * director" notes via the Backend's guest rehearsal-notes route, with the
 * group's guest token injected from its httpOnly cookie server-side (same
 * pattern as `../pdf/+server.ts`). This keeps the browser off the Backend's
 * guest API directly, so no guest token/password ever reaches client JS.
 * The response shape (`{ id, body, created_at }[]`) matches the member
 * route's, so `$lib/api/pieceNotes.ts` maps both the same way. */
export const GET: RequestHandler = async ({ params, locals, fetch, url, cookies }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) return new Response(null, { status: 401 });
		const guestUrl = new URL(
			`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/pieces/${encodeURIComponent(params.id)}/rehearsal-notes`
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
	const groupId = url.searchParams.get('groupId');
	if (!groupId) return new Response(null, { status: 400 });
	try {
		const body = await backendJson(
			locals.token,
			`/groups/${encodeURIComponent(groupId)}/pieces/${encodeURIComponent(params.id)}/rehearsal-notes`,
			undefined,
			fetch
		);
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return backendErrorResponse(err);
	}
};

export const POST: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const { groupId, ...payload } = (await request.json()) as { groupId?: string } & Record<string, unknown>;
	if (!groupId) return new Response(null, { status: 400 });
	try {
		const body = await backendJson(
			locals.token,
			`/groups/${encodeURIComponent(groupId)}/pieces/${encodeURIComponent(params.id)}/rehearsal-notes`,
			{ method: 'POST', body: JSON.stringify(payload) },
			fetch
		);
		return new Response(JSON.stringify(body), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return backendErrorResponse(err);
	}
};
