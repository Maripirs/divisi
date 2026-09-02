import { json } from '@sveltejs/kit';
import { backendErrorResponse, backendJson } from '$lib/server/backend';
import type { OmrJobListItem } from '$lib/server/backendTypes';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET /omr/jobs` — the signed-in user's own
 * "Generate music from PDF" jobs, newest first. Polled client-side by
 * `$lib/stores/omrJobs.svelte.ts` (via `AppHeader`'s `OmrJobAlerts`) so an
 * admin hears that a job they kicked off has finished or failed while they
 * were on another screen. Same authenticated-proxy shape as
 * `../../piece/[id]/annotations/+server.ts`: `locals.token` is attached
 * server-side, the browser never sees the Backend token. A logged-out
 * visitor has no jobs — return an empty list rather than a 401 so the
 * store's poll loop stays quiet instead of logging errors. */
export const GET: RequestHandler = async ({ locals, fetch }) => {
	if (!locals.token) return json([] as OmrJobListItem[]);
	try {
		const jobs = await backendJson<OmrJobListItem[]>(locals.token, '/omr/jobs', undefined, fetch);
		return json(jobs);
	} catch (err) {
		return backendErrorResponse(err);
	}
};
