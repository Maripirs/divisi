import { json } from '@sveltejs/kit';
import { backendJson, backendErrorResponse } from '$lib/server/backend';
import type { PieceVersionOut } from '$lib/server/backendTypes';
import type { RequestHandler } from './$types';

/**
 * F16: "Publish as live version" from the editor. Proxies the Backend's
 * B17 `POST /library/versions/{id}/publish`, which walks the working draft
 * submit -> approve -> (group piece) distribute in one call. The editor
 * only enables the button once every OMR seam is marked resolved
 * client-side, so the acknowledgement it sends is always
 * `seams_resolved: true`; the Backend records it and re-checks review
 * authority itself.
 *
 * Body: `{ versionId }` (the working draft the editor is holding).
 */
export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.token) return json({ detail: 'Not authenticated' }, { status: 401 });

	const body = (await request.json().catch(() => ({}))) as { versionId?: string };
	if (!body.versionId) return json({ detail: 'versionId is required' }, { status: 400 });

	try {
		const version = await backendJson<PieceVersionOut>(
			locals.token,
			`/library/versions/${encodeURIComponent(body.versionId)}/publish`,
			{ method: 'POST', body: JSON.stringify({ seams_resolved: true }) },
			fetch
		);
		return json(version);
	} catch (err) {
		return backendErrorResponse(err);
	}
};
