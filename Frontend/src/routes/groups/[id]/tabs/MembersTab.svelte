<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import { assertUngated } from '../groupTabs';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();
	// This tab only ever mounts from `+page.svelte`'s non-gate branch, so
	// `data.group`/`data.user` are always genuinely defined here: see
	// `groupTabs.ts`'s `assertUngated` doc comment for why they're typed
	// optional/nullable in `PageData` at all. A one-time check at mount, not
	// a reactive read of `data` (it never meaningfully changes afterward).
	// svelte-ignore state_referenced_locally
	assertUngated(data);

	// Members tab: which member's row (by id) has its title swapped for the
	// inline edit form — at most one at a time.
	let editingTitleUserId = $state<string | null>(null);
	let titleDraft = $state('');
	let savingTitle = $state(false);
	let addingMember = $state(false);
	let memberEmail = $state('');

	// Known names: admin-only rename-that-merges-history for the free-text
	// guest names typed into Responsibilities/Carpool. Keyed by the name
	// itself (`KnownNameOut` has no id), single-field inline edit like the
	// member title row above.
	let editingKnownName = $state<string | null>(null);
	let knownNameDraft = $state('');
	let savingKnownName = $state(false);

	// Local copy of the roster so `removeMember` can drop a row the instant
	// it's confirmed, instead of waiting for the reload; resynced whenever
	// the server data actually changes (a reload, or another tab's edit).
	// svelte-ignore state_referenced_locally
	let members = $state(data.members);
	$effect(() => {
		members = data.members;
	});
</script>

<div class="content-narrow">
<section class="card">
	{#each members as member (member.user_id)}
		<div class="member-row">
			<div class="member-identity">
				<span class="member-name-line">
					{member.name}{member.role === 'admin' ? ` (${m.groups_role_admin()})` : ''}
					{#if member.is_anonymous}
						<!-- B19: signed up from a local-only device, no Saved account yet. -->
						<span class="badge-unverified" title={m.roster_unverified_hint()}>{m.roster_unverified_badge()}</span>
					{/if}
				</span>
				{#if editingTitleUserId === member.user_id}
					<form
						method="POST"
						action="?/updateMemberTitle"
						use:enhance={withSubmitting((v) => (savingTitle = v), () => (editingTitleUserId = null))}
						class="inline-edit-row"
					>
						<input type="hidden" name="userId" value={member.user_id} />
						<input name="title" bind:value={titleDraft} placeholder="e.g. Soprano 2, Section leader" />
						<button type="submit" class="btn btn-outline" disabled={savingTitle}>{m.action_save()}</button>
						<button type="button" class="text-link" onclick={() => (editingTitleUserId = null)}>{m.action_cancel()}</button>
					</form>
				{:else}
					{#if member.title}
						<span class="dim">{member.title}</span>
					{/if}
					{#if !member.is_anonymous}
						<!-- An anonymous participant's email is a synthetic
						     anon-*.invalid placeholder, not a real address
						     (see mint_anonymous_participant), so it's just
						     noise next to the "Unverified" badge above and
						     is hidden for that row only. -->
						<span class="dim">{member.email}</span>
					{/if}
					{#if mode === 'admin'}
						<button
							type="button"
							class="text-link"
							onclick={() => {
								titleDraft = member.title ?? '';
								editingTitleUserId = member.user_id;
							}}
						>
							{member.title ? m.groups_edit_title() : m.groups_add_title()}
						</button>
					{/if}
				{/if}
			</div>
			{#if mode === 'admin' && member.user_id !== data.user.id}
				<ConfirmButton>
					{#snippet trigger(start)}
						<div class="member-actions">
							<form method="POST" action="?/updateMemberRole" use:enhance>
								<input type="hidden" name="userId" value={member.user_id} />
								<input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
								<button type="submit" class="text-link">
									{member.role === 'admin' ? m.groups_remove_admin() : m.groups_make_admin()}
								</button>
							</form>
							<button type="button" class="text-link" onclick={start}>
								{m.groups_remove()}
							</button>
						</div>
					{/snippet}
					{#snippet confirm(cancel)}
						<div class="member-actions">
							<span class="dim">{m.groups_remove_confirm()}</span>
							<button type="button" class="text-link" onclick={cancel}>
								{m.action_cancel()}
							</button>
							<form
								method="POST"
								action="?/removeMember"
								use:enhance={({ formData }) => {
									const userId = String(formData.get('userId'));
									const removed = members.find((mem) => mem.user_id === userId);
									members = members.filter((mem) => mem.user_id !== userId);
									return async ({ result, update }) => {
										if (result.type !== 'success' && removed) members = [...members, removed];
										await update();
									};
								}}
							>
								<input type="hidden" name="userId" value={member.user_id} />
								<button type="submit" class="text-link text-link--danger">{m.groups_confirm()}</button>
							</form>
						</div>
					{/snippet}
				</ConfirmButton>
			{/if}
		</div>
	{/each}
	{#if form?.form === 'removeMember' && form?.error}
		<p class="error">{form.error}</p>
	{/if}
	{#if form?.form === 'updateMemberRole' && form?.error}
		<p class="error">{form.error}</p>
	{/if}
	{#if form?.form === 'updateMemberTitle' && form?.error}
		<p class="error">{form.error}</p>
	{/if}
</section>
{#if mode === 'admin'}
	<section class="card">
		<p class="card-eyebrow">{m.groups_invite_member()}</p>
		<form
			method="POST"
			action="?/addMember"
			use:enhance={withSubmitting((v) => (addingMember = v), () => (memberEmail = ''))}
		>
			<label class="field">
				<span>{m.login_email()}</span>
				<input type="email" name="email" bind:value={memberEmail} placeholder="singer@example.com" required />
			</label>
			{#if form?.form === 'addMember' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if form?.form === 'addMember' && form?.success}
				<p class="success">{m.groups_added()}</p>
			{/if}
			<button class="btn btn-primary btn-block" type="submit" disabled={addingMember}>
				{addingMember ? m.groups_inviting() : m.groups_invite_member()}
			</button>
		</form>
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.groups_known_names()}</p>
		<p class="card-note">{m.groups_known_names_note()}</p>

		{#if data.knownNames.length === 0}
			<p class="card-note">{m.groups_known_names_none()}</p>
		{/if}

		{#each data.knownNames as kn (kn.name)}
			{#if editingKnownName === kn.name}
				<form
					method="POST"
					action="?/renameKnownName"
					use:enhance={withSubmitting((v) => (savingKnownName = v), () => (editingKnownName = null))}
				>
					<input type="hidden" name="oldName" value={kn.name} />
					<label class="field">
						<span>{m.groups_known_names()}</span>
						<input name="newName" bind:value={knownNameDraft} required />
					</label>
					{#if form?.form === 'knownNames' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={() => (editingKnownName = null)}>
							{m.action_cancel()}
						</button>
						<button class="btn btn-primary" type="submit" disabled={savingKnownName}>
							{savingKnownName ? m.reset_password_saving() : m.action_save()}
						</button>
					</div>
				</form>
			{:else}
				<div class="list-row">
					<span class="known-name-block">
						<span class="known-name-line">
							<span>{kn.name}</span>
							<span class="dim">
								{kn.count === 1 ? m.groups_known_names_uses_one({ count: kn.count }) : m.groups_known_names_uses_other({ count: kn.count })}
							</span>
						</span>
						{#if kn.phone || kn.email}
							<span class="known-name-line dim">
								{#if kn.phone}<span>{m.groups_known_names_phone({ phone: kn.phone })}</span>{/if}
								{#if kn.email}<span>{m.groups_known_names_email({ email: kn.email })}</span>{/if}
							</span>
						{/if}
					</span>
					<button
						type="button"
						class="text-link"
						onclick={() => {
							knownNameDraft = kn.name;
							editingKnownName = kn.name;
						}}
					>
						{m.drawer_edit()}
					</button>
				</div>
			{/if}
		{/each}
	</section>
{/if}
</div>

<style>
	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.member-row + .member-row {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}

	.member-identity {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.member-name-line {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.badge-unverified {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
		white-space: nowrap;
	}

	.member-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.inline-edit-row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.inline-edit-row input:not([type]) {
		flex: 1 1 auto;
		min-width: 0;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.known-name-block {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.known-name-line {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
