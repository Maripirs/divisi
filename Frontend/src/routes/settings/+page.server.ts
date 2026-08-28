import { fail, redirect } from '@sveltejs/kit';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import { clearSessionCookie } from '$lib/server/session';
import type { Actions } from './$types';

/** Both actions are targeted from `SettingsDrawer.svelte` (`action="/settings?/..."`)
 * rather than from this route's own page, since the drawer is mounted once
 * in the root layout and can be open over any page in the app — see
 * `settingsDrawer.svelte.ts` for why. */
export const actions: Actions = {
	updateName: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Enter a name', form: 'updateName' });

		try {
			await backendFetch(locals.token, '/auth/me', {
				method: 'PUT',
				body: JSON.stringify({ name })
			}, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'updateName' });
			throw err;
		}
		return { success: true, form: 'updateName' as const };
	},

	changePassword: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		if (!currentPassword || !newPassword) {
			return fail(400, { error: 'Enter your current and new password', form: 'changePassword' });
		}
		if (newPassword.length < 8) {
			return fail(400, { error: 'New password must be at least 8 characters', form: 'changePassword' });
		}

		try {
			await backendFetch(locals.token, '/auth/me/password', {
				method: 'PUT',
				body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
			}, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'changePassword' });
			throw err;
		}
		return { success: true, form: 'changePassword' as const };
	},

	// Destructive and irreversible — the Backend itself is the source of
	// truth on whether it's actually safe (e.g. 409s if this account is the
	// sole admin of a group), this action just forwards that.
	deleteAccount: async ({ locals, cookies, fetch }) => {
		try {
			await backendFetch(locals.token, '/auth/me', { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'deleteAccount' });
			throw err;
		}
		clearSessionCookie(cookies);
		throw redirect(303, '/welcome');
	}
};
