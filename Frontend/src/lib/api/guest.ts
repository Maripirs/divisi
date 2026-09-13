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
async function guestFetch(url: string, fetchFn: typeof fetch): Promise<Response> {
	return fetchOr503(GuestApiError, url, { signal: AbortSignal.timeout(GUEST_TIMEOUT_MS) }, fetchFn);
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

/** B23: one admin-created custom page (`carpool_board` is the only
 * `templateKey` today), reached by its slug rather than listed: there's no
 * guest "list every custom page" route, same gap the Backend's own comment
 * on the member-facing route describes: a page is reached via a link
 * someone shares, not a browse view. Guest-visible only when the page is
 * published *and* `audience: everyone`; a draft, archived, or members-only
 * page 404s here exactly like a disabled built-in page would. */
export interface GuestCustomPage {
	title: string;
	templateKey: 'carpool_board';
}

interface GuestCustomPageResponse {
	title: string;
	template_key: 'carpool_board';
}

export async function getGuestCustomPage(
	code: string,
	slug: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestCustomPage> {
	const res = await guestFetch(
		guestUrl(`/guest/${encodeURIComponent(code)}/pages/${encodeURIComponent(slug)}`, { password, token }),
		fetchFn
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestCustomPageResponse = await res.json();
	return { title: body.title, templateKey: body.template_key };
}

/** B25: the discovery counterpart to `getGuestCustomPage` above — every
 * published, `audience: everyone` custom page, so a guest can find one
 * without a shared slug link (fed into `/join/[code]`'s own "Pages" tab).
 * Never 404s for a valid join code (an empty array just means this group
 * has no such page yet), unlike every other guest list here. */
export interface GuestCustomPageListItem {
	id: string;
	title: string;
	slug: string;
	templateKey: 'carpool_board';
}

interface GuestCustomPageListItemResponse {
	id: string;
	title: string;
	slug: string;
	template_key: 'carpool_board';
}

export async function listGuestCustomPages(
	code: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestCustomPageListItem[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/pages`, { password, token }), fetchFn);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestCustomPageListItemResponse[] = await res.json();
	return body.map((p) => ({ id: p.id, title: p.title, slug: p.slug, templateKey: p.template_key }));
}

export interface GuestTabs {
	homeworkVisible: boolean;
	weeklyNotesVisible: boolean;
	responsibilitiesVisible: boolean;
	customPages: GuestCustomPageListItem[];
	/** The group's own name, for a guest custom page's `AppHeader` (same
	 * field `GuestGroup.groupName` carries on the join landing page) rather
	 * than that one page's own title. */
	groupName: string;
}

interface GuestTabsResponse {
	homework_visible: boolean;
	weekly_notes_visible: boolean;
	responsibilities_visible: boolean;
	custom_pages: GuestCustomPageListItemResponse[];
	group_name: string;
}

/** F31 fast-follow: `pages/[slug]/+page.server.ts` used to learn these same
 * three booleans as a side effect of calling `listGuestHomework`/
 * `listGuestWeeklyNotes`/`listGuestResponsibilityDates` and discarding the
 * result, plus a separate `listGuestCustomPages` call, four guest requests
 * just to render the tab strip. One call now, and it's the only one that
 * route needs to make beyond its own page's actual content. `/join/[code]`'s
 * own load still calls the individual list endpoints directly, since it
 * needs their real data (not just whether they're visible), not this. */
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
		customPages: body.custom_pages.map((p) => ({
			id: p.id,
			title: p.title,
			slug: p.slug,
			templateKey: p.template_key
		})),
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
	page_id: string;
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
 * between" reason as `GuestCarpoolPost` below. */
export interface GuestCarpoolSeatClaim {
	id: string;
	user_id: string;
	display_name: string;
	created_at: string;
}

export interface GuestCarpoolPost {
	id: string;
	event_id: string;
	user_id: string;
	display_name: string;
	kind: 'driver' | 'rider';
	status: 'open' | 'hidden' | 'cancelled';
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
	claims: GuestCarpoolSeatClaim[];
	created_at: string;
	updated_at: string;
}

/** Only reachable at all once `getGuestCustomPage` has already confirmed the
 * page is published, `audience: everyone`, and a carpool board — a 404 here
 * (wrong audience, or `getGuestCustomPage` skipped) is a real error, not an
 * "opted out" signal the way it is for homework/responsibilities/weekly
 * notes above. */
export async function listGuestCarpoolEvents(
	code: string,
	slug: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestCarpoolEvent[]> {
	const res = await guestFetch(
		guestUrl(`/guest/${encodeURIComponent(code)}/pages/${encodeURIComponent(slug)}/carpool/events`, {
			password,
			token
		}),
		fetchFn
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));
	return res.json();
}

export async function listGuestCarpoolPosts(
	code: string,
	eventId: string,
	{ password, token, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestCarpoolPost[]> {
	const res = await guestFetch(
		guestUrl(`/guest/${encodeURIComponent(code)}/carpool/events/${encodeURIComponent(eventId)}/posts`, {
			password,
			token
		}),
		fetchFn
	);
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));
	return res.json();
}
