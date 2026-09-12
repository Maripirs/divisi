import { error } from '@sveltejs/kit';
import { readGuestCookie } from '$lib/server/guestSession';
import {
	GuestApiError,
	getGuestCustomPage,
	listGuestCarpoolEvents,
	listGuestCarpoolPosts,
	listGuestCustomPages,
	listGuestHomework,
	listGuestResponsibilityDates,
	listGuestWeeklyNotes
} from '$lib/api/guest';
import { selectDefaultCarpoolEventId } from '$lib/utils/carpool';
import type { PageServerLoad } from './$types';

/** F27: the guest counterpart to `/groups/[id]/pages/[slug]`, reached by a
 * link someone shares or (F29) the join page's own tab strip, not a list
 * living on this route itself.
 *
 * F29/B25: for a `carpool_board` page, also loads that page's events (and
 * the selected one's posts) so `CarpoolBoard.svelte` renders real content
 * instead of `CustomPageView`'s placeholder — same `?event=<id>` selection
 * convention `/groups/[id]/pages/[slug]/+page.server.ts` uses. Every other
 * template still falls through to the placeholder (there's only the one
 * template today).
 *
 * F31: also loads the same three optional-page visibility flags and the
 * custom-page discovery list `/join/[code]`'s own load does
 * (`guestJoin.ts`), so this route can render the identical shared tab strip
 * (`joinTabs.ts`). Duplicated rather than calling `loadGuestJoin` directly:
 * that helper resolves its own errors into a `{ error }` result instead of
 * throwing, which doesn't fit this route's plain throw-on-failure handling
 * below.
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

		let homeworkVisible = false;
		try {
			await listGuestHomework(code, { token, fetchFn: fetch });
			homeworkVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}
		let weeklyNotesVisible = false;
		try {
			await listGuestWeeklyNotes(code, { token, fetchFn: fetch });
			weeklyNotesVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}
		let responsibilitiesVisible = false;
		try {
			await listGuestResponsibilityDates(code, { token, fetchFn: fetch });
			responsibilitiesVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}
		const customPages = await listGuestCustomPages(code, { token, fetchFn: fetch });
		const tabData = { homeworkVisible, weeklyNotesVisible, responsibilitiesVisible, customPages };
		// `GuestCustomPage` (unlike the member-side `GroupCustomPageOut`)
		// carries no `slug` of its own — it's fetched by slug, not listed —
		// so the route param is this page's own tab-strip identity instead.
		const slug = params.slug;

		if (customPage.templateKey !== 'carpool_board') {
			return { code, slug, customPage, events: [], selectedEventId: null, posts: [], ...tabData };
		}

		const events = await listGuestCarpoolEvents(code, params.slug, { token, fetchFn: fetch });
		const selectedEventId = selectDefaultCarpoolEventId(events, url.searchParams.get('event'));
		const posts = selectedEventId
			? await listGuestCarpoolPosts(code, selectedEventId, { token, fetchFn: fetch })
			: [];

		return { code, slug, customPage, events, selectedEventId, posts, ...tabData };
	} catch (err) {
		if (err instanceof GuestApiError) throw error(err.status, err.message);
		throw err;
	}
};
