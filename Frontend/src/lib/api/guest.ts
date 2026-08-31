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

export interface GuestResponsibilityDate {
	id: string;
	scheduleName: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	roles: GuestResponsibilityRoleCoverage[];
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

interface GuestResponsibilityDateResponse {
	id: string;
	schedule_name: string;
	date: string;
	notes: string;
	locked: boolean;
	canceled: boolean;
	roles: GuestResponsibilityRoleCoverageResponse[];
}

interface GuestWeeklyNoteResponse {
	id: string;
	title: string;
	body: string;
	note_date: string;
}

interface GuestRequestOptions {
	password?: string;
	fetchFn?: typeof fetch;
}

function guestUrl(path: string, password?: string): string {
	const url = new URL(`${PUBLIC_API_BASE_URL}${path}`);
	if (password) url.searchParams.set('password', password);
	return url.toString();
}

/** Wraps the raw `fetch` call so a genuine network failure (Backend down,
 * DNS/connection error — `fetch` itself throwing rather than resolving to
 * any response) surfaces as the same `GuestApiError` shape every caller
 * already knows how to handle, instead of an unhandled exception. Distinct
 * from a resolved-but-non-2xx response, which callers check via `res.ok`/
 * `res.status` themselves afterward (which is why this stays a thin wrapper
 * over `fetchOr503` and not the shared `makeCall`). */
async function guestFetch(url: string, fetchFn: typeof fetch): Promise<Response> {
	return fetchOr503(GuestApiError, url, undefined, fetchFn);
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
export async function resolveJoinCode(code: string, { password, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestGroup> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}`, password), fetchFn);
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
export async function listGuestHomework(code: string, { password, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestHomework[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/homework`, password), fetchFn);
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
	{ password, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestResponsibilityDate[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/responsibilities/dates`, password), fetchFn);
	if (res.status === 401) throw new GuestPasswordRequiredError();
	if (!res.ok) throw new GuestApiError(res.status, m.errors_request_failed({ status: res.status }));

	const body: GuestResponsibilityDateResponse[] = await res.json();
	return body.map((d) => ({
		id: d.id,
		scheduleName: d.schedule_name,
		date: d.date,
		notes: d.notes,
		locked: d.locked,
		canceled: d.canceled,
		roles: d.roles.map((r) => ({
			roleId: r.role_id,
			roleName: r.role_name,
			neededCount: r.needed_count,
			activeCount: r.active_count,
			status: r.status
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
	{ password, fetchFn = fetch }: GuestRequestOptions = {}
): Promise<GuestWeeklyNote[]> {
	const res = await guestFetch(guestUrl(`/guest/${encodeURIComponent(code)}/weekly-notes`, password), fetchFn);
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
