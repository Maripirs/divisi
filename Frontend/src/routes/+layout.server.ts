import { backendJson, BackendApiError } from '$lib/server/backend';
import { clearSessionCookie } from '$lib/server/session';
import type { LayoutServerLoad } from './$types';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
}

/** Resolves the session cookie to a real user once per navigation, so every
 * page gets `data.user` (or `null` if logged out) without re-fetching
 * `/auth/me` itself. An expired/invalid token (a real 401) clears the
 * cookie; any other failure (a Backend outage — see `backendFetch`'s
 * synthetic 503 for a network failure, or an unexpected 4xx/5xx from
 * `/auth/me` itself) is dropped the same way, deliberately *not* thrown —
 * this load runs for every route including fully public ones (`/welcome`,
 * `/join`), so surfacing an error here would block pages that need no user
 * at all over a transient hiccup. The session cookie itself is left alone
 * in that case (only a real 401 clears it), so once the Backend recovers
 * the same cookie resolves normally again — self-healing rather than
 * forcing a real re-login over what was just a blip. */
export const load: LayoutServerLoad = async ({ locals, cookies, fetch }) => {
	if (!locals.token) return { user: null as SessionUser | null };
	try {
		const user = await backendJson<SessionUser>(locals.token, '/auth/me', undefined, fetch);
		return { user };
	} catch (err) {
		if (err instanceof BackendApiError && err.status === 401) {
			clearSessionCookie(cookies);
		}
		return { user: null as SessionUser | null };
	}
};
