import { PUBLIC_API_BASE_URL } from '$env/static/public';

/** Any non-2xx response from an authenticated Backend call. Carries the
 * real HTTP status so callers can tell "not found" (404) from "not allowed"
 * (403) apart, same distinction `$lib/api/guest.ts` draws for the
 * unauthenticated guest routes. */
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
	return `Backend returned ${res.status}`;
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

	const res = await fetchFn(`${PUBLIC_API_BASE_URL}${path}`, { ...init, headers });
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
