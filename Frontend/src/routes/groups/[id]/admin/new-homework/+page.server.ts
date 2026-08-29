import { error, fail, redirect } from '@sveltejs/kit';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { GroupOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}/admin/new-homework`));

	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());
	if (group.role !== 'admin') throw error(403, m.errors_admin_required());

	const library = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
	const tracks = library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id);

	return { group, tracks };
};

export const actions: Actions = {
	default: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '') || null;
		const rangeMode = String(form.get('rangeMode') ?? 'full');
		const measureFrom = String(form.get('measureFrom') ?? '');
		const measureTo = String(form.get('measureTo') ?? '');
		const dueDate = String(form.get('dueDate') ?? '');
		const instructions = String(form.get('instructions') ?? '');
		const title = String(form.get('title') ?? '');

		if (!pieceId) return fail(400, { error: m.new_homework_choose_piece() });

		const range = rangeMode === 'measures' && measureFrom && measureTo ? `mm. ${measureFrom}-${measureTo}` : 'Full piece';

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/homework`,
				{
					method: 'POST',
					body: JSON.stringify({
						piece_id: pieceId,
						title,
						range,
						instructions,
						due_date: dueDate || null
					})
				},
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}

		throw redirect(303, lh(`/groups/${params.id}?view=admin`));
	}
};
