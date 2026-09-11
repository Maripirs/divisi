import { backendJson, BackendApiError } from '$lib/server/backend';
import { clearSessionCookie } from '$lib/server/session';
import { subjectFromToken } from '$lib/server/jwt';
import type { LayoutServerLoad } from './$types';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
}

/** How long the session resolve gets to block the very first paint. A warm
 * Backend answers `/auth/me` in well under this; a cold one (Render free
 * tier waking from idle) can take 30s+, which is the white screen this
 * budget avoids. Past it we paint anyway with an optimistic session and
 * let `+layout.svelte` reconcile once the Backend is up. */
const SESSION_RESOLVE_BUDGET_MS = 1500;

/** Resolves the session cookie to a real user once per navigation, so every
 * page gets `data.user` (or `null` if logged out) without re-fetching
 * `/auth/me` itself.
 *
 * `/auth/me` is the app's first Backend call on a cold start, so it eats
 * the whole cold-start latency. Rather than block the first paint on it
 * (nothing renders, not even a loading state, until it returns), race it
 * against a short budget:
 *
 *  - Answers in time: use it. A real 401 clears the cookie here (response
 *    headers aren't flushed yet); any other failure (Backend outage, see
 *    `backendFetch`'s synthetic 503) is dropped to `user: null` without
 *    throwing, since this load runs for fully public routes too.
 *  - Doesn't answer in time: paint now with an *optimistic* user built
 *    from the JWT's own `sub` claim (the id is real; name/email are blank
 *    for a beat) and set `sessionPending`, which tells `+layout.svelte` to
 *    re-run this load once we're interactive and the Backend has woken.
 *    The cookie isn't cleared on this path even if the token turns out
 *    expired; that gets caught and cleared on the reconcile pass. */
export const load: LayoutServerLoad = async ({ locals, cookies, fetch }) => {
	// F24 / Backend B20: rides along with every branch below unchanged. It
	// doesn't affect (and isn't affected by) session resolution, it's just
	// threaded into `PageData` here so `+layout.svelte` can render the
	// persistent "Preview Admin" banner.
	const demoPreviewJoinCode = locals.demoPreviewJoinCode;

	if (!locals.token) return { user: null as SessionUser | null, sessionPending: false, demoPreviewJoinCode };

	const resolved = backendJson<SessionUser>(locals.token, '/auth/me', undefined, fetch).then(
		(user) => ({ kind: 'ok' as const, user }),
		(err: unknown) => ({ kind: 'err' as const, err })
	);
	const raced = await Promise.race([
		resolved,
		new Promise<{ kind: 'timeout' }>((r) => setTimeout(() => r({ kind: 'timeout' }), SESSION_RESOLVE_BUDGET_MS))
	]);

	if (raced.kind === 'ok') return { user: raced.user, sessionPending: false, demoPreviewJoinCode };
	if (raced.kind === 'err') {
		if (raced.err instanceof BackendApiError && raced.err.status === 401) clearSessionCookie(cookies);
		return { user: null as SessionUser | null, sessionPending: false, demoPreviewJoinCode };
	}

	const id = subjectFromToken(locals.token);
	if (!id) return { user: null as SessionUser | null, sessionPending: false, demoPreviewJoinCode };
	return { user: { id, email: '', name: '' } as SessionUser, sessionPending: true, demoPreviewJoinCode };
};
