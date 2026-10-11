import type { Cookies } from '@sveltejs/kit';
import { safeRedirectTarget } from '$lib/redirectTarget';

/** Where a successful OAuth sign-in should land, parked for the round trip
 * through the provider (see `routes/login/oauth/[provider]`). Short-lived
 * and httpOnly; only ever a validated same-site path. */
const OAUTH_RETURN_COOKIE = 'divisi_oauth_return';
const OAUTH_RETURN_MAX_AGE_SECONDS = 60 * 10;

export function setOAuthReturnCookie(cookies: Cookies, redirectTo: string | null): void {
	const target = safeRedirectTarget(redirectTo, '');
	if (!target) {
		cookies.delete(OAUTH_RETURN_COOKIE, { path: '/' });
		return;
	}
	cookies.set(OAUTH_RETURN_COOKIE, target, {
		path: '/',
		httpOnly: true,
		secure: true,
		// `lax` so it's sent on the top-level redirect back from the Backend's
		// callback to `/login/oauth-callback`.
		sameSite: 'lax',
		maxAge: OAUTH_RETURN_MAX_AGE_SECONDS
	});
}

/** Reads and clears the parked target, re-validated (a cookie is still
 * client-controlled). `/home` when there's none. */
export function takeOAuthReturnTarget(cookies: Cookies): string {
	const raw = cookies.get(OAUTH_RETURN_COOKIE) ?? null;
	if (raw !== null) cookies.delete(OAUTH_RETURN_COOKIE, { path: '/' });
	return safeRedirectTarget(raw, '/home');
}
