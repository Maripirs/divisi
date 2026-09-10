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

/** F23 / Backend B19: a local-only visitor signs themselves up for a
 * responsibility slot from the guest join page.
 *
 * `POST /responsibilities/dates/{dateId}/signups` with an unauthenticated
 * body `{ role_id, local_id, display_name }` makes the Backend mint (or
 * re-resolve, by the forwarded `divisi_participant` cookie or `local_id`)
 * this device's anonymous participant, create its guest-tier membership,
 * and set a fresh `divisi_participant` cookie on the response. We pull that
 * token out and re-set it first-party (see `participantSession.ts`).
 *
 * Always answers HTTP 200 with a small JSON verdict so the client form
 * reads a discriminant rather than catching:
 *   { ok: true, signup }
 *   { ok: false, error: 'save-required' }   B19's SAVE_REQUIRED: 403 gate
 *   { ok: false, error: 'conflict', message }
 *   { ok: false, error: 'server' }
 */
export const POST: RequestHandler = async ({ request, cookies, locals, fetch }) => {
	let body: { dateId?: string; roleId?: string; localId?: string; displayName?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'server' as const });
	}
	const dateId = (body.dateId ?? '').trim();
	const roleId = (body.roleId ?? '').trim();
	if (!dateId || !roleId) return json({ ok: false, error: 'server' as const });

	// A logged-in member shouldn't reach this route (the join page's server
	// load redirects them to the real group page), but if one does, sign
	// them up as themselves through the authenticated proxy instead.
	if (locals.token) {
		try {
			const res = await backendFetch(
				locals.token,
				`/responsibilities/dates/${encodeURIComponent(dateId)}/signups`,
				{ method: 'POST', body: JSON.stringify({ role_id: roleId }) },
				fetch
			);
			return json({ ok: true as const, signup: await res.json() });
		} catch (err) {
			if (err instanceof BackendApiError && err.status === 409) {
				return json({ ok: false as const, error: 'conflict' as const, message: err.message });
			}
			if (err instanceof BackendApiError && err.status === 403 && err.message.startsWith('SAVE_REQUIRED:')) {
				return json({ ok: false as const, error: 'save-required' as const });
			}
			return json({ ok: false as const, error: 'server' as const });
		}
	}

	const existingToken = readParticipantCookie(cookies);
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const forward = backendCookieHeader(existingToken);
	if (forward) headers.Cookie = forward;

	let res: Response;
	try {
		res = await fetch(
			`${PUBLIC_API_BASE_URL}/responsibilities/dates/${encodeURIComponent(dateId)}/signups`,
			{
				method: 'POST',
				headers,
				body: JSON.stringify({
					role_id: roleId,
					local_id: body.localId ?? undefined,
					display_name: body.displayName ?? ''
				}),
				signal: AbortSignal.timeout(20_000)
			}
		);
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}

	if (res.ok) {
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const, signup: await res.json() });
	}

	let detail = '';
	try {
		detail = ((await res.json()) as { detail?: string }).detail ?? '';
	} catch {
		detail = '';
	}
	if (res.status === 403 && detail.startsWith('SAVE_REQUIRED:')) {
		return json({ ok: false as const, error: 'save-required' as const });
	}
	if (res.status === 409) {
		return json({ ok: false as const, error: 'conflict' as const, message: detail });
	}
	return json({ ok: false as const, error: 'server' as const });
};
