import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
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
	return `Request failed (${res.status})`;
}

export const actions: Actions = {
	default: async ({ request, fetch }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');
		if (!token) return fail(400, { error: 'Missing or invalid reset link' });
		if (password !== passwordConfirm) return fail(400, { error: "Passwords don't match" });

		const res = await fetch(`${PUBLIC_API_BASE_URL}/auth/reset-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, new_password: password })
		});
		if (!res.ok) return fail(res.status, { error: await errorDetail(res) });

		throw redirect(303, '/login?reset=1');
	}
};
