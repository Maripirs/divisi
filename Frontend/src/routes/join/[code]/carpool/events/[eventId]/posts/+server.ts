import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import { originCoordinatesPayload } from '$lib/utils/carpool';
import {
	backendCookieHeader,
	extractParticipantToken,
	readParticipantCookie,
	readSetCookie,
	setParticipantCookie
} from '$lib/server/participantSession';
import type { RequestHandler } from './$types';

/** F29 / Backend B25: a guest posts "I can drive" / "I need a ride" on one
 * carpool event. Same proxy shape as `join/[code]/responsibilities/
 * signups/+server.ts`: read the local profile's identity, forward the
 * `divisi_participant` cookie, thread through a fresh one from the
 * Backend's response.
 *
 * Always answers HTTP 200 with a small JSON verdict so the client reads a
 * discriminant rather than catching:
 *   { ok: true, post }
 *   { ok: false, error: 'save-required' }   min_identity=saved gate
 *   { ok: false, error: 'conflict', message }   event locked/archived
 *   { ok: false, error: 'server' }
 */
export const POST: RequestHandler = async ({ request, params, cookies, locals, fetch }) => {
	let body: {
		kind?: 'driver' | 'rider';
		originLabel?: string;
		seatsTotal?: number;
		leaveTimeText?: string;
		notes?: string;
		localId?: string;
		displayName?: string;
		// F35: same optional pin fields the member form action forwards
		// (`actions/carpool.ts`'s `offerRide`/`requestRide`); absent entirely
		// on a plain free-text submission (Places unavailable, or no place
		// picked), same as today.
		originLatitude?: number;
		originLongitude?: number;
		originPlaceId?: string;
		originPrecision?: 'exact' | 'approximate';
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ ok: false, error: 'server' as const });
	}
	const eventId = params.eventId;
	const kind = body.kind;
	const originLabel = (body.originLabel ?? '').trim();
	if (!eventId || (kind !== 'driver' && kind !== 'rider') || !originLabel) {
		return json({ ok: false, error: 'server' as const });
	}

	const payload = {
		kind,
		origin_label: originLabel,
		// Riders never send seat fields at all (the Backend rejects a rider
		// payload that carries them), same "one form per kind" shape the
		// member actions use.
		seats_total: kind === 'driver' ? (body.seatsTotal ?? null) : undefined,
		leave_time_text: body.leaveTimeText || null,
		notes: body.notes || null,
		...originCoordinatesPayload({
			latitude: body.originLatitude,
			longitude: body.originLongitude,
			placeId: body.originPlaceId,
			precision: body.originPrecision
		})
	};

	// A logged-in member who reaches a guest page (e.g. via a shared join
	// link) posts as themselves through the authenticated route instead,
	// same fallback `responsibilities/signups/+server.ts` uses.
	if (locals.token) {
		try {
			const res = await backendFetch(
				locals.token,
				`/carpool/events/${encodeURIComponent(eventId)}/posts`,
				{ method: 'POST', body: JSON.stringify(payload) },
				fetch
			);
			return json({ ok: true as const, post: await res.json() });
		} catch (err) {
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
		res = await fetch(`${PUBLIC_API_BASE_URL}/carpool/events/${encodeURIComponent(eventId)}/posts`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				...payload,
				local_id: body.localId ?? undefined,
				display_name: body.displayName ?? ''
			}),
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
