import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const weeklyNoteActions = {
	// Admin-only: a dated bulletin entry (title/body/note_date). `note_date`
	// arrives as a plain `<input type="date">` value ("YYYY-MM-DD"), which
	// `new Date(...)` parses as UTC midnight — good enough for a "week of"
	// date with no time-of-day meaning.
	createWeeklyNote: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const noteDateInput = String(form.get('noteDate') ?? '');
		if (!title || !noteDateInput) return fail(400, { error: m.groups_enter_title_date(), form: 'createWeeklyNote' });

		return runAction('createWeeklyNote', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/weekly-notes`,
				{ method: 'POST', body: JSON.stringify({ title, body, note_date: new Date(noteDateInput).toISOString() }) },
				fetch
			)
		);
	},

	updateWeeklyNote: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const noteId = String(form.get('noteId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const noteDateInput = String(form.get('noteDate') ?? '');
		if (!noteId || !title || !noteDateInput) return fail(400, { error: m.groups_enter_title_date(), form: 'editWeeklyNote' });

		return runAction('editWeeklyNote', () =>
			backendFetch(
				locals.token,
				`/weekly-notes/${noteId}`,
				{ method: 'PUT', body: JSON.stringify({ title, body, note_date: new Date(noteDateInput).toISOString() }) },
				fetch
			)
		);
	},

	deleteWeeklyNote: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const noteId = String(form.get('noteId') ?? '');
		if (!noteId) return fail(400, { error: m.groups_missing_note(), form: 'editWeeklyNote' });

		return runAction('editWeeklyNote', () =>
			backendFetch(locals.token, `/weekly-notes/${noteId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
