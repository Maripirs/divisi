import { json } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { setGuestCookie } from '$lib/server/guestSession';
import type { RequestHandler } from './$types';

/** Exchanges a group's guest password for an opaque signed guest token and
 * stashes it in the per-group httpOnly cookie (`$lib/server/guestSession.ts`).
 * Backs both the `/join/[code]` password prompt and the `/piece/[id]` gate:
 * either posts `{ password }` here, then re-runs its own load (which now
 * finds the cookie). A group with no guest password still 200s here with a
 * usable token, so the same flow works even when the prompt was shown
 * spuriously.
 *
 * Always answers HTTP 200 with `{ ok }` (never 401/500) so the client form
 * reads a boolean rather than having to catch: `ok: false` means wrong
 * password, `ok: false, error: 'server'` means the Backend itself failed. */
export const POST: RequestHandler = async ({ params, request, cookies, fetch }) => {
	const code = params.code.toUpperCase();

	let password: string | null = null;
	try {
		const body = (await request.json()) as { password?: string | null };
		password = body.password ?? null;
	} catch {
		// Missing or malformed body — treat as an empty password attempt,
		// which the Backend accepts only for a group that has none set.
		password = null;
	}

	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/guest/${encodeURIComponent(code)}/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password }),
			// Same 20s ceiling the rest of the guest/Backend plumbing uses, so a
			// cold-started Render instance can't hang this request open.
			signal: AbortSignal.timeout(20_000)
		});

		if (res.ok) {
			const { token } = (await res.json()) as { token: string };
			setGuestCookie(cookies, code, token);
			return json({ ok: true });
		}

		if (res.status === 401) return json({ ok: false });

		return json({ ok: false, error: 'server' });
	} catch {
		// `fetch` threw outright (Backend unreachable, DNS/connection error,
		// or our own timeout above firing).
		return json({ ok: false, error: 'server' });
	}
};
