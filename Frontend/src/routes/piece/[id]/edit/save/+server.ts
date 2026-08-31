import { error, json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/**
 * F14 task 5: takes the MusicXML the in-app editor exported and creates a
 * new `draft` version on the piece via the Backend's existing
 * `POST /library/pieces/{id}/versions` (music-file slot) — the same
 * endpoint the group Tracks edit panel and B8's OMR auto-import already
 * use. It carries the PDF slot forward on its own, and stamps the version
 * `source: modification`.
 *
 * This route exists (rather than a `+page.server.ts` form action) because
 * the payload is an in-memory string the client turns into a `File`, and a
 * plain `fetch` for a JSON reply is far less fiddly to consume from the
 * `ssr: false` editor than an action envelope. The session token is
 * httpOnly, so the multipart POST to the Backend has to happen here, not
 * in the browser.
 *
 * Deliberately does *not* chain submit/approve/distribute — per the F14
 * plan the new draft then flows through the normal review workflow
 * unchanged. The Backend re-checks edit authority (`_require_piece_access`)
 * on this POST, so a user who somehow reached the editor without rights
 * still can't save.
 */
export const POST: RequestHandler = async ({ params, request, locals, fetch }) => {
	if (!locals.token) throw error(401, 'Not signed in');

	const incoming = await request.formData();
	const file = incoming.get('file');
	if (!(file instanceof File) || file.size === 0) {
		throw error(400, 'No edited music file was provided');
	}

	const body = new FormData();
	body.set('file', file, file.name || 'edited.musicxml');

	let res: Response;
	try {
		res = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces/${params.id}/versions`, {
			method: 'POST',
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
