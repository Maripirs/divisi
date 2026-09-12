import { m } from '$lib/paraglide/messages';
import type { GroupCustomPageOut } from '$lib/server/backendTypes';

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
			visible: mode === 'admin' || data.homeworkEnabled,
			label: mode === 'admin' ? m.groups_assignments() : m.homework_tab_title()
		},
		{ key: 'tracks', visible: true, label: mode === 'admin' ? m.groups_tracks() : m.tracks_tab_title() },
		{ key: 'weeklyNotes', visible: mode === 'admin' || data.weeklyNotesEnabled, label: m.weekly_notes_tab_title() },
		{ key: 'members', visible: mode === 'admin' || data.membersEnabled, label: m.groups_members_tab_title() },
		{
			key: 'responsibilities',
			visible: mode === 'admin' || data.responsibilitiesEnabled,
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
