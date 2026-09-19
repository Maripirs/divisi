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

/** B30 / Backend B30: a guest driver expresses interest in one rider's
 * post. Same proxy shape as the seat-claim pair (`join/[code]/carpool/
 * posts/[postId]/claims/+server.ts`): read the local profile's identity,
 * forward the `divisi_participant` cookie, thread through a fresh one from
 * the Backend's response.
 *
 * `create_interest` rejects with 400 for the domain checks (wrong kind, own
 * post, already interested, bad phone/email format) and 409 for a locked/
 * archived event blocking a non-admin — both map to the same `conflict`
 * verdict here, since either way the client just shows the Backend's own
 * message inline:
 *   { ok: true, interest }
 *   { ok: false, error: 'save-required' }   min_identity=saved gate
 *   { ok: false, error: 'conflict', message }
 *   { ok: false, error: 'server' }
 *
 * B34: `contactPhone`/`contactEmail` are optional — left by the interested
 * driver so the rider post's owner can reach back once this interest is
 * active, mirroring the guest claim proxy.
 */
export const POST: RequestHandler = async ({ request, params, cookies, locals, fetch }) => {
	let body: { localId?: string; displayName?: string; contactPhone?: string; contactEmail?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'server' as const });
	}
	const postId = params.postId;
	if (!postId) return json({ ok: false, error: 'server' as const });
	const contactPhone = body.contactPhone?.trim() || null;
	const contactEmail = body.contactEmail?.trim() || null;

	// A logged-in member who reaches a guest page (e.g. via a shared join
	// link) expresses interest as themselves through the authenticated route
	// instead, same fallback the claim-create proxy uses.
	if (locals.token) {
		try {
			const res = await backendFetch(
				locals.token,
				`/carpool/posts/${encodeURIComponent(postId)}/interests`,
				{ method: 'POST', body: JSON.stringify({ contact_phone: contactPhone, contact_email: contactEmail }) },
				fetch
			);
			return json({ ok: true as const, interest: await res.json() });
		} catch (err) {
			if (err instanceof BackendApiError && (err.status === 409 || err.status === 400)) {
				return json({ ok: false as const, error: 'conflict' as const, message: err.message });
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
		res = await fetch(`${PUBLIC_API_BASE_URL}/carpool/posts/${encodeURIComponent(postId)}/interests`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				local_id: body.localId ?? undefined,
				display_name: body.displayName ?? '',
				contact_phone: contactPhone,
				contact_email: contactEmail
			}),
			signal: AbortSignal.timeout(20_000)
		});
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}

	if (res.ok) {
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const, interest: await res.json() });
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
	if (res.status === 409 || res.status === 400) {
		return json({ ok: false as const, error: 'conflict' as const, message: detail });
	}
	return json({ ok: false as const, error: 'server' as const });
};
