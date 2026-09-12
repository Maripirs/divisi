import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import {
	backendCookieHeader,
	extractParticipantToken,
	readParticipantCookie,
	readSetCookie,
	setParticipantCookie
} from '$lib/server/participantSession';
import type { RequestHandler } from './$types';

/** F33 / Backend B27: a guest releases a seat claim, either their own or
 * (if they're the driver post's owner) someone else's. Same shape as
 * `join/[code]/carpool/posts/[postId]/+server.ts`'s `DELETE`: `local_id`
 * travels as a query param, a fallback for a lost cookie.
 *
 *   DELETE -> { ok: true } | { ok: false, error: 'forbidden' | 'server' }
 */
export const DELETE: RequestHandler = async ({ params, url, cookies, locals, fetch }) => {
	const claimId = params.claimId;
	if (!claimId) return json({ ok: false, error: 'server' as const });
	const localId = url.searchParams.get('localId');

	if (locals.token) {
		try {
			await backendFetch(locals.token, `/carpool/claims/${encodeURIComponent(claimId)}`, { method: 'DELETE' }, fetch);
			return json({ ok: true as const });
		} catch (err) {
			if (err instanceof BackendApiError && err.status === 403) {
				return json({ ok: false as const, error: 'forbidden' as const });
			}
			return json({ ok: false as const, error: 'server' as const });
		}
	}

	const existingToken = readParticipantCookie(cookies);
	const headers: Record<string, string> = {};
	const forward = backendCookieHeader(existingToken);
	if (forward) headers.Cookie = forward;

	const url_ = new URL(`${PUBLIC_API_BASE_URL}/carpool/claims/${encodeURIComponent(claimId)}`);
	if (localId) url_.searchParams.set('local_id', localId);

	let res: Response;
	try {
		res = await fetch(url_.toString(), { method: 'DELETE', headers, signal: AbortSignal.timeout(20_000) });
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}
	if (res.ok) {
		// A 204 has no body to read a `Set-Cookie`-derived token off of any
		// differently than any other response — same extraction either way.
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const });
	}
	if (res.status === 403) return json({ ok: false as const, error: 'forbidden' as const });
	return json({ ok: false as const, error: 'server' as const });
};
