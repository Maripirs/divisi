import { fail } from '@sveltejs/kit';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const memberActions = {
	addMember: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: m.groups_enter_email(), form: 'addMember' });

		return runAction('addMember', () =>
			backendFetch(locals.token, `/groups/${params.id}/members`, { method: 'POST', body: JSON.stringify({ email, role: 'member' }) }, fetch)
		);
	},

	// Admin-only, and only for *other* members — removing yourself is a
	// separate, deliberate "Leave group" action below (the Members tab's
	// own Remove button is hidden on the caller's own row, but this checks
	// again server-side since a form POST doesn't actually enforce that).
	// `parent()` isn't available in form actions (only `load`), so this
	// re-resolves the caller via `/auth/me` rather than trusting a
	// client-supplied id. The Backend itself 409s a removal that would
	// leave the group with no admins, surfaced here as a normal form error.
	removeMember: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'removeMember' });

		return runAction('removeMember', async () => {
			const me = await backendJson<{ id: string }>(locals.token, '/auth/me', undefined, fetch);
			// Routed through runAction's `BackendApiError` handling to land as
			// the same `fail(400, …)` the standalone check returned before.
			if (userId === me.id) throw new BackendApiError(400, m.groups_use_leave_group());
			await backendFetch(locals.token, `/groups/${params.id}/members/${userId}`, { method: 'DELETE' }, fetch);
		});
	},

	// Admin-only; promoting is always allowed, demoting the last admin gets
	// the same 409 removing them would.
	updateMemberRole: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'member';
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'updateMemberRole' });

		return runAction('updateMemberRole', () =>
			backendFetch(locals.token, `/groups/${params.id}/members/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) }, fetch)
		);
	},

	// Admin-only, full replace — free-text context next to a member on the
	// Members page (e.g. "Soprano 2 — Section leader").
	updateMemberTitle: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'updateMemberTitle' });

		return runAction('updateMemberTitle', () =>
			backendFetch(locals.token, `/groups/${params.id}/members/${userId}/title`, { method: 'PUT', body: JSON.stringify({ title: title || null }) }, fetch)
		);
	}
} satisfies Actions;
