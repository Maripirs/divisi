import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import { clearSessionCookie } from '$lib/server/session';
import { backendCookieHeader, readParticipantCookie } from '$lib/server/participantSession';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { Actions } from './$types';

/** Every action here is targeted from `SettingsDrawer.svelte` (`action="/settings?/..."`)
 * rather than from this route's own page, since the drawer is mounted once
 * in the root layout and can be open over any page in the app — see
 * `settingsDrawer.svelte.ts` for why. */
export const actions: Actions = {
	updateName: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: m.settings_enter_name(), form: 'updateName' });

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

	// F26: guest counterpart to `updateName` above -- there's no session to
	// authenticate this with (a guest never logs in), so it forwards the
	// `divisi_participant` cookie instead, same idiom as the join page's
	// responsibility-signup proxy (`join/[code]/responsibilities/signups/
	// +server.ts`). The Backend route no-ops gracefully when no participant
	// has been minted yet, so this can be called before any shared action.
	updateGuestName: async ({ request, cookies, fetch }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const localId = String(form.get('localId') ?? '').trim();
		if (!name) return fail(400, { error: m.settings_enter_name(), form: 'updateGuestName' });

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		const forward = backendCookieHeader(readParticipantCookie(cookies));
		if (forward) headers.Cookie = forward;

		let res: Response;
		try {
			res = await fetch(`${PUBLIC_API_BASE_URL}/auth/participant/name`, {
				method: 'PATCH',
				headers,
				body: JSON.stringify({ name, local_id: localId || undefined }),
				signal: AbortSignal.timeout(20_000)
			});
		} catch {
			return fail(502, { error: m.drawer_could_not_update_name(), form: 'updateGuestName' });
		}
		if (!res.ok) {
			return fail(res.status, { error: m.drawer_could_not_update_name(), form: 'updateGuestName' });
		}
		return { success: true, form: 'updateGuestName' as const };
	},

	changePassword: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		if (!currentPassword || !newPassword) {
			return fail(400, { error: m.settings_enter_passwords(), form: 'changePassword' });
		}
		if (newPassword.length < 8) {
			return fail(400, { error: m.settings_password_too_short(), form: 'changePassword' });
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
		throw redirect(303, lh('/welcome'));
	}
};
