import { m } from '$lib/paraglide/messages';

/** Shared plumbing for the app's Backend-facing API modules — the
 * client-side proxy callers (`$lib/api/annotations.ts`,
 * `$lib/api/pieceMarkup.ts`), the unauthenticated guest module
 * (`$lib/api/guest.ts`), and the server-only `$lib/server/backend.ts`. Each
 * of those kept a byte-identical copy of the error class + `errorDetail` +
 * fetch-or-503 dance; this is the one copy. Domain modules still export
 * their own `XApiError` subclass so existing `err instanceof XApiError`
 * call sites are untouched. */
export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/** Pull a human message out of a Backend error response: its JSON
 * `{ detail }` when present, else a generic translated "request failed"
 * carrying the status code. Tolerates a non-JSON body (e.g. a proxy
 * route's bare 401/503). */
export async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { detail?: string };
		if (body.detail) return body.detail;
	} catch {
		// Non-JSON error body — fall through to the generic message.
	}
	return m.errors_request_failed({ status: res.status });
}

/** `{ method, JSON headers, stringified body }` — the RequestInit every
 * mutating proxy call needs. */
export function jsonInit(method: string, body: unknown): RequestInit {
	return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

type ApiErrorClass<E extends ApiError> = new (status: number, message: string) => E;

/** Run a `fetch` and convert a *thrown* fetch (Backend unreachable,
 * DNS/connection error — `fetch` rejecting rather than resolving to any
 * response) into `new ErrorClass(503, …)` with a friendly translated
 * message. A resolved response — including a non-2xx one — is returned
 * untouched for the caller to inspect. */
export async function fetchOr503<E extends ApiError>(
	ErrorClass: ApiErrorClass<E>,
	url: string,
	init?: RequestInit,
	fetchFn: typeof fetch = fetch
): Promise<Response> {
	try {
		return await fetchFn(url, init);
	} catch {
		throw new ErrorClass(503, m.errors_could_not_reach_server());
	}
}

/** Builds a `call(url, init)` bound to one domain error class: fetches via
 * {@link fetchOr503}, then turns a resolved-but-non-2xx response into the
 * same error carrying {@link errorDetail}'s parsed message. For callers
 * that want any non-2xx to throw; the guest module keeps its own thinner
 * wrapper because it maps 404/401 to distinct error types itself. */
export function makeCall<E extends ApiError>(ErrorClass: ApiErrorClass<E>) {
	return async function call(url: string, init?: RequestInit): Promise<Response> {
		const res = await fetchOr503(ErrorClass, url, init);
		if (!res.ok) throw new ErrorClass(res.status, await errorDetail(res));
		return res;
	};
}
