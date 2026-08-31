import { ApiError, jsonInit, makeCall } from './client';

/** Freehand pen strokes, stamps, and text drawn on a piece's PDF pages, rendered by
 * `PdfView.svelte`. Calls
 * `routes/piece/[id]/markup/**`'s authenticated proxy routes, same
 * session-stays-server-side pattern as `$lib/api/annotations.ts`. `x`/`y`/
 * `points` are fractions of the PDF page's own rendered width — see
 * `app.db.models.PieceMarkupMark`'s doc comment for why. */
export type MarkKind = 'stroke' | 'stamp' | 'text';
export type MarkupScope = 'mine' | 'group';

export interface MarkupMark {
	id: string;
	userId: string;
	pieceId: string;
	pageNumber: number;
	kind: MarkKind;
	color: string;
	width: number | null;
	points: [number, number][] | null;
	stampType: string | null;
	x: number | null;
	y: number | null;
	text: string | null;
	createdAt: string;
}

interface MarkupMarkResponse {
	id: string;
	user_id: string;
	piece_id: string;
	page_number: number;
	kind: MarkKind;
	color: string;
	width: number | null;
	points: [number, number][] | null;
	stamp_type: string | null;
	x: number | null;
	y: number | null;
	text: string | null;
	created_at: string;
}

export interface MarkupMarkPatch {
	color?: string;
	width?: number;
	text?: string;
	x?: number;
	y?: number;
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
		pageNumber: body.page_number,
		kind: body.kind,
		color: body.color,
		width: body.width,
		points: body.points,
		stampType: body.stamp_type,
		x: body.x,
		y: body.y,
		text: body.text,
		createdAt: body.created_at
	};
}

export async function listMarks(pieceId: string, scope: MarkupScope = 'mine'): Promise<MarkupMark[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup?scope=${scope}`);
	const body = (await res.json()) as MarkupMarkResponse[];
	return body.map(toMark);
}

export async function createStroke(
	pieceId: string,
	pageNumber: number,
	color: string,
	width: number,
	points: [number, number][]
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'stroke', color, width, points })
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
	y: number
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'stamp', color, width, stamp_type: stampType, x, y })
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
	y: number
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'text', color, width, text, x, y })
	);
	return toMark(await res.json());
}

export async function updateMark(pieceId: string, markId: string, patch: MarkupMarkPatch): Promise<MarkupMark> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup/${markId}`, jsonInit('PATCH', patch));
	return toMark(await res.json());
}

export async function deleteMark(pieceId: string, markId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/markup/${markId}`, { method: 'DELETE' });
}
