import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session';
import { clearParticipantCookie } from '$lib/server/participantSession';
import type { RequestHandler } from './$types';

/** POST-only by design — logging out is a state change, so it shouldn't be
 * a plain link (`/settings`'s form posts here with `method="POST"`).
 *
 * Also forgets this browser's anonymous-participant cookie: sign-in
 * already folds it into the account (`claimDeviceParticipant`), so by now
 * it's normally gone or stale, and a fresh guest session after logout
 * shouldn't act as whoever last used the device. Nothing signed-in reads
 * it (member calls go by the session token). */
export const POST: RequestHandler = async ({ cookies }) => {
	clearSessionCookie(cookies);
	clearParticipantCookie(cookies);
	throw redirect(303, '/welcome');
};
