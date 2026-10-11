import { error, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { setOAuthReturnCookie } from '$lib/server/oauthReturn';
import type { RequestHandler } from './$types';

/** The login page's "Continue with Google/Apple" buttons go through here
 * rather than straight to the Backend's `/auth/oauth/{provider}/start`, so
 * the login page's `redirectTo` survives the round trip through the
 * provider: it's parked in a short-lived first-party cookie
 * (`setOAuthReturnCookie`, same-site paths only) that
 * `../../oauth-callback/+page.server.ts` reads once sign-in completes. The
 * Backend's own `state` cookie lives on the API origin and stays the CSRF
 * guard; this one only ever decides where a successful sign-in lands. */
export const GET: RequestHandler = ({ params, url, cookies }) => {
	if (params.provider !== 'google' && params.provider !== 'apple') throw error(404);
	setOAuthReturnCookie(cookies, url.searchParams.get('redirectTo'));
	throw redirect(303, `${PUBLIC_API_BASE_URL}/auth/oauth/${params.provider}/start`);
};
