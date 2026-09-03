/** Raw (snake_case) shapes returned by the Backend's authenticated JSON API
 * — mirrors `Backend/app/api/schemas.py`. Each route maps these to whatever
 * view shape its template wants, same convention `$lib/api/guest.ts` uses
 * for the unauthenticated guest routes. */

import type { PiecePresentation } from '$lib/pieces/types';

export type GroupRole = 'admin' | 'member';
export type VersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type VersionSource = 'original' | 'modification';
export type OwnerType = 'user' | 'group';

export interface GroupOut {
	id: string;
	name: string;
	join_code: string;
	role: GroupRole;
	has_guest_password: boolean;
	description: string | null;
	/** A regular weekly rehearsal slot (e.g. weekday=2/"19:00" ->
	 * "Wednesdays at 7:00 PM") — no timezone stored, see the Backend
	 * `Group.rehearsal_weekday` doc comment for why. Both null means unset. */
	rehearsal_weekday: number | null;
	rehearsal_time: string | null;
}

/** B12: per-(group, page) visibility, replacing the old single
 * `guest_homework_visible` flag — one row per page, always all 5. */
export type GroupPage = 'homework' | 'tracks' | 'members' | 'about' | 'responsibilities' | 'weekly_notes';
export type PageAudience = 'members' | 'everyone';

export interface GroupPageSettingOut {
	page: GroupPage;
	enabled: boolean;
	audience: PageAudience;
}

/** B13: a named volunteer program inside a group (e.g. "Snack and rehearsal
 * support"), made up of reusable roles and concrete dates. */
export interface ResponsibilityRoleOut {
	id: string;
	schedule_id: string;
	name: string;
	needed_count: number;
}

export interface ResponsibilityScheduleOut {
	id: string;
	group_id: string;
	name: string;
	created_by: string;
	created_at: string;
	roles: ResponsibilityRoleOut[];
}

/** `user_id`/`email` are null for a signup admin-assigned to someone with
 * no Divisi account at all — `name` is always the display name either way
 * (the real member's name, or the free-text name the admin typed). */
export interface ResponsibilitySignupOut {
	id: string;
	user_id: string | null;
	name: string;
	email: string | null;
	created_at: string;
}

export type ResponsibilityCoverageStatus = 'underfilled' | 'covered' | 'overfilled';

export interface ResponsibilityRoleCoverageOut {
	role_id: string;
	role_name: string;
	needed_count: number;
	active_count: number;
	status: ResponsibilityCoverageStatus;
	signups: ResponsibilitySignupOut[];
}

/** B13 (multi-role-set dates): one role set attached to a date, with that
 * role set's coverage rows. A date can now carry several of these. */
export interface ResponsibilityDateScheduleGroupOut {
	schedule_id: string;
	schedule_name: string;
	roles: ResponsibilityRoleCoverageOut[];
}

export interface ResponsibilityDateOut {
	id: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	schedules: ResponsibilityDateScheduleGroupOut[];
}

export interface GroupMemberOut {
	user_id: string;
	email: string;
	name: string;
	role: GroupRole;
	/** Free-text context shown next to this member on the Members page,
	 * e.g. "Soprano 2 — Section leader" — admin-editable, null means unset. */
	title: string | null;
}

export interface HomeworkOut {
	id: string;
	group_id: string;
	piece_id: string | null;
	title: string;
	range: string;
	instructions: string;
	due_date: string | null;
	created_by: string;
	created_at: string;
}

/** A group admin's dated bulletin entry — a history feed, not a single
 * running note. `note_date` is the "week of" date the entry is about,
 * distinct from `created_at` (when it was actually posted). */
export interface WeeklyNoteOut {
	id: string;
	group_id: string;
	title: string;
	body: string;
	note_date: string;
	created_by: string | null;
	created_at: string;
}

export interface LibraryEntryOut {
	piece_id: string;
	title: string;
	owner_type: OwnerType;
	owner_id: string;
	version_id: string;
	version_status: VersionStatus;
	version_source: VersionSource;
	version_created_at: string;
	default_tempo_bpm: number | null;
	composer: string | null;
	youtube_url: string | null;
	/** Admin-set first-open presentation hint; null means the automatic
	 * pane-shape default. Mirrors `Piece.presentation`. */
	presentation: PiecePresentation | null;
	/** Computed by the Backend, never a raw storage path — see
	 * `Backend/app/api/schemas/library.py`'s `LibraryEntryOut`. */
	has_music: boolean;
	has_pdf: boolean;
	/** Original uploaded filenames, display-only — safe to expose, unlike
	 * the storage-relative paths those booleans are computed from. */
	music_file_name: string | null;
	pdf_file_name: string | null;
}
