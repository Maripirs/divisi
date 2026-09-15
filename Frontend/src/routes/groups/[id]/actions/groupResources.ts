import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const groupResourceActions = {
	// Admin-only: a stable link (label + url). Same "trim, require both
	// fields" client-side check as `weeklyNoteActions.createWeeklyNote`; the
	// Backend's own `field_validator` on `url` is the real guard against a
	// non-absolute-URL value slipping through.
	createGroupResource: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const label = String(form.get('label') ?? '').trim();
		const url = String(form.get('url') ?? '').trim();
		if (!label || !url) return fail(400, { error: m.groups_resources_enter_label_url(), form: 'createGroupResource' });

		return runAction('createGroupResource', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/resources`,
				{ method: 'POST', body: JSON.stringify({ label, url }) },
				fetch
			)
		);
	},

	updateGroupResource: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const resourceId = String(form.get('resourceId') ?? '');
		const label = String(form.get('label') ?? '').trim();
		const url = String(form.get('url') ?? '').trim();
		if (!resourceId || !label || !url) {
			return fail(400, { error: m.groups_resources_enter_label_url(), form: 'editGroupResource' });
		}

		return runAction('editGroupResource', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/resources/${resourceId}`,
				{ method: 'PATCH', body: JSON.stringify({ label, url }) },
				fetch
			)
		);
	},

	deleteGroupResource: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const resourceId = String(form.get('resourceId') ?? '');
		if (!resourceId) return fail(400, { error: m.groups_resources_missing(), form: 'editGroupResource' });

		return runAction('editGroupResource', () =>
			backendFetch(locals.token, `/groups/${params.id}/resources/${resourceId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
