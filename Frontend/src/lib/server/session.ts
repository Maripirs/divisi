import type { Cookies } from '@sveltejs/kit';

/** F4: the Backend JWT lives in this httpOnly cookie, never in
 * `localStorage` or client-readable JS — set/cleared only from server code
 * (`+page.server.ts`/`+server.ts` actions), read into `event.locals.token`
 * by `hooks.server.ts`. */
export const SESSION_COOKIE = 'divisi_session';

// Matches the Backend's default JWT lifetime (`jwt_expire_minutes = 60 * 24 * 90`,
// i.e. 90 days, in `Backend/app/core/config.py`) — no point outliving the
// token itself. This previously said `60 * 24` (1 day) instead of
// `60 * 24 * 90`, a stale comment the cookie's own maxAge had drifted to
// match instead of the real Backend value: the JWT itself was good for 90
// days, but the browser discarded the cookie carrying it after 1, forcing a
// fresh login far more often than the token actually required.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function setSessionCookie(cookies: Cookies, token: string): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// Dev and prod are both real HTTPS (see vite.config.ts's basicSsl
		// plugin — AudioWorklet needs a secure context anyway), so this can
		// stay unconditionally true instead of branching on `dev`.
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
