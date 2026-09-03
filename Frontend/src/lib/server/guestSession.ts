import type { Cookies } from '@sveltejs/kit';

/** The guest counterpart to `$lib/server/session.ts`. A visitor who clears
 * a group's guest-password gate on `/join/[code]` gets an opaque signed
 * guest token from the Backend (`POST /guest/{code}/auth`), which we stash
 * in a per-group httpOnly cookie so every later `/guest/{code}...` fetch
 * can prove the browser is authorized without ever re-prompting — and
 * without the token (or the password) ever being visible to client JS or
 * sitting in a browser-visible URL. One cookie per group (keyed by join
 * code) so authorizing group A never implies group B.
 *
 * Read only from server code (`+server.ts` / `+page.server.ts`), same as
 * the member session cookie. There is no `hooks.server.ts` hook populating
 * a `locals` field for it: the set of routes that need it is small and each
 * reads its own group's cookie explicitly via `readGuestCookie`. */

/** Join codes are generated as `[A-Z0-9]{8}` (see Backend's
 * `app/core/join_codes.py`); callers may pass a lowercased/mixed-case code
 * from a URL, so every helper here uppercases before building the name. */
export function guestCookieName(code: string): string {
	return `divisi_guest_${code.toUpperCase()}`;
}

/** Must track the Backend's `guest_token_expire_minutes` (30 days at time
 * of writing). Outliving the token itself just means a stale cookie that
 * the Backend rejects with a 401, which the piece-page gate / join-page
 * prompt then recover from by re-authing — harmless, but pointless. */
const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setGuestCookie(cookies: Cookies, code: string, token: string): void {
	cookies.set(guestCookieName(code), token, {
		path: '/',
		httpOnly: true,
		// Dev and prod are both real HTTPS (see vite.config.ts's basicSsl
		// plugin), same reasoning as the member session cookie — no need to
		// branch this on `dev`.
		secure: true,
		sameSite: 'lax',
		maxAge: GUEST_SESSION_MAX_AGE_SECONDS
	});
}

export function clearGuestCookie(cookies: Cookies, code: string): void {
	cookies.delete(guestCookieName(code), { path: '/' });
}

export function readGuestCookie(cookies: Cookies, code: string): string | null {
	return cookies.get(guestCookieName(code)) ?? null;
}
