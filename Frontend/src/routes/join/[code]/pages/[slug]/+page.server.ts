import { error } from '@sveltejs/kit';
import { readGuestCookie } from '$lib/server/guestSession';
import {
	GuestApiError,
	getGuestCustomPage,
	listGuestCarpoolEvents,
	listGuestCarpoolPosts
} from '$lib/api/guest';
import type { PageServerLoad } from './$types';

/** F27: the guest counterpart to `/groups/[id]/pages/[slug]`, reached by a
 * link someone shares or (F29) the join page's own "Pages" tab, not a list
 * living on this route itself.
 *
 * F29/B25: for a `carpool_board` page, also loads that page's events (and
 * the selected one's posts) so `CarpoolBoard.svelte` renders real content
 * instead of `CustomPageView`'s placeholder — same `?event=<id>` selection
 * convention `/groups/[id]/pages/[slug]/+page.server.ts` uses. Every other
 * template still falls through to the placeholder (there's only the one
 * template today).
 *
 * Unlike `/join/[code]`'s own load, this doesn't stream the fetch behind an
 * unawaited promise: that trick exists there so a Render cold start doesn't
 * block the very first paint of the group's whole guest view. A single
 * custom page (even with real carpool content) doesn't carry that same
 * cost, so a plain awaited load stays simpler. */
export const load: PageServerLoad = async ({ params, cookies, fetch, url }) => {
	const code = params.code.toUpperCase();
	const token = readGuestCookie(cookies, code) ?? undefined;
	try {
		const customPage = await getGuestCustomPage(code, params.slug, { token, fetchFn: fetch });
		if (customPage.templateKey !== 'carpool_board') {
			return { code, customPage, events: [], selectedEventId: null, posts: [] };
		}

		const events = await listGuestCarpoolEvents(code, params.slug, { token, fetchFn: fetch });
		const requested = url.searchParams.get('event');
		const selectedEventId = events.find((e) => e.id === requested)?.id ?? events[0]?.id ?? null;
		const posts = selectedEventId
			? await listGuestCarpoolPosts(code, selectedEventId, { token, fetchFn: fetch })
			: [];

		return { code, customPage, events, selectedEventId, posts };
	} catch (err) {
		if (err instanceof GuestApiError) throw error(err.status, err.message);
		throw err;
	}
};
