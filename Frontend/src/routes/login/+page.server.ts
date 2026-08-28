import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { setSessionCookie } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

interface OAuthProviders {
	google: boolean;
	apple: boolean;
}

/** Which "Continue with X" buttons actually work right now — both report
 * `false` until real OAuth app credentials exist (see Backend/plan.md's
 * Backlog), so the buttons themselves just don't render rather than
 * offering something that would 501. Falls back to both-off rather than
 * failing the whole page if the Backend call itself fails. */
export const load: PageServerLoad = async ({ fetch }) => {
	let oauthProviders: OAuthProviders = { google: false, apple: false };
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/auth/oauth/providers`);
		if (res.ok) oauthProviders = await res.json();
	} catch {
		// Backend unreachable — same fallback as a clean "not configured".
	}
	return { oauthProviders, apiBaseUrl: PUBLIC_API_BASE_URL };
};

async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { detail?: string };
		if (body.detail) return body.detail;
	} catch {
		// Non-JSON error body — fall through to the generic message.
	}
	return `Request failed (${res.status})`;
}

/** Logs in with `email`/`password` against the Backend, returning the
 * access token on success or an error string on failure. Shared by both
 * actions below — registration logs the new user straight in rather than
 * bouncing them to a second form. */
async function login(
	email: string,
	password: string,
	fetchFn: typeof fetch
): Promise<{ token: string } | { error: string }> {
	const res = await fetchFn(`${PUBLIC_API_BASE_URL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	if (!res.ok) return { error: await errorDetail(res) };
	const body = (await res.json()) as { access_token: string };
	return { token: body.access_token };
}

/** Only ever redirect back to a same-site path — `redirectTo` rides in a
 * hidden form field (ultimately from a URL query param), so without this
 * check a crafted `?redirectTo=https://evil.example` link could turn a
 * normal login into an open redirect. */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
	const target = String(value ?? '');
	return target.startsWith('/') && !target.startsWith('//') ? target : '/home';
}

export const actions: Actions = {
	login: async ({ request, cookies, fetch }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const redirectTo = safeRedirectTarget(form.get('redirectTo'));

		const result = await login(email, password, fetch);
		if ('error' in result) return fail(401, { error: result.error, mode: 'login' as const });

		setSessionCookie(cookies, result.token);
		throw redirect(303, redirectTo);
	},

	register: async ({ request, cookies, fetch }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const name = String(form.get('name') ?? '');
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');
		const redirectTo = safeRedirectTarget(form.get('redirectTo'));

		// The Backend's `UserCreate` only ever takes one `password` field —
		// the match check is purely this form's own safeguard against a
		// typo, so it happens here rather than needing a second field on
		// the Backend's own schema.
		if (password !== passwordConfirm) {
			return fail(400, { error: "Passwords don't match", mode: 'register' as const });
		}

		const registerRes = await fetch(`${PUBLIC_API_BASE_URL}/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, name, password })
		});
		if (!registerRes.ok) {
			return fail(registerRes.status, { error: await errorDetail(registerRes), mode: 'register' as const });
		}

		const result = await login(email, password, fetch);
		if ('error' in result) return fail(401, { error: result.error, mode: 'register' as const });

		setSessionCookie(cookies, result.token);
		throw redirect(303, redirectTo);
	}
};
