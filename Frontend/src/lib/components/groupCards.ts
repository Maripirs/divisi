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
