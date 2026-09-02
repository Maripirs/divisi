import { json } from '@sveltejs/kit';
import { backendErrorResponse, backendJson } from '$lib/server/backend';
import type { PagedReport } from '$lib/server/backendTypes';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET /omr/jobs/{id}/paged-report` — the segment /
 * unresolved-boundary / per-page breakdown of a B16 paged run. Used by the
 * group Tracks review panel and the F15 editor to place seam markers at the
 * page joins the merge wasn't sure about. Same authenticated-proxy shape as
 * `../../+server.ts`: `locals.token` is attached server-side, never reaches
 * the browser. 401 when logged out (unlike the job-list route, there's no
 * meaningful empty value here). */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return json({ detail: 'Not authenticated' }, { status: 401 });
	try {
		const report = await backendJson<PagedReport>(
			locals.token,
			`/omr/jobs/${params.id}/paged-report`,
			undefined,
			fetch
		);
		return json(report);
	} catch (err) {
		return backendErrorResponse(err);
	}
};
