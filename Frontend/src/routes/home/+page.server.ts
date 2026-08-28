import { redirect } from '@sveltejs/kit';
import { backendJson } from '$lib/server/backend';
import type { GroupOut, HomeworkOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, fetch }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, '/login?redirectTo=/home');

	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const homeworkByGroup = await Promise.all(
		groups.map((g) =>
			backendJson<HomeworkOut[]>(locals.token, `/groups/${g.id}/homework`, undefined, fetch)
		)
	);
	const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

	// Earliest-due-first across every group — the Backend already orders
	// each group's own list that way, this just merges them.
	const homework = homeworkByGroup
		.flat()
		.sort((a, b) => {
			if (a.due_date === b.due_date) return 0;
			if (a.due_date === null) return 1;
			if (b.due_date === null) return -1;
			return a.due_date.localeCompare(b.due_date);
		})
		.map((hw) => ({ ...hw, groupName: groupNameById.get(hw.group_id) ?? 'Unknown group' }));

	return {
		groups: groups.map((g, i) => ({ ...g, homeworkCount: homeworkByGroup[i].length })),
		homework
	};
};
