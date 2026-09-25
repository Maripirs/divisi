import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

/** Shared by `createTeam`/`updateTeam`: the contact half of a team's body,
 * built from the one contact-editor form both actions' own `<form>`s share
 * in `TeamsTab.svelte`. `contact_show_email`/`contact_show_phone` come from
 * plain checkbox presence (`form.has`, not a hidden `'true'/'false'` field)
 * — simplest for a real `<input type="checkbox">` that's either submitted
 * or isn't. */
function teamContactBody(form: FormData) {
	return {
		contact_name: String(form.get('contactName') ?? '').trim() || null,
		contact_email: String(form.get('contactEmail') ?? '').trim() || null,
		contact_phone: String(form.get('contactPhone') ?? '').trim() || null,
		contact_show_email: form.has('showEmail'),
		contact_show_phone: form.has('showPhone')
	};
}

/** Shared by `addTeamRole`/`updateTeamRole`: a role's `mode` (`'interest'`
 * self-signup or `'roster'` admin-maintained) plus `roster_visible_to_members`
 * (only meaningful in `roster` mode, but always sent, same "one form,
 * submit everything together" shape `teamContactBody` above uses). The
 * radio group defaults to `'interest'` server-side too (`TeamRoleCreate`'s
 * own default), so a missing/unexpected value falls back the same way. */
function teamRoleModeBody(form: FormData) {
	const mode = form.get('mode') === 'roster' ? 'roster' : 'interest';
	return { mode, roster_visible_to_members: form.get('rosterVisible') === 'on' };
}

export const teamActions = {
	// Admin-only. `params.id` (the group id), not a form field — same
	// convention `createResponsibilitySchedule` uses for its own group-scoped
	// create.
	createTeam: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: m.groups_enter_name(), form: 'createTeam' });
		const description = String(form.get('description') ?? '').trim();

		return runAction('createTeam', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/teams`,
				{ method: 'POST', body: JSON.stringify({ name, description, ...teamContactBody(form) }) },
				fetch
			)
		);
	},

	// Admin-only. `TeamUpdate` is a partial patch on the Backend (only fields
	// present in the JSON body are touched), but this form's own single
	// "Save" always submits every field together — same one-form-one-save
	// shape as `updateResponsibilitySchedule`'s schedule-name field, just
	// with no per-field conditionality needed here.
	updateTeam: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const teamId = String(form.get('teamId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!teamId || !name) return fail(400, { error: m.groups_enter_name(), form: 'editTeam' });
		const description = String(form.get('description') ?? '').trim();

		return runAction('editTeam', () =>
			backendFetch(
				locals.token,
				`/teams/${teamId}`,
				{ method: 'PATCH', body: JSON.stringify({ name, description, ...teamContactBody(form) }) },
				fetch
			)
		);
	},

	// Admin-only. Cascades on the Backend (the team's roles and their
	// signups go with it) — the confirm step lives entirely in the UI
	// (`ConfirmButton`), same as every other destructive action on this page.
	deleteTeam: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const teamId = String(form.get('teamId') ?? '');
		if (!teamId) return fail(400, { error: m.groups_missing_team(), form: 'editTeam' });

		return runAction('editTeam', () => backendFetch(locals.token, `/teams/${teamId}`, { method: 'DELETE' }, fetch));
	},

	// Admin-only. `has_text_field` isn't exposed in the add-role form (every
	// admin-created role defaults to a plain checkbox, `has_text_field:
	// false` is the Backend's own default), no UI regression from the
	// prototype, which never had a way to create an "Other"-style role
	// either, only the seeded ones had it. `mode`/`roster_visible_to_members`
	// (`teamRoleModeBody`) are exposed: a fresh role is `interest` unless the
	// admin picks `roster` in the same form.
	addTeamRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const teamId = String(form.get('teamId') ?? '');
		const name = String(form.get('roleName') ?? '').trim();
		if (!teamId || !name) return fail(400, { error: m.groups_missing_role(), form: 'editTeam' });

		return runAction('editTeam', () =>
			backendFetch(
				locals.token,
				`/teams/${teamId}/roles`,
				{ method: 'POST', body: JSON.stringify({ name, ...teamRoleModeBody(form) }) },
				fetch
			)
		);
	},

	// Admin-only. Name plus `mode`/`roster_visible_to_members` (`has_text_field`
	// still untouched here, matching the prototype's own role-rename scope).
	updateTeamRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		const name = String(form.get('roleName') ?? '').trim();
		if (!roleId || !name) return fail(400, { error: m.groups_missing_role(), form: 'editTeam' });

		return runAction('editTeam', () =>
			backendFetch(
				locals.token,
				`/teams/roles/${roleId}`,
				{ method: 'PATCH', body: JSON.stringify({ name, ...teamRoleModeBody(form) }) },
				fetch
			)
		);
	},

	// Admin-only. Its signups go with it, same cascade shape as `deleteTeam`.
	deleteTeamRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		if (!roleId) return fail(400, { error: m.groups_missing_role(), form: 'editTeam' });

		return runAction('editTeam', () => backendFetch(locals.token, `/teams/roles/${roleId}`, { method: 'DELETE' }, fetch));
	},

	// Self-signup only (no admin-assigns-someone-else shape, unlike
	// `signUpResponsibility`) — the Backend attributes it to the bearer
	// caller itself, so there's no `userId`/`name` field to send at all.
	// `textValue` is only meaningful for a `has_text_field` role; sent as
	// `undefined` (dropped by `JSON.stringify`) when blank so an empty
	// string never gets stored as if it were real text.
	//
	// Called both from a real `<form>` (none currently — see `TeamsTab.svelte`'s
	// own doc comment on why the member "Save" flow calls this via a plain
	// `fetch` to this same `?/signUpTeamRole` endpoint instead) and, in
	// principle, could back a literal form too; the action itself doesn't
	// care which.
	signUpTeamRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		if (!roleId) return fail(400, { error: m.groups_missing_role(), form: 'teamSignUp' });
		const textValue = String(form.get('textValue') ?? '').trim();

		return runAction('teamSignUp', () =>
			backendFetch(
				locals.token,
				`/teams/roles/${roleId}/signups`,
				{ method: 'POST', body: JSON.stringify({ text_value: textValue || undefined }) },
				fetch
			)
		);
	},

	// Admin-only: adds a named entry (with an optional free-text `contact`,
	// e.g. an email or phone) to a `roster`-mode role's roster. Reuses the
	// same `POST .../signups` endpoint `signUpTeamRole` posts to, just with
	// the admin-assignment payload shape (`name`/`contact` instead of a
	// self-signup's fields). The Backend tells the two apart by which
	// fields are present, and 400s this shape against a non-roster role or
	// a non-admin caller regardless of what this action sends.
	addTeamRosterEntry: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!roleId || !name) return fail(400, { error: m.groups_enter_name(), form: 'editTeam' });
		const contact = String(form.get('contact') ?? '').trim();

		return runAction('editTeam', () =>
			backendFetch(
				locals.token,
				`/teams/roles/${roleId}/signups`,
				{ method: 'POST', body: JSON.stringify({ name, contact: contact || undefined }) },
				fetch
			)
		);
	},

	// The signup's own actor or a group admin can withdraw it (enforced on
	// the Backend); this action itself doesn't need to know which. Also
	// doubles as the admin's "remove roster entry" action: same DELETE, no
	// mode-specific behavior needed.
	removeTeamSignup: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const signupId = String(form.get('signupId') ?? '');
		if (!signupId) return fail(400, { error: m.groups_missing_signup(), form: 'teamSignUp' });

		return runAction('teamSignUp', () => backendFetch(locals.token, `/teams/signups/${signupId}`, { method: 'DELETE' }, fetch));
	}
} satisfies Actions;
