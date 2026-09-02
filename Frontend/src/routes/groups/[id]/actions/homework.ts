import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const homeworkActions = {
	// Admin-only, full replace — same shape as `updateWeeklyNote` above, and
	// the Backend's own `update_homework` (`PUT /homework/{id}`). Homework
	// doesn't get a separate edit page (the create flow at
	// `admin/new-homework` still does, but editing an existing entry is this
	// tab's own expand-in-place card instead — see `+page.svelte`'s
	// `editingHomeworkId`) so there's no redirect on success, just like the
	// other inline-edit actions on this page.
	updateHomework: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const homeworkId = String(form.get('homeworkId') ?? '');
		const pieceId = String(form.get('pieceId') ?? '') || null;
		const title = String(form.get('title') ?? '').trim();
		const range = String(form.get('range') ?? '').trim();
		const dueDate = String(form.get('dueDate') ?? '');
		const instructions = String(form.get('instructions') ?? '');
		if (!homeworkId) return fail(400, { error: m.groups_missing_homework(), form: 'updateHomework' });
		if (!title || !range) return fail(400, { error: m.groups_enter_title_range(), form: 'updateHomework' });

		return runAction('updateHomework', () =>
			backendFetch(
				locals.token,
				`/homework/${homeworkId}`,
				{ method: 'PUT', body: JSON.stringify({ piece_id: pieceId, title, range, instructions, due_date: dueDate || null }) },
				fetch
			)
		);
	},

	// Admin-only, `DELETE /homework/{id}` — same click-to-confirm-behind-a-
	// trash-icon pattern as `deleteTrack` above, reachable from inside the
	// edit form rather than sitting next to Save (one click apart from a
	// non-destructive action is too easy to fat-finger).
	deleteHomework: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const homeworkId = String(form.get('homeworkId') ?? '');
		if (!homeworkId) return fail(400, { error: m.groups_missing_homework(), form: 'deleteHomework' });

		return runAction('deleteHomework', () =>
			backendFetch(locals.token, `/homework/${homeworkId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
