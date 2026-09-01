import { json } from '@sveltejs/kit';
import { backendJson, backendErrorResponse } from '$lib/server/backend';
import type { OmrPageRerunOut } from '$lib/server/backendTypes';
import type { RequestHandler } from './$types';

/** F16: "Re-run this page" on a failed-OMR-page seam. Proxies the Backend's
 * B17 `POST /omr/jobs/{id}/pages/{n}/rerun`, which re-transcribes that one
 * page from the split PDF still on disk, rebuilds the paged report +
 * `needs_review`, and returns the re-run page's own MusicXML URL for the
 * editor to splice into the working model. Same authenticated-proxy shape
 * as the sibling `paged-report` route — `locals.token` attached
 * server-side, never in the browser. */
export const POST: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return json({ detail: 'Not authenticated' }, { status: 401 });
	try {
		const result = await backendJson<OmrPageRerunOut>(
			locals.token,
			`/omr/jobs/${params.id}/pages/${params.n}/rerun`,
			{ method: 'POST' },
			fetch
		);
		return json(result);
	} catch (err) {
		return backendErrorResponse(err);
	}
};
