import { error, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type {
	GroupCustomPageOut,
	GroupMemberOut,
	GroupOut,
	HomeworkOut,
	ResponsibilityDateOut,
	WeeklyNoteOut
} from '$lib/server/backendTypes';
import type { LayoutServerLoad } from './$types';

/** B12: a member-facing page route 403s once its admin disables that page
 * (`require_member_page_access`) — admins always pass regardless, so this
 * only ever "disables" something for a non-admin caller. Wraps a group-page
 * fetch so a disabled page hides its tab instead of failing the whole load. */
async function fetchPageOrDisabled<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; enabled: boolean }> {
	try {
		return { data: await promise, enabled: true };
	} catch (err) {
		if (err instanceof BackendApiError && err.status === 403) return { data: fallback, enabled: false };
		throw err;
	}
}

/** F31: shared chrome for every route under `/groups/[id]` — the group's
 * own page and each custom page's own `pages/[slug]` route both need the
 * same tab strip (`groupTabs.ts`'s `computeGroupTabs`), which needs the
 * group, its custom pages, and which built-in pages are enabled for a
 * member. Lives here once instead of duplicated in both leaf loads.
 *
 * As a side benefit, the main page's own load (`+page.server.ts`) now pulls
 * the homework/members/responsibilities/weekly-notes lists it needs for its
 * own tab content back out of `parent()` instead of fetching them a second
 * time. A custom page's route pays for these same four fetches too (it
 * didn't before), but that's a small, fixed cost independent of how many
 * custom pages exist — unlike a custom page's own carpool content (its
 * events, then a selected event's posts), which stays on that page's own
 * route alone. Loading *that* here for every custom page on every group
 * request is exactly what B24/F28's lazy-load stance (and this milestone's
 * own design note) rules out. */
export const load: LayoutServerLoad = async ({ parent, locals, fetch, params, url }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=${url.pathname}`));

	// No single-group GET exists on the Backend — `/groups` only lists the
	// caller's own groups, so a group this user isn't in 404s here exactly
	// like an unknown id would, which is the right behavior either way.
	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());
	const isAdmin = group.role === 'admin';

	try {
		const [homeworkResult, membersResult, responsibilitiesResult, weeklyNotesResult, customPagesResult] =
			await Promise.all([
				fetchPageOrDisabled(backendJson<HomeworkOut[]>(locals.token, `/groups/${group.id}/homework`, undefined, fetch), []),
				fetchPageOrDisabled(backendJson<GroupMemberOut[]>(locals.token, `/groups/${group.id}/members`, undefined, fetch), []),
				fetchPageOrDisabled(
					backendJson<ResponsibilityDateOut[]>(locals.token, `/groups/${group.id}/responsibilities/dates`, undefined, fetch),
					[]
				),
				fetchPageOrDisabled(backendJson<WeeklyNoteOut[]>(locals.token, `/groups/${group.id}/weekly-notes`, undefined, fetch), []),
				// B23 fast-follow: `GET .../custom-pages` is the admin
				// *management* list (every status), so an admin gets that;
				// a member gets the published-only `.../pages` list instead
				// of 403ing into the empty fallback the other pages above
				// use for a disabled page.
				fetchPageOrDisabled(
					backendJson<GroupCustomPageOut[]>(
						locals.token,
						isAdmin ? `/groups/${group.id}/custom-pages` : `/groups/${group.id}/pages`,
						undefined,
						fetch
					),
					[]
				)
			]);

		return {
			// Re-returned (not just checked above) so every route in this
			// subtree sees `PageData.user` narrowed to non-null — the root
			// layout's own type is `SessionUser | null`, and the redirect
			// above only narrows it locally unless the narrowed value is
			// itself part of what this load hands back down.
			user,
			group,
			isAdmin,
			homework: homeworkResult.data,
			homeworkEnabled: homeworkResult.enabled,
			members: membersResult.data,
			membersEnabled: membersResult.enabled,
			responsibilities: responsibilitiesResult.data,
			responsibilitiesEnabled: responsibilitiesResult.enabled,
			weeklyNotes: weeklyNotesResult.data,
			weeklyNotesEnabled: weeklyNotesResult.enabled,
			customPages: customPagesResult.data,
			customPagesEnabled: customPagesResult.enabled
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};
