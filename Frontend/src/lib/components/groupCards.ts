// A1: normalized shapes for the homework / weekly-note / responsibility-date
// cards shared between the member group page (`routes/groups/[id]`) and the
// guest join page (`routes/join/[code]`). The two sources feed the Backend's
// snake_case member DTOs and camelCase guest DTOs respectively; each call
// site maps its rows to these shapes so the card sees one thing.

export interface HomeworkCardItem {
	id: string;
	title: string;
	range: string;
	instructions: string;
	dueDate: string | null;
	/** Drives the card's own Play button — both the member and guest DTOs
	 * carry a piece id, so this isn't member-only like `pieceTitle` below. */
	pieceId?: string | null;
	/** Member side only — the linked track's title. */
	pieceTitle?: string | null;
}

export interface WeeklyNoteCardItem {
	id: string;
	title: string;
	body: string;
	noteDate: string;
}

export interface ResponsibilityRoleSignup {
	id: string;
	name: string;
	userId: string | null;
}

export interface ResponsibilityRole {
	roleId: string;
	roleName: string;
	neededCount: number;
	activeCount: number;
	status: string;
	/** Member side only — the guest coverage DTO strips signup identities. */
	signups?: ResponsibilityRoleSignup[];
}

/** One role set attached to a date, with that role set's coverage rows.
 * A date renders one heading + role block per entry. */
export interface ResponsibilityDateScheduleGroup {
	scheduleId: string;
	scheduleName: string;
	roles: ResponsibilityRole[];
}

export interface ResponsibilityDateCardItem {
	id: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	scheduleGroups: ResponsibilityDateScheduleGroup[];
}

/** Whole-date coverage rolled up from a date's per-role counts — drives the
 * Responsibilities tab's upcoming-date strip (the `x/y filled` line + meter)
 * and the selected-date badge.
 *
 *   * `empty`       — nothing signed up anywhere on the date
 *   * `underfilled` — at least one role still needs people
 *   * `covered`     — every role has exactly its needed count
 *   * `overfilled`  — no role is short and at least one has extras
 *
 * `openSlots` only counts roles that are still short (an overfilled role
 * doesn't lend its extra to a short one). */
export type ResponsibilityDateStatus = 'empty' | 'underfilled' | 'covered' | 'overfilled';

export interface ResponsibilityCoverageTotals {
	active: number;
	needed: number;
	openSlots: number;
	filledFraction: number;
	status: ResponsibilityDateStatus;
}

/** True when a date-bearing item's ISO date/time is at or after "now". */
export function isUpcomingDate(date: string): boolean {
	return new Date(date).getTime() >= Date.now();
}

/** Splits a list of date-bearing items (already sorted oldest-first, the
 * order the Backend returns responsibility dates in) into `upcoming` (kept
 * oldest-first, so the soonest leads) and `past` (reversed, so the most
 * recent past date leads) around "now". Shared by the member
 * Responsibilities tab's upcoming/past split and the guest join page's
 * equivalent, so the "upcoming means >= now" rule and the past-list
 * reversal only live in one place. */
export function partitionDatesByUpcoming<T extends { date: string }>(
	items: readonly T[]
): { upcoming: T[]; past: T[] } {
	const upcoming = items.filter((item) => isUpcomingDate(item.date));
	const past = items.filter((item) => !isUpcomingDate(item.date)).reverse();
	return { upcoming, past };
}

/** Splits an already-sorted list into runs of consecutive equal labels —
 * e.g. homework grouped under one header per due date. Shared by Home's
 * "For next rehearsal" card and the group page's Homework tab, which derive
 * the label their own way (Home reads the raw Backend `due_date`, the tab
 * reads the normalized `HomeworkCardItem.dueDate`), so the label itself is
 * the caller's job — this just splits on where it changes. */
export function groupByLabel<T>(
	items: readonly T[],
	labelOf: (item: T) => string
): { label: string; items: T[] }[] {
	const groups: { label: string; items: T[] }[] = [];
	for (const item of items) {
		const label = labelOf(item);
		const current = groups.at(-1);
		if (current && current.label === label) {
			current.items.push(item);
		} else {
			groups.push({ label, items: [item] });
		}
	}
	return groups;
}

export function coverageTotals(
	roles: readonly Pick<ResponsibilityRole, 'neededCount' | 'activeCount'>[]
): ResponsibilityCoverageTotals {
	let active = 0;
	let needed = 0;
	let openSlots = 0;
	let anyShort = false;
	let anyOver = false;
	for (const role of roles) {
		active += role.activeCount;
		needed += role.neededCount;
		if (role.activeCount < role.neededCount) {
			anyShort = true;
			openSlots += role.neededCount - role.activeCount;
		} else if (role.activeCount > role.neededCount) {
			anyOver = true;
		}
	}
	const filledFraction = needed === 0 ? 1 : Math.min(1, active / needed);
	const status: ResponsibilityDateStatus = anyShort
		? active === 0
			? 'empty'
			: 'underfilled'
		: anyOver
			? 'overfilled'
			: 'covered';
	return { active, needed, openSlots, filledFraction, status };
}

/** Every distinct name worth suggesting back to someone typing a name into
 * a plain text field -- current members, plus everyone who's ever shown up
 * in a responsibility signup or a carpool post for this group. Helps a
 * repeat volunteer/guest get suggested their own name consistently (same
 * spelling every time) instead of typing a near-miss variant that reads as
 * a different person -- particularly for a guest, since the B21 name-match
 * reconnect flow (`join/[code]/+page.svelte`) keys off an exact name
 * match. Shared by the member Responsibilities tab's admin "assign by
 * name" field (members + responsibilities, no carpool -- a member page has
 * no carpool posts of its own to read) and the guest join page (
 * responsibilities + carpool, no members -- a guest page never exposes the
 * member roster at all, so this must not either). */
export function collectKnownNames(sources: {
	members?: readonly { name: string }[];
	responsibilities?: readonly {
		schedules: readonly { roles: readonly { signups: readonly { name: string }[] }[] }[];
	}[];
	carpoolPosts?: readonly { display_name: string }[];
}): string[] {
	const names = new Set<string>();
	for (const mem of sources.members ?? []) names.add(mem.name);
	for (const date of sources.responsibilities ?? []) {
		for (const schedule of date.schedules) {
			for (const role of schedule.roles) {
				for (const signup of role.signups) {
					if (signup.name) names.add(signup.name);
				}
			}
		}
	}
	for (const post of sources.carpoolPosts ?? []) {
		if (post.display_name) names.add(post.display_name);
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}
