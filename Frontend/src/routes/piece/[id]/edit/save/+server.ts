import { error, json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/**
 * F16: an editor save writes the MusicXML the editor exported back into the
 * piece's *working draft* in place, via the Backend's B17
 * `PUT /library/versions/{id}/file` — no new version row per save, and the
 * draft stays `draft` for "Publish as live version" to promote later.
 *
 * (F14 originally POSTed `/library/pieces/{id}/versions`, stacking a fresh
 * draft on every save; B17's single working-draft slot replaces that.)
 *
 * The working-draft version id comes in the multipart body as `versionId`
 * (the client holds it from `+page.server.ts`'s `load`). This route exists
 * rather than a form action because the payload is an in-memory string the
 * client turns into a `File`, and the session token is httpOnly so the
 * multipart PUT to the Backend has to happen server-side. The Backend
 * re-checks authority (creator or review authority) and that the target is
 * still a draft.
 */
export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.token) throw error(401, 'Not signed in');

	const incoming = await request.formData();
	const file = incoming.get('file');
	const versionId = incoming.get('versionId');
	if (!(file instanceof File) || file.size === 0) {
		throw error(400, 'No edited music file was provided');
	}
	if (typeof versionId !== 'string' || !versionId) {
		throw error(400, 'No working-draft version id was provided');
	}

	const body = new FormData();
	body.set('file', file, file.name || 'edited.musicxml');

	let res: Response;
	try {
		res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${encodeURIComponent(versionId)}/file`, {
			method: 'PUT',
			headers: { Authorization: `Bearer ${locals.token}` },
			body
		});
	} catch {
		throw error(503, 'Could not reach the server');
	}

	if (!res.ok) {
		const detail = (await res.json().catch(() => ({}))) as { detail?: string };
		throw error(res.status, detail.detail ?? `Save failed (HTTP ${res.status})`);
	}

	const version = (await res.json()) as { id: string };
	return json({ versionId: version.id });
};
