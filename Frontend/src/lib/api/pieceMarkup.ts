import { ApiError, jsonInit, makeCall } from './client';

/** Freehand pen strokes, stamps, and text drawn on a piece's PDF pages, rendered by
 * `PdfView.svelte`. Calls
 * `routes/piece/[id]/markup/**`'s authenticated proxy routes, same
 * session-stays-server-side pattern as `$lib/api/annotations.ts`. `x`/`y`/
 * `points` are fractions of the PDF page's own rendered width — see
 * `app.db.models.PieceMarkupMark`'s doc comment for why. */
export type MarkKind = 'stroke' | 'stamp' | 'text' | 'cue';
/** `personal`: the caller's own marks. `group`: the shared director layer on
 * a group-owned piece (any member reads it, any owning-group admin edits it,
 * see Backend B17). */
export type MarkupScope = 'personal' | 'group';

export interface MarkupMark {
	id: string;
	userId: string;
	pieceId: string;
	scope: MarkupScope;
	pageNumber: number;
	kind: MarkKind;
	color: string;
	width: number | null;
	points: [number, number][] | null;
	stampType: string | null;
	x: number | null;
	y: number | null;
	text: string | null;
	/** F22 / Backend B18: milliseconds into the reference recording a
	 * `kind: 'cue'` marker seeks to. `null` for every other kind. */
	timeMs: number | null;
	createdAt: string;
}

interface MarkupMarkResponse {
	id: string;
	user_id: string;
	piece_id: string;
	scope: MarkupScope;
	page_number: number;
	kind: MarkKind;
	color: string;
	width: number | null;
	points: [number, number][] | null;
	stamp_type: string | null;
	x: number | null;
	y: number | null;
	text: string | null;
	time_ms: number | null;
	created_at: string;
}

export interface MarkupMarkPatch {
	color?: string;
	width?: number;
	text?: string;
	x?: number;
	y?: number;
	/** F22: re-time a cue. Sent to the Backend as `time_ms`. */
	timeMs?: number;
}

export class MarkupApiError extends ApiError {
	constructor(status: number, message: string) {
		super(status, message);
		this.name = 'MarkupApiError';
	}
}

const call = makeCall(MarkupApiError);

function toMark(body: MarkupMarkResponse): MarkupMark {
	return {
		id: body.id,
		userId: body.user_id,
		pieceId: body.piece_id,
		scope: body.scope,
		pageNumber: body.page_number,
		kind: body.kind,
		color: body.color,
		width: body.width,
		points: body.points,
		stampType: body.stamp_type,
		x: body.x,
		y: body.y,
		text: body.text,
		timeMs: body.time_ms,
		createdAt: body.created_at
	};
}

export async function listMarks(pieceId: string, scope: MarkupScope = 'personal'): Promise<MarkupMark[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup?scope=${scope}`);
	const body = (await res.json()) as MarkupMarkResponse[];
	return body.map(toMark);
}

/** F22: the cue subset of a piece's shared `group` (director) markup layer,
 * loaded unconditionally for the PDF player — cue glyphs render for every
 * viewer whenever the reference recording is the audio source, not gated
 * behind the "Show director markup" toggle the rest of that layer sits under.
 * Passing `guestCode` (a group join code) routes the request through the
 * markup proxy's guest branch, so a not-logged-in join-link viewer gets them
 * too (the group's guest token is injected server-side). */
export async function listGroupCues(pieceId: string, guestCode?: string): Promise<MarkupMark[]> {
	const suffix = guestCode ? `&code=${encodeURIComponent(guestCode)}` : '';
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup?scope=group${suffix}`);
	const body = (await res.json()) as MarkupMarkResponse[];
	return body.map(toMark).filter((mark) => mark.kind === 'cue');
}

export async function createStroke(
	pieceId: string,
	pageNumber: number,
	color: string,
	width: number,
	points: [number, number][],
	scope: MarkupScope = 'personal'
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'stroke', color, width, points, scope })
	);
	return toMark(await res.json());
}

export async function createStamp(
	pieceId: string,
	pageNumber: number,
	color: string,
	stampType: string,
	width: number,
	x: number,
	y: number,
	scope: MarkupScope = 'personal'
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'stamp', color, width, stamp_type: stampType, x, y, scope })
	);
	return toMark(await res.json());
}

export async function createText(
	pieceId: string,
	pageNumber: number,
	color: string,
	width: number,
	text: string,
	x: number,
	y: number,
	scope: MarkupScope = 'personal'
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'text', color, width, text, x, y, scope })
	);
	return toMark(await res.json());
}

export async function createCue(
	pieceId: string,
	pageNumber: number,
	color: string,
	x: number,
	y: number,
	timeMs: number,
	scope: MarkupScope = 'personal'
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'cue', color, x, y, time_ms: timeMs, scope })
	);
	return toMark(await res.json());
}

export async function updateMark(pieceId: string, markId: string, patch: MarkupMarkPatch): Promise<MarkupMark> {
	const { timeMs, ...rest } = patch;
	const body: Record<string, unknown> = { ...rest };
	if (timeMs !== undefined) body.time_ms = timeMs;
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup/${markId}`, jsonInit('PATCH', body));
	return toMark(await res.json());
}

export async function deleteMark(pieceId: string, markId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/markup/${markId}`, { method: 'DELETE' });
}
