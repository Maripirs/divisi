import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** Proxies the Backend's `GET /library/versions/{id}/file` for an
 * *explicit* version id, unlike `../../file/+server.ts` (which always
 * resolves to the piece's current live version) -- used by the
 * review/AI-edit page (`piece/[id]/review`) to fetch either an
 * unpublished draft's or the live piece's own music file directly by
 * version id, depending which it's showing. Admin-only in practice (that
 * page is gated), but the real access check happens Backend-side
 * (`_require_piece_access` against the version's actual piece) same as
 * every other file proxy here -- no guest path, drafts are never
 * guest-reachable. */
export const GET: RequestHandler = async ({ params, locals, fetch }) => {
	if (!locals.token) return new Response(null, { status: 401 });
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${params.versionId}/file`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		return new Response(res.body, { status: res.status, headers: res.headers });
	} catch {
		return new Response(null, { status: 503 });
	}
};
