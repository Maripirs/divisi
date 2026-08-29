import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	return { token: url.searchParams.get('token') ?? '' };
};

async function errorDetail(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { detail?: string };
		if (body.detail) return body.detail;
	} catch {
		// Non-JSON error body — fall through to the generic message.
	}
	return m.errors_request_failed({ status: res.status });
}

export const actions: Actions = {
	default: async ({ request, fetch }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');
		if (!token) return fail(400, { error: m.reset_password_missing_link() });
		if (password !== passwordConfirm) return fail(400, { error: m.login_passwords_dont_match() });

		const res = await fetch(`${PUBLIC_API_BASE_URL}/auth/reset-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, new_password: password })
		});
		if (!res.ok) return fail(res.status, { error: await errorDetail(res) });

		throw redirect(303, lh('/login?reset=1'));
	}
};
