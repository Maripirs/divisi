import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';
import { SESSION_COOKIE } from '$lib/server/session';

/** Populates `event.locals.token` from the session cookie for every
 * request, so `+page.server.ts`/`+layout.server.ts load`s and form
 * `actions` don't each need to read the cookie themselves. Does no network
 * I/O itself — resolving the token to an actual user happens once, in the
 * root `+layout.server.ts`. */
const authHandle: Handle = async ({ event, resolve }) => {
	event.locals.token = event.cookies.get(SESSION_COOKIE) ?? null;
	return resolve(event);
};

/** i18n: detects the request's locale (from the `/es` URL prefix — see
 * `src/hooks.ts`'s `reroute` — falling back to a cookie, then the base
 * locale) and stamps `%lang%`/`%dir%` into `app.html` so the rendered page
 * always has the right `<html lang>` attribute, not just translated text. */
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale).replace('%dir%', getTextDirection(locale))
		});
	});

export const handle: Handle = sequence(paraglideHandle, authHandle);
