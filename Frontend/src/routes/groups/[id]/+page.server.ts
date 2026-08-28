import { error, fail, redirect } from '@sveltejs/kit';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupMemberOut, GroupOut, HomeworkOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';

// Loads everything both the member view and the admin view need in one
// pass — the admin view used to be a separate route (`/groups/[id]/admin`)
// with its own near-identical load, refetching the same three lists. Now
// it's a mode of this same page (see UX_WIREFRAME.md's "Admin mode should
// be a view of the group, not a separate destination"), so one load feeds
// both.
export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, `/login?redirectTo=/groups/${params.id}`);

	// No single-group GET exists on the Backend — `/groups` only lists the
	// caller's own groups, so a group this user isn't in 404s here exactly
	// like an unknown id would, which is the right behavior either way.
	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, 'Group not found');

	try {
		const [homework, library, members] = await Promise.all([
			backendJson<HomeworkOut[]>(locals.token, `/groups/${group.id}/homework`, undefined, fetch),
			backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch),
			backendJson<GroupMemberOut[]>(locals.token, `/groups/${group.id}/members`, undefined, fetch)
		]);

		const tracks = library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id);
		const trackTitleById = new Map(tracks.map((t) => [t.piece_id, t.title]));

		return {
			group,
			homework: homework.map((hw) => ({ ...hw, pieceTitle: hw.piece_id ? (trackTitleById.get(hw.piece_id) ?? null) : null })),
			tracks,
			members
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

export const actions: Actions = {
	updateGuestSettings: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const newPassword = String(form.get('guestPassword') ?? '').trim();
		const removePassword = form.get('removePassword') === 'on';
		const guestHomeworkVisible = form.get('guestHomeworkVisible') === 'on';

		// Partial patch (see Backend's `GroupGuestSettingsUpdate`) — only
		// include `guest_password` when the admin actually typed a new one
		// or explicitly asked to remove it. The API never lets them read the
		// current password back, so a blank field must mean "leave it
		// alone", not "clear it".
		const body: { guest_password?: string | null; guest_homework_visible: boolean } = {
			guest_homework_visible: guestHomeworkVisible
		};
		if (newPassword) body.guest_password = newPassword;
		else if (removePassword) body.guest_password = null;

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/guest-settings`,
				{ method: 'PUT', body: JSON.stringify(body) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}
		return { success: true, form: 'guestSettings' };
	},

	addMember: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: 'Enter an email address', form: 'addMember' });

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/members`,
				{ method: 'POST', body: JSON.stringify({ email, role: 'member' }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'addMember' });
			throw err;
		}
		return { success: true, form: 'addMember' };
	}
};
