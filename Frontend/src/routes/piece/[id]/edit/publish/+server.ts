import { json } from '@sveltejs/kit';
import { backendJson, backendErrorResponse } from '$lib/server/backend';
import type { PieceVersionOut } from '$lib/server/backendTypes';
import type { RequestHandler } from './$types';

/**
 * F16: "Publish as live version" from the editor. Proxies the Backend's
 * B17 `POST /library/versions/{id}/publish`, which walks the working draft
 * submit -> approve -> (group piece) distribute in one call.
 *
 * F19: the editor only enables the button once every source page is
 * approved *and* every seam is marked resolved client-side, so the
 * acknowledgement it sends is always `{ pages_reviewed: true,
 * seams_resolved: true }`. The Backend re-checks review authority itself
 * and records `seams_resolved`; `pages_reviewed` is accepted and (until a
 * Backend column lands) ignored.
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
			{ method: 'POST', body: JSON.stringify({ pages_reviewed: true, seams_resolved: true }) },
			fetch
		);
		return json(version);
	} catch (err) {
		return backendErrorResponse(err);
	}
};
