import { error, redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { readGuestCookie } from '$lib/server/guestSession';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type {
	GroupCustomPageOut,
	GroupMemberOut,
	GroupOut,
	GroupPageSettingOut,
	HomeworkOut,
	ResponsibilityDateOut,
	WeeklyNoteOut
} from '$lib/server/backendTypes';
import type { LayoutServerLoad } from './$types';

/** B12: a member-facing page route 403s once its admin disables that page
 * (`require_member_page_access`) — admins always pass regardless, so this
 * only ever "disables" something for a non-admin caller. Wraps a group-page
 * fetch so a disabled page hides its tab instead of failing the whole load. */
async function fetchPageOrDisabled<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; enabled: boolean }> {
	try {
		return { data: await promise, enabled: true };
	} catch (err) {
		if (err instanceof BackendApiError && err.status === 403) return { data: fallback, enabled: false };
		throw err;
	}
}

/** The group-id counterpart to `piece/[id]/+page.server.ts`'s bare-piece-link
 * lookup: a logged-out visitor on a real "member" link (`/groups/{id}` or
 * `/groups/{id}/pages/{slug}`, as opposed to a `/join/{code}` guest link)
 * gets a chance at the guest view instead of an unexplained bounce straight
 * to `/login`. `GET /guest/groups/{id}/info` is the unauthenticated,
 * no-argument-needed lookup (mirrors `/guest/pieces/{id}/owner`).
 *
 * `guestSuffix` is `''` for the bare group page or `/pages/{slug}` for a
 * custom page, with the visited URL's own `?query` already appended by the
 * caller: it becomes the matching suffix on the `/join/{code}` route tree.
 *
 * Same fetch-failure stance as the piece lookup: wrapped in try/catch, any
 * thrown error or non-OK response returns `null`, which the caller treats
 * as "fall through to the ordinary login redirect" rather than a dead end
 * (a cold Backend degrades to today's behavior, never a stuck page).
 *
 * On a clean answer: no guest password on the group, or this browser
 * already holds a valid guest cookie for it (`readGuestCookie`, minted by
 * `/join/{code}/auth`) -> redirect straight into the guest view, no gate
 * shown at all. Otherwise return the group name + code for the caller to
 * hand back as page data, so `GroupGuestGate.svelte` can render a gate card
 * naming the group at this same URL. */
async function resolveGroupGuestGate(
	groupId: string,
	guestSuffix: string,
	cookies: Cookies,
	fetchFn: typeof fetch
): Promise<{ groupName: string; code: string; targetSuffix: string } | null> {
	type GroupInfo = { group_name: string; join_code: string; guest_password_required: boolean };
	let info: GroupInfo | null = null;
	try {
		const res = await fetchFn(`${PUBLIC_API_BASE_URL}/guest/groups/${encodeURIComponent(groupId)}/info`);
		if (res.ok) info = (await res.json()) as GroupInfo;
	} catch {
		info = null;
	}
	if (!info) return null;

	if (!info.guest_password_required || readGuestCookie(cookies, info.join_code)) {
		throw redirect(303, lh(`/join/${info.join_code}${guestSuffix}`));
	}

	return { groupName: info.group_name, code: info.join_code, targetSuffix: guestSuffix };
}

/** F31: shared chrome for every route under `/groups/[id]` — the group's
 * own page and each custom page's own `pages/[slug]` route both need the
 * same tab strip (`groupTabs.ts`'s `computeGroupTabs`), which needs the
 * group, its custom pages, and which built-in pages are enabled for a
 * member. Lives here once instead of duplicated in both leaf loads.
 *
 * As a side benefit, the main page's own load (`+page.server.ts`) now pulls
 * the homework/members/responsibilities/weekly-notes lists it needs for its
 * own tab content back out of `parent()` instead of fetching them a second
 * time. A custom page's route pays for these same four fetches too (it
 * didn't before), but that's a small, fixed cost independent of how many
 * custom pages exist — unlike a custom page's own carpool content (its
 * events, then a selected event's posts), which stays on that page's own
 * route alone. Loading *that* here for every custom page on every group
 * request is exactly what B24/F28's lazy-load stance (and this milestone's
 * own design note) rules out. */
export const load: LayoutServerLoad = async ({ parent, locals, fetch, params, url, cookies, route }) => {
	const { user } = await parent();
	if (!user) {
		// The guest gate only exists for the two routes that actually have a
		// `/join/{code}` counterpart: the bare group page and a custom page.
		// Anything else under this tree (e.g. `/groups/[id]/admin`) has no
		// guest-facing equivalent to send a visitor into, so it keeps today's
		// plain login-redirect behavior. `route.id` (not `url.pathname`) is
		// what decides that: this app is localized and a pathname can carry a
		// locale prefix (`/es/...`) that `route.id` never does.
		const guestSuffix =
			route.id === '/groups/[id]'
				? ''
				: route.id === '/groups/[id]/pages/[slug]'
					? `/pages/${(params as { slug?: string }).slug}`
					: null;
		if (guestSuffix !== null) {
			const gate = await resolveGroupGuestGate(params.id, guestSuffix + url.search, cookies, fetch);
			if (gate) {
				// Every key below also appears in the authenticated return further
				// down, with the exact same value types (`group` is the one
				// unavoidable exception: there's no real group to hand back, so
				// it's `undefined` here, and every reader of `data.group` in this
				// subtree that only ever runs post-gate, every Tab component,
				// via `assertUngated`, narrows it back to non-optional). Keeping
				// every OTHER key's shape identical between branches (empty
				// arrays/`false` rather than `undefined`) is deliberate: SvelteKit
				// infers this function's return type from its literal return
				// statements, and a shared-layout `load` whose branches return
				// *differently shaped* objects makes every descendant page's own
				// generated `PageData` collapse to an unusable blob (each field
				// typed as "some property's type across every branch, or
				// `undefined`", not a clean discriminated union): SvelteKit's
				// `Omit`-based data merging isn't distributive over a union
				// coming from an ancestor layout. Matching shapes sidesteps that
				// entirely: one flat type, no collapse, and every Tab component
				// downstream keeps exactly the same field types it always had.
				return {
					user: null,
					gate,
					group: undefined,
					isAdmin: false,
					homework: [],
					homeworkEnabled: false,
					members: [],
					membersEnabled: false,
					responsibilities: [],
					responsibilitiesEnabled: false,
					weeklyNotes: [],
					weeklyNotesEnabled: false,
					customPages: [],
					customPagesEnabled: false,
					pageSettings: []
				};
			}
		}
		throw redirect(303, lh(`/login?redirectTo=${url.pathname}`));
	}

	// No single-group GET exists on the Backend — `/groups` only lists the
	// caller's own groups, so a group this user isn't in 404s here exactly
	// like an unknown id would, which is the right behavior either way.
	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());
	const isAdmin = group.role === 'admin';

	try {
		const [homeworkResult, membersResult, responsibilitiesResult, weeklyNotesResult, customPagesResult, pageSettings] =
			await Promise.all([
				fetchPageOrDisabled(backendJson<HomeworkOut[]>(locals.token, `/groups/${group.id}/homework`, undefined, fetch), []),
				fetchPageOrDisabled(backendJson<GroupMemberOut[]>(locals.token, `/groups/${group.id}/members`, undefined, fetch), []),
				fetchPageOrDisabled(
					backendJson<ResponsibilityDateOut[]>(locals.token, `/groups/${group.id}/responsibilities/dates`, undefined, fetch),
					[]
				),
				fetchPageOrDisabled(backendJson<WeeklyNoteOut[]>(locals.token, `/groups/${group.id}/weekly-notes`, undefined, fetch), []),
				// B23 fast-follow: `GET .../custom-pages` is the admin
				// *management* list (every status), so an admin gets that;
				// a member gets the published-only `.../pages` list instead
				// of 403ing into the empty fallback the other pages above
				// use for a disabled page.
				fetchPageOrDisabled(
					backendJson<GroupCustomPageOut[]>(
						locals.token,
						isAdmin ? `/groups/${group.id}/custom-pages` : `/groups/${group.id}/pages`,
						undefined,
						fetch
					),
					[]
				),
				// The one authoritative source for a built-in page's real
				// `enabled` setting: unlike the four `fetchPageOrDisabled`
				// fetches above, an admin's own request to these page routes
				// never 403s (the Backend's `require_member_page_access`
				// always lets an admin through), so `homeworkEnabled` etc.
				// stay `true` for an admin even when a page is actually
				// disabled. That's fine for the admin's *real* view, but it
				// means `groupTabs.ts`'s member-mode preview (an admin using
				// the in-app "view as member" toggle, still the same
				// request) can't tell a truly-enabled page from an
				// admin-bypassed one without this. `GET .../page-settings`
				// itself 403s for a non-admin, so only fetched here; a
				// non-admin doesn't need it; their own `*Enabled` flags
				// above are already accurate for them.
				isAdmin
					? backendJson<GroupPageSettingOut[]>(locals.token, `/groups/${group.id}/page-settings`, undefined, fetch)
					: Promise.resolve<GroupPageSettingOut[]>([])
			]);

		return {
			// Re-returned (not just checked above): the root layout's own
			// type is `SessionUser | null`, and the check above only narrows
			// it locally unless the narrowed value is itself part of what
			// this load hands back down. `user` (like `group`) is still
			// `SessionUser | null` in `PageData` overall now, because the
			// gate branch above has to report `user: null`. Every route
			// under this layout that only ever renders once a member is
			// actually signed in (i.e. everywhere but the gate card itself)
			// re-narrows both via `assertUngated` (`groupTabs.ts`).
			user,
			// `gate: undefined` here (see the gate branch above for why every
			// key has to line up between branches): this is the "no gate"
			// case, so there's nothing to report.
			gate: undefined,
			group,
			isAdmin,
			homework: homeworkResult.data,
			homeworkEnabled: homeworkResult.enabled,
			members: membersResult.data,
			membersEnabled: membersResult.enabled,
			responsibilities: responsibilitiesResult.data,
			responsibilitiesEnabled: responsibilitiesResult.enabled,
			weeklyNotes: weeklyNotesResult.data,
			weeklyNotesEnabled: weeklyNotesResult.enabled,
			customPages: customPagesResult.data,
			customPagesEnabled: customPagesResult.enabled,
			pageSettings
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};
