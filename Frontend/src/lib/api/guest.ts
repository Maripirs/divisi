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

/** Mirrors the Backend's `ResponsibilityGuestRoleCoverageOut`/
 * `ResponsibilityGuestDateOut` (B13), as seen via the guest
 * `/guest/{code}/responsibilities/dates` route — coverage numbers only, no
 * signup identities (see the Backend route's own note on why). Only
 * returned at all when the group's admin has enabled the `responsibilities`
 * page for guests, same B12 mechanism as homework above. */
export interface GuestResponsibilityRoleCoverage {
	roleId: string;
	roleName: string;
	neededCount: number;
	activeCount: number;
	status: string;
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

/** B10: the group has a guest password set and none (or the wrong one) was
 * given — distinct from `JoinCodeNotFoundError` so the UI can prompt for a
 * password instead of saying the code itself is wrong. */
export class GuestPasswordRequiredError extends Error {
	constructor() {
		super('This group requires a password');
		this.name = 'GuestPasswordRequiredError';
	}
}

/** Any other non-2xx response from the guest API (rate-limited, server
 * error, etc.) — distinct from the two errors above so callers can show
 * "check your code"/"enter a password" only for the cases actually about
 * those. */
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
}

interface GuestHomeworkResponse {
	id: string;
	piece_id: string | null;
	title: string;
	range: string;
	instructions: string;
	due_date: string | null;
}

interface GuestResponsibilityRoleCoverageResponse {
	role_id: string;
	role_name: string;
	needed_count: number;
	active_count: number;
	status: string;
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
	password?: string;
	/** An opaque signed guest token (from the per-group httpOnly cookie,
	 * `$lib/server/guestSession.ts`), read server-side and threaded through
	 * here. Supplying it is equivalent to supplying the right `?password=`;
	 * a group with no guest password ignores both. This is how a
	 * password-protected group's guest routes stay reachable without ever
	 * putting the password in a browser-visible URL. */
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
	if (res.status === 401) throw new GuestPasswordRequiredError();
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
		}))
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
	if (res.status === 401) throw new GuestPasswordRequiredError();
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
	if (res.status === 401) throw new GuestPasswordRequiredError();
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
				status: r.status
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
	if (res.status === 401) throw new GuestPasswordRequiredError();
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
	if (res.status === 401) throw new GuestPasswordRequiredError();
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestPieceRehearsalNoteResponse[] = await res.json();
	return body.map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at }));
}
