import { redirect } from '@sveltejs/kit';
import { setSessionCookie } from '$lib/server/session';
import { lh } from '$lib/i18n';
import type { PageServerLoad } from './$types';

/** Landed here after the Backend's `/auth/oauth/{provider}/callback`
 * finishes a successful sign-in and redirects with the resulting JWT as a
 * query param — this route's only job is to move that token into the
 * same httpOnly session cookie a normal `/login` sets, then get out of
 * the way. Nothing renders; there's no failure path here worth a page of
 * its own since the Backend only ever redirects here on success (a
 * failure goes to `/login?oauth_error=1` instead). */
export const load: PageServerLoad = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');
	if (token) setSessionCookie(cookies, token);
	throw redirect(303, lh(token ? '/home' : '/login?oauth_error=1'));
};
