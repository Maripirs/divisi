<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import { renderNoteMarkdown } from '$lib/utils/noteMarkdown';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
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

	// Homework `dueDate` has no time-of-day meaning (an admin picks a plain
	// calendar date) — unlike `formatDate` above, this pins to UTC so it
	// doesn't roll back a calendar day in any timezone behind UTC (caught
	// live: a Sept 2 due date showed "Sep 1"). Same fix as the group page's
	// `formatDate` and Home's `formatDueDate`.
	function formatDueDate(iso: string | null) {
		return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : m.home_no_due_date();
	}

	function coverageLabel(status: string) {
		if (status === 'underfilled') return m.join_coverage_underfilled();
		if (status === 'overfilled') return m.join_coverage_overfilled();
		return m.join_coverage_covered();
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
			<p class="card-title">{m.join_code_not_found()}</p>
			<p class="card-meta">
				{m.join_code_not_found_body({ code: data.code })}
			</p>
			<a class="btn btn-outline btn-block" href={lh('/join')}>{m.join_try_another_code()}</a>
		</section>
	{:else if data.error === 'password-required'}
		<section class="card">
			<p class="card-title">{m.join_password_required()}</p>
			<p class="card-meta">{m.join_password_required_body()}</p>
			<form method="GET">
				<label class="field">
					<span>{m.login_password()}</span>
					<input type="password" name="password" required autofocus />
				</label>
				<button class="btn btn-primary btn-block" type="submit">{m.join_continue()}</button>
			</form>
		</section>
	{:else if data.error === 'server'}
		<section class="card">
			<p class="card-title">{m.join_something_went_wrong()}</p>
			<p class="card-meta">{m.errors_could_not_reach_server()}</p>
			<a class="btn btn-outline btn-block" href={lh('/join')}>{m.join_back()}</a>
		</section>
	{:else if data.group}
		<AppHeader title={data.group.groupName} homeHref={lh(`/join/${data.code}`)} />

		{#if !bannerDismissed}
			<section class="card card--highlight">
				<p class="card-note">
					{m.join_guest_banner()}
				</p>
				<div class="btn-row">
					<a class="btn btn-primary" href={lh(`/login?redirectTo=/join/${data.code}`)}>{m.join_sign_in()}</a>
					<button type="button" class="btn btn-outline" onclick={() => (bannerDismissed = true)} aria-label={m.join_dismiss()}>
						{m.join_not_now()}
					</button>
				</div>
			</section>
		{/if}

		{#if data.homeworkVisible || data.responsibilitiesVisible || data.weeklyNotesVisible}
			<div class="tabs" role="tablist">
				<button class="tab" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>
					{m.tracks_tab_title()}
				</button>
				{#if data.homeworkVisible}
					<button class="tab" class:active={tab === 'homework'} onclick={() => (tab = 'homework')}>
						{m.homework_tab_title()}
					</button>
				{/if}
				{#if data.weeklyNotesVisible}
					<button class="tab" class:active={tab === 'weeklyNotes'} onclick={() => (tab = 'weeklyNotes')}>
						{m.weekly_notes_tab_title()}
					</button>
				{/if}
				{#if data.responsibilitiesVisible}
					<button class="tab" class:active={tab === 'responsibilities'} onclick={() => (tab = 'responsibilities')}>
						{m.responsibilities_tab_title()}
					</button>
				{/if}
			</div>
		{/if}

		{#if tab === 'homework' && data.homeworkVisible}
			{#if data.homework.length === 0}
				<p class="empty">{m.join_no_homework()}</p>
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
				<p class="empty">{m.join_no_weekly_notes()}</p>
			{:else}
				{#each data.weeklyNotes as n (n.id)}
					<section class="card">
						<p class="card-eyebrow">{m.join_week_of({ date: formatNoteDate(n.noteDate) })}</p>
						<p class="card-title">{n.title}</p>
						{#if n.body}
							<div class="card-note note-markdown">{@html renderNoteMarkdown(n.body)}</div>
						{/if}
					</section>
				{/each}
			{/if}
		{:else if tab === 'responsibilities' && data.responsibilitiesVisible}
			<!-- Guest coverage view only — no signup identities (see the
			     Backend's `ResponsibilityGuestRoleCoverageOut`), so this is
			     read-only, no sign-up action like the member group page has. -->
			{#if data.responsibilities.length === 0}
				<p class="empty">{m.join_no_responsibilities()}</p>
			{:else}
				{#each data.responsibilities as d (d.id)}
					<section class="card">
						<p class="card-eyebrow">
							{formatDateTime(d.date)}{#if d.canceled} · {m.responsibilities_canceled()}{:else if d.locked} · {m.responsibilities_locked()}{/if}
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
				<p class="empty">{m.library_no_tracks()}</p>
			{:else}
				{#each visiblePieces as piece (piece.pieceId)}
					<!-- Bundled-title match is only a fallback for a piece with
					     nothing of its own wired up yet — real uploaded content
					     (even under a title that happens to match a bundled
					     piece) always wins. See the group Tracks tab's
					     identical fix for the real bug this closed. -->
					{@const bundled = piece.hasMusic || piece.hasPdf ? undefined : getPieceByTitle(piece.title)}
					{@const practiceId = bundled ? bundled.id : piece.pieceId}
					<section class="card track-card">
						<div class="track-info">
							<p class="card-title">{piece.title}</p>
							<p class="card-meta">{m.join_shared({ date: formatDate(piece.distributedAt) })}</p>
						</div>
						<a
							class="piece-action piece-action--primary"
							href={lh(`/piece/${practiceId}?guest=1&code=${data.code}`)}
							aria-label={m.join_open_player()}
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
