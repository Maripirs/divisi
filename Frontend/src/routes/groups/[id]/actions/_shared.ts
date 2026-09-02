import { fail } from '@sveltejs/kit';
import { BackendApiError } from '$lib/server/backend';

/** The tail every form action on this page shares: run the Backend work,
 * and if the Backend rejects it (`BackendApiError`) surface that as a
 * `fail(status, { error, form })` the page renders inline; let anything
 * else through untouched — a real bug, or a `redirect(...)` thrown on
 * success (`leaveGroup`). On success returns `{ success: true, form }`,
 * the payload each action used to build by hand.
 *
 * Actions whose failure isn't a `backendFetch` throw — the raw multipart
 * uploads in `updatePieceDetails` / `uploadTrack`, the self-removal guard
 * in `removeMember` — `throw new BackendApiError(status, msg)` to route
 * through the same handling. */
export async function runAction(form: string, work: () => Promise<unknown>) {
	try {
		await work();
		return { success: true, form };
	} catch (err) {
		if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form });
		throw err;
	}
}
