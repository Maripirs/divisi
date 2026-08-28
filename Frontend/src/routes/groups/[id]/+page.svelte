<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import '$lib/styles/shell.css';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Same four tab slots in both modes, just relabeled — see the `tab`
	// picker below. Keeping one `tab` state (rather than separate
	// member/admin tab state) means switching modes never has to remap a
	// tab selection that doesn't exist on the other side.
	type Tab = 'primary' | 'tracks' | 'members' | 'about';
	let tab = $state<Tab>('primary');

	// Admin mode is a *view* of this same group page, not a separate
	// destination (UX_WIREFRAME.md's Admin Experience) — reachable via the
	// role switcher below, or a direct `?view=admin` link (what the old
	// `/groups/[id]/admin` route now redirects to). Defaults to member
	// view even for an admin, per the human's call on this doc's own open
	// question ("member or admin view by default?").
	let mode = $state<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	const isAdmin = data.group.role === 'admin';

	// One-time confirmation right after `/groups/new` creates this group —
	// UX_WIREFRAME.md's Create Group Flow wants a "created" screen with the
	// join code and quick next actions; shown as a dismissable banner here
	// rather than a separate route, since a brand-new group is otherwise
	// just this same admin view.
	let showCreatedBanner = $state(page.url.searchParams.get('created') === '1');

	let guestHomeworkVisible = $state(data.group.guest_homework_visible);
	let removePassword = $state(false);
	let savingGuestSettings = $state(false);
	let addingMember = $state(false);
	let memberEmail = $state('');

	function formatDate(iso: string | null) {
		if (!iso) return 'No due date';
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<main class="shell">
	<AppHeader title={data.group.name} />

	{#if showCreatedBanner}
		<section class="card card--highlight">
			<p class="card-eyebrow">{data.group.name} created</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
			<p class="card-note">Share the join code so singers can view rehearsal tracks with no login.</p>
			<div class="btn-row">
				<button
					type="button"
					class="btn btn-outline"
					onclick={() => {
						tab = 'members';
						showCreatedBanner = false;
					}}
				>
					Invite members
				</button>
				<a class="btn btn-outline" href="/groups/{data.group.id}/admin/new-homework">Create homework</a>
				<button type="button" class="btn btn-primary" onclick={() => (showCreatedBanner = false)}>
					View group
				</button>
			</div>
		</section>
	{/if}

	{#if isAdmin}
		<div class="role-switch">
			<span>Viewing as {mode === 'admin' ? 'Admin' : 'Member'}</span>
			<button type="button" class="text-link" onclick={() => (mode = mode === 'admin' ? 'member' : 'admin')}>
				Switch to {mode === 'admin' ? 'Member' : 'Admin'}
			</button>
		</div>
	{/if}

	<div class="tabs" role="tablist">
		<button class="tab" class:active={tab === 'primary'} onclick={() => (tab = 'primary')}>
			{mode === 'admin' ? 'Assignments' : 'Homework'}
		</button>
		<button class="tab" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>
			{mode === 'admin' ? 'Tracks' : 'Rehearsal Tracks'}
		</button>
		<button class="tab" class:active={tab === 'members'} onclick={() => (tab = 'members')}>Members</button>
		<button class="tab" class:active={tab === 'about'} onclick={() => (tab = 'about')}>
			{mode === 'admin' ? 'Settings' : 'Info'}
		</button>
	</div>

	{#if tab === 'primary'}
		{#if mode === 'admin'}
			<p class="tab-meta">{data.homework.length} active</p>
		{/if}
		{#if data.homework.length === 0}
			<p class="empty">No homework assigned yet.</p>
		{:else}
			{#each data.homework as hw (hw.id)}
				<section class="card">
					<p class="card-eyebrow">{formatDate(hw.due_date)}</p>
					<p class="card-title">{hw.title}</p>
					<p class="card-meta">{hw.range}{hw.pieceTitle ? ` · ${hw.pieceTitle}` : ''}</p>
					{#if hw.instructions}
						<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
					{/if}
					<div class="btn-row">
						<a class="btn btn-primary" href="/groups/{data.group.id}/homework/{hw.id}">
							{mode === 'admin' ? 'View' : 'View assignment'}
						</a>
					</div>
				</section>
			{/each}
		{/if}
		{#if mode === 'admin'}
			<div class="btn-row">
				<a class="btn btn-outline" href="/groups/{data.group.id}/admin/new-homework">+ New homework</a>
			</div>
		{/if}
	{:else if tab === 'tracks'}
		{#if mode === 'admin'}
			<p class="tab-meta">{data.tracks.length} shared with this group</p>
		{/if}
		{#if data.tracks.length === 0}
			<p class="empty">No rehearsal tracks shared with this group yet.</p>
		{:else}
			{#each data.tracks as track (track.piece_id)}
				{@const bundled = getPieceByTitle(track.title)}
				<section class="card">
					<p class="card-title">{track.title}</p>
					<p class="card-meta">Status: {track.version_status}</p>
					{#if bundled}
						<div class="btn-row">
							<a class="btn btn-primary" href="/piece/{bundled.id}">Practice</a>
						</div>
					{:else}
						<p class="card-note">
							Practice isn't wired up for this track yet (see Frontend/plan.md's backlog).
						</p>
					{/if}
				</section>
			{/each}
		{/if}
		{#if mode === 'admin'}
			<p class="card-note">
				Upload a piece via the Backend's `/library/pieces` upload endpoint, then distribute it to
				this group — no in-app upload UI yet.
			</p>
		{/if}
	{:else if tab === 'members'}
		<section class="card">
			{#each data.members as member (member.user_id)}
				<div class="list-row">
					<span>{member.name}{member.role === 'admin' ? ' (Admin)' : ''}</span>
					<span class="dim">{member.email}</span>
				</div>
			{/each}
		</section>
		{#if mode === 'admin'}
			<section class="card">
				<p class="card-eyebrow">Invite member</p>
				<form
					method="POST"
					action="?/addMember"
					use:enhance={() => {
						addingMember = true;
						return async ({ update }) => {
							addingMember = false;
							memberEmail = '';
							await update();
						};
					}}
				>
					<label class="field">
						<span>Email</span>
						<input type="email" name="email" bind:value={memberEmail} placeholder="singer@example.com" required />
					</label>
					{#if form?.form === 'addMember' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					{#if form?.form === 'addMember' && form?.success}
						<p class="success">Added.</p>
					{/if}
					<button class="btn btn-primary btn-block" type="submit" disabled={addingMember}>
						{addingMember ? 'Inviting…' : 'Invite member'}
					</button>
				</form>
			</section>
		{/if}
	{:else if mode === 'admin'}
		<section class="card">
			<p class="card-eyebrow">Group settings</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
		</section>

		<section class="card">
			<p class="card-eyebrow">Guest access</p>
			<p class="card-note">
				Anyone with the join code (and password, if set) can view this group's rehearsal tracks
				with no login. Nothing they do is saved to the Backend.
			</p>
			<form
				method="POST"
				action="?/updateGuestSettings"
				use:enhance={() => {
					savingGuestSettings = true;
					return async ({ update }) => {
						savingGuestSettings = false;
						removePassword = false;
						await update();
					};
				}}
			>
				<label class="field">
					<span>{data.group.has_guest_password ? 'Change password' : 'Set a password'}</span>
					<input
						type="password"
						name="guestPassword"
						placeholder={data.group.has_guest_password ? 'Leave blank to keep current' : 'Leave blank for no password'}
					/>
				</label>
				{#if data.group.has_guest_password}
					<label class="checkline">
						<input type="checkbox" name="removePassword" bind:checked={removePassword} />
						<span>Remove the password entirely</span>
					</label>
				{/if}
				<label class="checkline">
					<input type="checkbox" name="guestHomeworkVisible" bind:checked={guestHomeworkVisible} />
					<span>Show homework to guests (no login)</span>
				</label>

				{#if form?.form === 'guestSettings' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				{#if form?.form === 'guestSettings' && form?.success}
					<p class="success">Saved.</p>
				{/if}

				<button class="btn btn-primary btn-block" type="submit" disabled={savingGuestSettings}>
					{savingGuestSettings ? 'Saving…' : 'Save guest settings'}
				</button>
			</form>
		</section>
	{:else}
		<section class="card">
			<p class="card-eyebrow">About</p>
			<p class="card-meta">
				{data.tracks.length} rehearsal track{data.tracks.length === 1 ? '' : 's'} shared ·
				{data.homework.length} active assignment{data.homework.length === 1 ? '' : 's'}
			</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
		</section>
	{/if}
</main>

<BottomNav />

<style>
	.role-switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.role-switch .text-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
	}

	.tab-meta {
		margin: -0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.error {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.success {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
