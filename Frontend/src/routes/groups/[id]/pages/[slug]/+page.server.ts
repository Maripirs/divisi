import { error } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { CarpoolEventOut, CarpoolPostOut, GroupCustomPageOut } from '$lib/server/backendTypes';
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
 * event's posts to show; it defaults to the first (soonest, since the
 * Backend already returns events ordered by `starts_at`). */
export const load: PageServerLoad = async ({ parent, locals, fetch, params, url }) => {
	const { isAdmin } = await parent();

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
			const requested = url.searchParams.get('event');
			selectedEventId = events.find((e) => e.id === requested)?.id ?? events[0]?.id ?? null;
			if (selectedEventId) {
				posts = await backendJson<CarpoolPostOut[]>(
					locals.token,
					`/carpool/events/${selectedEventId}/posts`,
					undefined,
					fetch
				);
			}
		}

		return { groupId: params.id, isAdmin, customPage, events, selectedEventId, posts };
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	...carpoolActions
};
