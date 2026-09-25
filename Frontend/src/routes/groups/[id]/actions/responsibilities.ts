import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

const RESPONSIBILITY_DATE_ID = (form: FormData) => String(form.get('dateId') ?? '');

export const responsibilityActions = {
	// B13, admin-only: create a schedule with its roles in one call — the
	// form's role rows arrive as parallel `roleName`/`roleNeeded` arrays
	// (FormData preserves input order), zipped back together here. Rows
	// left blank (no name typed) are dropped rather than sent as empty roles.
	createResponsibilitySchedule: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const name = String(form.get('scheduleName') ?? '').trim();
		if (!name) return fail(400, { error: m.groups_enter_schedule_name(), form: 'createSchedule' });

		const roleNames = form.getAll('roleName').map((v) => String(v).trim());
		const roleCounts = form.getAll('roleNeeded').map((v) => Number(v) || 1);
		const roles = roleNames
			.map((roleName, i) => ({ name: roleName, needed_count: roleCounts[i] ?? 1 }))
			.filter((r) => r.name);

		return runAction('createSchedule', () =>
			backendFetch(locals.token, `/groups/${params.id}/responsibilities/schedules`, { method: 'POST', body: JSON.stringify({ name, roles }) }, fetch)
		);
	},

	// One save for the schedule's name and every one of its roles together
	// (a schedule name field plus parallel roleId/roleName/roleNeeded arrays,
	// same zip-by-position shape `createResponsibilitySchedule` above already
	// uses) -- was a separate PATCH-and-reload per role, annoying enough on a
	// schedule with several roles that the human asked for one Save instead.
	// An empty `roleId` (the schedule-editor's own freshly added, not-yet-
	// saved rows) means "create"; a real one means "update that role". A
	// blank `roleName` is dropped either way, same as a blank row in the
	// create form.
	updateResponsibilitySchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!scheduleId || !name) return fail(400, { error: m.groups_enter_name(), form: 'editSchedule' });

		const roleIds = form.getAll('roleId').map(String);
		const roleNames = form.getAll('roleName').map((v) => String(v).trim());
		const roleCounts = form.getAll('roleNeeded').map((v) => Number(v) || 1);

		return runAction('editSchedule', async () => {
			await backendFetch(locals.token, `/responsibilities/schedules/${scheduleId}`, { method: 'PATCH', body: JSON.stringify({ name }) }, fetch);
			for (let i = 0; i < roleNames.length; i++) {
				const roleName = roleNames[i];
				if (!roleName) continue;
				const roleId = roleIds[i];
				if (roleId) {
					await backendFetch(
						locals.token,
						`/responsibilities/roles/${roleId}`,
						{ method: 'PATCH', body: JSON.stringify({ name: roleName, needed_count: roleCounts[i] ?? 1 }) },
						fetch
					);
				} else {
					await backendFetch(
						locals.token,
						`/responsibilities/schedules/${scheduleId}/roles`,
						{ method: 'POST', body: JSON.stringify({ name: roleName, needed_count: roleCounts[i] ?? 1 }) },
						fetch
					);
				}
			}
		});
	},

	// Deletes the whole responsibility — its roles, dates, and signups go
	// with it (see the Backend route's own note on why there's no undo).
	// The confirm step lives entirely in the UI (a click-to-reveal button).
	deleteResponsibilitySchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		if (!scheduleId) return fail(400, { error: m.groups_missing_responsibility(), form: 'editSchedule' });

		return runAction('editSchedule', () =>
			backendFetch(locals.token, `/responsibilities/schedules/${scheduleId}`, { method: 'DELETE' }, fetch)
		);
	},

	// `deleteRoleId`, not `roleId`: this button lives inside the same big
	// edit-schedule form as the parallel `roleId` array above (one per role
	// row, for the save action's own zip), so it needs its own field name to
	// point at just the row that was clicked, the same "formaction button,
	// distinct field name" shape `EditableCard`'s own delete button uses.
	deleteResponsibilityRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('deleteRoleId') ?? '');
		if (!roleId) return fail(400, { error: m.groups_missing_role(), form: 'editSchedule' });

		return runAction('editSchedule', () =>
			backendFetch(locals.token, `/responsibilities/roles/${roleId}`, { method: 'DELETE' }, fetch)
		);
	},

	// B13, admin-only: one concrete occurrence, attached to one or more role
	// sets. The role-set checkboxes arrive as repeated `scheduleId` fields.
	addResponsibilityDate: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const scheduleIds = form.getAll('scheduleId').map(String).filter(Boolean);
		const dateInput = String(form.get('date') ?? '');
		const notes = String(form.get('notes') ?? '').trim();
		if (scheduleIds.length === 0 || !dateInput) return fail(400, { error: m.groups_choose_schedule_date(), form: 'addDate' });

		return runAction('addDate', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/responsibilities/dates`,
				{ method: 'POST', body: JSON.stringify({ date: new Date(dateInput).toISOString(), notes, schedule_ids: scheduleIds }) },
				fetch
			)
		);
	},

	// B13 (multi-role-set dates), admin-only: attach/detach a role set on an
	// existing date. Both only need the two ids from the form.
	attachResponsibilityDateSchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		const scheduleId = String(form.get('scheduleId') ?? '');
		if (!dateId || !scheduleId) return fail(400, { error: m.groups_missing_date_or_role(), form: 'dateRoleSets' });

		return runAction('dateRoleSets', () =>
			backendFetch(
				locals.token,
				`/responsibilities/dates/${dateId}/schedules`,
				{ method: 'POST', body: JSON.stringify({ schedule_id: scheduleId }) },
				fetch
			)
		);
	},

	detachResponsibilityDateSchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		const scheduleId = String(form.get('scheduleId') ?? '');
		if (!dateId || !scheduleId) return fail(400, { error: m.groups_missing_date_or_role(), form: 'dateRoleSets' });

		return runAction('dateRoleSets', () =>
			backendFetch(locals.token, `/responsibilities/dates/${dateId}/schedules/${scheduleId}`, { method: 'DELETE' }, fetch)
		);
	},

	// B13, admin-only: covers edit (date/notes), lock/unlock, and cancel/
	// reinstate all in one partial-patch action — each caller only submits
	// the field(s) it's actually changing, so this only ever patches what's
	// present in the form.
	updateResponsibilityDate: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		if (!dateId) return fail(400, { error: m.groups_missing_date() });

		const body: { date?: string; notes?: string; locked?: boolean; canceled?: boolean } = {};
		if (form.has('date')) {
			const dateInput = String(form.get('date') ?? '');
			if (!dateInput) return fail(400, { error: m.groups_choose_date(), form: 'editDate' });
			body.date = new Date(dateInput).toISOString();
		}
		if (form.has('notes')) body.notes = String(form.get('notes') ?? '').trim();
		if (form.has('locked')) body.locked = form.get('locked') === 'true';
		if (form.has('canceled')) body.canceled = form.get('canceled') === 'true';

		return runAction('editDate', () =>
			backendFetch(locals.token, `/responsibilities/dates/${dateId}`, { method: 'PATCH', body: JSON.stringify(body) }, fetch)
		);
	},

	// Admin-only, a real delete (its signups go with it) — distinct from
	// "Cancel", which just flips a status flag and keeps the date + its
	// signup history around. Confirm step lives entirely in the UI.
	deleteResponsibilityDate: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		if (!dateId) return fail(400, { error: m.groups_missing_date() });

		return runAction('editDate', () =>
			backendFetch(locals.token, `/responsibilities/dates/${dateId}`, { method: 'DELETE' }, fetch)
		);
	},

	// B13: no `userId`/`name` in the form means "sign myself up" (member
	// self-signup); an explicit `userId` is an admin assigning an existing
	// member; a `name` with no `userId` is an admin assigning someone with
	// no Divisi account at all (the Backend route enforces both admin
	// checks server-side either way).
	signUpResponsibility: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = String(form.get('dateId') ?? '');
		const roleId = String(form.get('roleId') ?? '');
		const userId = String(form.get('userId') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		if (!dateId || !roleId) return fail(400, { error: m.groups_missing_date_or_role() });

		return runAction('signUp', () =>
			backendFetch(
				locals.token,
				`/responsibilities/dates/${dateId}/signups`,
				{ method: 'POST', body: JSON.stringify({ role_id: roleId, user_id: userId || undefined, name: name || undefined }) },
				fetch
			)
		);
	},

	removeResponsibilitySignup: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const signupId = String(form.get('signupId') ?? '');
		if (!signupId) return fail(400, { error: m.groups_missing_signup() });

		return runAction('signUp', () =>
			backendFetch(locals.token, `/responsibilities/signups/${signupId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
