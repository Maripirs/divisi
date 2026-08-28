import { PUBLIC_API_BASE_URL } from '$env/static/public';

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
}

export interface GuestGroup {
	groupName: string;
	pieces: GuestPiece[];
}

/** Mirrors the Backend's `HomeworkOut` (B9), as seen via the guest B10
 * `/guest/{code}/homework` route — only returned at all when the group's
 * admin opted into `guest_homework_visible`. */
export interface GuestHomework {
	id: string;
	pieceId: string | null;
	title: string;
	range: string;
	instructions: string;
	dueDate: string | null;
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
export class GuestApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'GuestApiError';
	}
}

interface GuestPieceResponse {
	piece_id: string;
	title: string;
	version_id: string;
	distributed_at: string;
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

interface GuestRequestOptions {
	password?: string;
	fetchFn?: typeof fetch;
}

function guestUrl(path: string, password?: string): string {
	const url = new URL(`${PUBLIC_API_BASE_URL}${path}`);
	if (password) url.searchParams.set('password', password);
	return url.toString();
}

async function throwForStatus(res: Response, code: string): Promise<never> {
	if (res.status === 404) throw new JoinCodeNotFoundError(code);
	if (res.status === 401) throw new GuestPasswordRequiredError();
	throw new GuestApiError(res.status, `Guest API returned ${res.status}`);
}

/** Resolves a group's join code (see Backend `app/core/join_codes.py`) to
 * its name and currently-distributed pieces. Unauthenticated — no cookie/
 * token sent or required (a `password` is only needed if the group's admin
 * set one via B10). */
export async function resolveJoinCode(code: string, { password, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestGroup> {
	const res = await fetchFn(guestUrl(`/guest/${encodeURIComponent(code)}`, password));
	if (!res.ok) await throwForStatus(res, code);

	const body: GuestGroupResponse = await res.json();
	return {
		groupName: body.group_name,
		pieces: body.pieces.map((p) => ({
			pieceId: p.piece_id,
			title: p.title,
			versionId: p.version_id,
			distributedAt: p.distributed_at
		}))
	};
}

/** B10: a group's homework, guest-visible only when its admin opted into
 * `guest_homework_visible`. Only call this after `resolveJoinCode` has
 * already confirmed the code (and password, if any) are good — a 404 here
 * means "this group doesn't expose homework to guests" (a `GuestApiError`
 * with `status === 404`), which callers should treat as "no homework tab"
 * rather than a real error. */
export async function listGuestHomework(code: string, { password, fetchFn = fetch }: GuestRequestOptions = {}): Promise<GuestHomework[]> {
	const res = await fetchFn(guestUrl(`/guest/${encodeURIComponent(code)}/homework`, password));
	if (res.status === 401) throw new GuestPasswordRequiredError();
	if (!res.ok) throw new GuestApiError(res.status, `Guest API returned ${res.status}`);

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
