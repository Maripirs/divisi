import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';
import { ApiError, fetchOr503 } from './client';

/** Mirrors the Backend's `GuestPieceOut`/`GuestGroupOut` (B6) — one of a
 * group's currently-distributed pieces, as seen by an unauthenticated guest
 * via a join code. No playback data here yet: wiring this list up to real
 * audio/notation (B7's stems + MusicXML manifest) is backlogged — see
 * Frontend/plan.md's F2 note. */
export interface GuestPiece {
	pieceId: string;
	title: string;
	versionId: string;
	distributedAt: string;
	composer: string | null;
	youtubeUrl: string | null;
	/** Admin-set default playback tempo (BPM), same field the member
	 * Tracks tab rides via its `?defaultTempo=` query param on the
	 * practice link — see `TracksTab.svelte`'s `tempoQuery`. */
	defaultTempoBpm: number | null;
	hasMusic: boolean;
	hasPdf: boolean;
}

export interface GuestGroup {
	groupName: string;
	pieces: GuestPiece[];
	/** B20: true only for the one group `Settings.demo_join_code` names on
	 * the Backend (the public demo choir). Gates the Settings drawer's
	 * "Preview Admin" entry point (F24). `false` for every other group. */
	adminPreviewAvailable: boolean;
}

/** Mirrors the Backend's `HomeworkOut` (B9), as seen via the guest
 * `/guest/{code}/homework` route — only returned at all when the group's
 * admin has enabled the `homework` page for guests (B12's per-page
 * settings, superseding B10's original `guest_homework_visible` flag). */
export interface GuestHomework {
	id: string;
	pieceId: string | null;
	title: string;
	range: string;
	instructions: string;
	dueDate: string | null;
}

/** Mirrors the Backend's `ResponsibilityGuestSignupOut` (B13): a guest's
 * view of one signup, name only, deliberately no email/userId (see
 * `groupCards.ts`'s `ResponsibilityRoleSignup`, which the join page maps
 * this into with `userId: null` since the guest DTO has no such field). */
export interface GuestResponsibilityRoleSignup {
	id: string;
	name: string;
}

/** Mirrors the Backend's `ResponsibilityGuestRoleCoverageOut`/
 * `ResponsibilityGuestDateOut` (B13), as seen via the guest
 * `/guest/{code}/responsibilities/dates` route: the same coverage numbers
 * and signup names a member sees, just never an email or account id (the
 * Backend route's real gate is reachability itself, see
 * `require_guest_page_access`). Only returned at all when the group's admin
 * has enabled the `responsibilities` page for guests, same B12 mechanism as
 * homework above. */
export interface GuestResponsibilityRoleCoverage {
	roleId: string;
	roleName: string;
	neededCount: number;
	activeCount: number;
	status: string;
	signups: GuestResponsibilityRoleSignup[];
}

/** One role set attached to a guest-visible date. No `schedule_id` in the
 * guest DTO (the guest never acts on a role set), just its name + roles. */
export interface GuestResponsibilityDateScheduleGroup {
	scheduleName: string;
	roles: GuestResponsibilityRoleCoverage[];
}

export interface GuestResponsibilityDate {
	id: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	schedules: GuestResponsibilityDateScheduleGroup[];
}

/** Mirrors the Backend's `WeeklyNoteOut`, as seen via the guest
 * `/guest/{code}/weekly-notes` route — a history feed, not a single running
 * note. Only returned at all when the group's admin has enabled the
 * `weekly_notes` page for guests, same B12 mechanism as homework above. */
export interface GuestWeeklyNote {
	id: string;
	title: string;
	body: string;
	noteDate: string;
}

/** Mirrors the Backend's `PieceRehearsalNoteOut` (B16), as seen via the
 * guest `/guest/{code}/pieces/{pieceId}/rehearsal-notes` route — the
 * "From the director" notes, read-only. Only returned at all when the
 * group's `tracks` page is enabled *and* `audience: everyone` (B16's
 * 2026-09-02 guest expansion; deliberately a different gate from the
 * member list, which uses `weekly_notes`). Only the `body`/`created_at`
 * fields are surfaced — a piece note is just a line of text. */
export interface GuestPieceRehearsalNote {
	id: string;
	body: string;
	createdAt: string;
}

/** Mirrors the Backend's `GuestAboutOut` (B33), as seen via the guest
 * `/guest/{code}/about` route — a group's free-text description plus its
 * regular weekly rehearsal slot, the same two fields `GroupOut` carries for
 * a member, minus everything privacy/per-user-storage-shaped (`id`,
 * `join_code`, `role`, `has_guest_password`). Only returned at all when the
 * group's admin has enabled the `about` page for guests, same B12
 * mechanism as homework/weekly_notes/responsibilities/carpool above. */
export interface GuestAbout {
	description: string | null;
	rehearsalWeekday: number | null;
	rehearsalTime: string | null;
}

/** Backlog: mirrors the Backend's `GroupResourceOut`, as seen via the guest
 * `/guest/{code}/resources` route — a group's stable link list, gated the
 * same as `GuestAbout` above (the `about` page's own settings, not a page
 * of its own; see the Backend `GroupResource` model docstring). No
 * `created_by` here: unlike `GuestWeeklyNote`, a guest has no use for a
 * bare creator id on a plain link list. */
export interface GuestGroupResource {
	id: string;
	label: string;
	url: string;
}

export class JoinCodeNotFoundError extends Error {
	constructor(code: string) {
		super(`No group found for join code "${code}"`);
		this.name = 'JoinCodeNotFoundError';
	}
}

/** Any other non-2xx response from the guest API (rate-limited, server
 * error, etc.) — distinct from `JoinCodeNotFoundError` so callers can show
 * "check your code" only for that one case.
 *
 * There is no longer a "password required" variant: a valid join code
 * authorizes the guest routes on its own (the Backend's `_authorize_guest`
 * is a no-op now), so these routes never answer 401. The guest password
 * survives only at `POST /guest/{code}/auth`, used by the bare
 * `/piece/{id}` link gate (see `routes/piece/[id]/+page.server.ts`); a
 * stray 401 from anywhere else is just a `GuestApiError` -> the generic
 * "try again" card. */
export class GuestApiError extends ApiError {
	constructor(status: number, message: string) {
		super(status, message);
		this.name = 'GuestApiError';
	}
}

interface GuestPieceResponse {
	piece_id: string;
	title: string;
	version_id: string;
	distributed_at: string;
	composer: string | null;
	youtube_url: string | null;
	default_tempo_bpm: number | null;
	has_music: boolean;
	has_pdf: boolean;
}

interface GuestGroupResponse {
	group_name: string;
	pieces: GuestPieceResponse[];
	admin_preview_available: boolean;
}

interface GuestHomeworkResponse {
	id: string;
	piece_id: string | null;
	title: string;
	range: string;
	instructions: string;
	due_date: string | null;
}

interface GuestResponsibilityRoleSignupResponse {
	id: string;
	name: string;
}

interface GuestResponsibilityRoleCoverageResponse {
	role_id: string;
	role_name: string;
	needed_count: number;
	active_count: number;
	status: string;
	signups: GuestResponsibilityRoleSignupResponse[];
}

interface GuestResponsibilityDateScheduleGroupResponse {
	schedule_name: string;
	roles: GuestResponsibilityRoleCoverageResponse[];
}

interface GuestResponsibilityDateResponse {
	id: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	schedules: GuestResponsibilityDateScheduleGroupResponse[];
}

interface GuestWeeklyNoteResponse {
	id: string;
	title: string;
	body: string;
	note_date: string;
}

interface GuestPieceRehearsalNoteResponse {
	id: string;
	body: string;
	created_at: string;
}

interface GuestAboutResponse {
	description: string | null;
	rehearsal_weekday: number | null;
	rehearsal_time: string | null;
}

interface GuestGroupResourceResponse {
	id: string;
	label: string;
	url: string;
}

interface GuestRequestOptions {
	/** Legacy `?password=` param. The guest routes no longer check it (a
	 * valid join code authorizes on its own), so nothing passes this any
	 * more; kept only so the `guestUrl` signature and call sites don't
	 * churn. The password now lives solely at `POST /guest/{code}/auth`. */
	password?: string;
	/** An opaque signed guest token (from the per-group httpOnly cookie,
	 * `$lib/server/guestSession.ts`), read server-side and threaded through
	 * here. Harmless to send and harmless to omit: the guest routes accept
	 * the join code alone now, and simply ignore this. Retained so the
	 * cookie set by `POST /guest/{code}/auth` (the no-`?code=` piece-link
	 * gate) still gets forwarded rather than silently dropped. */
	token?: string;
	fetchFn?: typeof fetch;
}

function guestUrl(path: string, { password, token }: { password?: string; token?: string } = {}): string {
	const url = new URL(`${PUBLIC_API_BASE_URL}${path}`);
	// `token` is the browser-safe path (nothing sensitive in the URL);
	// `password` is still accepted for the very first server-side exchange
	// but is no longer built into anything the browser sees.
	if (token) url.searchParams.set('token', token);
	if (password) url.searchParams.set('password', password);
	return url.toString();
}

/** Hard ceiling on a single guest API call, mirroring
 * `$lib/server/backend.ts`'s `BACKEND_TIMEOUT_MS`. Without it, an SSR
 * `load` (this module's main caller) hitting a cold-started Render free
 * instance sits on the `fetch` for 30s+, holding the Cloudflare Worker's
 * SSR response open until an upstream proxy/browser gives up with an
 * opaque "can't reach the site" error. Past this we bail and surface the
 * same synthetic 503 a flat network failure produces, which `+page.ts`
 * already renders as a clean "try again" card. */
const GUEST_TIMEOUT_MS = 20_000;

/** Wraps the raw `fetch` call so a genuine network failure (Backend down,
 * DNS/connection error, or our own timeout above firing — `fetch` itself
 * throwing rather than resolving to any response) surfaces as the same
 * `GuestApiError` shape every caller already knows how to handle, instead
 * of an unhandled exception. Distinct from a resolved-but-non-2xx
 * response, which callers check via `res.ok`/`res.status` themselves
 * afterward (which is why this stays a thin wrapper over `fetchOr503` and
 * not the shared `makeCall`). */
async function guestFetch(url: string, fetchFn: typeof fetch, headers?: Record<string, string>): Promise<Response> {
	return fetchOr503(GuestApiError, url, { signal: AbortSignal.timeout(GUEST_TIMEOUT_MS), headers }, fetchFn);
}

async function throwForStatus(res: Response, code: string): Promise<never> {
	if (res.status === 404) throw new JoinCodeNotFoundError(code);
	throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));
}

/** Resolves a group's join code (see Backend `app/core/join_codes.py`) to
 * its name and currently-distributed pieces. Unauthenticated — no cookie/
 * token sent or required (a `password` is only needed if the group's admin
 * set one via B10). */
export async function resolveJoinCode(code: string, { password, token, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestGroup> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}`, { password, token }), fetchFn);
	if (!res.ok) await throwForStatus(res, code);

	const body: GuestGroupResponse = await res.json();
	return {
		groupName: body.group_name,
		pieces: body.pieces.map((p) => ({
			pieceId: p.piece_id,
			title: p.title,
			versionId: p.version_id,
			distributedAt: p.distributed_at,
			composer: p.composer,
			youtubeUrl: p.youtube_url,
			defaultTempoBpm: p.default_tempo_bpm,
			hasMusic: p.has_music,
			hasPdf: p.has_pdf
		})),
		adminPreviewAvailable: body.admin_preview_available
	};
}

/** A group's homework, guest-visible only when its admin has enabled the
 * `homework` page for guests (B12's per-page settings). Only call this
 * after `resolveJoinCode` has
 * already confirmed the code (and password, if any) are good — a 404 here
 * means "this group doesn't expose homework to guests" (a `GuestApiError`
 * with `status === 404`), which callers should treat as "no homework tab"
 * rather than a real error. */
export async function listGuestHomework(code: string, { password, token, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestHomework[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/homework`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestHomeworkResponse[] = await res.json();
	return body.map((hw) => ({
		id: hw.id,
		pieceId: hw.piece_id,
		title: hw.title,
		range: hw.range,
		instructions: hw.instructions,
		dueDate: hw.due_date
	}));
}

/** B13: a group's responsibility dates + per-role coverage, guest-visible
 * only when its admin opted the `responsibilities` page into B12's
 * `audience: everyone`. Same "only call after `resolveJoinCode` confirmed
 * the code/password" convention as `listGuestHomework` — a 404 here means
 * "this group doesn't expose responsibilities to guests", not a real error. */
export async function listGuestResponsibilityDates(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestResponsibilityDate[]> {
	const res = await guestFetch(
		guestUrl(`/guest/${encodeURIComponent(code)}/responsibilities/dates`, { password, token }),
		fetchFn
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestResponsibilityDateResponse[] = await res.json();
	return body.map((d) => ({
		id: d.id,
		date: d.date,
		notes: d.notes,
		locked: d.locked,
		canceled: d.canceled,
		schedules: d.schedules.map((s) => ({
			scheduleName: s.schedule_name,
			roles: s.roles.map((r) => ({
				roleId: r.role_id,
				roleName: r.role_name,
				neededCount: r.needed_count,
				activeCount: r.active_count,
				status: r.status,
				signups: r.signups.map((sg) => ({ id: sg.id, name: sg.name }))
			}))
		}))
	}));
}

/** A group's weekly notes, guest-visible only when its admin has enabled the
 * `weekly_notes` page for guests (B12's per-page settings). Same "only call
 * after `resolveJoinCode` confirmed the code/password" convention as
 * `listGuestHomework` — a 404 here means "this group doesn't expose weekly
 * notes to guests", not a real error. */
export async function listGuestWeeklyNotes(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestWeeklyNote[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/weekly-notes`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestWeeklyNoteResponse[] = await res.json();
	return body.map((n) => ({
		id: n.id,
		title: n.title,
		body: n.body,
		noteDate: n.note_date
	}));
}

/** A piece's "From the director" rehearsal notes (Backend B16), guest-visible
 * only when the group's `tracks` page is enabled and `audience: everyone`.
 * Same "only call after `resolveJoinCode` confirmed the code/password"
 * convention as `listGuestHomework` — a 404 here means "this group doesn't
 * expose these notes to guests" (or the piece isn't distributed to it), not
 * a real error. */
export async function listGuestPieceRehearsalNotes(
	code: string,
	pieceId: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestPieceRehearsalNote[]> {
	const res = await guestFetch(
		guestUrl(
			`/guest/${encodeURIComponent(code)}/pieces/${encodeURIComponent(pieceId)}/rehearsal-notes`,
			{ password, token }
		),
		fetchFn
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestPieceRehearsalNoteResponse[] = await res.json();
	return body.map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at }));
}

/** A group's Info/About content (B33), guest-visible only when its admin has
 * enabled the `about` page for guests (B12's per-page settings). Same "only
 * call after `resolveJoinCode` confirmed the code/password" convention as
 * `listGuestHomework` — a 404 here means "this group doesn't expose About
 * to guests", not a real error. Read-only: there's no guest write path,
 * same restraint as `tracks`. */
export async function listGuestAbout(code: string, { password, token, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestAbout> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/about`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestAboutResponse = await res.json();
	return {
		description: body.description,
		rehearsalWeekday: body.rehearsal_weekday,
		rehearsalTime: body.rehearsal_time
	};
}

/** Backlog: a group's stable link list, guest-visible under the same
 * `about` page gate as `listGuestAbout` above. Same "only call after
 * `resolveJoinCode` confirmed the code/password" convention as every other
 * guest list here — a 404 means "this group doesn't expose About (and so
 * Resources) to guests", not a real error. */
export async function listGuestGroupResources(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestGroupResource[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/resources`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestGroupResourceResponse[] = await res.json();
	return body.map((r) => ({ id: r.id, label: r.label, url: r.url }));
}

/** Visibility booleans for a join page's optional built-in tabs. The join
 * landing page uses this first, then fetches only the visible pages' real
 * data; other callers can also use it when they only need the tab strip. */
export interface GuestTabs {
	homeworkVisible: boolean;
	weeklyNotesVisible: boolean;
	responsibilitiesVisible: boolean;
	carpoolVisible: boolean;
	aboutVisible: boolean;
	/** The group's own name, for a guest tab's `AppHeader` (same field
	 * `GuestGroup.groupName` carries on the join landing page). */
	groupName: string;
}

interface GuestTabsResponse {
	homework_visible: boolean;
	weekly_notes_visible: boolean;
	responsibilities_visible: boolean;
	carpool_visible: boolean;
	about_visible: boolean;
	group_name: string;
}

export async function getGuestTabs(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestTabs> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/tabs`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestTabsResponse = await res.json();
	return {
		homeworkVisible: body.homework_visible,
		weeklyNotesVisible: body.weekly_notes_visible,
		responsibilitiesVisible: body.responsibilities_visible,
		carpoolVisible: body.carpool_visible,
		aboutVisible: body.about_visible,
		groupName: body.group_name
	};
}

/** B24/B25: one dated carpool occurrence and one ride post, exactly the
 * Backend's own `CarpoolEventOut`/`CarpoolPostOut` shape (snake_case, no
 * camelCase remap) — unlike every other type in this file, these feed
 * `CarpoolBoard.svelte` directly (built for the member route, which passes
 * it `$lib/server/backendTypes`'s identically-shaped types), so keeping the
 * wire shape as-is here is what lets the same component render either
 * caller's data with no adapter in between. */
export interface GuestCarpoolEvent {
	id: string;
	group_id: string;
	title: string;
	starts_at: string | null;
	destination_label: string | null;
	// B29/F35: same optional venue pin as the member route's
	// `CarpoolEventOut`, mirrored verbatim (see this file's own doc comment
	// on why these carpool shapes stay snake_case, no camelCase remap).
	destination_latitude: number | null;
	destination_longitude: number | null;
	destination_place_id: string | null;
	is_standing: boolean;
	status: 'open' | 'locked' | 'archived';
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

/** B27: same `CarpoolSeatClaimOut` shape `$lib/server/backendTypes.ts`
 * carries for the member route, mirrored here for the same "no adapter in
 * between" reason as `GuestCarpoolPost` below.
 *
 * B34: `contact_phone`/`contact_email` are the claimant's own opt-in
 * contact info, already visibility-gated by the Backend before this
 * reaches here -- see `CarpoolSeatClaimOut`'s doc comment. */
export interface GuestCarpoolSeatClaim {
	id: string;
	user_id: string;
	display_name: string;
	contact_phone: string | null;
	contact_email: string | null;
	created_at: string;
}

/** B30: same `CarpoolRiderInterestOut` shape `$lib/server/backendTypes.ts`
 * carries for the member route, mirrored here for the same "no adapter in
 * between" reason as `GuestCarpoolSeatClaim` above.
 *
 * B34: same gated `contact_phone`/`contact_email` as `GuestCarpoolSeatClaim`. */
export interface GuestCarpoolRiderInterest {
	id: string;
	user_id: string;
	display_name: string;
	contact_phone: string | null;
	contact_email: string | null;
	created_at: string;
}

export interface GuestCarpoolPost {
	id: string;
	event_id: string;
	user_id: string;
	display_name: string;
	kind: 'driver' | 'rider';
	status: 'open' | 'hidden' | 'cancelled';
	// B32/F37: which leg of the trip this post covers, same
	// `CarpoolPostDirection` shape the member route's `CarpoolPostOut`
	// carries.
	direction: 'there' | 'back' | 'round_trip';
	origin_label: string;
	// B29/F35: same optional home-area pin as the member route's
	// `CarpoolPostOut`, mirrored verbatim for the same "no adapter in
	// between" reason as everything else in this interface.
	origin_latitude: number | null;
	origin_longitude: number | null;
	origin_place_id: string | null;
	origin_precision: 'exact' | 'approximate' | null;
	seats_total: number | null;
	seats_available: number | null;
	leave_time_text: string | null;
	notes: string | null;
	// B30: already visibility-gated by the Backend (`serialize_post`) — see
	// `CarpoolPost.contact_phone`'s docstring. `null` unless this viewer is
	// the post's own owner or a matched counterparty.
	contact_phone: string | null;
	// B33: the email mirror of `contact_phone`, same already-gated contract.
	contact_email: string | null;
	claims: GuestCarpoolSeatClaim[];
	// B30: a rider post's active interests, same shape as `claims`; always
	// empty for a driver post.
	interests: GuestCarpoolRiderInterest[];
	created_at: string;
	updated_at: string;
}

/** B31: reached directly by join code (no more slug indirection through a
 * `GroupCustomPage`) — a 404 here means the group's admin hasn't enabled
 * guest visibility on the `carpool` page, the same "opted out" signal
 * `listGuestHomework`/`listGuestResponsibilityDates`/`listGuestWeeklyNotes`
 * already give. */
export async function listGuestCarpoolEvents(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestCarpoolEvent[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/carpool/events`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));
	return res.json();
}

/** B30: `participantCookieHeader` is the one extra thing this call needs
 * beyond every other guest list here — a `Cookie: divisi_participant=...`
 * value (`$lib/server/participantSession.ts`'s `backendCookieHeader`, fed
 * from `readParticipantCookie` on the incoming SvelteKit request) so the
 * Backend can identify *which* guest is asking and decide `contact_phone`
 * visibility (`app.services.carpool.serialize_post`) accordingly. `undefined`
 * (a guest with no participant cookie yet at all) is the normal case for a
 * brand-new visitor — every post's `contact_phone` just comes back `null`,
 * same as it would for any other unmatched viewer. */
export async function listGuestCarpoolPosts(
	code: string,
	eventId: string,
	{
		password,
		token,
		fetchFn = fetch,
		participantCookieHeader
	}: GuestRequestOptions & { participantCookieHeader?: string } = {}
): Promise<GuestCarpoolPost[]> {
	const res = await guestFetch(
		guestUrl(`/guest/${encodeURIComponent(code)}/carpool/events/${encodeURIComponent(eventId)}/posts`, {
			password,
			token
		}),
		fetchFn,
		participantCookieHeader ? { Cookie: participantCookieHeader } : undefined
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));
	return res.json();
}
