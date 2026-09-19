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
 * `guest_homework_visible` flag — one row per page, always all 6 (B31 added
 * `carpool`, promoted from the generic `GroupCustomPage` system, its one and
 * only template, to a built-in page like every other one here). */
export type GroupPage = 'homework' | 'tracks' | 'members' | 'about' | 'responsibilities' | 'weekly_notes' | 'carpool';
export type PageAudience = 'members' | 'everyone';
/** B19: whether a shared *write* on this page requires a Saved account.
 * `anyone` (default) lets an anonymous local-only participant act;
 * `saved` makes the Backend answer a `SAVE_REQUIRED:` 403. Reads are
 * unaffected either way. F23 only consumes this gate; the admin toggle to
 * set it is out of F23 scope. */
export type PageMinIdentity = 'anyone' | 'saved';

export interface GroupPageSettingOut {
	page: GroupPage;
	enabled: boolean;
	audience: PageAudience;
	min_identity: PageMinIdentity;
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
	 * e.g. "Soprano 2, Section leader" — admin-editable, null means unset. */
	title: string | null;
	/** B19: true for a local-only participant who signed up for something
	 * but has not Saved an account yet. The roster shows an "unverified"
	 * badge for these. */
	is_anonymous: boolean;
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

/** Backlog: a group's stable link list (rehearsal playlist, member portal,
 * shared drive folder, a standing join link, ...) — a small reference list,
 * not a dated feed like `WeeklyNoteOut` above. Read access rides along with
 * the group's `about` page gate rather than a page setting of its own (see
 * the Backend's `GroupResource` model docstring). */
export interface GroupResourceOut {
	id: string;
	group_id: string;
	label: string;
	url: string;
	created_by: string | null;
	created_at: string;
}

export type CarpoolEventStatus = 'open' | 'locked' | 'archived';

/** B24/F28: one dated carpool occurrence on the group's built-in carpool
 * page. B31 promoted carpool from a carpool-template `GroupCustomPage` (the
 * generic system's one and only template) to a built-in `GroupPage`, so this
 * is now scoped directly to `group_id` rather than a custom page's own id.
 *
 * B26/F32: `is_standing` marks the one group-scoped, non-dated board every
 * group's carpool page now bootstraps on first view; `starts_at`/`destination_label`
 * are `null` on that row and required (never `null`) on every dated one.
 *
 * B29/F35: `destination_latitude`/`destination_longitude`/`destination_place_id`
 * are the rehearsal venue's pin, optional (most events won't have one) and
 * never privacy-rounded by the Backend (unlike a `CarpoolPostOut`'s
 * `origin_*` below): this is a fixed, admin-chosen venue, not someone's home
 * area. Rendered by `CarpoolMap.svelte`. */
export interface CarpoolEventOut {
	id: string;
	group_id: string;
	title: string;
	starts_at: string | null;
	destination_label: string | null;
	destination_latitude: number | null;
	destination_longitude: number | null;
	destination_place_id: string | null;
	is_standing: boolean;
	status: CarpoolEventStatus;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export type CarpoolPostKind = 'driver' | 'rider';
export type CarpoolPostStatus = 'open' | 'hidden' | 'cancelled';
/** B32: which leg of the trip a post covers. `round_trip` (the default for
 * an old client that doesn't send one) matches either direction filter on
 * `GET .../posts?direction=`, alongside its own exact-direction match. */
export type CarpoolPostDirection = 'there' | 'back' | 'round_trip';
/** B29/F35: how precisely `origin_latitude`/`origin_longitude` may be
 * trusted. `approximate` (the default whenever coordinates are sent with no
 * explicit `exact`) means the Backend has already rounded them to roughly a
 * 1.1km grid server-side, regardless of what the client originally sent;
 * `exact` means the poster opted in to sharing their real pin. `null` means
 * no coordinates at all. The Frontend never rounds anything itself, it only
 * ever picks which of these to request via the "share exact location"
 * checkbox (unchecked, i.e. `approximate`, by default). */
export type CarpoolLocationPrecision = 'exact' | 'approximate';

/** B27: one seat claim against a driver's `CarpoolPost`. `user_id` is the
 * claimant (a real member or an anonymous participant, same actor shapes
 * `CarpoolPostOut.user_id` already carries). */
export interface CarpoolSeatClaimOut {
	id: string;
	user_id: string;
	display_name: string;
	created_at: string;
}

/** B30: the rider-post mirror of `CarpoolSeatClaimOut` — one driver
 * expressing interest in a rider's `CarpoolPost`. Same shape, same actor
 * possibilities (`user_id` is a real member or an anonymous participant). */
export interface CarpoolRiderInterestOut {
	id: string;
	user_id: string;
	display_name: string;
	created_at: string;
}

/** B24/F28: one member's ride offer/request against a `CarpoolEvent`.
 * `seats_total`/`seats_available`/`leave_time_text` are null for a rider
 * post; a driver post always has the first two set. `display_name` is
 * captured at post time, not resolved live from the user.
 *
 * B27: `seats_available` is now computed by the Backend from active claims
 * (no longer client-settable, see `carpool.ts`'s create/edit bodies), and
 * `claims` carries the driver post's current claimants; always empty for a
 * rider post.
 *
 * B29/F35: `origin_latitude`/`origin_longitude`/`origin_place_id` are a
 * driver/rider's home-area pin, optional (most posts won't have one).
 * `origin_precision` says how trustworthy the coordinates are; see that
 * type's own doc comment for the privacy-rounding rule. Rendered by
 * `CarpoolMap.svelte`.
 *
 * B30: `contact_phone` is already visibility-gated by the Backend
 * (`app.services.carpool.serialize_post`) before it ever reaches here —
 * `null` unless this viewer is the post's own owner, a group admin, or a
 * matched counterparty (a rider who claimed a driver's seat, or a driver
 * who expressed interest in a rider's post). The Frontend never re-derives
 * that check itself, it just renders whatever it got, same as
 * `origin_label`/`notes`. `interests` is the rider-post mirror of `claims`:
 * a rider post's active interests (always empty for a driver post, which
 * can't have interest expressed in it, same as `claims` always being empty
 * for a rider post). */
export interface CarpoolPostOut {
	id: string;
	event_id: string;
	user_id: string;
	display_name: string;
	kind: CarpoolPostKind;
	status: CarpoolPostStatus;
	direction: CarpoolPostDirection;
	origin_label: string;
	origin_latitude: number | null;
	origin_longitude: number | null;
	origin_place_id: string | null;
	origin_precision: CarpoolLocationPrecision | null;
	seats_total: number | null;
	seats_available: number | null;
	leave_time_text: string | null;
	notes: string | null;
	contact_phone: string | null;
	// B33: the email mirror of `contact_phone`, same "already visibility-
	// gated, render whatever came back" contract.
	contact_email: string | null;
	claims: CarpoolSeatClaimOut[];
	interests: CarpoolRiderInterestOut[];
	created_at: string;
	updated_at: string;
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
	/** Id of this piece's open working draft (a `status: draft`,
	 * `source: modification` `PieceVersion`), if any -- produced by either
	 * "Generate lyrics from PDF" (`app/api/routes/library/lyrics.py`) or
	 * "AI edit" (`app/api/routes/library/edit.py`), left unpublished for an
	 * admin to review at `piece/[id]/review` before it goes live.
	 * Null when nothing's pending. See `working_draft`/
	 * `pending_generated_version_id` in `Backend/app/services/pieces.py`. */
	pending_generated_version_id: string | null;
}

/** One `PieceVersion`, as returned by version-lifecycle routes
 * (`POST .../generate-lyrics`, `.../submit`, `.../approve`, `.../reject`,
 * `.../publish`) -- see `Backend/app/api/schemas/library.py`'s
 * `PieceVersionOut`. Narrow: only the fields this app's frontend
 * actually reads. */
export interface PieceVersionOut {
	id: string;
	piece_id: string;
	status: VersionStatus;
	source: VersionSource;
}
