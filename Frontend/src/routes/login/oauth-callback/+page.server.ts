import { redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { setSessionCookie } from '$lib/server/session';
import { claimDeviceParticipant } from '$lib/server/participantSession';
import { takeOAuthReturnTarget } from '$lib/server/oauthReturn';
import { lh } from '$lib/i18n';
import type { PageServerLoad } from './$types';

/** Landed here after the Backend's `/auth/oauth/{provider}/callback`
 * finishes a successful sign-in and redirects with the resulting JWT as a
 * query param — this route's only job is to move that token into the
 * same httpOnly session cookie a normal `/login` sets, then get out of
 * the way. Nothing renders; there's no failure path here worth a page of
 * its own since the Backend only ever redirects here on success (a
 * failure goes to `/login?oauth_error=1` instead). Like the password
 * login, a guest who acted on this browser first gets their anonymous
 * participant folded into the account (best-effort). Lands on the login
 * page's `redirectTo` when one was parked for the trip through the
 * provider (`takeOAuthReturnTarget`), else `/home`. */
export const load: PageServerLoad = async ({ url, cookies, fetch }) => {
	const token = url.searchParams.get('token');
	const target = takeOAuthReturnTarget(cookies);
	if (token) {
		setSessionCookie(cookies, token);
		await claimDeviceParticipant(cookies, token, fetch, PUBLIC_API_BASE_URL);
	}
	throw redirect(303, lh(token ? target : '/login?oauth_error=1'));
};
