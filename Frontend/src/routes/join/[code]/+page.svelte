<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Tab = 'tracks' | 'homework' | 'weeklyNotes' | 'responsibilities';
	let tab = $state<Tab>('tracks');

	// Nudges an anonymous guest toward creating an account — no persistence
	// (plain `$state`, not `localStorage`), so it reappears every visit
	// since guests aren't tracked across sessions at all.
	let bannerDismissed = $state(false);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	// Weekly Notes' `note_date` has no time-of-day meaning — see the group
	// page's matching `formatNoteDate` note on why this needs pinning to
	// UTC instead of `formatDate`'s local-time conversion.
	function formatNoteDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	function formatDateTime(iso: string) {
		return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function formatDueDate(iso: string | null) {
		return iso ? formatDate(iso) : 'No due date';
	}

	function coverageLabel(status: string) {
		if (status === 'underfilled') return 'Needs volunteers';
		if (status === 'overfilled') return 'Overfilled';
		return 'Covered';
	}
</script>

<main class="shell join-result">
	{#if !data.group}
		<div class="hero">
			<Logo size={48} />
		</div>
	{/if}

	{#if data.error === 'not-found'}
		<section class="card">
			<p class="card-title">Code not found</p>
			<p class="card-meta">
				"{data.code}" doesn't match any group. Double-check the code with your choir admin and
				try again.
			</p>
			<a class="btn btn-outline btn-block" href="/join">Try another code</a>
		</section>
	{:else if data.error === 'password-required'}
		<section class="card">
			<p class="card-title">Password required</p>
			<p class="card-meta">This group's admin protected it with a password. Ask them for it.</p>
			<form method="GET">
				<label class="field">
					<span>Password</span>
					<input type="password" name="password" required autofocus />
				</label>
				<button class="btn btn-primary btn-block" type="submit">Continue</button>
			</form>
		</section>
	{:else if data.error === 'server'}
		<section class="card">
			<p class="card-title">Something went wrong</p>
			<p class="card-meta">Couldn't reach the server. Please try again in a moment.</p>
			<a class="btn btn-outline btn-block" href="/join">Back</a>
		</section>
	{:else if data.group}
		<AppHeader title={data.group.groupName} homeHref="/join/{data.code}" />

		{#if !bannerDismissed}
			<section class="card card--highlight">
				<p class="card-note">
					Browsing as a guest. Sign in for full member access, including homework, signing up
					for responsibilities, and the members list.
				</p>
				<div class="btn-row">
					<a class="btn btn-primary" href="/login?redirectTo=/join/{data.code}">Sign in</a>
					<button type="button" class="btn btn-outline" onclick={() => (bannerDismissed = true)} aria-label="Dismiss">
						Not now
					</button>
				</div>
			</section>
		{/if}

		{#if data.homeworkVisible || data.responsibilitiesVisible || data.weeklyNotesVisible}
			<div class="tabs" role="tablist">
				<button class="tab" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>
					Rehearsal Tracks
				</button>
				{#if data.homeworkVisible}
					<button class="tab" class:active={tab === 'homework'} onclick={() => (tab = 'homework')}>
						Homework
					</button>
				{/if}
				{#if data.weeklyNotesVisible}
					<button class="tab" class:active={tab === 'weeklyNotes'} onclick={() => (tab = 'weeklyNotes')}>
						Weekly Notes
					</button>
				{/if}
				{#if data.responsibilitiesVisible}
					<button class="tab" class:active={tab === 'responsibilities'} onclick={() => (tab = 'responsibilities')}>
						Responsibilities
					</button>
				{/if}
			</div>
		{/if}

		{#if tab === 'homework' && data.homeworkVisible}
			{#if data.homework.length === 0}
				<p class="empty">No homework assigned yet.</p>
			{:else}
				{#each data.homework as hw (hw.id)}
					<section class="card">
						<p class="card-eyebrow">{formatDueDate(hw.dueDate)}</p>
						<p class="card-title">{hw.title}</p>
						<p class="card-meta">{hw.range}</p>
						{#if hw.instructions}
							<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
						{/if}
					</section>
				{/each}
			{/if}
		{:else if tab === 'weeklyNotes' && data.weeklyNotesVisible}
			{#if data.weeklyNotes.length === 0}
				<p class="empty">No weekly notes posted yet.</p>
			{:else}
				{#each data.weeklyNotes as n (n.id)}
					<section class="card">
						<p class="card-eyebrow">Week of {formatNoteDate(n.noteDate)}</p>
						<p class="card-title">{n.title}</p>
						{#if n.body}
							<p class="card-note">{n.body}</p>
						{/if}
					</section>
				{/each}
			{/if}
		{:else if tab === 'responsibilities' && data.responsibilitiesVisible}
			<!-- Guest coverage view only — no signup identities (see the
			     Backend's `ResponsibilityGuestRoleCoverageOut`), so this is
			     read-only, no sign-up action like the member group page has. -->
			{#if data.responsibilities.length === 0}
				<p class="empty">No responsibilities scheduled yet.</p>
			{:else}
				{#each data.responsibilities as d (d.id)}
					<section class="card">
						<p class="card-eyebrow">
							{formatDateTime(d.date)}{#if d.canceled} · Canceled{:else if d.locked} · Locked{/if}
						</p>
						<p class="card-title">{d.scheduleName}</p>
						{#if d.notes}
							<p class="card-note">{d.notes}</p>
						{/if}
						{#each d.roles as role (role.roleId)}
							<div class="list-row">
								<span>{role.roleName} · {role.activeCount}/{role.neededCount}</span>
								<span class="dim">{coverageLabel(role.status)}</span>
							</div>
						{/each}
					</section>
				{/each}
			{/if}
		{:else}
			<!-- Same as the member group page's Tracks tab: a guest only sees
			     pieces that actually have a practice file wired up (no dead
			     "not wired up" entries), each its own card with the same
			     circle-play icon button as the personal Library. -->
			{@const visiblePieces = data.group.pieces.filter(
				(piece) => getPieceByTitle(piece.title) || piece.hasMusic || piece.hasPdf
			)}
			{#if visiblePieces.length === 0}
				<p class="empty">No rehearsal tracks shared with this group yet.</p>
			{:else}
				{#each visiblePieces as piece (piece.pieceId)}
					{@const bundled = getPieceByTitle(piece.title)}
					{@const practiceId = bundled ? bundled.id : piece.pieceId}
					<section class="card track-card">
						<div class="track-info">
							<p class="card-title">{piece.title}</p>
							<p class="card-meta">Shared {formatDate(piece.distributedAt)}</p>
						</div>
						<a
							class="piece-action piece-action--primary"
							href="/piece/{practiceId}?guest=1&code={data.code}"
							aria-label="Open player"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 5v14l11-7z" />
							</svg>
						</a>
					</section>
				{/each}
			{/if}
		{/if}
	{/if}
</main>

<style>
	.join-result {
		padding-bottom: 3rem;
	}

	.hero {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0 1rem;
	}

	.track-card {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.track-info {
		min-width: 0;
	}

	.piece-action {
		flex: 0 0 auto;
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
	}

	.piece-action:hover {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.piece-action--primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.piece-action--primary:hover {
		background: var(--accent-hover);
	}

	.piece-action svg {
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
		margin-left: -0.1rem;
	}
</style>
