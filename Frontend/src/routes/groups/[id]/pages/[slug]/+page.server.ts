import { error, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { CarpoolEventOut, CarpoolPostOut, GroupCustomPageOut, GroupOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';
import { carpoolActions } from './actions/carpool';

/** F27: the by-slug counterpart to the admin management list the group
 * page's own `+page.server.ts` loads: this is how a member actually
 * reaches one custom page, since there's no member-facing "list every
 * custom page" route yet (see that file's comment on why `GET
 * .../custom-pages` 403s for a non-admin). An admin lands here too, via
 * the Pages tab's own "View" link, and bypasses every gate exactly like
 * `require_member_page_access` does on the Backend.
 *
 * B24/F28: for a carpool board, also loads that page's events (and the
 * selected one's posts) so `CarpoolBoard.svelte` has real content instead
 * of `CustomPageView`'s placeholder. `?event=<id>` in the URL picks which
 * event's posts to show; it defaults to the first (soonest, since the
 * Backend already returns events ordered by `starts_at`). */
export const load: PageServerLoad = async ({ parent, locals, fetch, params, url }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}/pages/${params.slug}`));

	try {
		const customPage = await backendJson<GroupCustomPageOut>(
			locals.token,
			`/groups/${params.id}/pages/${params.slug}`,
			undefined,
			fetch
		);

		// No single-group GET on the Backend, same lookup `/groups/[id]/
		// +page.server.ts` does: an admin gets the moderation controls,
		// otherwise the plain member view.
		const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
		const isAdmin = groups.find((g) => g.id === params.id)?.role === 'admin';

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

		return { groupId: params.id, user, customPage, isAdmin, events, selectedEventId, posts };
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	...carpoolActions
};
