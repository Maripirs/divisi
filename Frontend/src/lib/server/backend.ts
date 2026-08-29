import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';

/** Any non-2xx response from an authenticated Backend call. Carries the
 * real HTTP status so callers can tell "not found" (404) from "not allowed"
 * (403) apart, same distinction `$lib/api/guest.ts` draws for the
 * unauthenticated guest routes. Also the shape a genuine network failure
 * (Backend unreachable, DNS/connection error — not a real HTTP response at
 * all) gets normalized into, via `backendFetch`'s own catch below — a
 * synthetic `status: 503` with a friendly, translated message, so every
 * existing `catch (err) { if (err instanceof BackendApiError) ... }` call
 * site across the app already handles it gracefully with no changes of its
 * own needed. */
export class BackendApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'BackendApiError';
	}
}

async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { detail?: string };
		if (body.detail) return body.detail;
	} catch {
		// Non-JSON error body — fall through to the generic message.
	}
	return m.errors_request_failed({ status: res.status });
}

/** Server-only authenticated fetch against the Backend API — `token` comes
 * from `event.locals.token` (see `hooks.server.ts`). Pass SvelteKit's own
 * `fetch` (from a `load`/`action`'s params) rather than the global one so
 * relative-URL handling and request tracing stay correct, matching
 * `$lib/api/guest.ts`'s existing convention. */
export async function backendFetch(
	token: string | null,
	path: string,
	init: RequestInit = {},
	fetchFn: typeof fetch = fetch
): Promise<Response> {
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

	let res: Response;
	try {
		res = await fetchFn(`${PUBLIC_API_BASE_URL}${path}`, { ...init, headers });
	} catch {
		// The Backend is down/unreachable, or a real network error — `fetch`
		// itself threw rather than resolving to any response at all (e.g.
		// Render's free tier cold-starting past a client timeout). Distinct
		// from a resolved-but-non-2xx response below; normalized into the
		// same `BackendApiError` shape (a synthetic 503) so callers don't
		// need to special-case it.
		throw new BackendApiError(503, m.errors_could_not_reach_server());
	}
	if (!res.ok) {
		throw new BackendApiError(res.status, await errorDetail(res));
	}
	return res;
}

export async function backendJson<T>(
	token: string | null,
	path: string,
	init?: RequestInit,
	fetchFn?: typeof fetch
): Promise<T> {
	const res = await backendFetch(token, path, init, fetchFn);
	return (await res.json()) as T;
}
