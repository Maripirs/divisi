<script lang="ts">
	// Teams: a group's standing list of teams/committees, each with a list of
	// roles. Every role has its own `mode` (see `Backend/app/db/models.py`'s
	// `TeamRoleMode`); a team freely mixes both kinds side by side, this is
	// not a team-wide setting:
	//
	//  - `interest`: a member self-signup checklist item, exactly today's
	//    only pre-redesign behavior.
	//  - `roster`: a fixed, admin-maintained list of names (e.g. "President"
	//    → "Jane Doe"), no self-signup at all. `roster_visible_to_members`
	//    decides whether members see that roster read-only (`true`) or the
	//    role is skipped entirely in the member view (`false`).
	//
	// See `Backend/app/api/schemas/teams.py`'s module docstring (`TeamOut`
	// for a plain member, `TeamAdminOut` for an admin, one route picks the
	// shape server-side) and `Backend/app/api/routes/teams.py`. Admin writes
	// live in `./actions/teams.ts`.
	//
	// Member view is a browsable directory (`.card-grid` of compact team
	// cards). Each card is collapsed (name, description, "Interested" badge
	// if the member has an active `interest`-mode signup somewhere on this
	// team) until its header is clicked (`expandedTeamIds`, same map/toggle
	// the admin cards below use), then expands into a per-role list: an
	// `interest` role renders as the toggleable `interest-option` chip
	// (with an "Other"-style role's free-text field inline); a visible
	// `roster` role renders as a small read-only name list; a hidden
	// `roster` role isn't rendered at all. Checklist drafts (`interestDrafts`/
	// `otherDrafts`) only ever cover `interest`-mode roles: a `roster`
	// role's entries are never member-editable, so they never seed or
	// participate in draft state. They are (re)seeded from each role's own
	// `my_signup` every time a card expands (`seedDraftsForTeam`).
	//
	// "Save" sits at the bottom of the checklist, covers only that team's
	// `interest`-mode roles, and is the only commit action, scoped to just
	// that one team. It's also the one interaction with no single-`<form>`-
	// one-action Backend equivalent: a member can toggle several role chips
	// before saving, but there's no batch-signup endpoint, only per-role
	// `POST .../signups` / `DELETE .../signups/{id}` (see
	// `Backend/app/api/routes/teams.py`), and an already-signed-up
	// "Other" role whose text changed needs both (no update-signup endpoint
	// either). Which calls are needed isn't known until Save is clicked, so
	// one `<form>` with one `action` can't express it; `saveTeamInterests`
	// diffs the drafts against each role's `my_signup` and fires exactly the
	// calls needed via `callTeamAction`, a thin wrapper that POSTs to this
	// page's own `?/actionName` endpoints the same way `use:enhance` does
	// internally (see its own doc comment). Every other write on this page
	// (admin team/role CRUD, and an admin's roster add/remove) is a plain
	// one-`<form>`-per-action `use:enhance`, no different from any other
	// tab's admin forms.
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import { withSubmitting } from '$lib/utils/enhance';
	import { assertUngated } from '../groupTabs';
	import type { TeamAdminOut, TeamOut, TeamRoleOut } from '$lib/server/backendTypes';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ActionData, PageData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();
	// This tab only ever mounts from `+page.svelte`'s non-gate branch — see
	// `groupTabs.ts`'s `assertUngated` doc comment. Nothing below actually
	// reads `data.group`/`data.user` (every write here is scoped by team/role/
	// signup id, or resolved server-side from the bearer token), but the call
	// stays for the same documented-invariant reason every sibling Tab
	// component keeps it even when its own body doesn't need every field.
	// svelte-ignore state_referenced_locally
	assertUngated(data);

	// Local copy of the team list, resynced whenever `data.teams` actually
	// changes (a reload, or another tab's edit) — same pattern
	// `ResponsibilitiesTab.svelte`'s own `responsibilities` copy uses.
	// Widened to `(TeamOut | TeamAdminOut)[]` (an array of the union) rather
	// than kept as the fetched `TeamOut[] | TeamAdminOut[]` (a union of
	// arrays) so every `{#each}` below gets a plain per-item union to work
	// with instead of needing to re-derive it at every use site.
	// svelte-ignore state_referenced_locally
	let teams = $state<(TeamOut | TeamAdminOut)[]>(data.teams);
	$effect(() => {
		teams = data.teams;
	});

	// Which cards are expanded — collapsed vs. the live checklist, member and
	// admin alike (independent per team, so several can be open at once).
	let expandedTeamIds = $state<Record<string, boolean>>({});
	function toggleExpanded(teamId: string) {
		const willExpand = !expandedTeamIds[teamId];
		expandedTeamIds[teamId] = willExpand;
		if (mode !== 'member' || !willExpand) return;
		const t = teams.find((x) => x.id === teamId);
		if (t) seedDraftsForTeam(t);
	}

	// Only `interest`-mode roles count toward the "Interested" badge: a
	// `roster` role's `my_signup` (populated whenever the viewer happens to
	// be that entry's own `user_id`) is an admin-assigned fact, not
	// something the viewer expressed interest in.
	function hasInterestInTeam(t: TeamOut | TeamAdminOut): boolean {
		return t.roles.some((r) => r.mode === 'interest' && !!r.my_signup);
	}

	/** What a member's contact line (and the admin summary's) both show —
	 * `TeamOut.contact_email`/`contact_phone` are already `null` unless the
	 * admin opted to show that one to members (the Backend redacts, not this
	 * component — see `TeamOut`'s own doc comment), so this needs no
	 * show-flag logic of its own, unlike the admin *editor*'s checkboxes
	 * below, which need the true stored values regardless of the flags. */
	function contactDisplayText(name: string | null, email: string | null, phone: string | null): string | null {
		if (!name) return null;
		const parts = [name];
		if (email) parts.push(email);
		if (phone) parts.push(phone);
		return parts.join(' · ');
	}

	// Checklist draft state — reseeded fresh from each role's own
	// `my_signup` every time a card expands (`seedDraftsForTeam`, called
	// from `toggleExpanded` above), not carried across a close/reopen. Keyed
	// by role id (globally unique), so one flat map covers every team.
	let interestDrafts = $state<Record<string, boolean>>({});
	let otherDrafts = $state<Record<string, string>>({});

	function toggleDraftInterest(role: TeamRoleOut) {
		interestDrafts[role.id] = !interestDrafts[role.id];
	}

	function updateOtherText(roleId: string, text: string) {
		otherDrafts[roleId] = text;
	}

	function seedDraftsForTeam(t: TeamOut | TeamAdminOut) {
		for (const r of t.roles) {
			if (r.mode !== 'interest') continue; // a roster role has no member-editable draft state
			interestDrafts[r.id] = !!r.my_signup;
			if (r.has_text_field) otherDrafts[r.id] = r.my_signup?.text_value ?? '';
		}
	}

	/** Calls this page's own `?/actionName` endpoint directly, the same way
	 * `use:enhance` does under the hood: a `fetch` carrying the
	 * `x-sveltekit-action` header SvelteKit's own form-action handling uses
	 * to tell a serialized `ActionResult` response apart from the plain
	 * no-JS-fallback response — the documented, supported way to call a form
	 * action outside of a literal `<form>` submit. Needed here, and nowhere
	 * else on this page, for the reason `saveTeamInterests` below explains:
	 * "Save" can mean anywhere from zero to several independent
	 * `signUpTeamRole`/`removeTeamSignup` calls, which no single `<form>`'s
	 * one `action` attribute can express. */
	async function callTeamAction(actionName: string, fields: Record<string, string>): Promise<void> {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		const response = await fetch(`?/${actionName}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text()) as ActionResult;
		if (result.type === 'failure') {
			throw new Error((result.data as { error?: string } | undefined)?.error ?? m.errors_could_not_reach_server());
		}
		if (result.type === 'error') {
			throw new Error(m.errors_could_not_reach_server());
		}
	}

	let savingInterestsFor = $state<Record<string, boolean>>({});
	let interestSaveError = $state<Record<string, string | null>>({});

	/** The "Save" button's handler: diffs `interestDrafts`/`otherDrafts`
	 * against each role's actual `my_signup`, and only calls the Backend for
	 * roles that actually changed. There's no update-signup endpoint (see
	 * `Backend/app/api/routes/teams.py`'s `create_signup`/`delete_signup`),
	 * so an already-signed-up "Other" role whose text changed is a
	 * delete-then-recreate, not a patch. */
	async function saveTeamInterests(t: TeamOut | TeamAdminOut) {
		savingInterestsFor[t.id] = true;
		interestSaveError[t.id] = null;
		try {
			for (const role of t.roles) {
				if (role.mode !== 'interest') continue; // a roster role is never member-editable
				const wantInterested = !!interestDrafts[role.id];
				const existing = role.my_signup;
				const wantText = role.has_text_field ? (otherDrafts[role.id] ?? '').trim() : '';
				if (wantInterested && !existing) {
					await callTeamAction('signUpTeamRole', { roleId: role.id, textValue: wantText });
				} else if (!wantInterested && existing) {
					await callTeamAction('removeTeamSignup', { signupId: existing.id });
				} else if (wantInterested && existing && role.has_text_field && wantText !== (existing.text_value ?? '')) {
					await callTeamAction('removeTeamSignup', { signupId: existing.id });
					await callTeamAction('signUpTeamRole', { roleId: role.id, textValue: wantText });
				}
			}
			await invalidateAll();
			// Re-seed from the just-reloaded `data.teams` directly, not the
			// local `teams` copy — its own resync `$effect` may not have
			// flushed yet — so the drafts land on exactly what was saved.
			const refreshed = data.teams.find((x) => x.id === t.id);
			if (refreshed) seedDraftsForTeam(refreshed);
		} catch (err) {
			interestSaveError[t.id] = err instanceof Error ? err.message : m.errors_could_not_reach_server();
		} finally {
			savingInterestsFor[t.id] = false;
		}
	}

	// ---- Admin: add/edit/delete teams and roles ----

	interface KnownContact {
		name: string;
		email: string | null;
		phone: string | null;
		showEmail: boolean;
		showPhone: boolean;
	}

	// Every contact already used on some other team in this group, deduped by
	// name (case-insensitive) — picking (or matching) a name in the
	// contact-name field reuses that contact's email/phone instead of
	// retyping it, the same "known name" convenience Responsibilities/
	// Carpool's guest name field gets from `known-names`, just derived
	// locally here from `data.teams` since there's no dedicated
	// known-team-contacts endpoint. The `as TeamAdminOut[]` is safe: `mode
	// === 'admin'` only ever renders once the caller genuinely is an admin
	// (the role switcher itself is admin-gated), so the Backend always
	// answers `GET .../teams` with the admin shape here, regardless of which
	// client-side `mode` happens to be showing.
	let knownContacts = $derived.by((): KnownContact[] => {
		if (mode !== 'admin') return [];
		const byName = new Map<string, KnownContact>();
		for (const t of teams as TeamAdminOut[]) {
			if (t.contact_name) {
				byName.set(t.contact_name.toLowerCase(), {
					name: t.contact_name,
					email: t.contact_email,
					phone: t.contact_phone,
					showEmail: t.contact_show_email,
					showPhone: t.contact_show_phone
				});
			}
		}
		return [...byName.values()];
	});

	function findKnownContact(name: string): KnownContact | undefined {
		const key = name.trim().toLowerCase();
		if (!key) return undefined;
		return knownContacts.find((c) => c.name.toLowerCase() === key);
	}

	let showAddTeam = $state(false);
	let creatingTeam = $state(false);
	let newTeamName = $state('');
	let newTeamDescription = $state('');
	let newTeamContactName = $state('');
	let newTeamContactEmail = $state('');
	let newTeamContactPhone = $state('');
	let newTeamShowEmail = $state(false);
	let newTeamShowPhone = $state(false);
	function onNewContactNameInput(value: string) {
		newTeamContactName = value;
		const known = findKnownContact(value);
		if (known) {
			newTeamContactEmail = known.email ?? '';
			newTeamContactPhone = known.phone ?? '';
			newTeamShowEmail = known.showEmail;
			newTeamShowPhone = known.showPhone;
		}
	}
	function resetNewTeamDraft() {
		newTeamName = '';
		newTeamDescription = '';
		newTeamContactName = '';
		newTeamContactEmail = '';
		newTeamContactPhone = '';
		newTeamShowEmail = false;
		newTeamShowPhone = false;
	}

	let editingTeamId = $state<string | null>(null);
	let savingTeam = $state(false);
	let teamNameDraft = $state('');
	let teamDescriptionDraft = $state('');
	let teamContactNameDraft = $state('');
	let teamContactEmailDraft = $state('');
	let teamContactPhoneDraft = $state('');
	let teamShowEmailDraft = $state(false);
	let teamShowPhoneDraft = $state(false);
	function onEditContactNameInput(value: string) {
		teamContactNameDraft = value;
		const known = findKnownContact(value);
		if (known) {
			teamContactEmailDraft = known.email ?? '';
			teamContactPhoneDraft = known.phone ?? '';
			teamShowEmailDraft = known.showEmail;
			teamShowPhoneDraft = known.showPhone;
		}
	}
	function startEditTeam(t: TeamAdminOut) {
		editingTeamId = t.id;
		teamNameDraft = t.name;
		teamDescriptionDraft = t.description;
		teamContactNameDraft = t.contact_name ?? '';
		teamContactEmailDraft = t.contact_email ?? '';
		teamContactPhoneDraft = t.contact_phone ?? '';
		teamShowEmailDraft = t.contact_show_email;
		teamShowPhoneDraft = t.contact_show_phone;
	}

	let newRoleDrafts = $state<Record<string, string>>({});
	// New-role mode/visibility, keyed by team id (several add-role forms can
	// exist at once, one per expanded team card). `?? 'interest'` below
	// mirrors `TeamRoleCreate.mode`'s own default for a team with no draft
	// touched yet.
	let newRoleMode = $state<Record<string, 'interest' | 'roster'>>({});
	let newRoleRosterVisible = $state<Record<string, boolean>>({});
	let addingRole = $state<Record<string, boolean>>({});
	let editingRoleId = $state<string | null>(null);
	let savingRole = $state(false);
	let roleNameDraft = $state('');
	let roleModeDraft = $state<'interest' | 'roster'>('interest');
	let roleRosterVisibleDraft = $state(false);
	function startEditRole(r: TeamRoleOut) {
		editingRoleId = r.id;
		roleNameDraft = r.name;
		roleModeDraft = r.mode;
		roleRosterVisibleDraft = r.roster_visible_to_members;
	}

	// ---- Admin: roster-mode role management (add/remove a named entry) ----

	let newRosterEntryName = $state<Record<string, string>>({});
	let newRosterEntryContact = $state<Record<string, string>>({});
	let addingRosterEntry = $state<Record<string, boolean>>({});
</script>

{#snippet memberRosterRoleBlock(r: TeamRoleOut)}
	<!-- A visible roster role's read-only name list: no chip, no
	     interactivity, just the role name plus each entry's name (and its
	     optional `contact`, e.g. an email or phone an admin attached). -->
	<div class="team-role-member team-role-roster">
		<p class="roster-role-name">{r.name}</p>
		{#if r.signups.length === 0}
			<p class="card-note">{m.teams_roster_empty()}</p>
		{:else}
			{#each r.signups as s (s.id)}
				<p class="roster-entry">
					{s.contact ? m.teams_roster_entry_with_contact({ name: s.name, contact: s.contact }) : s.name}
				</p>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet memberRoleRow(r: TeamRoleOut)}
	<div class="team-role-member interest-option" class:is-selected={!!interestDrafts[r.id]}>
		<button
			type="button"
			class="interest-option-toggle"
			aria-pressed={!!interestDrafts[r.id]}
			onclick={() => toggleDraftInterest(r)}
		>
			<span>{r.name}</span>
			<span class="interest-option-icon" aria-hidden="true">{interestDrafts[r.id] ? '✓' : '+'}</span>
		</button>
		{#if r.has_text_field && interestDrafts[r.id]}
			<input
				class="interest-option-input"
				placeholder={m.teams_other_placeholder()}
				value={otherDrafts[r.id] ?? ''}
				oninput={(e) => updateOtherText(r.id, e.currentTarget.value)}
			/>
		{/if}
	</div>
{/snippet}

<div class="teams-body">
	<div class="teams-head">
		<div>
			<p class="card-title">{m.teams_tab_title()}</p>
			<p class="card-meta">{mode === 'admin' ? m.teams_admin_intro() : m.teams_page_intro()}</p>
		</div>
		{#if mode === 'admin'}
			<button type="button" class="btn btn-primary" onclick={() => (showAddTeam = !showAddTeam)}>
				{m.teams_add_team_button()}
			</button>
		{/if}
	</div>

	{#if mode === 'admin'}
		<!-- Backs both contact-name inputs' `list="team-known-contacts"` --
		     picking (or matching) a name here reuses that contact's
		     email/phone, see `onNewContactNameInput`/`onEditContactNameInput`. -->
		<datalist id="team-known-contacts">
			{#each knownContacts as c (c.name)}
				<option value={c.name}></option>
			{/each}
		</datalist>
	{/if}

	{#if mode === 'admin' && showAddTeam}
		<section class="card">
			<p class="card-eyebrow">{m.teams_add_team_heading()}</p>
			<form
				method="POST"
				action="?/createTeam"
				use:enhance={withSubmitting(
					(v) => (creatingTeam = v),
					() => {
						showAddTeam = false;
						resetNewTeamDraft();
					}
				)}
			>
				<div class="field">
					<input name="name" bind:value={newTeamName} placeholder={m.teams_add_team_placeholder()} required />
				</div>
				<div class="field">
					<input name="description" bind:value={newTeamDescription} placeholder={m.teams_description_placeholder()} />
				</div>
				<Disclosure variant="inline">
					{#snippet summary()}<span>{m.teams_contact_section_label()}</span>{/snippet}
					<div class="field">
						<input
							name="contactName"
							value={newTeamContactName}
							oninput={(e) => onNewContactNameInput(e.currentTarget.value)}
							placeholder={m.teams_contact_placeholder()}
							list="team-known-contacts"
						/>
					</div>
					<div class="field">
						<input name="contactEmail" bind:value={newTeamContactEmail} placeholder={m.teams_contact_email_placeholder()} />
					</div>
					<label class="checkline">
						<input
							type="checkbox"
							name="showEmail"
							bind:checked={newTeamShowEmail}
							disabled={newTeamContactEmail.trim().length === 0}
						/>
						<span>{m.teams_contact_show_email()}</span>
					</label>
					<div class="field">
						<input name="contactPhone" bind:value={newTeamContactPhone} placeholder={m.teams_contact_phone_placeholder()} />
					</div>
					<label class="checkline">
						<input
							type="checkbox"
							name="showPhone"
							bind:checked={newTeamShowPhone}
							disabled={newTeamContactPhone.trim().length === 0}
						/>
						<span>{m.teams_contact_show_phone()}</span>
					</label>
				</Disclosure>
				{#if form?.form === 'createTeam' && form?.error}<p class="error">{form.error}</p>{/if}
				<button type="submit" class="btn btn-primary btn-block" disabled={creatingTeam}>
					{creatingTeam ? m.groups_creating() : m.teams_add_team_button()}
				</button>
			</form>
		</section>
	{/if}

	{#if teams.length === 0}
		<p class="empty">{m.teams_no_teams()}</p>
	{/if}

	{#if mode === 'member'}
		<!-- Directory of compact team cards — `.card-grid` (shared with
		     Home/Tracks) goes 2-up once there's room, one column on mobile.
		     `align-items: start` on that grid (shell.css) is what lets one
		     card grow taller without stretching its row-mate. Two states per
		     card — see the doc comment at the top of this file. -->
		<div class="card-grid">
			{#each teams as t (t.id)}
				{@const interested = hasInterestInTeam(t)}
				{@const contactText = contactDisplayText(t.contact_name, t.contact_email, t.contact_phone)}
				<section class="card team-card">
					<button
						type="button"
						class="team-summary"
						aria-expanded={!!expandedTeamIds[t.id]}
						onclick={() => toggleExpanded(t.id)}
					>
						<span class="team-summary-text">
							<span class="team-summary-title-row">
								<span class="card-title">{t.name}</span>
								{#if interested}<span class="badge-interested">{m.teams_interest_badge()}</span>{/if}
							</span>
							{#if t.description}<span class="card-meta">{t.description}</span>{/if}
						</span>
						<span class="chevron" class:is-open={!!expandedTeamIds[t.id]} aria-hidden="true"></span>
					</button>

					{#if expandedTeamIds[t.id]}
						<div class="team-body">
							{#if contactText}<p class="card-meta">{m.teams_contact_label({ contact: contactText })}</p>{/if}
							{#if t.roles.length === 0}
								<p class="card-note">{m.teams_no_roles_yet()}</p>
							{:else}
								{@const interestRoles = t.roles.filter((r) => r.mode === 'interest')}
								{#if interestRoles.length > 0}<p class="card-note">{m.teams_reassurance()}</p>{/if}
								{#each t.roles as r (r.id)}
									{#if r.mode === 'interest'}
										{@render memberRoleRow(r)}
									{:else if r.roster_visible_to_members}
										{@render memberRosterRoleBlock(r)}
									{/if}
								{/each}
								{#if interestRoles.length > 0}
									{#if interestSaveError[t.id]}<p class="error">{interestSaveError[t.id]}</p>{/if}
									<button
										type="button"
										class="btn btn-primary"
										disabled={!!savingInterestsFor[t.id]}
										onclick={() => saveTeamInterests(t)}
									>
										{savingInterestsFor[t.id] ? m.reset_password_saving() : m.teams_save_interests()}
									</button>
								{/if}
							{/if}
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{:else}
		<!-- Admin: same `.card-grid` of team cards as the member view (they're
		     the same card shape, just with roster/edit controls inside once
		     expanded) — kept at the same width on purpose, not the narrower
		     `.content-narrow` other admin-only tabs use for their form-heavy
		     screens, since this one isn't that: a data table/roster, not the
		     survey-style flow the member view above avoids. -->
		<div class="card-grid">
			{#each teams as t (t.id)}
				{@const contactText = contactDisplayText(t.contact_name, t.contact_email, t.contact_phone)}
				<section class="card team-card">
				<button
					type="button"
					class="team-summary"
					aria-expanded={!!expandedTeamIds[t.id]}
					onclick={() => toggleExpanded(t.id)}
				>
					<span class="team-summary-text">
						<span class="card-title">{t.name}</span>
						<span class="card-meta">
							{t.roles.length === 1
								? m.teams_role_count_one({ count: t.roles.length })
								: m.teams_role_count_other({ count: t.roles.length })}
						</span>
						{#if contactText}<span class="card-meta">{m.teams_contact_label({ contact: contactText })}</span>{/if}
					</span>
					<span class="chevron" class:is-open={!!expandedTeamIds[t.id]} aria-hidden="true"></span>
				</button>

				{#if editingTeamId === t.id}
					<form
						method="POST"
						action="?/updateTeam"
						class="inline-edit-row"
						use:enhance={withSubmitting((v) => (savingTeam = v), () => (editingTeamId = null))}
					>
						<input type="hidden" name="teamId" value={t.id} />
						<div class="field">
							<input name="name" bind:value={teamNameDraft} required />
						</div>
						<div class="field">
							<input name="description" bind:value={teamDescriptionDraft} placeholder={m.teams_description_placeholder()} />
						</div>
						<Disclosure variant="inline" open={teamContactNameDraft.trim().length > 0}>
							{#snippet summary()}<span>{m.teams_contact_section_label()}</span>{/snippet}
							<div class="field">
								<input
									name="contactName"
									value={teamContactNameDraft}
									oninput={(e) => onEditContactNameInput(e.currentTarget.value)}
									placeholder={m.teams_contact_placeholder()}
									list="team-known-contacts"
								/>
							</div>
							<div class="field">
								<input name="contactEmail" bind:value={teamContactEmailDraft} placeholder={m.teams_contact_email_placeholder()} />
							</div>
							<label class="checkline">
								<input
									type="checkbox"
									name="showEmail"
									bind:checked={teamShowEmailDraft}
									disabled={teamContactEmailDraft.trim().length === 0}
								/>
								<span>{m.teams_contact_show_email()}</span>
							</label>
							<div class="field">
								<input name="contactPhone" bind:value={teamContactPhoneDraft} placeholder={m.teams_contact_phone_placeholder()} />
							</div>
							<label class="checkline">
								<input
									type="checkbox"
									name="showPhone"
									bind:checked={teamShowPhoneDraft}
									disabled={teamContactPhoneDraft.trim().length === 0}
								/>
								<span>{m.teams_contact_show_phone()}</span>
							</label>
						</Disclosure>
						{#if form?.form === 'editTeam' && form?.error}<p class="error">{form.error}</p>{/if}
						<div class="btn-row">
							<button type="submit" class="btn btn-outline" disabled={savingTeam}>{m.action_save()}</button>
							<button type="button" class="text-link" onclick={() => (editingTeamId = null)}>{m.action_cancel()}</button>
						</div>
					</form>
				{:else}
					{@const admin = t as TeamAdminOut}
					<div class="btn-row">
						<button type="button" class="text-link" onclick={() => startEditTeam(admin)}>{m.drawer_edit()}</button>
						<ConfirmButton>
							{#snippet trigger(start)}
								<button type="button" class="text-link text-link--danger" onclick={start}>{m.teams_delete_team()}</button>
							{/snippet}
							{#snippet confirm(cancel)}
								<span class="dim">{m.teams_delete_team_confirm()}</span>
								<button type="button" class="text-link" onclick={cancel}>{m.action_cancel()}</button>
								<form method="POST" action="?/deleteTeam" use:enhance>
									<input type="hidden" name="teamId" value={t.id} />
									<button type="submit" class="text-link text-link--danger">{m.teams_delete_team()}</button>
								</form>
							{/snippet}
						</ConfirmButton>
					</div>
				{/if}

				{#if expandedTeamIds[t.id]}
					<div class="team-body">
						{#if t.roles.length === 0}
							<p class="card-note">{m.teams_no_roles_yet()}</p>
						{/if}

						{#each t.roles as r (r.id)}
							<div class="team-role-admin">
								{#if editingRoleId === r.id}
									<form
										method="POST"
										action="?/updateTeamRole"
										class="inline-edit-row"
										use:enhance={withSubmitting((v) => (savingRole = v), () => (editingRoleId = null))}
									>
										<input type="hidden" name="roleId" value={r.id} />
										<div class="field">
											<input name="roleName" bind:value={roleNameDraft} required />
										</div>
										<label class="field">
											<span>{m.teams_role_mode_label()}</span>
											<select name="mode" bind:value={roleModeDraft}>
												<option value="interest">{m.teams_role_mode_interest()}</option>
												<option value="roster">{m.teams_role_mode_roster()}</option>
											</select>
										</label>
										{#if roleModeDraft === 'roster'}
											<label class="checkline">
												<input type="checkbox" name="rosterVisible" bind:checked={roleRosterVisibleDraft} />
												<span>{m.teams_roster_visible_to_members()}</span>
											</label>
										{/if}
										{#if form?.form === 'editTeam' && form?.error}<p class="error">{form.error}</p>{/if}
										<div class="btn-row">
											<button type="submit" class="btn btn-outline" disabled={savingRole}>{m.action_save()}</button>
											<button type="button" class="text-link" onclick={() => (editingRoleId = null)}>{m.action_cancel()}</button>
										</div>
									</form>
								{:else}
									<div class="team-role-header">
										<span
											>{r.name}
											{#if r.mode === 'roster'}<span class="role-mode-badge">{m.teams_role_mode_roster_badge()}</span
												>{/if}</span
										>
										<div class="btn-row">
											<button type="button" class="text-link" onclick={() => startEditRole(r)}>{m.drawer_edit()}</button>
											<form method="POST" action="?/deleteTeamRole" use:enhance>
												<input type="hidden" name="roleId" value={r.id} />
												<button type="submit" class="text-link text-link--danger">{m.groups_remove()}</button>
											</form>
										</div>
									</div>
								{/if}
								{#if r.mode === 'roster'}
									<!-- Roster-mode: admin-maintained name list, not a
									     self-signup roster. Each entry gets its own
									     remove link, plus a name+contact "Add" row below. -->
									{#if r.signups.length === 0}
										<p class="card-note">{m.teams_roster_empty()}</p>
									{:else}
										{#each r.signups as s (s.id)}
											<div class="list-row">
												<span class="dim">{s.contact ? m.teams_roster_entry_with_contact({ name: s.name, contact: s.contact }) : s.name}</span>
												<form method="POST" action="?/removeTeamSignup" use:enhance>
													<input type="hidden" name="signupId" value={s.id} />
													<button type="submit" class="text-link text-link--danger">{m.groups_remove()}</button>
												</form>
											</div>
										{/each}
									{/if}
									<form
										method="POST"
										action="?/addTeamRosterEntry"
										class="role-row"
										use:enhance={withSubmitting(
											(v) => (addingRosterEntry[r.id] = v),
											() => {
												newRosterEntryName[r.id] = '';
												newRosterEntryContact[r.id] = '';
											}
										)}
									>
										<input type="hidden" name="roleId" value={r.id} />
										<div class="field">
											<input
												name="name"
												bind:value={newRosterEntryName[r.id]}
												placeholder={m.teams_roster_name_placeholder()}
												required
											/>
										</div>
										<div class="field">
											<input
												name="contact"
												bind:value={newRosterEntryContact[r.id]}
												placeholder={m.teams_roster_contact_placeholder()}
											/>
										</div>
										<button type="submit" class="text-link" disabled={!!addingRosterEntry[r.id]}>
											{m.teams_roster_add_button()}
										</button>
									</form>
								{:else if r.signups.length === 0}
									<p class="card-note">{m.teams_admin_no_signups()}</p>
								{:else}
									{#each r.signups as s (s.id)}
										<div class="list-row">
											<span class="dim">{s.name}{s.text_value ? `: ${s.text_value}` : ''}</span>
										</div>
									{/each}
								{/if}
							</div>
						{/each}

						<form
							method="POST"
							action="?/addTeamRole"
							class="role-row role-row-with-mode"
							use:enhance={withSubmitting(
								(v) => (addingRole[t.id] = v),
								() => {
									newRoleDrafts[t.id] = '';
									newRoleMode[t.id] = 'interest';
									newRoleRosterVisible[t.id] = false;
								}
							)}
						>
							<input type="hidden" name="teamId" value={t.id} />
							<div class="field">
								<input name="roleName" bind:value={newRoleDrafts[t.id]} placeholder={m.groups_role_placeholder()} required />
							</div>
							<label class="field">
								<span>{m.teams_role_mode_label()}</span>
								<select name="mode" bind:value={newRoleMode[t.id]}>
									<option value="interest">{m.teams_role_mode_interest()}</option>
									<option value="roster">{m.teams_role_mode_roster()}</option>
								</select>
							</label>
							{#if (newRoleMode[t.id] ?? 'interest') === 'roster'}
								<label class="checkline">
									<input type="checkbox" name="rosterVisible" bind:checked={newRoleRosterVisible[t.id]} />
									<span>{m.teams_roster_visible_to_members()}</span>
								</label>
							{/if}
							<button type="submit" class="text-link" disabled={!!addingRole[t.id]}>{m.groups_add_role()}</button>
						</form>
					</div>
				{/if}
			</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Member and admin both stay full shell width (no `.content-narrow`
	   cap): they're the same `.card-grid` of team cards either way, so
	   narrowing one but not the other would make the layout visibly shift
	   just from switching modes. */
	.teams-body {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.teams-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.team-card {
		gap: 0.6rem;
	}

	.team-summary {
		all: unset;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.team-summary-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.team-summary-title-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.badge-interested {
		flex: 0 0 auto;
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
		white-space: nowrap;
	}

	.team-body {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-top: 0.5rem;
		margin-top: 0.3rem;
		border-top: 1px solid var(--border);
	}

	.team-role-admin {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.team-role-admin + .team-role-admin {
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}

	.team-role-member + .team-role-member {
		margin-top: 0.5rem;
	}

	/* A visible roster role's member-facing read-only block: same font size
	   as the interactive `interest-option` chip it sits alongside, just no
	   border/button chrome since there's nothing to toggle. */
	.team-role-roster {
		padding: 0.4rem 0;
		font-size: 0.875rem;
		color: var(--text);
	}

	.roster-role-name {
		font-weight: 600;
		margin: 0 0 0.2rem;
	}

	.roster-entry {
		margin: 0;
		color: var(--text-muted);
	}

	/* The admin role list's small "roster" tag, distinct from the member
	   card's `.badge-interested` (a personal "you're in" signal). This is
	   just a mode label, so it's muted rather than accent-colored. */
	.role-mode-badge {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.team-role-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.inline-edit-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	/* A real `<form>` now (the add-role field), not a plain `<div>` —
	   `shell.css`'s bare `form { flex-direction: column }` rule otherwise
	   wins over this class for that one property (CSS cascades per property,
	   not per rule), collapsing this back to a stacked layout. See
	   `shell.css`'s own comment on this exact gotcha. */
	.role-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.role-row .field {
		flex: 1 1 auto;
	}

	/* The add-role row grows a mode picker (and, for roster mode, a
	   visibility checkbox) alongside the name field: wrap instead of
	   squeezing everything onto one line once there's no room. */
	.role-row-with-mode {
		flex-wrap: wrap;
	}

	/* One bordered box per role, holding both the toggle button and (for a
	   `has_text_field` role) its revealed text field, so checking it grows
	   the same card instead of popping a second, separately-bordered field
	   below it. */
	.interest-option {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		overflow: hidden;
	}

	.interest-option:hover {
		border-color: var(--accent);
	}

	.interest-option.is-selected {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
	}

	.interest-option-toggle {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		min-height: 3rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.interest-option-input {
		display: block;
		box-sizing: border-box;
		width: 100%;
		border: none;
		border-top: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 0.875rem;
		padding: 0.6rem 0.8rem;
	}

	.interest-option-input:focus {
		outline: none;
	}

	.interest-option-icon {
		width: 1.5rem;
		height: 1.5rem;
		flex: 0 0 1.5rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--accent);
		font-weight: 800;
	}
</style>
