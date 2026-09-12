import { error } from '@sveltejs/kit';
import { readGuestCookie } from '$lib/server/guestSession';
import { GuestApiError, getGuestCustomPage } from '$lib/api/guest';
import type { PageServerLoad } from './$types';

/** F27: the guest counterpart to `/groups/[id]/pages/[slug]`, reached by a
 * link someone shares, not a list (there's no guest "list every custom
 * page" route, same gap `$lib/api/guest.ts`'s `getGuestCustomPage` docs).
 *
 * Unlike `/join/[code]`'s own load, this doesn't stream the fetch behind an
 * unawaited promise: that trick exists there so a Render cold start doesn't
 * block the very first paint of the group's whole guest view. A single
 * mostly-empty custom page (this milestone's entire content story is
 * "title plus an empty state") doesn't carry that same cost, so a plain
 * awaited load stays simpler. */
export const load: PageServerLoad = async ({ params, cookies, fetch }) => {
	const code = params.code.toUpperCase();
	const token = readGuestCookie(cookies, code) ?? undefined;
	try {
		const customPage = await getGuestCustomPage(code, params.slug, { token, fetchFn: fetch });
		return { code, customPage };
	} catch (err) {
		if (err instanceof GuestApiError) throw error(err.status, err.message);
		throw err;
	}
};
