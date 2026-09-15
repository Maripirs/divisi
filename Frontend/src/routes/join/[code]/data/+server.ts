import { json } from '@sveltejs/kit';
import { readGuestCookie } from '$lib/server/guestSession';
import { loadGuestJoin } from '../guestJoin';
import type { RequestHandler } from './$types';

/** `+page.ts` is a universal `load` — on a client-side navigation it runs in
 * the browser, where it cannot read the group's httpOnly guest-token cookie.
 * So the guest fan-out lives behind this server endpoint instead (same
 * pattern as `piece/[id]/resolve/+server.ts`): it reads the cookie, threads
 * the token through every `/guest/{code}...` call, and returns the resolved
 * `GuestJoinResult`. `+page.ts` just `fetch`es this (unawaited, so Render
 * cold-start streaming behavior is preserved) and hands the promise to the
 * component. */
export const GET: RequestHandler = async ({ params, cookies, fetch, url }) => {
	const code = params.code.toUpperCase();
	const token = readGuestCookie(cookies, code) ?? undefined;
	try {
		return json(await loadGuestJoin(code, token, fetch, url.searchParams.get('event')));
	} catch {
		// `loadGuestJoin` only throws for a genuinely unexpected failure (the
		// known guest errors resolve to a string variant). Surface it as the
		// same `{ error: 'server' }` the client already renders as a retry
		// card, rather than a bare 500.
		return json({ error: 'server' });
	}
};
