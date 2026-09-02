import { redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
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

/** The redirect gate keys off the session cookie, not `parent()`'s `user`:
 * on a cold Backend start the root layout hands back an optimistic user
 * (see `+layout.server.ts`) and this just needs "is there a session". The
 * actual Home data is returned as an unawaited promise so the shell +
 * loading state paint immediately instead of blocking on a fan-out of
 * per-group Backend calls while the Backend is still waking. */
export const load: PageServerLoad = async ({ parent, locals, fetch }) => {
	if (!locals.token) throw redirect(303, lh('/login?redirectTo=/home'));
	const { user } = await parent();
	// `user` may be the layout's cold-start stub, but its `id` is real
	// (decoded from the session JWT), which is all the `reason` calc needs.
	return { home: loadHome(locals.token, user?.id ?? '', fetch) };
};

async function loadHome(token: string, userId: string, fetch: typeof globalThis.fetch) {
	const groups = await backendJson<GroupOut[]>(token, '/groups', undefined, fetch);
	const homeworkByGroup = await Promise.all(
		groups.map((g) => groupJsonOrEmpty<HomeworkOut>(token, `/groups/${g.id}/homework`, fetch))
	);
	const responsibilitiesByGroup = await Promise.all(
		groups.map((g) =>
			groupJsonOrEmpty<ResponsibilityDateOut>(token, `/groups/${g.id}/responsibilities/dates`, fetch)
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
		.map((hw) => ({ ...hw, groupName: groupNameById.get(hw.group_id) ?? m.home_unknown_group() }));

	// Only upcoming, still-active dates that are actually relevant to this
	// member: either they're already signed up for something on it, or it
	// still needs volunteers — a date every role of which is already
	// covered by other people isn't something to surface on Home. A past
	// or canceled date is never relevant either way. Earliest-first, same
	// convention as homework above (the Backend already orders each
	// group's own list that way). `ResponsibilityDateOut` carries no
	// `group_id` of its own (a date can span several role sets), so the
	// group is attached here from which per-group fetch produced it, not
	// looked up afterward.
	const now = new Date();
	const responsibilities = responsibilitiesByGroup
		.flatMap((dates, i) => dates.map((d) => ({ ...d, groupId: groups[i].id, groupName: groups[i].name })))
		.filter((d) => !d.canceled && new Date(d.date) >= now)
		.map((d) => ({
			...d,
			// Flat role list across every role set on the date — Home only
			// needs "am I in it" / "does anything still need people".
			roleSetNames: d.schedules.map((s) => s.schedule_name).join(', '),
			// Why this date is relevant enough to surface at all — shown on
			// Home so the reason isn't a mystery, and used there to decide
			// whether the row is dismissible (a personal commitment isn't;
			// an open call for volunteers is). Enrolled wins when both are
			// true — "you're already covering this" matters more to the
			// member than "it also still needs others".
			reason: d.schedules
				.flatMap((s) => s.roles)
				.some((r) => r.signups.some((s) => s.user_id === userId))
				? ('enrolled' as const)
				: ('needs_volunteers' as const)
		}))
		.filter(
			(d) =>
				d.reason === 'enrolled' ||
				d.schedules.flatMap((s) => s.roles).some((r) => r.status === 'underfilled')
		)
		.sort((a, b) => a.date.localeCompare(b.date))
		// Capped to the soonest few — an admin planning ahead (dates months
		// out) shouldn't turn this into a second homework list.
		.slice(0, 3);

	return {
		groups: groups.map((g, i) => ({ ...g, homeworkCount: homeworkByGroup[i].length })),
		homework,
		responsibilities
	};
}
