import { error } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupPageSettingOut, LibraryEntryOut, ResponsibilityScheduleOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';
import { groupActions } from './actions/group';
import { memberActions } from './actions/members';
import { trackActions } from './actions/tracks';
import { homeworkActions } from './actions/homework';
import { weeklyNoteActions } from './actions/weeklyNotes';
import { responsibilityActions } from './actions/responsibilities';
import { customPageActions } from './actions/customPages';

// F31: the group/role lookup, the four built-in pages' lists (+ their
// enabled flags), and the custom pages list all moved up to
// `./+layout.server.ts` — shared with `pages/[slug]/+page.server.ts`, which
// needs the same data to render the same tab strip. `parent()` hands all of
// that back here; this load only adds what's specific to the main page
// itself: the piece library (for the Tracks tab and homework's
// `pieceTitle`), and the two admin-only management lists.
export const load: PageServerLoad = async ({ parent, locals, fetch }) => {
	const { group, isAdmin, homework } = await parent();

	try {
		const library = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);

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
			homework: homework.map((hw) => ({
				...hw,
				pieceTitle: hw.piece_id ? (trackTitleById.get(hw.piece_id) ?? null) : null
			})),
			tracks,
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
