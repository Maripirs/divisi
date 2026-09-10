import { fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import { clearSessionCookie, setSessionCookie } from '$lib/server/session';
import {
	backendCookieHeader,
	clearParticipantCookie,
	readParticipantCookie
} from '$lib/server/participantSession';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { Actions } from './$types';

/** Both actions are targeted from `SettingsDrawer.svelte` (`action="/settings?/..."`)
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

	// F23 / Backend B19 "Save across devices": attach a name + numeric PIN
	// to this device's anonymous participant row (or fold it into a
	// matching saved account). On success the Backend hands back a normal
	// bearer token, which becomes this device's session cookie, and the
	// `divisi_participant` cookie is retired. Targeted from
	// `SettingsDrawer.svelte`'s Save section; needs the raw participant
	// cookie forwarded, so it uses `fetch` directly rather than
	// `backendFetch` (which is bearer-only and throws away the response on
	// a non-2xx, losing the Backend's `detail`).
	saveAcrossDevices: async ({ request, cookies, fetch }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const pin = String(form.get('pin') ?? '').trim();
		const localId = String(form.get('localId') ?? '').trim();
		if (!name) return fail(400, { error: m.save_enter_name(), form: 'saveAcrossDevices' });
		if (!/^[0-9]{4,8}$/.test(pin)) return fail(400, { error: m.save_pin_invalid(), form: 'saveAcrossDevices' });

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		const forward = backendCookieHeader(readParticipantCookie(cookies));
		if (forward) headers.Cookie = forward;

		let res: Response;
		try {
			res = await fetch(`${PUBLIC_API_BASE_URL}/auth/save`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ name, pin, local_id: localId || undefined }),
				signal: AbortSignal.timeout(20_000)
			});
		} catch {
			return fail(503, { error: m.errors_could_not_reach_server(), form: 'saveAcrossDevices' });
		}

		if (!res.ok) {
			let detail = '';
			try {
				detail = ((await res.json()) as { detail?: string }).detail ?? '';
			} catch {
				detail = '';
			}
			if (res.status === 422) return fail(400, { error: m.save_pin_invalid(), form: 'saveAcrossDevices' });
			return fail(res.status, {
				error: detail || m.errors_request_failed({ status: res.status }),
				form: 'saveAcrossDevices'
			});
		}

		const { access_token: accessToken } = (await res.json()) as { access_token: string };
		setSessionCookie(cookies, accessToken);
		clearParticipantCookie(cookies);
		return { success: true, form: 'saveAcrossDevices' as const };
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
