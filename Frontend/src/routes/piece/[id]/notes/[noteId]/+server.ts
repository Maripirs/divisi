import { backendErrorResponse, backendFetch, backendJson } from '$lib/server/backend';
import type { RequestHandler } from './$types';

/** F20: proxies the Backend's B16 `PUT`/`DELETE /piece-rehearsal-notes/{id}`
 * — admin-only full replace / delete, keyed on the note id alone (its
 * group and piece aren't needed in the path once you have the id). Same
 * authenticated-proxy shape as `../../markup/[markId]/+server.ts`. */
export const PUT: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const payload = await request.json();
	try {
		const body = await backendJson(
			locals.token,
			`/piece-rehearsal-notes/${encodeURIComponent(params.noteId)}`,
			{ method: 'PUT', body: JSON.stringify(payload) },
			fetch
		);
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return backendErrorResponse(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		await backendFetch(
			locals.token,
			`/piece-rehearsal-notes/${encodeURIComponent(params.noteId)}`,
			{ method: 'DELETE' },
			fetch
		);
		return new Response(null, { status: 204 });
	} catch (err) {
		return backendErrorResponse(err);
	}
};
