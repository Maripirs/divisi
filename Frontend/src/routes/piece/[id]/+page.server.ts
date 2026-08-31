import { redirect } from '@sveltejs/kit';
import { getPiece } from '$lib/pieces/registry';
import { lh } from '$lib/i18n';
import type { PageServerLoad } from './$types';

/** F5: this used to also resolve `params.id` against the Backend's
 * `/library/pieces` (or the guest `/guest/{code}` listing) right here,
 * blocking on it before returning — but that resolution can take up to
 * `resolve/+server.ts`'s 20s timeout on a Render free-tier cold start, and
 * this route is `ssr:false`, so blocking `load` blocked the very first
 * paint: nothing rendered at all (not even the loading state — the
 * component hadn't mounted yet) for however long the Backend took to wake
 * up. Real incident: a choir member opened a shared piece link and saw a
 * blank tab for a solid ~20s, not the "loading"/"couldn't reach it" card
 * `+page.svelte` already has for exactly this situation — see
 * `piece_unreachable`/`piece_retry` there.
 *
 * So `load` here now only ever does the parts that are instant — a
 * bundled fixture needs no network call at all, and "not logged in, no
 * guest code" is a redirect, not a fetch — and the slow Backend lookup
 * moves to `resolve/+server.ts`, called from `+page.svelte`'s `onMount`
 * *after* the "loading" status card is already on screen. However long
 * that takes, the user is never looking at a blank pane while it does. */
export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) {
			// A bundled demo/SFCC piece needs no login at all — unchanged. A
			// real Backend piece (e.g. a choir member sharing a track link)
			// does: send the visitor to log in (or register) and land right
			// back on this exact piece afterward, rather than silently
			// falling back to "no remote piece found" the way a cold,
			// logged-out visit used to.
			if (getPiece(params.id)) return { id: params.id };
			throw redirect(303, lh(`/login?redirectTo=/piece/${params.id}`));
		}
	}
	return { id: params.id };
};
