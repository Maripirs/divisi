/** Raw (snake_case) shapes returned by the Backend's authenticated JSON API
 * — mirrors `Backend/app/api/schemas.py`. Each route maps these to whatever
 * view shape its template wants, same convention `$lib/api/guest.ts` uses
 * for the unauthenticated guest routes. */

export type GroupRole = 'admin' | 'member';
export type VersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type VersionSource = 'original' | 'modification';
export type OwnerType = 'user' | 'group';
export type OmrJobStatus = 'pending' | 'running' | 'done' | 'failed';

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
	/** Computed by the Backend, never a raw storage path — see
	 * `Backend/app/api/schemas/library.py`'s `LibraryEntryOut`. */
	has_music: boolean;
	has_pdf: boolean;
	/** Original uploaded filenames, display-only — safe to expose, unlike
	 * the storage-relative paths those booleans are computed from. */
	music_file_name: string | null;
	pdf_file_name: string | null;
	/** "Generate music from PDF" (Tracks tab): the most recent OMR job for
	 * this track, and the id of a draft version a finished job produced and
	 * that's waiting for an admin to accept or discard it. Both null when
	 * the feature was never used on this track. */
	latest_omr_job: {
		id: string;
		status: OmrJobStatus;
		error_message: string | null;
		/** B16: the job transcribed a multi-page PDF page-by-page and
		 * re-merged. `needs_review` is then true when the pages didn't all
		 * merge into one segment — the draft is a provisional guess across
		 * the unresolved page joins, which F15 surfaces as seam markers in
		 * the editor. */
		paged: boolean;
		needs_review: boolean | null;
		/** B17: best-effort "page X of Y" while a paged run is in flight;
		 * both null for a single-run job or before the paged loop starts. */
		pages_done: number | null;
		pages_total: number | null;
	} | null;
	pending_generated_version_id: string | null;
}

/** A `PieceVersion` row — mirrors `Backend/app/api/schemas/library.py`'s
 * `PieceVersionOut`. Returned by the B17 working-draft / publish endpoints. */
export interface PieceVersionOut {
	id: string;
	piece_id: string;
	created_by: string | null;
	created_at: string;
	source: VersionSource;
	status: VersionStatus;
	reviewed_by: string | null;
	reviewed_at: string | null;
}

/** `POST /library/pieces/{id}/working-draft` — the piece's single open
 * working draft. `forked_from_live` is true when this call just created it
 * by content-copying the live version (F16 badges it either way, but uses
 * this to know it's a pristine copy). Mirrors `WorkingDraftOut`. */
export interface WorkingDraftOut {
	version: PieceVersionOut;
	forked_from_live: boolean;
}

/** `POST /omr/jobs/{id}/pages/{n}/rerun` — result of re-transcribing one
 * page of a paged run. Mirrors `Backend/app/api/schemas/omr.py`'s
 * `OmrPageRerunOut`. */
export interface OmrPageRerunOut {
	ok: boolean;
	still_failed: boolean;
	measure_count: number;
	page_musicxml_url: string | null;
}

/** One row of `GET /omr/jobs` — the caller's own "Generate music from PDF"
 * jobs, newest first. Feeds the header alert (`OmrJobAlerts.svelte`) that
 * tells an admin a job they started has finished or failed while they were
 * elsewhere in the app. `piece_*`/`group_id` are null for a job never
 * tagged with a piece, or whose piece has since been deleted;
 * `pending_generated_version_id` is set once the runner auto-imported the
 * result as a draft nobody has accepted or discarded yet. Mirrors
 * `Backend/app/api/schemas/omr.py`'s `OmrJobListItemOut`. */
export interface OmrJobListItem {
	id: string;
	status: OmrJobStatus;
	error_message: string | null;
	piece_id: string | null;
	piece_title: string | null;
	group_id: string | null;
	pending_generated_version_id: string | null;
	/** B16: true when a paged run left more than one segment, i.e. the
	 * auto-imported draft has page joins a human should review. */
	needs_review: boolean | null;
	/** B17: best-effort per-page progress for a paged run in flight. */
	pages_done: number | null;
	pages_total: number | null;
	created_at: string;
	updated_at: string;
}

/** `GET /omr/jobs/{id}/paged-report` — the segment / unresolved-boundary /
 * per-page breakdown of a B16 paged run. Mirrors `app/omr/paged.py`'s
 * `PagedReport.as_dict()`, with each segment's on-disk path rewritten to a
 * download URL by the route. */
export interface PagedReport {
	total: number;
	ok: number;
	failed_pages: number[];
	needs_review: boolean;
	combined_error: string | null;
	segments: {
		index: number;
		pages: number[];
		parts: number;
		start_reason: string | null;
		/** 1-based measure number in the provisional whole-score merge where
		 * this segment begins; null for the first segment. The anchor F15
		 * maps to an onset to place a seam marker. */
		boundary_measure: number | null;
		musicxml_url: string | null;
		midi_url: string | null;
	}[];
	unresolved_boundaries: {
		before_page: number;
		merged_measure: number | null;
		reason: string | null;
	}[];
	/** B18: `start_measure` (1-based) / `measure_count` place each source
	 * page in the provisional whole-score merge, so F19's page-by-page
	 * review can scroll + highlight a page's bar range without fetching
	 * every page XML. A failed page has `measure_count === 0` and
	 * `start_measure` pointing at where it *would* begin (the "insert N
	 * bars" anchor). Both null on a report from before B18. */
	pages: {
		page: number;
		ok: boolean;
		error: string | null;
		start_measure: number | null;
		measure_count: number | null;
	}[];
}
