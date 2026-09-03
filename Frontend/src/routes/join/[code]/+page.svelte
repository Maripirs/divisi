<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import LoadingBlock from '$lib/components/LoadingBlock.svelte';
	import HomeworkCard from '$lib/components/HomeworkCard.svelte';
	import WeeklyNoteCard from '$lib/components/WeeklyNoteCard.svelte';
	import ResponsibilityDateCard from '$lib/components/ResponsibilityDateCard.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import PieceNotesPanel from '$lib/components/PieceNotesPanel.svelte';
	import { listGuestGroupNotes } from '$lib/api/pieceNotes';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { formatEventDate } from '$lib/utils/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Tab = 'tracks' | 'homework' | 'weeklyNotes' | 'responsibilities';
	let tab = $state<Tab>('tracks');

	// Nudges an anonymous guest toward creating an account — no persistence
	// (plain `$state`, not `localStorage`), so it reappears every visit
	// since guests aren't tracked across sessions at all.
	let bannerDismissed = $state(false);

	// F20 guest expansion: which track cards have their "Piece Notes"
	// disclosure open. Lazy — the panel only mounts (and fetches) once a
	// card is expanded.
	let notesExpanded = $state<Record<string, boolean>>({});
</script>

<!-- Shared between the resolved `error: 'server'` case and the `{:catch}`
     branch: both mean "the Backend fetch failed and a retry is the fix". A
     rejected promise (network error, unexpected status) and a mapped
     `error: 'server'` result should look identical to the visitor, so the
     card lives in one snippet rather than being duplicated. -->
{#snippet serverErrorCard()}
	<!-- Nearly always a cold-started backend (Render free tier, ~30s to
	     wake): the request that landed here just triggered the wake-up, so
	     an immediate retry usually succeeds. Offer that inline rather than
	     making the visitor guess that a manual refresh fixes it. -->
	<section class="card">
		<p class="card-title">{m.join_something_went_wrong()}</p>
		<p class="card-meta">{m.errors_could_not_reach_server()}</p>
		<button type="button" class="btn btn-primary btn-block" onclick={() => location.reload()}>
			{m.piece_retry()}
		</button>
		<a class="btn btn-outline btn-block" href={lh('/join')}>{m.join_back()}</a>
	</section>
{/snippet}

<main class="shell join-result">
	{#await data.result}
		<!-- Shell + spinner paint immediately while the guest fetch fan-out
		     streams in (see +page.ts for why the promise is unawaited). -->
		<div class="hero">
			<Logo size={48} />
		</div>
		<LoadingBlock />
	{:then result}
		{#if result.error !== null}
			<!-- No group to head the page (not-found / password-required /
			     server), so lead with the logo instead. `error === null` is
			     exactly the "has a group" variant of the union. -->
			<div class="hero">
				<Logo size={48} />
			</div>
		{/if}

		{#if result.error === 'not-found'}
			<section class="card">
				<p class="card-title">{m.join_code_not_found()}</p>
				<p class="card-meta">
					{m.join_code_not_found_body({ code: data.code })}
				</p>
				<a class="btn btn-outline btn-block" href={lh('/join')}>{m.join_try_another_code()}</a>
			</section>
		{:else if result.error === 'password-required'}
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
		{:else if result.error === 'server'}
			{@render serverErrorCard()}
		{:else if result.group}
			<AppHeader title={result.group.groupName} homeHref={lh(`/join/${data.code}`)} />

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

			{#if result.homeworkVisible || result.responsibilitiesVisible || result.weeklyNotesVisible}
				<div class="tabs" role="tablist">
					<button class="tab" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>
						{m.tracks_tab_title()}
					</button>
					{#if result.homeworkVisible}
						<button class="tab" class:active={tab === 'homework'} onclick={() => (tab = 'homework')}>
							{m.homework_tab_title()}
						</button>
					{/if}
					{#if result.weeklyNotesVisible}
						<button class="tab" class:active={tab === 'weeklyNotes'} onclick={() => (tab = 'weeklyNotes')}>
							{m.weekly_notes_tab_title()}
						</button>
					{/if}
					{#if result.responsibilitiesVisible}
						<button class="tab" class:active={tab === 'responsibilities'} onclick={() => (tab = 'responsibilities')}>
							{m.responsibilities_tab_title()}
						</button>
					{/if}
				</div>
			{/if}

			{#if tab === 'homework' && result.homeworkVisible}
				{#if result.homework.length === 0}
					<p class="empty">{m.join_no_homework()}</p>
				{:else}
					{#each result.homework as hw (hw.id)}
						<HomeworkCard item={hw} />
					{/each}
				{/if}
			{:else if tab === 'weeklyNotes' && result.weeklyNotesVisible}
				{#if result.weeklyNotes.length === 0}
					<p class="empty">{m.join_no_weekly_notes()}</p>
				{:else}
					{#each result.weeklyNotes as n (n.id)}
						<WeeklyNoteCard item={n} />
					{/each}
				{/if}
			{:else if tab === 'responsibilities' && result.responsibilitiesVisible}
				<!-- Guest coverage view only — no signup identities (see the
				     Backend's `ResponsibilityGuestRoleCoverageOut`), so this is
				     read-only, no sign-up action like the member group page has. -->
				{#if result.responsibilities.length === 0}
					<p class="empty">{m.join_no_responsibilities()}</p>
				{:else}
					{#each result.responsibilities as d (d.id)}
						<ResponsibilityDateCard
							item={{
								id: d.id,
								date: d.date,
								notes: d.notes,
								locked: d.locked,
								canceled: d.canceled,
								scheduleGroups: d.schedules.map((s) => ({
									scheduleId: s.scheduleName,
									scheduleName: s.scheduleName,
									roles: s.roles
								}))
							}}
						/>
					{/each}
				{/if}
			{:else}
				<!-- Same as the member group page's Tracks tab: a guest only sees
				     pieces that actually have a practice file wired up (no dead
				     "not wired up" entries), each its own card with the same
				     circle-play icon button as the personal Library. -->
				{@const visiblePieces = result.group.pieces.filter(
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
							<div class="track-card-row">
								<div class="track-info">
									<p class="card-title">{piece.title}</p>
									<p class="card-meta">{m.join_shared({ date: formatEventDate(piece.distributedAt) })}</p>
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
							</div>
							<!-- F20 guest expansion: read-only "From the director" notes,
							     same disclosure the member Rehearsal Tracks cards have.
							     Lazy — nothing fetches until expanded. -->
							<Disclosure
								variant="inline"
								bind:open={
									() => notesExpanded[piece.pieceId] ?? false,
									(v) => (notesExpanded[piece.pieceId] = v)
								}
							>
								{#snippet summary()}{m.piece_notes_title()}{/snippet}
								{#snippet children()}
									{#if notesExpanded[piece.pieceId]}
										<PieceNotesPanel
											pieceId={piece.pieceId}
											chrome="bare"
											directorLoader={() =>
												listGuestGroupNotes(data.code, piece.pieceId, data.password)}
										/>
									{/if}
								{/snippet}
							</Disclosure>
						</section>
					{/each}
				{/if}
			{/if}
		{/if}
	{:catch}
		<!-- The promise rejected outright (not one of the three mapped guest
		     errors). Show the same retry card as `error: 'server'`; the hero
		     goes with it since there's no group to head the page. -->
		<div class="hero">
			<Logo size={48} />
		</div>
		{@render serverErrorCard()}
	{/await}
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

	/* `.track-info`, `.piece-action` live in shell.css. F20 made the guest
	   track card a column (info+play row, then the "Piece Notes" disclosure)
	   just like the member Rehearsal Tracks cards, so override shell's row. */
	.track-card {
		flex-direction: column;
		align-items: stretch;
	}

	.track-card-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
</style>
