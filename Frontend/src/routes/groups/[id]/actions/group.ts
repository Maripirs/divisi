import { fail, redirect } from '@sveltejs/kit';
import { backendFetch, backendJson } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type { GroupPage, PageAudience } from '$lib/server/backendTypes';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const groupActions = {
	updateGuestSettings: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const newPassword = String(form.get('guestPassword') ?? '').trim();
		const removePassword = form.get('removePassword') === 'on';

		// Partial patch (see Backend's `GroupGuestSettingsUpdate`) — only
		// include `guest_password` when the admin actually typed a new one
		// or explicitly asked to remove it. The API never lets them read the
		// current password back, so a blank field must mean "leave it
		// alone", not "clear it". Per-page visibility (formerly
		// `guest_homework_visible`) is B12's separate `updatePageSettings`
		// action below, not this one.
		const body: { guest_password?: string | null } = {};
		if (newPassword) body.guest_password = newPassword;
		else if (removePassword) body.guest_password = null;

		return runAction('guestSettings', () =>
			backendFetch(locals.token, `/groups/${params.id}/guest-settings`, { method: 'PUT', body: JSON.stringify(body) }, fetch)
		);
	},

	// B12: admin-only replace of all 5 pages' enabled/audience in one go —
	// the form always submits every page's current state (checkboxes for
	// unchecked/disabled pages just don't appear in the FormData), so this
	// builds the full set rather than a true partial patch even though the
	// Backend endpoint itself supports one.
	updatePageSettings: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pages: GroupPage[] = ['homework', 'tracks', 'members', 'about', 'responsibilities', 'weekly_notes'];
		const updates = pages.map((page) => ({
			page,
			enabled: form.get(`enabled_${page}`) === 'on',
			audience: (form.get(`audience_${page}`) === 'everyone' ? 'everyone' : 'members') as PageAudience
		}));

		return runAction('pageSettings', () =>
			backendFetch(locals.token, `/groups/${params.id}/page-settings`, { method: 'PUT', body: JSON.stringify({ pages: updates }) }, fetch)
		);
	},

	// Admin-only, full replace — a regular weekly rehearsal slot (e.g.
	// "Wednesdays at 7pm") the Responsibilities tab's "Next rehearsal"
	// button anchors new dates to. `weekday` empty means "clear it"; the
	// select's own options are '0'-'6' strings (Monday-Sunday, matching the
	// Backend's `date.weekday()` convention) so this just needs `Number(...)`.
	updateRehearsalSchedule: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const weekdayRaw = String(form.get('weekday') ?? '').trim();
		const time = String(form.get('time') ?? '').trim();
		const rehearsalWeekday = weekdayRaw === '' ? null : Number(weekdayRaw);
		const rehearsalTime = weekdayRaw === '' ? null : time;
		if (rehearsalWeekday !== null && (!Number.isInteger(rehearsalWeekday) || !rehearsalTime)) {
			return fail(400, { error: m.rehearsal_choose_day_time(), form: 'rehearsalSchedule' });
		}

		return runAction('rehearsalSchedule', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/rehearsal-schedule`,
				{ method: 'PUT', body: JSON.stringify({ rehearsal_weekday: rehearsalWeekday, rehearsal_time: rehearsalTime }) },
				fetch
			)
		);
	},

	// Admin-only, full replace — the free-text blurb on the Info/About tab.
	updateDescription: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const description = String(form.get('description') ?? '').trim();

		return runAction('description', () =>
			backendFetch(locals.token, `/groups/${params.id}/description`, { method: 'PUT', body: JSON.stringify({ description: description || null }) }, fetch)
		);
	},

	// Any member (including an admin, as long as they're not the last one
	// — the Backend's own 409 covers that) can leave a group they belong
	// to. Redirects to `/home` on success since staying on this page no
	// longer makes sense once the caller isn't a member.
	leaveGroup: ({ locals, fetch, params }) =>
		runAction('leaveGroup', async () => {
			const me = await backendJson<{ id: string }>(locals.token, '/auth/me', undefined, fetch);
			await backendFetch(locals.token, `/groups/${params.id}/members/${me.id}`, { method: 'DELETE' }, fetch);
			// Not a `BackendApiError`, so runAction re-throws it — staying on
			// this page makes no sense once the caller isn't a member.
			throw redirect(303, lh('/home'));
		})
} satisfies Actions;
