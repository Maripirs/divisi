import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** F16: streams a specific `PieceVersion`'s music file — the editor's
 * working draft, whose id `edit/+page.server.ts` resolved via B17's
 * create-or-get. Distinct from `../file` (which resolves the piece's
 * *live* version for the practice player); the editor must load the draft
 * it will save back to, not whatever is currently distributed. The version
 * id comes in as `?v=`; the Backend re-checks access on
 * `GET /library/versions/{id}/file`. */
export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	const versionId = url.searchParams.get('v');
	if (!versionId) return new Response(null, { status: 400 });
	try {
		const res = await fetch(
			`${PUBLIC_API_BASE_URL}/library/versions/${encodeURIComponent(versionId)}/file`,
			{ headers: { Authorization: `Bearer ${locals.token}` } }
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		return new Response(null, { status: 503 });
	}
};
