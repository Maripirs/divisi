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
 * `/auth/me` itself. An expired/invalid token is dropped silently here
 * rather than surfaced as an error on every page load. */
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
