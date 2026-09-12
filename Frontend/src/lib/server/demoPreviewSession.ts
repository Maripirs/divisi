import type { Cookies } from '@sveltejs/kit';

/** F24 / Backend B20: the demo "Preview Admin" marker cookie.
 *
 * A visitor who clicks "Preview Admin" on the public demo's join page gets
 * a *normal* session cookie (`$lib/server/session.ts`'s `setSessionCookie`,
 * the same helper `/auth/login` and the OAuth callback use: every existing
 * admin screen renders exactly as it would for a real admin, since the
 * Backend's `admin_preview` token resolves as one for every read) plus
 * this separate first-party marker, whose value is the join code they
 * previewed from. It exists purely so the rest of the app can tell "this
 * session is a read-only demo preview" apart from a real login: the root
 * layout renders the persistent banner when it's set, and "Exit preview"
 * reads the join code back out of it to know where to send the visitor.
 *
 * Deliberately NOT httpOnly (unlike `session.ts`/`participantSession.ts`):
 * there is nothing sensitive in a join code, and client-side code may want
 * to read it too. `hooks.server.ts` still reads it server-side into
 * `event.locals.demoPreviewJoinCode` as the primary path. */

export const DEMO_PREVIEW_COOKIE = 'divisi_demo_preview';

// Matches the session cookie's lifetime (`session.ts`): a preview that
// outlives its own session cookie is meaningless.
const DEMO_PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 24;

export function setDemoPreviewCookie(cookies: Cookies, joinCode: string): void {
	cookies.set(DEMO_PREVIEW_COOKIE, joinCode, {
		path: '/',
		httpOnly: false,
		secure: true,
		sameSite: 'lax',
		maxAge: DEMO_PREVIEW_MAX_AGE_SECONDS
	});
}

export function clearDemoPreviewCookie(cookies: Cookies): void {
	cookies.delete(DEMO_PREVIEW_COOKIE, { path: '/' });
}

export function readDemoPreviewCookie(cookies: Cookies): string | null {
	return cookies.get(DEMO_PREVIEW_COOKIE) ?? null;
}

/** Normalizes a join code the same way every guest route already does
 * (`params.code.toUpperCase()` in `join/[code]/+page.ts` and
 * `guestJoin.ts`), so the marker cookie's value always matches what
 * `/join/[code]` expects on the way back out of a preview. Pure so it is
 * directly unit-testable without a `Cookies` mock. */
export function normalizeJoinCodeForPreview(code: string): string {
	return code.trim().toUpperCase();
}
