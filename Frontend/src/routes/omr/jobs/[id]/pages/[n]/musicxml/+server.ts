import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** F16: one paged-run page's own normalized MusicXML — what a re-run
 * response's `page_musicxml_url` points at. The editor fetches this and
 * splices it into the working model at the seam. Streams the Backend's
 * `GET /omr/jobs/{id}/pages/{n}/musicxml` with the session attached
 * server-side, mirroring `../../result` and the segment routes. */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/omr/jobs/${params.id}/pages/${params.n}/musicxml`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		return new Response(null, { status: 503 });
	}
};
