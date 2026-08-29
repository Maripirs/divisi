import { error, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { GroupOut, HomeworkOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}/homework/${params.hwId}`));

	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());

	try {
		const homework = await backendJson<HomeworkOut>(locals.token, `/homework/${params.hwId}`, undefined, fetch);
		if (homework.group_id !== group.id) throw error(404, m.errors_homework_not_found());

		let pieceTitle: string | null = null;
		if (homework.piece_id) {
			const library = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
			pieceTitle = library.find((entry) => entry.piece_id === homework.piece_id)?.title ?? null;
		}

		return { group, homework, pieceTitle };
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};
