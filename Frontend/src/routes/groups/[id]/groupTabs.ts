import { m } from '$lib/paraglide/messages';
import type { GroupCustomPageOut, GroupOut, GroupPage, GroupPageSettingOut } from '$lib/server/backendTypes';
import type { SessionUser } from '../../+layout.server';

/** The six built-in tabs, in their fixed display order. `+page.svelte`
 * still switches between these with local `$state` (zero navigation); from
 * a custom page's own route (`pages/[slug]/+page.svelte`) every one of
 * these is instead a plain link back to the main page. */
export type BuiltinTabKey = 'primary' | 'tracks' | 'weeklyNotes' | 'members' | 'responsibilities' | 'about';

export interface GroupTabEntry {
	label: string;
	/** A built-in tab's key, or `null` for a custom-page entry (which
	 * carries `slug` instead). Never both — a tab is either one of the six
	 * built-ins or one specific custom page. */
	key: BuiltinTabKey | null;
	slug: string | null;
}

/** What both `+page.server.ts` (via its `+layout.server.ts` parent) and
 * `pages/[slug]/+page.server.ts` (via the same layout) have on hand to
 * compute this list — a structural subset of `PageData`, not the whole
 * thing, so this stays decoupled from either route's exact shape. */
export interface GroupTabData {
	homeworkEnabled: boolean;
	weeklyNotesEnabled: boolean;
	membersEnabled: boolean;
	responsibilitiesEnabled: boolean;
	customPages: GroupCustomPageOut[];
	/** B12's real, admin-set per-page `enabled` value (`GET
	 * .../page-settings`, admin-only). Empty for a non-admin caller, whose
	 * own `*Enabled` flags above are already accurate for them (see
	 * `realEnabled` below). For an admin, this is the only accurate source:
	 * their own `*Enabled` flags above always read `true` because the
	 * Backend lets an admin's request through regardless of a page's real
	 * setting. */
	pageSettings: GroupPageSettingOut[];
}

/** Looks up `page`'s real, admin-set `enabled` value out of
 * `data.pageSettings`. Falls back to `fallback` (one of the `*Enabled`
 * flags) when no matching row exists, which is always the case for a
 * non-admin caller (`pageSettings` is `[]` for them) — their `*Enabled`
 * flags are already correct, so the fallback is exactly right for them. For
 * an admin, a matching row is always present (the Backend returns all six
 * pages) and wins over `fallback`, which is what lets `mode === 'member'`
 * (the in-app "view as member" preview, still a real admin request under
 * the hood) reflect the actual setting instead of the admin's own
 * always-true bypassed fetch. */
function realEnabled(data: GroupTabData, page: GroupPage, fallback: boolean): boolean {
	const setting = data.pageSettings.find((s) => s.page === page);
	return setting ? setting.enabled : fallback;
}

/** `data.group`/`data.user` are typed `GroupOut | undefined` /
 * `SessionUser | null` in every `PageData` under this route tree, purely to
 * accommodate the shared `+layout.server.ts`'s guest-gate branch (a
 * logged-out visitor on a password-gated group's member link: see that
 * file's own comment on why its two branches have to line up field for
 * field). Every actual consumer of `data.group`/`data.user`, every Tab
 * component, and the two leaf `+page.svelte` files themselves, only ever
 * renders once the caller has already checked `data.gate` and taken the
 * non-gate branch, where both are always genuinely present. This is the one
 * place that invariant gets asserted, so call sites can go back to treating
 * them as the plain, always-defined values they actually are at runtime.
 *
 * Throws (rather than silently falling back to something wrong) if the
 * invariant is somehow violated: that would mean a real bug in the
 * `data.gate` branching upstream, not a normal path through this code. */
export function assertUngated<T extends { group?: GroupOut; user?: SessionUser | null }>(
	data: T
): asserts data is T & { group: GroupOut; user: SessionUser } {
	if (!data.group || !data.user) {
		throw new Error('Group page data missing outside the guest gate, should be unreachable.');
	}
}

/** F31: the ordered, filtered, labeled tab list shared by the main group
 * page and every custom page's own route, so the strip is identical (and
 * stays in sync) wherever it renders. Fixed order: Homework, Rehearsal
 * Tracks, Weekly Notes, Members, Responsibilities, [custom pages], Info —
 * the same slot the old single "Pages" list-tab used to occupy, now
 * expanded into one entry per visible custom page.
 *
 * `mode === 'admin'` bypasses every built-in page's member-visibility gate
 * (mirrors the Backend's own admin-always-passes rule) and shows a custom
 * page of any status, not just `published` — see `+page.svelte`'s own
 * comment on why admin mode is a *view*, not tied to the caller's real
 * role. */
export function computeGroupTabs(data: GroupTabData, mode: 'member' | 'admin'): GroupTabEntry[] {
	const builtins: { key: BuiltinTabKey; visible: boolean; label: string }[] = [
		{
			key: 'primary',
			visible: mode === 'admin' || realEnabled(data, 'homework', data.homeworkEnabled),
			label: mode === 'admin' ? m.groups_assignments() : m.homework_tab_title()
		},
		{ key: 'tracks', visible: true, label: mode === 'admin' ? m.groups_tracks() : m.tracks_tab_title() },
		{
			key: 'weeklyNotes',
			visible: mode === 'admin' || realEnabled(data, 'weekly_notes', data.weeklyNotesEnabled),
			label: m.weekly_notes_tab_title()
		},
		{
			key: 'members',
			visible: mode === 'admin' || realEnabled(data, 'members', data.membersEnabled),
			label: m.groups_members_tab_title()
		},
		{
			key: 'responsibilities',
			visible: mode === 'admin' || realEnabled(data, 'responsibilities', data.responsibilitiesEnabled),
			label: m.responsibilities_tab_title()
		}
	];

	const visiblePages = mode === 'admin' ? data.customPages : data.customPages.filter((p) => p.status === 'published');
	const pageEntries: GroupTabEntry[] = visiblePages.map((p) => ({ key: null, slug: p.slug, label: p.title }));

	const about: GroupTabEntry = { key: 'about', slug: null, label: mode === 'admin' ? m.groups_settings() : m.groups_info() };

	return [
		...builtins.filter((b) => b.visible).map(({ key, label }) => ({ key, slug: null, label })),
		...pageEntries,
		about
	];
}
