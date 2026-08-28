import { redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupOut, HomeworkOut, ResponsibilityDateOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

// B12: a group admin can disable the `homework`/`responsibilities` page for
// members, which makes the corresponding `GET /groups/{id}/...` 403 for a
// non-admin member of that group — treated here as "nothing from this
// group" rather than failing the whole Home load over one group's settings.
async function groupJsonOrEmpty<T>(
	token: string | null,
	path: string,
	fetch: typeof globalThis.fetch
): Promise<T[]> {
	try {
		return await backendJson<T[]>(token, path, undefined, fetch);
	} catch (err) {
		if (err instanceof BackendApiError && err.status === 403) return [];
		throw err;
	}
}

export const load: PageServerLoad = async ({ parent, locals, fetch }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, '/login?redirectTo=/home');

	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const homeworkByGroup = await Promise.all(
		groups.map((g) => groupJsonOrEmpty<HomeworkOut>(locals.token, `/groups/${g.id}/homework`, fetch))
	);
	const responsibilitiesByGroup = await Promise.all(
		groups.map((g) =>
			groupJsonOrEmpty<ResponsibilityDateOut>(locals.token, `/groups/${g.id}/responsibilities/dates`, fetch)
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

	// Only upcoming, still-active dates — a past or canceled one isn't
	// something to surface on Home. Earliest-first, same convention as
	// homework above (the Backend already orders each group's own list
	// this way). `ResponsibilityDateOut` carries no `group_id` of its own
	// (only `schedule_id`/`schedule_name`), so the group is attached here
	// from which per-group fetch produced it, not looked up afterward.
	const now = new Date();
	const responsibilities = responsibilitiesByGroup
		.flatMap((dates, i) => dates.map((d) => ({ ...d, groupId: groups[i].id, groupName: groups[i].name })))
		.filter((d) => !d.canceled && new Date(d.date) >= now)
		.sort((a, b) => a.date.localeCompare(b.date));

	return {
		groups: groups.map((g, i) => ({ ...g, homeworkCount: homeworkByGroup[i].length })),
		homework,
		responsibilities
	};
};
