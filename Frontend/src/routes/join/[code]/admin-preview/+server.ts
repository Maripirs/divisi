import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { setSessionCookie } from '$lib/server/session';
import { normalizeJoinCodeForPreview, setDemoPreviewCookie } from '$lib/server/demoPreviewSession';
import type { RequestHandler } from './$types';

/** F24 / Backend B20: starts a read-only "Preview Admin" session for the
 * public demo group. `GET /guest/{code}/admin-preview` is unauthenticated
 * (same guest rate limiting as every other `/guest/*` route) and 404s for
 * every join code except the one `Settings.demo_join_code` names on the
 * Backend (see that route's own docstring). On success it hands back a
 * bearer token that resolves as the demo group's real admin for every
 * read (a process-wide Backend middleware rejects every non-GET request
 * it makes, regardless of route), so we just set it as the *normal*
 * session cookie (same helper `/auth/login` and the OAuth callback use,
 * every existing admin screen renders as-is) plus a first-party marker
 * cookie so the rest of the app can tell this session apart from a real
 * login (the persistent banner, "Exit preview").
 *
 * POST (a state change: it sets cookies), no body needed; mirrors the
 * fetch/error-handling shape of
 * `join/[code]/responsibilities/signups/+server.ts`. Always answers 200
 * with a small JSON verdict so the caller reads a discriminant rather than
 * catching. */
export const POST: RequestHandler = async ({ params, cookies, fetch }) => {
	const code = normalizeJoinCodeForPreview(params.code);

	let res: Response;
	try {
		res = await fetch(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/admin-preview`, {
			signal: AbortSignal.timeout(20_000)
		});
	} catch {
		return json({ ok: false as const, error: 'server' as const });
	}

	if (!res.ok) {
		if (res.status === 404) return json({ ok: false as const, error: 'not-found' as const });
		return json({ ok: false as const, error: 'server' as const });
	}

	const body = (await res.json()) as { access_token: string; token_type: string; group_id: string };
	setSessionCookie(cookies, body.access_token);
	setDemoPreviewCookie(cookies, code);
	return json({ ok: true as const, groupId: body.group_id });
};
