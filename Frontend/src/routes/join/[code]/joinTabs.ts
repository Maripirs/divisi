import { m } from '$lib/paraglide/messages';

/** The guest join page's built-in tabs, in their fixed display order.
 * Deliberately a smaller, differently-ordered set than the member side's
 * `../groups/[id]/groupTabs.ts` (`BuiltinTabKey`) — a guest never sees
 * Members or Info/Settings, and Tracks leads instead of Homework.
 *
 * B31/F36: `carpool` joined this list as a built-in tab, promoted from the
 * generic `GroupCustomPage` system (its one and only template), which the
 * Backend dropped entirely. There is no more per-group "which custom pages
 * exist" question to answer, so unlike every version of this file before
 * F36, a tab entry is always exactly one of these five — no separate
 * slug-addressed branch. */
export type GuestBuiltinTabKey = 'tracks' | 'homework' | 'weeklyNotes' | 'responsibilities' | 'carpool';

export interface GuestTabEntry {
	label: string;
	key: GuestBuiltinTabKey;
}

/** What `/join/[code]`'s own resolved `GuestJoinResult` has on hand to
 * compute this list. */
export interface GuestTabData {
	homeworkVisible: boolean;
	weeklyNotesVisible: boolean;
	responsibilitiesVisible: boolean;
	carpoolVisible: boolean;
}

/** F31/B31: the guest counterpart to `groupTabs.ts`'s `computeGroupTabs` —
 * same idea (ordered, filtered, labeled tabs), but no `mode` parameter: a
 * guest is never an admin. */
export function computeGuestTabs(data: GuestTabData): GuestTabEntry[] {
	const builtins: { key: GuestBuiltinTabKey; visible: boolean; label: string }[] = [
		{ key: 'tracks', visible: true, label: m.tracks_tab_title() },
		{ key: 'homework', visible: data.homeworkVisible, label: m.homework_tab_title() },
		{ key: 'weeklyNotes', visible: data.weeklyNotesVisible, label: m.weekly_notes_tab_title() },
		{ key: 'responsibilities', visible: data.responsibilitiesVisible, label: m.responsibilities_tab_title() },
		{ key: 'carpool', visible: data.carpoolVisible, label: m.carpool_tab_title() }
	];

	return builtins.filter((b) => b.visible).map(({ key, label }) => ({ key, label }));
}
