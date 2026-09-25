import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const knownNameActions = {
	// Admin-only: rewrite one free-text guest name to another everywhere it
	// appears in this group's Responsibilities signups and Carpool posts/
	// claims/interests — a rename that merges history, not a separate
	// suggestion layered on top. The Backend does the actual validation
	// (non-empty, different from the old name); this is just the same
	// trim-and-require-both check every other action here already does.
	renameKnownName: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const oldName = String(form.get('oldName') ?? '').trim();
		const newName = String(form.get('newName') ?? '').trim();
		if (!oldName || !newName) return fail(400, { error: m.groups_known_names_enter_new_name(), form: 'knownNames' });

		return runAction('knownNames', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/known-names/rename`,
				{ method: 'POST', body: JSON.stringify({ old_name: oldName, new_name: newName }) },
				fetch
			)
		);
	}
} satisfies Actions;
