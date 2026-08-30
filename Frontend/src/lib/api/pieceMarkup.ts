import { m } from '$lib/paraglide/messages';

/** Freehand pen strokes + stamps drawn on a piece's PDF pages — personal
 * only (no sharing), rendered by `PdfView.svelte`. Calls
 * `routes/piece/[id]/markup/**`'s authenticated proxy routes, same
 * session-stays-server-side pattern as `$lib/api/annotations.ts`. `x`/`y`/
 * `points` are fractions (0-1) of the PDF page's own rendered width/height
 * — see `app.db.models.PieceMarkupMark`'s doc comment for why. */
export type MarkKind = 'stroke' | 'stamp';

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
	created_at: string;
}

export class MarkupApiError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MarkupApiError';
	}
}

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
		createdAt: body.created_at
	};
}

async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { detail?: string };
		if (body.detail) return body.detail;
	} catch {
		// Non-JSON error body (e.g. the proxy's bare 401/503) — fall through.
	}
	return m.errors_request_failed({ status: res.status });
}

async function call(url: string, init?: RequestInit): Promise<Response> {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch {
		throw new MarkupApiError(503, m.errors_could_not_reach_server());
	}
	if (!res.ok) throw new MarkupApiError(res.status, await errorDetail(res));
	return res;
}

function jsonInit(method: string, body: unknown): RequestInit {
	return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listMarks(pieceId: string): Promise<MarkupMark[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/markup`);
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
	x: number,
	y: number
): Promise<MarkupMark> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/markup`,
		jsonInit('POST', { page_number: pageNumber, kind: 'stamp', color, stamp_type: stampType, x, y })
	);
	return toMark(await res.json());
}

export async function deleteMark(pieceId: string, markId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/markup/${markId}`, { method: 'DELETE' });
}
