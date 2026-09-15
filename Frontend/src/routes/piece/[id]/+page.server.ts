import { redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { getPiece } from '$lib/pieces/registry';
import { readGuestCookie } from '$lib/server/guestSession';
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
 * bundled fixture needs no network call at all — and the slow Backend
 * lookup of a *logged-in* user's library moves to `resolve/+server.ts`,
 * called from `+page.svelte`'s `onMount` *after* the "loading" status card
 * is already on screen. However long that takes, the user is never looking
 * at a blank pane while it does.
 *
 * The one deliberate network call left here is the logged-out, no-`code`
 * branch below: a single fast unauthenticated lookup that names the owning
 * group so a bare `/piece/{id}` link can show a group-named gate (or go
 * straight into the guest player when the group has no guest password),
 * instead of an unexplained bounce to `/login`. It falls back to that
 * bounce on any error, so a cold Backend still degrades to today's
 * behavior rather than blocking. */
export const load: PageServerLoad = async ({ params, locals, url, fetch, cookies }) => {
	if (!locals.token) {
		const code = url.searchParams.get('code');
		if (!code) {
			// A bundled demo piece needs no login at all, unchanged.
			if (getPiece(params.id)) return { id: params.id };

			// A real Backend piece with no `?code=` yet: resolve which group
			// owns it so a logged-out visitor sees a gate naming that group,
			// or is sent straight into the guest player when the group has no
			// guest password — instead of the unexplained `/login` bounce a
			// cold, logged-out visit used to get. Accepted tradeoff: a piece
			// id reveals its owning group's name and join code to an
			// unauthenticated caller. Piece ids are non-guessable and a shared
			// piece link is the same trust level as a shared join link — and a
			// join code already grants the guest view, so this reveals nothing
			// the code itself wouldn't. When the group has a guest password,
			// that password still gates this no-`?code=` entry (the gate card
			// below); once past it the visitor continues with `?code=` like
			// any other join-code guest.
			//
			// Note `redirect()` throws, so this is structured so a fetch
			// failure maps to the login redirect and only a clean 200 leads
			// to a redirect-or-`guestGate` — no try/catch wraps the throws.
			type PieceOwner = {
				group_name: string;
				join_code: string;
				guest_password_required: boolean;
			};
			let owner: PieceOwner | null = null;
			try {
				const res = await fetch(
					`${PUBLIC_API_BASE_URL}/guest/pieces/${encodeURIComponent(params.id)}/owner`
				);
				if (res.ok) {
					owner = (await res.json()) as PieceOwner;
				}
			} catch {
				owner = null;
			}

			// Any non-OK response (404 included) or fetch error: fall back to
			// exactly today's behavior.
			if (!owner) {
				throw redirect(303, lh(`/login?redirectTo=/piece/${params.id}`));
			}

			if (!owner.guest_password_required) {
				// No guest password on the group — re-enter this `load` with
				// `code` present so it returns `{ id }` and `+page.svelte`'s
				// normal guest resolve flow takes over, no password prompt.
				throw redirect(
					303,
					lh(`/piece/${params.id}?code=${encodeURIComponent(owner.join_code)}`)
				);
			}

			// Guest password group: but if this browser already cleared the
			// gate for this group (the `divisi_guest_{CODE}` cookie
			// `submitGuestGatePassword` below mints via `/join/{code}/auth`),
			// don't ask again. This is also what makes the browser Back
			// button behave: unlocking the gate is a full-page nav to
			// `?code=...`, which *pushes* a history entry on top of this bare
			// URL rather than replacing it, so Back lands right back here. A
			// stale/expired cookie just means the Backend 401s the guest
			// routes on `/join/{code}`, which already knows how to recover by
			// re-prompting, so this redirect is never a dead end.
			if (readGuestCookie(cookies, owner.join_code)) {
				throw redirect(303, lh(`/join/${owner.join_code}`));
			}

			// Guest password group, no cookie yet: hand `+page.svelte` the
			// owning group's name + join code so it can render the
			// group-named gate card in place of mounting the player.
			return {
				id: params.id,
				guestGate: { groupName: owner.group_name, code: owner.join_code }
			};
		}
	}
	return { id: params.id };
};
