import { error, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type {
	GroupCustomPageOut,
	GroupMemberOut,
	GroupOut,
	GroupPageSettingOut,
	HomeworkOut,
	LibraryEntryOut,
	ResponsibilityDateOut,
	ResponsibilityScheduleOut,
	WeeklyNoteOut
} from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';
import { groupActions } from './actions/group';
import { memberActions } from './actions/members';
import { trackActions } from './actions/tracks';
import { homeworkActions } from './actions/homework';
import { weeklyNoteActions } from './actions/weeklyNotes';
import { responsibilityActions } from './actions/responsibilities';
import { customPageActions } from './actions/customPages';

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

// Loads everything both the member view and the admin view need in one
// pass — the admin view used to be a separate route (`/groups/[id]/admin`)
// with its own near-identical load, refetching the same three lists. Now
// it's a mode of this same page (see UX_WIREFRAME.md's "Admin mode should
// be a view of the group, not a separate destination"), so one load feeds
// both.
export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}`));

	// No single-group GET exists on the Backend — `/groups` only lists the
	// caller's own groups, so a group this user isn't in 404s here exactly
	// like an unknown id would, which is the right behavior either way.
	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());
	const isAdmin = group.role === 'admin';

	try {
		const [homeworkResult, membersResult, library, responsibilitiesResult, weeklyNotesResult, customPagesResult] =
			await Promise.all([
				fetchPageOrDisabled(backendJson<HomeworkOut[]>(locals.token, `/groups/${group.id}/homework`, undefined, fetch), []),
				fetchPageOrDisabled(backendJson<GroupMemberOut[]>(locals.token, `/groups/${group.id}/members`, undefined, fetch), []),
				backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch),
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

		// Admin-only management data — these two endpoints 403 for a
		// non-admin, so only fetched when the caller actually is one.
		let schedules: ResponsibilityScheduleOut[] = [];
		let pageSettings: GroupPageSettingOut[] = [];
		if (isAdmin) {
			[schedules, pageSettings] = await Promise.all([
				backendJson<ResponsibilityScheduleOut[]>(
					locals.token,
					`/groups/${group.id}/responsibilities/schedules`,
					undefined,
					fetch
				),
				backendJson<GroupPageSettingOut[]>(locals.token, `/groups/${group.id}/page-settings`, undefined, fetch)
			]);
		}

		const tracks = library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id);
		const trackTitleById = new Map(tracks.map((t) => [t.piece_id, t.title]));

		return {
			user,
			group,
			homework: homeworkResult.data.map((hw) => ({
				...hw,
				pieceTitle: hw.piece_id ? (trackTitleById.get(hw.piece_id) ?? null) : null
			})),
			homeworkEnabled: homeworkResult.enabled,
			tracks,
			members: membersResult.data,
			membersEnabled: membersResult.enabled,
			responsibilities: responsibilitiesResult.data,
			responsibilitiesEnabled: responsibilitiesResult.enabled,
			weeklyNotes: weeklyNotesResult.data,
			weeklyNotesEnabled: weeklyNotesResult.enabled,
			customPages: customPagesResult.data,
			customPagesEnabled: customPagesResult.enabled,
			schedules,
			pageSettings
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

// The 30 form actions this page exposes live in `./actions/*.ts`, grouped
// by the tab they belong to (see CLEANUP.md step 7). Each module exports
// one `*Actions` object; they're spread-composed here into the single
// `actions` export SvelteKit expects. Every action shares `runAction`
// (`./actions/_shared.ts`) for its Backend-error-to-`fail` tail.
export const actions: Actions = {
	...groupActions,
	...memberActions,
	...trackActions,
	...homeworkActions,
	...weeklyNoteActions,
	...responsibilityActions,
	...customPageActions
};
