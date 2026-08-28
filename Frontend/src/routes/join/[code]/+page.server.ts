import { redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

/** A logged-in member who follows a join link already has this group —
 * send them straight to its real page instead of the guest-facing view
 * `+page.ts` builds from the public `/guest/*` routes (which works for them
 * too, but only shows what an unauthenticated visitor would see). Skipped
 * entirely for anonymous visitors, who fall through to that guest load. */
export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.token) return {};
	const code = params.code.toUpperCase();
	try {
		const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
		const member = groups.find((g) => g.join_code === code);
		if (member) throw redirect(303, `/groups/${member.id}`);
	} catch (err) {
		// An expired/invalid token here just means "treat as logged out" —
		// the root layout load already handles clearing the cookie; this
		// route just shouldn't crash over it, and falls through to the
		// guest view below like any other anonymous visitor would get.
		if (!(err instanceof BackendApiError)) throw err;
	}
	return {};
};
