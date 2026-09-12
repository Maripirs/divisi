import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import type { RequestHandler } from './$types';

/** Mirrors the Backend's `GuestNameMatchOut` (B21). */
interface GuestNameMatchResponse {
	user_id: string;
	title: string | null;
	joined_at: string;
}

export interface NameMatchCandidate {
	userId: string;
	title: string | null;
	joinedAt: string;
}

/** B21: "is this you?" candidates for a name the join page's signup flow is
 * about to submit, from the Backend's `GET /guest/{join_code}/name-matches`.
 * That route is public (no auth, no cookie), scoped by the join code alone
 * — unlike the self-signup proxy next to this one, there's no
 * `divisi_participant` cookie to read or set, so this is a thin
 * pass-through rather than needing that cookie-juggling. Always answers
 * HTTP 200 with a small JSON verdict, same convention as
 * `responsibilities/signups/+server.ts`:
 *   { ok: true, matches: NameMatchCandidate[] }   (empty array = no match)
 *   { ok: false, error: 'server' }
 */
export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const code = params.code.toUpperCase();
	const name = (url.searchParams.get('name') ?? '').trim();
	if (!name) return json({ ok: true as const, matches: [] as NameMatchCandidate[] });

	let res: Response;
	try {
		res = await fetch(
			`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/name-matches?name=${encodeURIComponent(name)}`,
			{ signal: AbortSignal.timeout(20_000) }
		);
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}
	if (!res.ok) return json({ ok: false as const, error: 'server' as const });

	const body = (await res.json()) as GuestNameMatchResponse[];
	return json({
		ok: true as const,
		matches: body.map((m) => ({ userId: m.user_id, title: m.title, joinedAt: m.joined_at }))
	});
};
