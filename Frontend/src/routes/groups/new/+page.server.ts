import { fail, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { GroupOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';

// UX_WIREFRAME.md's Create Group Flow also asks for a description and
// default-sections checklist — the Backend's `POST /groups` (schema
// `GroupCreate`) only takes a name today, so this form only asks for what
// it can actually save. See Frontend/plan.md's log for the note.
export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh('/login?redirectTo=/groups/new'));
};

export const actions: Actions = {
	default: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: m.groups_new_enter_name() });

		let group: GroupOut;
		try {
			group = await backendJson<GroupOut>(
				locals.token,
				'/groups',
				{ method: 'POST', body: JSON.stringify({ name }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}

		throw redirect(303, lh(`/groups/${group.id}?view=admin&created=1`));
	}
};
