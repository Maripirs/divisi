import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET /library/versions/{id}/pdf` for an explicit
 * version id -- see `../file/+server.ts`, same reasoning. */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${params.versionId}/pdf`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		return new Response(null, { status: 503 });
	}
};
