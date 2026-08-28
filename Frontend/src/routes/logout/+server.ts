import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

/** POST-only by design — logging out is a state change, so it shouldn't be
 * a plain link (`/settings`'s form posts here with `method="POST"`). */
export const POST: RequestHandler = async ({ cookies }) => {
	clearSessionCookie(cookies);
	throw redirect(303, '/welcome');
};
