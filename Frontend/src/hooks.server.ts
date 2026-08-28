import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/session';

/** Populates `event.locals.token` from the session cookie for every
 * request, so `+page.server.ts`/`+layout.server.ts load`s and form
 * `actions` don't each need to read the cookie themselves. Does no network
 * I/O itself — resolving the token to an actual user happens once, in the
 * root `+layout.server.ts`. */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = event.cookies.get(SESSION_COOKIE) ?? null;
	return resolve(event);
};
