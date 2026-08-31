import { ApiError, jsonInit, makeCall } from './client';

/** F4: client-side calls against `routes/piece/[id]/annotations/**`'s
 * authenticated proxy routes (never the Backend directly — same
 * session-stays-server-side pattern as `remotePiece.ts`'s file/pdf URLs).
 * `positionWholeNotes` is the same unit `ScoreView`'s `positionWholeNotes`
 * prop and playback cursor already use (whole notes from the piece's
 * start) — stored on the Backend as `Annotation.position`, an opaque
 * string there, so it round-trips through `String(...)`/`Number(...)`
 * here rather than the Backend needing to know its meaning. */
export interface Annotation {
	id: string;
	userId: string;
	pieceId: string;
	positionWholeNotes: number;
	content: string;
	createdAt: string;
}

export interface AnnotationShare {
	annotationId: string;
	sharedWithUserId: string;
	email: string;
}

interface AnnotationResponse {
	id: string;
	user_id: string;
	piece_id: string;
	position: string;
	content: string;
	created_at: string;
}

interface AnnotationShareResponse {
	annotation_id: string;
	shared_with_user_id: string;
	email: string;
}

export class AnnotationApiError extends ApiError {
	constructor(status: number, message: string) {
		super(status, message);
		this.name = 'AnnotationApiError';
	}
}

const call = makeCall(AnnotationApiError);

function toAnnotation(body: AnnotationResponse): Annotation {
	return {
		id: body.id,
		userId: body.user_id,
		pieceId: body.piece_id,
		positionWholeNotes: Number(body.position),
		content: body.content,
		createdAt: body.created_at
	};
}

function toShare(body: AnnotationShareResponse): AnnotationShare {
	return { annotationId: body.annotation_id, sharedWithUserId: body.shared_with_user_id, email: body.email };
}

export async function listAnnotations(pieceId: string): Promise<Annotation[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/annotations`);
	const body = (await res.json()) as AnnotationResponse[];
	return body.map(toAnnotation);
}

export async function createAnnotation(
	pieceId: string,
	positionWholeNotes: number,
	content: string
): Promise<Annotation> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/annotations`,
		jsonInit('POST', { position: String(positionWholeNotes), content })
	);
	return toAnnotation(await res.json());
}

export async function updateAnnotation(
	pieceId: string,
	annotationId: string,
	patch: { positionWholeNotes?: number; content?: string }
): Promise<Annotation> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/annotations/${annotationId}`,
		jsonInit('PATCH', {
			...(patch.positionWholeNotes !== undefined ? { position: String(patch.positionWholeNotes) } : {}),
			...(patch.content !== undefined ? { content: patch.content } : {})
		})
	);
	return toAnnotation(await res.json());
}

export async function deleteAnnotation(pieceId: string, annotationId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/annotations/${annotationId}`, { method: 'DELETE' });
}

export async function listAnnotationShares(pieceId: string, annotationId: string): Promise<AnnotationShare[]> {
	const res = await call(`/piece/${encodeURIComponent(pieceId)}/annotations/${annotationId}/share`);
	const body = (await res.json()) as AnnotationShareResponse[];
	return body.map(toShare);
}

export async function shareAnnotation(pieceId: string, annotationId: string, email: string): Promise<AnnotationShare> {
	const res = await call(
		`/piece/${encodeURIComponent(pieceId)}/annotations/${annotationId}/share`,
		jsonInit('POST', { email })
	);
	return toShare(await res.json());
}

export async function unshareAnnotation(pieceId: string, annotationId: string, userId: string): Promise<void> {
	await call(`/piece/${encodeURIComponent(pieceId)}/annotations/${annotationId}/share/${userId}`, {
		method: 'DELETE'
	});
}
