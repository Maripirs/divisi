import { fail } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, fetch }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: m.forgot_password_enter_email() });

		// The Backend always returns the same generic response whether or
		// not the email has an account (see its own `forgot_password` route
		// docstring) — a network/server error is the only thing worth
		// surfacing differently here.
		try {
			await fetch(`${PUBLIC_API_BASE_URL}/auth/forgot-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});
		} catch {
			return fail(502, { error: m.errors_could_not_reach_server() });
		}
		return { success: true };
	}
};
