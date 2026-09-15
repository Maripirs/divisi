import { error } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { selectDefaultCarpoolEventId } from '$lib/utils/carpool';
import type { CarpoolPostOut, LibraryEntryOut, ResponsibilityScheduleOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';
import { groupActions } from './actions/group';
import { memberActions } from './actions/members';
import { trackActions } from './actions/tracks';
import { homeworkActions } from './actions/homework';
import { weeklyNoteActions } from './actions/weeklyNotes';
import { responsibilityActions } from './actions/responsibilities';
import { carpoolActions } from './actions/carpool';
import { groupResourceActions } from './actions/groupResources';

// F31/B31: the group/role lookup, the five built-in pages' lists (+ their
// enabled flags, carpool's events among them), and the admin-only real
// `page-settings` list all live in `./+layout.server.ts`. `parent()` hands
// all of that back here; this load only adds what's specific to the main
// page itself: the piece library (for the Tracks tab and homework's
// `pieceTitle`), the one remaining admin-only management list
// (responsibility schedules), and carpool's selected-event posts (the one
// piece of carpool content that depends on this page's own `?event=` query
// param, so it can't live in the shared layout).
export const load: PageServerLoad = async ({ parent, locals, fetch, url }) => {
	const parentData = await parent();
	// Logged-out visitor on a password-gated group's bare link: the shared
	// `+layout.server.ts` already resolved this down to a gate card instead
	// of the group data below, and there's nothing of this page's own left
	// to fetch: the gate is the entire page (see `+page.svelte`). A
	// truthiness check, not `'gate' in parentData`: the layout always
	// returns a `gate` key (see its own comment on why), just `undefined`
	// outside this branch.
	//
	// `homework`/`tracks`/`schedules`/`pageSettings`/`carpoolSelectedEventId`/
	// `carpoolPosts` get the same empty placeholders here as the layout's own
	// gate branch gives its fields, and for the same reason: matching this
	// load's two branches to the same shape (never `undefined`-vs-"present")
	// is what keeps every Tab component's own `data.homework`/`data.tracks`/
	// etc. typed as a plain array instead of `... | undefined` everywhere,
	// gated or not.
	if (parentData.gate) {
		return {
			gate: parentData.gate,
			homework: [],
			tracks: [],
			schedules: [],
			pageSettings: [],
			carpoolSelectedEventId: null,
			carpoolPosts: []
		};
	}
	const { group, isAdmin, homework, pageSettings, carpoolEvents } = parentData;
	if (!group) {
		// Unreachable in practice: the layout only omits `group` in the same
		// branch that sets `gate`, which the check above already returned on.
		// Exists so TypeScript can narrow `group` for the rest of this load
		// (its type is `GroupOut | undefined` purely to accommodate that
		// gate branch) rather than because this can actually happen.
		throw error(500, 'Group missing outside the guest gate');
	}

	try {
		const library = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);

		// Admin-only management data — this endpoint 403s for a non-admin, so
		// only fetched when the caller actually is one. (`page-settings` used
		// to be fetched here too; it moved up to `./+layout.server.ts`, which
		// `pageSettings` above is now sourced from.)
		let schedules: ResponsibilityScheduleOut[] = [];
		if (isAdmin) {
			schedules = await backendJson<ResponsibilityScheduleOut[]>(
				locals.token,
				`/groups/${group.id}/responsibilities/schedules`,
				undefined,
				fetch
			);
		}

		// B31/F36: carpool's events list already came down from the shared
		// layout (`carpoolEvents`); only the selected event's posts are
		// fetched here, same `?event=<id>` selection convention the old
		// `pages/[slug]/+page.server.ts` used (defaulting to the standing
		// event via `selectDefaultCarpoolEventId`, not "first by `starts_at`").
		const carpoolSelectedEventId = selectDefaultCarpoolEventId(carpoolEvents, url.searchParams.get('event'));
		const carpoolPosts: CarpoolPostOut[] = carpoolSelectedEventId
			? await backendJson<CarpoolPostOut[]>(locals.token, `/carpool/events/${carpoolSelectedEventId}/posts`, undefined, fetch)
			: [];

		const tracks = library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id);
		const trackTitleById = new Map(tracks.map((t) => [t.piece_id, t.title]));

		return {
			gate: undefined,
			homework: homework.map((hw) => ({
				...hw,
				pieceTitle: hw.piece_id ? (trackTitleById.get(hw.piece_id) ?? null) : null
			})),
			tracks,
			schedules,
			pageSettings,
			carpoolSelectedEventId,
			carpoolPosts
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

// The form actions this page exposes live in `./actions/*.ts`, grouped by
// the tab they belong to (see CLEANUP.md step 7). Each module exports one
// `*Actions` object; they're spread-composed here into the single `actions`
// export SvelteKit expects. Every action shares `runAction`
// (`./actions/_shared.ts`) for its Backend-error-to-`fail` tail.
export const actions: Actions = {
	...groupActions,
	...memberActions,
	...trackActions,
	...homeworkActions,
	...weeklyNoteActions,
	...responsibilityActions,
	...carpoolActions,
	...groupResourceActions
};
