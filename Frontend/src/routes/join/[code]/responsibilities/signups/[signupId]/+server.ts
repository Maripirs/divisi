import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import {
	backendCookieHeader,
	extractParticipantToken,
	readParticipantCookie,
	readSetCookie,
	setParticipantCookie
} from '$lib/server/participantSession';
import type { RequestHandler } from './$types';

/** F34 / Backend B28: a guest removes their own responsibility signup, the
 * same cookie/`local_id` resolution the create proxy above uses, following
 * the carpool post delete proxy's own shape for the same reason (a guest
 * actor, not a create-time mint).
 *
 *   DELETE -> { ok: true } | { ok: false, error: 'forbidden' | 'conflict' | 'server', message?: string }
 */

function backendSignupUrl(signupId: string, localId: string | null): string {
	const url = new URL(`${PUBLIC_API_BASE_URL}/responsibilities/signups/${encodeURIComponent(signupId)}`);
	if (localId) url.searchParams.set('local_id', localId);
	return url.toString();
}

export const DELETE: RequestHandler = async ({ params, url, cookies, locals, fetch }) => {
	const signupId = params.signupId;
	if (!signupId) return json({ ok: false, error: 'server' as const });
	const localId = url.searchParams.get('localId');

	// A logged-in member shouldn't reach this route either (same reasoning as
	// the create proxy's own comment), but route it through the authenticated
	// proxy if one does.
	if (locals.token) {
		try {
			await backendFetch(locals.token, `/responsibilities/signups/${encodeURIComponent(signupId)}`, { method: 'DELETE' }, fetch);
			return json({ ok: true as const });
		} catch (err) {
			if (err instanceof BackendApiError && err.status === 403) {
				return json({ ok: false as const, error: 'forbidden' as const });
			}
			if (err instanceof BackendApiError && err.status === 409) {
				return json({ ok: false as const, error: 'conflict' as const });
			}
			return json({ ok: false as const, error: 'server' as const });
		}
	}

	const existingToken = readParticipantCookie(cookies);
	const headers: Record<string, string> = {};
	const forward = backendCookieHeader(existingToken);
	if (forward) headers.Cookie = forward;

	let res: Response;
	try {
		res = await fetch(backendSignupUrl(signupId, localId), {
			method: 'DELETE',
			headers,
			signal: AbortSignal.timeout(20_000)
		});
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}
	if (res.ok) {
		// A 204 has no body to read a `Set-Cookie`-derived token off of any
		// differently than any other response, same extraction either way.
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const });
	}
	if (res.status === 403) return json({ ok: false as const, error: 'forbidden' as const });
	if (res.status === 409) {
		let detail = '';
		try {
			detail = ((await res.json()) as { detail?: string }).detail ?? '';
		} catch {
			detail = '';
		}
		return json({ ok: false as const, error: 'conflict' as const, message: detail });
	}
	return json({ ok: false as const, error: 'server' as const });
};
