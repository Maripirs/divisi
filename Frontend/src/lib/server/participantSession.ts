import type { Cookies } from '@sveltejs/kit';

/** F23 / Backend B19: the anonymous-participant device cookie.
 *
 * A local-only visitor's first shared action (a responsibility self-signup)
 * makes the Backend mint an anonymous `User` and set a `divisi_participant`
 * cookie on its own response. The Backend's cookie is scoped to the API
 * origin, which is cross-site from the Frontend, so rather than trying to
 * relay that `Set-Cookie` verbatim we pull the token value out of it and
 * re-set it on our own origin here, exactly the way `guestSession.ts`
 * threads the guest token (read the `{ token }` off the Backend response,
 * stash it in a first-party httpOnly cookie).
 *
 * Read only from server code (`+server.ts` / `+page.server.ts`). Later
 * `/responsibilities/...` and `/auth/save` proxy calls forward it back to
 * the Backend as a `Cookie:` header (see `backendCookieHeader`). */

export const PARTICIPANT_COOKIE = 'divisi_participant';

/** Mirrors the Backend's `participant_token_expire_minutes` (365 days). An
 * outlived first-party cookie just means a stale value the Backend rejects,
 * which the next shared action recovers from by re-minting via `local_id`. */
const PARTICIPANT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function setParticipantCookie(cookies: Cookies, token: string): void {
	cookies.set(PARTICIPANT_COOKIE, token, {
		path: '/',
		httpOnly: true,
		// Dev and prod are both real HTTPS, same reasoning as the member
		// session and guest-token cookies.
		secure: true,
		sameSite: 'lax',
		maxAge: PARTICIPANT_SESSION_MAX_AGE_SECONDS
	});
}

export function clearParticipantCookie(cookies: Cookies): void {
	cookies.delete(PARTICIPANT_COOKIE, { path: '/' });
}

export function readParticipantCookie(cookies: Cookies): string | null {
	return cookies.get(PARTICIPANT_COOKIE) ?? null;
}

/** Pull the `divisi_participant` value out of one or more `Set-Cookie`
 * header lines from a Backend response. Returns `null` when none is
 * present (a returning client that reused its row gets no fresh cookie).
 * Pure and header-shape tolerant so it can be unit-tested directly. */
export function extractParticipantToken(setCookieLines: string | string[] | null): string | null {
	if (!setCookieLines) return null;
	const lines = Array.isArray(setCookieLines) ? setCookieLines : [setCookieLines];
	for (const line of lines) {
		for (const part of line.split(/,(?=[^;]+=)/)) {
			const match = part.trim().match(/^divisi_participant=([^;]*)/);
			if (match && match[1]) return decodeURIComponent(match[1]);
		}
	}
	return null;
}

/** Read every `Set-Cookie` line off a `fetch` Response in a Node/runtime-
 * portable way (`Headers.getSetCookie` where available, else the folded
 * single header). */
export function readSetCookie(res: Response): string[] {
	const headers = res.headers as Headers & { getSetCookie?: () => string[] };
	if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
	const single = res.headers.get('set-cookie');
	return single ? [single] : [];
}

/** The `Cookie:` header value to forward this device's participant token to
 * the Backend on a proxied call, or `undefined` when there is none yet. */
export function backendCookieHeader(token: string | null): string | undefined {
	return token ? `${PARTICIPANT_COOKIE}=${encodeURIComponent(token)}` : undefined;
}
