import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session';
import { clearParticipantCookie } from '$lib/server/participantSession';
import { fetchGroupInfo, fetchPieceOwner } from '$lib/server/groupJoin';
import { classifyLogoutReturn } from '$lib/logoutReturn';
import { lh } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** Bounds the one public lookup a group/piece return hint needs, so a cold
 * Backend can't hold logout hostage; past it, `/welcome` as before. */
const RETURN_LOOKUP_TIMEOUT_MS = 5_000;

/** POST-only by design — logging out is a state change, so it shouldn't be
 * a plain link (`/settings`'s form posts here with `method="POST"`).
 *
 * Also forgets this browser's anonymous-participant cookie: sign-in
 * already folds it into the account (`claimDeviceParticipant`), so by now
 * it's normally gone or stale, and a fresh guest session after logout
 * shouldn't act as whoever last used the device. Nothing signed-in reads
 * it (member calls go by the session token).
 *
 * The form may post `redirectTo`, the page logout was tapped on. A member
 * logging out from inside a group or a piece lands on that group's guest
 * view (`/join/{code}`, or the piece with `?code=`) instead of `/welcome`,
 * so they can get straight back in (`classifyLogoutReturn`); anything
 * else, or a failed lookup, still lands on `/welcome`. */
export const POST: RequestHandler = async ({ cookies, request, fetch }) => {
	clearSessionCookie(cookies);
	clearParticipantCookie(cookies);

	let target = '/welcome';
	try {
		const form = await request.formData();
		const hint = classifyLogoutReturn(form.get('redirectTo'));
		if (hint?.kind === 'path') {
			target = hint.path;
		} else if (hint?.kind === 'group') {
			const timedFetch: typeof fetch = (input, init) =>
				fetch(input, { ...init, signal: AbortSignal.timeout(RETURN_LOOKUP_TIMEOUT_MS) });
			const info = await fetchGroupInfo(hint.groupId, timedFetch);
			if (info) target = `/join/${info.join_code}`;
		} else if (hint?.kind === 'piece') {
			const { owner } = await fetchPieceOwner(
				hint.pieceId,
				fetch,
				AbortSignal.timeout(RETURN_LOOKUP_TIMEOUT_MS)
			);
			if (owner) target = `/piece/${encodeURIComponent(hint.pieceId)}?code=${encodeURIComponent(owner.join_code)}`;
		}
	} catch {
		// No form body, or a bad one: the plain `/welcome` landing.
	}
	throw redirect(303, lh(target));
};
