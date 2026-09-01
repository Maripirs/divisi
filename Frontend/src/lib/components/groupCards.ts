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

export interface ResponsibilityDateCardItem {
	id: string;
	scheduleName: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	roles: ResponsibilityRole[];
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
