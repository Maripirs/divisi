import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET /library/versions/{id}/pdf` for an explicit
 * version id -- see `../file/+server.ts`, same reasoning. */
export const GET: RequestHandler = async ({ params, locals, fetch, request }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	// See ../../pdf/+server.ts for why the Range header must be forwarded:
	// without it, pdf.js's own range-request streaming breaks with
	// "Bad end offset" on the full file it gets back instead.
	const range = request.headers.get('range');
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${params.versionId}/pdf`, {
			headers: { Authorization: `Bearer ${locals.token}`, ...(range ? { Range: range } : {}) }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		return new Response(null, { status: 503 });
	}
};
