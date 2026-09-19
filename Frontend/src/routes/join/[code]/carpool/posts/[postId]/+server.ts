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

/** F29 / Backend B25: a guest edits or deletes their own carpool post.
 * `local_id` travels to the Backend as a query param (a fallback for a lost
 * cookie), not a body field — mirrors `carpool.py`'s `update_post`/
 * `delete_post`, which take it the same way.
 *
 *   PATCH  -> { ok: true, post } | { ok: false, error: 'forbidden' | 'conflict' | 'server', message? }
 *   DELETE -> { ok: true } | { ok: false, error: 'forbidden' | 'server' }
 */

function backendPostUrl(postId: string, localId: string | null | undefined): string {
	const url = new URL(`${PUBLIC_API_BASE_URL}/carpool/posts/${encodeURIComponent(postId)}`);
	if (localId) url.searchParams.set('local_id', localId);
	return url.toString();
}

export const PATCH: RequestHandler = async ({ request, params, cookies, locals, fetch }) => {
	let body: {
		originLabel?: string;
		// B32/F37: same optional direction field the member form action
		// forwards (`actions/carpool.ts`'s `updateCarpoolPost`).
		direction?: 'there' | 'back' | 'round_trip';
		seatsTotal?: number | null;
		leaveTimeText?: string | null;
		notes?: string | null;
		// B30: same optional contact phone `updateCarpoolPost` (the member
		// form action) accepts.
		contactPhone?: string | null;
		// B33: the email mirror of `contactPhone` above, same opt-in.
		contactEmail?: string | null;
		localId?: string;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'server' as const });
	}
	const postId = params.postId;
	if (!postId) return json({ ok: false, error: 'server' as const });

	// Partial patch: only forward a field the caller actually sent, same
	// `model_fields_set` convention the Backend's own schema checks against.
	const patchBody: Record<string, unknown> = {};
	if (body.originLabel !== undefined) patchBody.origin_label = body.originLabel.trim();
	if (body.direction !== undefined) patchBody.direction = body.direction;
	if (body.seatsTotal !== undefined) patchBody.seats_total = body.seatsTotal;
	if (body.leaveTimeText !== undefined) patchBody.leave_time_text = body.leaveTimeText || null;
	if (body.notes !== undefined) patchBody.notes = body.notes || null;
	if (body.contactPhone !== undefined) patchBody.contact_phone = body.contactPhone || null;
	if (body.contactEmail !== undefined) patchBody.contact_email = body.contactEmail || null;

	if (locals.token) {
		try {
			const res = await backendFetch(
				locals.token,
				`/carpool/posts/${encodeURIComponent(postId)}`,
				{ method: 'PATCH', body: JSON.stringify(patchBody) },
				fetch
			);
			return json({ ok: true as const, post: await res.json() });
		} catch (err) {
			if (err instanceof BackendApiError && err.status === 403) {
				return json({ ok: false as const, error: 'forbidden' as const });
			}
			if (err instanceof BackendApiError && err.status === 409) {
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
		res = await fetch(backendPostUrl(postId, body.localId), {
			method: 'PATCH',
			headers,
			body: JSON.stringify(patchBody),
			signal: AbortSignal.timeout(20_000)
		});
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}

	if (res.ok) {
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const, post: await res.json() });
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

export const DELETE: RequestHandler = async ({ params, url, cookies, locals, fetch }) => {
	const postId = params.postId;
	if (!postId) return json({ ok: false, error: 'server' as const });
	const localId = url.searchParams.get('localId');

	// Owner delete is always allowed regardless of the event's lock/archive
	// state (see the Backend's own `delete_post` docstring), so there's no
	// `conflict` variant here at all, unlike PATCH above.
	if (locals.token) {
		try {
			await backendFetch(locals.token, `/carpool/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' }, fetch);
			return json({ ok: true as const });
		} catch (err) {
			if (err instanceof BackendApiError && err.status === 403) {
				return json({ ok: false as const, error: 'forbidden' as const });
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
		res = await fetch(backendPostUrl(postId, localId), {
			method: 'DELETE',
			headers,
			signal: AbortSignal.timeout(20_000)
		});
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}
	if (res.ok) {
		// A 204 has no body to read a `Set-Cookie`-derived token off of any
		// differently than any other response — same extraction either way.
		const minted = extractParticipantToken(readSetCookie(res));
		if (minted) setParticipantCookie(cookies, minted);
		return json({ ok: true as const });
	}
	if (res.status === 403) return json({ ok: false as const, error: 'forbidden' as const });
	return json({ ok: false as const, error: 'server' as const });
};
