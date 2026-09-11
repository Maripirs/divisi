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
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { settingsDrawer } from '$lib/stores/settingsDrawer.svelte';
	import {
		localProfile,
		ensureLocalId,
		setDisplayName,
		markSignedUp,
		dismissSignupBanner,
		shouldShowSignupBanner
	} from '$lib/localProfile';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { formatEventDate } from '$lib/utils/dates';
	import type { PageData } from './$types';
	import type { ResponsibilityRole } from '$lib/components/groupCards';

	let { data }: { data: PageData } = $props();

	type Tab = 'tracks' | 'homework' | 'weeklyNotes' | 'responsibilities';
	let tab = $state<Tab>('tracks');

	// F23: local-only responsibility self-signup. A visitor with no account
	// signs themselves up straight from this read-only guest view; the
	// Backend (B19) mints their anonymous participant on the first such
	// action and sets a device cookie (threaded first-party by
	// `/join/[code]/responsibilities/signups`). The display name is
	// prompted lazily, once, then reused from the local profile.
	const roleKey = (dateId: string, roleId: string) => `${dateId}:${roleId}`;
	let promptingKey = $state<string | null>(null);
	let nameDraft = $state('');
	let busyKey = $state<string | null>(null);
	let doneKeys = $state<Set<string>>(new Set());
	let errorByKey = $state<Record<string, string>>({});
	let saveRequiredKey = $state<string | null>(null);

	async function requestSignup(dateId: string, roleId: string) {
		if ($localProfile.displayName.trim().length === 0) {
			promptingKey = roleKey(dateId, roleId);
			nameDraft = '';
			return;
		}
		await doSignup(dateId, roleId);
	}

	async function confirmName(dateId: string, roleId: string) {
		const name = nameDraft.trim();
		if (!name) return;
		setDisplayName(name);
		promptingKey = null;
		await doSignup(dateId, roleId);
	}

	async function doSignup(dateId: string, roleId: string) {
		const key = roleKey(dateId, roleId);
		busyKey = key;
		saveRequiredKey = null;
		errorByKey = { ...errorByKey, [key]: '' };
		try {
			const res = await fetch(`/join/${data.code}/responsibilities/signups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dateId,
					roleId,
					localId: ensureLocalId(),
					displayName: $localProfile.displayName
				})
			});
			const body = (await res.json()) as
				| { ok: true }
				| { ok: false; error: 'save-required' }
				| { ok: false; error: 'conflict'; message?: string }
				| { ok: false; error: 'server' };
			if (body.ok) {
				markSignedUp();
				doneKeys = new Set([...doneKeys, key]);
				await invalidateAll();
			} else if (body.error === 'save-required') {
				saveRequiredKey = key;
			} else if (body.error === 'conflict') {
				errorByKey = { ...errorByKey, [key]: body.message || m.responsibilities_signup_conflict() };
			} else {
				errorByKey = { ...errorByKey, [key]: m.responsibilities_signup_failed() };
			}
		} catch {
			errorByKey = { ...errorByKey, [key]: m.responsibilities_signup_failed() };
		} finally {
			busyKey = null;
		}
	}

	// F20 guest expansion: which track cards have their "Piece Notes"
	// disclosure open. Lazy — the panel only mounts (and fetches) once a
	// card is expanded.
	let notesExpanded = $state<Record<string, boolean>>({});

	// The old B10 guest-password gate that lived here is gone: a valid join
	// code now authorizes the group's guest view on its own, so
	// `/join/[code]/data` never comes back "password-required". The guest
	// password survives only on the bare `/piece/[id]` link (no `?code=`),
	// handled in `routes/piece/[id]/+page.server.ts` +
	// `routes/piece/[id]/+page.svelte`. `/join/[code]/auth/+server.ts` stays
	// as the endpoint that gate POSTs to.
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
			<!-- No group to head the page (not-found / server), so lead with
			     the logo instead. `error === null` is exactly the "has a
			     group" variant of the union. -->
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
		{:else if result.error === 'server'}
			{@render serverErrorCard()}
		{:else if result.group}
			<AppHeader title={result.group.groupName} homeHref={lh(`/join/${data.code}`)} />

			<!-- The persistent "browsing as a guest, sign in" banner used to live
			     here (removed 2026-09-11: the human found it redundant now that
			     Settings already covers the same ground for a guest -
			     `settings_guest_note` plus Save-across-devices / Log in / Create
			     account, see `SettingsDrawer.svelte`). The gear icon in
			     `AppHeader` is the one, quieter way in now. -->

			{#if shouldShowSignupBanner($localProfile)}
				<!-- F23: shown once, after the first responsibility signup, until
				     dismissed or the profile is Saved (flags persist in the
				     local profile store, so it does not reappear). -->
				<section class="card card--highlight">
					<p class="card-note">{m.local_only_banner_body()}</p>
					<div class="btn-row">
						<button type="button" class="btn btn-primary" onclick={() => (settingsDrawer.open = true)}>
							{m.save_action()}
						</button>
						<button type="button" class="btn btn-outline" onclick={dismissSignupBanner} aria-label={m.join_dismiss()}>
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
				<!-- Guest coverage view: no signup identities (see the Backend's
				     `ResponsibilityGuestRoleCoverageOut`), but F23 adds a
				     local-only "Sign me up" per role for an open/unlocked date. -->
				{#if result.responsibilities.length === 0}
					<p class="empty">{m.join_no_responsibilities()}</p>
				{:else}
					{#each result.responsibilities as d (d.id)}
						{#snippet signupControl(role: ResponsibilityRole)}
							{@const key = roleKey(d.id, role.roleId)}
							{#if !d.locked && !d.canceled && !page.data.user}
								<div class="signup-control">
									{#if doneKeys.has(key)}
										<p class="signup-done">{m.responsibilities_signup_done()}</p>
									{:else if promptingKey === key}
										<form
											class="signup-name-form"
											onsubmit={(e) => {
												e.preventDefault();
												void confirmName(d.id, role.roleId);
											}}
										>
											<label class="field">
												<span>{m.responsibilities_name_prompt()}</span>
												<input bind:value={nameDraft} required autocomplete="name" />
											</label>
											<div class="btn-row">
												<button
													type="button"
													class="text-link"
													onclick={() => (promptingKey = null)}
													disabled={busyKey === key}
												>
													{m.join_not_now()}
												</button>
												<button
													type="submit"
													class="btn btn-primary"
													disabled={busyKey === key || nameDraft.trim().length === 0}
												>
													{busyKey === key ? m.responsibilities_signing_up() : m.responsibilities_sign_me_up()}
												</button>
											</div>
										</form>
									{:else}
										<button
											type="button"
											class="btn btn-outline"
											onclick={() => void requestSignup(d.id, role.roleId)}
											disabled={busyKey === key}
										>
											{busyKey === key ? m.responsibilities_signing_up() : m.responsibilities_sign_me_up()}
										</button>
									{/if}

									{#if saveRequiredKey === key}
										<p class="signup-save-required">
											{m.responsibilities_save_required()}
											<button type="button" class="text-link" onclick={() => (settingsDrawer.open = true)}>
												{m.save_action()}
											</button>
										</p>
									{/if}
									{#if errorByKey[key]}
										<p class="error">{errorByKey[key]}</p>
									{/if}
								</div>
							{/if}
						{/snippet}
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
							roleExtra={signupControl}
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
									href={lh(`/piece/${practiceId}?code=${data.code}`)}
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
											directorLoader={() => listGuestGroupNotes(data.code, piece.pieceId)}
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

	/* F23: the per-role local-only signup control, sitting under a role's
	   coverage row inside `ResponsibilityDateCard`'s `roleExtra` slot. */
	.signup-control {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}

	.signup-name-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.signup-done {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--accent);
	}

	.signup-save-required {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
