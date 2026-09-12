import { m } from '$lib/paraglide/messages';
import type { GuestCustomPageListItem } from '$lib/api/guest';

/** The guest join page's built-in tabs, in their fixed display order.
 * Deliberately a smaller, differently-ordered set than the member side's
 * `../groups/[id]/groupTabs.ts` (`BuiltinTabKey`) — a guest never sees
 * Members or Info/Settings, and Tracks leads instead of Homework. */
export type GuestBuiltinTabKey = 'tracks' | 'homework' | 'weeklyNotes' | 'responsibilities';

export interface GuestTabEntry {
	label: string;
	/** A built-in tab's key, or `null` for a custom-page entry (which
	 * carries `slug` instead). */
	key: GuestBuiltinTabKey | null;
	slug: string | null;
}

/** What `/join/[code]`'s own resolved `GuestJoinResult` and
 * `pages/[slug]/+page.server.ts`'s load both have on hand to compute this
 * list — a structural subset of either, not the whole shape. */
export interface GuestTabData {
	homeworkVisible: boolean;
	weeklyNotesVisible: boolean;
	responsibilitiesVisible: boolean;
	customPages: GuestCustomPageListItem[];
}

/** F31: the guest counterpart to `groupTabs.ts`'s `computeGroupTabs` — same
 * idea (ordered, filtered, labeled tabs; one entry per discoverable custom
 * page in the slot the old single "Pages" list-tab used to occupy), but no
 * `mode` parameter: a guest is never an admin, and every guest-visible
 * custom page here is already published + `audience: everyone` (B25's
 * `/guest/{code}/pages` only ever returns those), so there's no
 * member-vs-admin filtering left to do. */
export function computeGuestTabs(data: GuestTabData): GuestTabEntry[] {
	const builtins: { key: GuestBuiltinTabKey; visible: boolean; label: string }[] = [
		{ key: 'tracks', visible: true, label: m.tracks_tab_title() },
		{ key: 'homework', visible: data.homeworkVisible, label: m.homework_tab_title() },
		{ key: 'weeklyNotes', visible: data.weeklyNotesVisible, label: m.weekly_notes_tab_title() },
		{ key: 'responsibilities', visible: data.responsibilitiesVisible, label: m.responsibilities_tab_title() }
	];

	const pageEntries: GuestTabEntry[] = data.customPages.map((p) => ({ key: null, slug: p.slug, label: p.title }));

	return [...builtins.filter((b) => b.visible).map(({ key, label }) => ({ key, slug: null, label })), ...pageEntries];
}
