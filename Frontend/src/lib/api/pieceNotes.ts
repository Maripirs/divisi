import { ApiError, jsonInit, makeCall } from './client';

/** F20: "Piece Notes" — short text notes pinned to a piece, shown next to
 * the music on the piece page and inside an expanded track card on a
 * group's Rehearsal Tracks tab. Two sources, kept visually distinct in the
 * panel:
 *
 *  - `group`    — a group admin's note, shown to everyone in the group
 *                 (Backend B16 `PieceRehearsalNote`; members read-only).
 *  - `personal` — the signed-in member's own private note (only they see
 *                 it). Stored as a Backend B5 `Annotation` with the
 *                 reserved position {@link PERSONAL_NOTE_POSITION} — a
 *                 "not pinned to a spot in the score" sentinel — so the
 *                 score-marker layer (`ScoreView`) skips it.
 *
 * All calls go through existing authenticated proxy routes
 * (`routes/piece/[id]/notes/**` for the group source,
 * `routes/piece/[id]/annotations/**` for the personal one), never the
 * Backend directly.
 *
 * B16's optional kind/title/page/measure/part fields are not used — a piece
 * note is just a line of text. */

export type PieceNoteSource = 'group' | 'personal';

export interface PieceNote {
	id: string;
	source: PieceNoteSource;
	body: string;
	createdAt: string;
}

/** Reserved `Annotation.position` for a personal note that isn't tied to a
 * score position. Real score annotations are always `>= 0` whole notes, so
 * `-1` can't collide; `ScoreView`'s marker list filters these out. */
export const PERSONAL_NOTE_POSITION = -1;

interface GroupNoteResponse {
	id: string;
	body: string;
	created_at: string;
}

interface AnnotationResponse {
	id: string;
	position: string;
	content: string;
	created_at: string;
}

export class PieceNoteApiError extends ApiError {
	constructor(status: number, message: string) {
		super(status, message);
		this.name = 'PieceNoteApiError';
	}
}

const call = makeCall(PieceNoteApiError);

function toGroupNote(body: GroupNoteResponse): PieceNote {
	return { id: body.id, source: 'group', body: body.body, createdAt: body.created_at };
}

function toPersonalNote(body: AnnotationResponse): PieceNote {
	return { id: body.id, source: 'personal', body: body.content, createdAt: body.created_at };
}

/* ---- Group source (Backend B16) --------------------------------------- */

/** Any member with access to the group's Weekly Notes page can list; only
 * a group admin can create/edit/delete. */
export async function listGroupNotes(pieceId: string, groupId: string): Promise<PieceNote[]> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/notes?groupId=${encodeURIComponent(groupId)}`
	);
	const body = (await res.json()) as GroupNoteResponse[];
	return body.map(toGroupNote);
}

export async function createGroupNote(
	pieceId: string,
	groupId: string,
	text: string
): Promise<PieceNote> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/notes`,
		jsonInit('POST', { groupId, body: text })
	);
	return toGroupNote(await res.json());
}

export async function updateGroupNote(
	pieceId: string,
	noteId: string,
	text: string
): Promise<PieceNote> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/notes/${encodeURIComponent(noteId)}`,
		jsonInit('PUT', { body: text })
	);
	return toGroupNote(await res.json());
}

export async function deleteGroupNote(pieceId: string, noteId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/notes/${encodeURIComponent(noteId)}`, {
		method: 'DELETE'
	});
}

/* ---- Personal source (Backend B5 annotations, position-less) ---------- */

export async function listPersonalNotes(pieceId: string): Promise<PieceNote[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/annotations`);
	const body = (await res.json()) as AnnotationResponse[];
	return body
		.filter((a) => a.position === String(PERSONAL_NOTE_POSITION))
		.map(toPersonalNote);
}

export async function createPersonalNote(pieceId: string, text: string): Promise<PieceNote> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/annotations`,
		jsonInit('POST', { position: String(PERSONAL_NOTE_POSITION), content: text })
	);
	return toPersonalNote(await res.json());
}

export async function updatePersonalNote(
	pieceId: string,
	noteId: string,
	text: string
): Promise<PieceNote> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/annotations/${encodeURIComponent(noteId)}`,
		jsonInit('PATCH', { content: text })
	);
	return toPersonalNote(await res.json());
}

export async function deletePersonalNote(pieceId: string, noteId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/annotations/${encodeURIComponent(noteId)}`, {
		method: 'DELETE'
	});
}
