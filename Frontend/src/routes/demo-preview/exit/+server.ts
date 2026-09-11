import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session';
import { clearDemoPreviewCookie, readDemoPreviewCookie } from '$lib/server/demoPreviewSession';
import { lh } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** F24: leaves a demo "Preview Admin" session (Backend B20) and returns to
 * the guest join page it started from. POST-only by design (same
 * reasoning as `/logout`: this is a state change, not a plain link). The
 * join code has to be read back out of the marker cookie before it's
 * cleared, since the redirect target needs it. */
export const POST: RequestHandler = async ({ cookies }) => {
	const joinCode = readDemoPreviewCookie(cookies);
	clearSessionCookie(cookies);
	clearDemoPreviewCookie(cookies);
	throw redirect(303, lh(joinCode ? `/join/${joinCode}` : '/join'));
};
