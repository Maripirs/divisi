import { error } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { CarpoolEventOut, CarpoolPostOut, GroupCustomPageOut } from '$lib/server/backendTypes';
import { selectDefaultCarpoolEventId } from '$lib/utils/carpool';
import type { Actions, PageServerLoad } from './$types';
import { carpoolActions } from './actions/carpool';

/** F27: the by-slug counterpart to the admin management list the group's
 * shared `../+layout.server.ts` loads: this is how a member actually
 * reaches one custom page, since there's no member-facing "list every
 * custom page" route (see that file's comment on why `GET .../custom-pages`
 * 403s for a non-admin). An admin lands here too, via the tab strip's own
 * link, and bypasses every gate exactly like `require_member_page_access`
 * does on the Backend.
 *
 * F31: `group`/`isAdmin`/`customPages`/the built-in `*Enabled` flags all
 * come from that shared layout (`parent()` below) — the same data
 * `+page.svelte`'s own main-page counterpart uses to render the identical
 * tab strip. This load only adds what's specific to the ONE page it's
 * showing.
 *
 * B24/F28: for a carpool board, also loads that page's events (and the
 * selected one's posts) so `CarpoolBoard.svelte` has real content instead
 * of `CustomPageView`'s placeholder. `?event=<id>` in the URL picks which
 * event's posts to show; it defaults to the standing event (B26/F32) via
 * `selectDefaultCarpoolEventId`, not "first by `starts_at`" as before. */
export const load: PageServerLoad = async ({ parent, locals, fetch, params, url }) => {
	const parentData = await parent();
	// Logged-out visitor on a password-gated group's custom-page link: same
	// short-circuit as the main group page's own load: the shared
	// `+layout.server.ts` already resolved the gate, nothing here to fetch.
	// A truthiness check, not `'gate' in parentData`: the layout always
	// returns a `gate` key, just `undefined` outside this branch.
	//
	// `groupId` is always `params.id` regardless of the gate, and
	// `events`/`selectedEventId`/`posts` get the same empty placeholders
	// this load's normal branch would use for a non-carpool page, matching
	// shapes between branches the same way (and for the same reason) as
	// `+layout.server.ts`'s own gate branch does. `customPage` has no such
	// placeholder (there's no "empty" custom page); this route's own
	// `+page.svelte` narrows that one field explicitly instead.
	if (parentData.gate) {
		return { gate: parentData.gate, groupId: params.id, events: [], selectedEventId: null, posts: [] };
	}
	const { isAdmin } = parentData;

	try {
		const customPage = await backendJson<GroupCustomPageOut>(
			locals.token,
			`/groups/${params.id}/pages/${params.slug}`,
			undefined,
			fetch
		);

		let events: CarpoolEventOut[] = [];
		let selectedEventId: string | null = null;
		let posts: CarpoolPostOut[] = [];
		if (customPage.template_key === 'carpool_board') {
			events = await backendJson<CarpoolEventOut[]>(
				locals.token,
				`/groups/${params.id}/pages/${customPage.id}/carpool/events`,
				undefined,
				fetch
			);
			selectedEventId = selectDefaultCarpoolEventId(events, url.searchParams.get('event'));
			if (selectedEventId) {
				posts = await backendJson<CarpoolPostOut[]>(
					locals.token,
					`/carpool/events/${selectedEventId}/posts`,
					undefined,
					fetch
				);
			}
		}

		return { gate: undefined, groupId: params.id, isAdmin, customPage, events, selectedEventId, posts };
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	...carpoolActions
};
