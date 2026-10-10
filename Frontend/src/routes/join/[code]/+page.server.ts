import { redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { GroupOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

/** A logged-in account that follows a join link lands on the group's real
 * page instead of the guest-facing view `+page.ts` builds from the public
 * `/guest/*` routes (which works for them too, but only shows what an
 * unauthenticated visitor would see). Already a member: straight there.
 * Not a member yet: self-join with the code (`POST /groups/join`, the same
 * code that already lets a guest in), then go there. This is also where a
 * guest who taps Create account / Log in on this page comes back to (via
 * `redirectTo`), so signing up from a join link ends with them in the group.
 * Skipped entirely for anonymous visitors, who fall through to that guest
 * load, and any Backend refusal (the demo group, an unknown code, a cold
 * Backend) falls through to the same guest view. */
export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.token) return {};
	const code = params.code.toUpperCase();
	let groupId: string | null = null;
	try {
		const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
		groupId = groups.find((g) => g.join_code === code)?.id ?? null;
		if (!groupId) {
			const joined = await backendJson<GroupOut>(
				locals.token,
				'/groups/join',
				{ method: 'POST', body: JSON.stringify({ join_code: code }) },
				fetch
			);
			groupId = joined.id;
		}
	} catch (err) {
		// An expired/invalid token here just means "treat as logged out" —
		// the root layout load already handles clearing the cookie; this
		// route just shouldn't crash over it, and falls through to the
		// guest view below like any other anonymous visitor would get. A
		// refused self-join (403 for the demo group, 404 for a bad code)
		// lands in the same fallback.
		if (!(err instanceof BackendApiError)) throw err;
	}
	// Outside the try: `redirect()` throws, and keeping it out of the catch
	// means it can never be mistaken for a Backend error.
	if (groupId) redirect(303, lh(`/groups/${groupId}`));
	return {};
};
