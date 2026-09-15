<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import LoadingBlock from '$lib/components/LoadingBlock.svelte';
	import HomeworkCard from '$lib/components/HomeworkCard.svelte';
	import WeeklyNoteCard from '$lib/components/WeeklyNoteCard.svelte';
	import ResponsibilityDateCard from '$lib/components/ResponsibilityDateCard.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import PieceNotesPanel from '$lib/components/PieceNotesPanel.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import { listGuestGroupNotes } from '$lib/api/pieceNotes';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		localProfile,
		ensureLocalId,
		setDisplayName,
		markSignedUp,
		dismissSignupBanner,
		shouldShowSignupBanner
	} from '$lib/localProfile';
	import {
		isOwnedResponsibilitySignup,
		rememberResponsibilitySignup,
		forgetResponsibilitySignup
	} from '$lib/utils/responsibilitySignupOwnership';
	import { clearDemoPreviewGuest, setDemoPreviewGuest } from '$lib/demoPreview';
	import { computeGuestTabs, type GuestBuiltinTabKey } from './joinTabs';
	import { formatRehearsalSchedule } from '../../groups/[id]/rehearsalSchedule';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { formatEventDate } from '$lib/utils/dates';
	import type { PageData } from './$types';
	import type { ResponsibilityRole } from '$lib/components/groupCards';

	let { data }: { data: PageData } = $props();

	// F24: feeds `$lib/demoPreview.ts`'s store, which the globally-mounted
	// `SettingsDrawer` reads to decide whether to show "Preview Admin".
	// Re-runs whenever `data.result` changes (a fresh join code, or an
	// `invalidateAll()`), and the cleanup clears the store both between
	// runs and when this page is left entirely, so the drawer never
	// offers preview for a group the visitor isn't looking at any more.
	$effect(() => {
		let cancelled = false;
		void data.result.then((result) => {
			if (cancelled) return;
			if (result.error === null) {
				setDemoPreviewGuest({ joinCode: data.code, adminPreviewAvailable: result.group.adminPreviewAvailable });
			} else {
				clearDemoPreviewGuest();
			}
		});
		return () => {
			cancelled = true;
			clearDemoPreviewGuest();
		};
	});

	type Tab = GuestBuiltinTabKey;
	// B31/F36: every guest tab is a plain built-in now that carpool dropped
	// its own `pages/[slug]` route (`joinTabs.ts`'s `GuestBuiltinTabKey`), so
	// `Tab` just cycles through the five of them, no separate slug-addressed
	// state to carry. A stale/missing `?tab=` (or one not actually visible
	// once `result` resolves) falls through to the tracks content below, the
	// same safe default a fresh visit gets.
	let tab = $state<Tab>((page.url.searchParams.get('tab') as Tab | null) ?? 'tracks');

	// F23: local-only responsibility self-signup. A visitor with no account
	// signs themselves up straight from this read-only guest view; the
	// Backend (B19) mints their anonymous participant on the first such
	// action and sets a device cookie (threaded first-party by
	// `/join/[code]/responsibilities/signups`). The display name is
	// prompted lazily, once, then reused from the local profile.
	//
	// B21: right after that first name is typed, before the signup itself
	// fires, check `/join/[code]/name-matches` for another guest already in
	// this group with the same name. A hit shows "is this you?"; confirming
	// one threads `claimUserId` into the signup call so the Backend folds
	// this device into that existing row instead of minting a duplicate.
	// Declining (or no match at all) proceeds exactly as before.
	interface NameMatch { userId: string; title: string | null; joinedAt: string }
	const roleKey = (dateId: string, roleId: string) => `${dateId}:${roleId}`;
	let promptingKey = $state<string | null>(null);
	let nameDraft = $state('');
	let busyKey = $state<string | null>(null);
	// F34: "have I already signed up for this role" used to live in a
	// purely in-memory `doneKeys` set, which lost the answer on reload.
	// `isOwnedResponsibilitySignup` (persisted) is the single source of
	// truth now, checked against each role's own signup rows below, so
	// there's only one tracker rather than two that could disagree.
	let removingId = $state<string | null>(null);
	let errorByKey = $state<Record<string, string>>({});
	let saveRequiredKey = $state<string | null>(null);
	let matchKey = $state<string | null>(null);
	let matchName = $state('');
	let matchCandidates = $state<NameMatch[]>([]);
	let pendingSignup = $state<{ dateId: string; roleId: string } | null>(null);

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
		const key = roleKey(dateId, roleId);
		promptingKey = null;
		busyKey = key;
		try {
			const res = await fetch(`/join/${data.code}/name-matches?name=${encodeURIComponent(name)}`);
			const body = (await res.json()) as { ok: true; matches: NameMatch[] } | { ok: false };
			if (body.ok && body.matches.length > 0) {
				pendingSignup = { dateId, roleId };
				matchName = name;
				matchCandidates = body.matches;
				matchKey = key;
				busyKey = null;
				return;
			}
		} catch {
			// A failed match check just falls through to a plain signup below
			// — worst case a brand-new participant is minted, same as if this
			// check didn't exist at all.
		}
		await doSignup(dateId, roleId);
	}

	function confirmMatch(userId: string) {
		const pending = pendingSignup;
		matchKey = null;
		matchCandidates = [];
		pendingSignup = null;
		if (pending) void doSignup(pending.dateId, pending.roleId, userId);
	}

	function declineMatch() {
		const pending = pendingSignup;
		matchKey = null;
		matchCandidates = [];
		pendingSignup = null;
		if (pending) void doSignup(pending.dateId, pending.roleId);
	}

	async function doSignup(dateId: string, roleId: string, claimUserId?: string) {
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
					displayName: $localProfile.displayName,
					claimUserId
				})
			});
			const body = (await res.json()) as
				| { ok: true; signup: { id: string } }
				| { ok: false; error: 'save-required' }
				| { ok: false; error: 'conflict'; message?: string }
				| { ok: false; error: 'server' };
			if (body.ok) {
				markSignedUp();
				// F34: remember this signup as ours so the "Remove me" control
				// shows up for it once `result.responsibilities` reloads below,
				// and again on a later page visit.
				rememberResponsibilitySignup(body.signup.id);
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

	// F34: a guest removes their own earlier signup, resolved by the new
	// proxy the same cookie/`local_id` way the create call above is.
	async function removeSignup(dateId: string, roleId: string, signupId: string) {
		const key = roleKey(dateId, roleId);
		removingId = signupId;
		errorByKey = { ...errorByKey, [key]: '' };
		try {
			const res = await fetch(
				`/join/${data.code}/responsibilities/signups/${signupId}?localId=${encodeURIComponent(ensureLocalId())}`,
				{ method: 'DELETE' }
			);
			const body = (await res.json()) as
				| { ok: true }
				| { ok: false; error: 'forbidden' | 'conflict' | 'server'; message?: string };
			if (body.ok) {
				forgetResponsibilitySignup(signupId);
				await invalidateAll();
			} else {
				errorByKey = { ...errorByKey, [key]: body.message || m.responsibilities_removal_failed() };
			}
		} catch {
			errorByKey = { ...errorByKey, [key]: m.responsibilities_removal_failed() };
		} finally {
			removingId = null;
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
			<AppHeader title={result.group.groupName} homeHref={lh('/welcome')} />

			<!-- The persistent "browsing as a guest, sign in" banner used to live
			     here (removed 2026-09-11: the human found it redundant now that
			     Settings already covers the same ground for a guest -
			     `settings_guest_note` plus Save-across-devices / Log in / Create
			     account, see `SettingsDrawer.svelte`). The gear icon in
			     `AppHeader` is the one, quieter way in now. -->

			{#if shouldShowSignupBanner($localProfile)}
				<!-- F23: shown once, after the first responsibility signup,
				     until dismissed (the flag persists in the local profile
				     store, so it does not reappear). B21: no more "Save"
				     action here — reconnecting this identity on another
				     device just means typing the same name again there. -->
				<section class="card card--highlight">
					<p class="card-note">{m.local_only_banner_body()}</p>
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={dismissSignupBanner} aria-label={m.join_dismiss()}>
							{m.join_not_now()}
						</button>
					</div>
				</section>
			{/if}

			{#if result.homeworkVisible || result.responsibilitiesVisible || result.weeklyNotesVisible || result.carpoolVisible || result.aboutVisible}
				<!-- F31/B31: same shared-tab-list shape the member side uses
				     (`groupTabs.ts`'s `computeGroupTabs`) — every entry is a
				     plain `<button>` now that carpool dropped its own
				     `pages/[slug]` route (`joinTabs.ts`). F38: `.tab-strip`
				     keeps this one row on mobile instead of wrapping. -->
				<div class="tabs tab-strip" role="tablist">
					{#each computeGuestTabs(result) as t (t.key)}
						<button class="tab" class:active={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>
					{/each}
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
				<!-- Guest coverage view: same signup names a member sees, just
				     never an email or account id (see the Backend's
				     `ResponsibilityGuestRoleCoverageOut`), plus F23's
				     local-only "Sign me up" per role for an open/unlocked date. -->
				{#if result.responsibilities.length === 0}
					<p class="empty">{m.join_no_responsibilities()}</p>
				{:else}
					{#each result.responsibilities as d (d.id)}
						{#snippet signupControl(role: ResponsibilityRole)}
							{@const key = roleKey(d.id, role.roleId)}
							<!-- F34: "am I already signed up for this role" is derived
							     from `isOwnedResponsibilitySignup`, checked per signup row
							     rather than tracked separately, so this can never disagree
							     with the "Remove me" controls below it. -->
							{@const mySignedUp = (role.signups ?? []).some((s) => isOwnedResponsibilitySignup(s.id))}
							<!-- Read-only names, same list the member tab's `roleExtra`
							     renders (`ResponsibilitiesTab.svelte`); a guest can't act
							     on anyone else's signup, only one it created itself
							     (F29's `carpoolOwnership.ts` trick, since the guest-facing
							     signup shape carries no `user_id` to compare against). -->
							{#each role.signups ?? [] as s (s.id)}
								<div class="list-row">
									<span class="dim">{s.name}</span>
									{#if !d.locked && !d.canceled && isOwnedResponsibilitySignup(s.id)}
										<button
											type="button"
											class="text-link"
											onclick={() => void removeSignup(d.id, role.roleId, s.id)}
											disabled={removingId === s.id}
										>
											{m.groups_remove_me()}
										</button>
									{/if}
								</div>
							{/each}
							{#if !d.locked && !d.canceled && !page.data.user}
								<div class="signup-control">
									{#if mySignedUp}
										<!-- Nothing else to show: the "Remove me" control next
										     to this browser's own name above already reflects
										     the signed-up state. -->
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
									{:else if matchKey === key}
										<!-- B21: another guest already in this group has the same
										     name — confirming folds this device into that row
										     (`claimUserId`) instead of minting a duplicate. -->
										<div class="name-match-block">
											<p class="card-note">{m.name_match_title()}</p>
											{#each matchCandidates as c (c.userId)}
												<div class="list-row name-match-row">
													<span>{matchName}</span>
													{#if c.title}
														<span class="dim">{c.title}</span>
													{:else}
														<span class="dim">{m.name_match_joined({ date: formatEventDate(c.joinedAt) })}</span>
													{/if}
													<button type="button" class="btn btn-outline" onclick={() => confirmMatch(c.userId)}>
														{m.name_match_confirm()}
													</button>
												</div>
											{/each}
											<button type="button" class="text-link" onclick={declineMatch}>
												{m.name_match_decline()}
											</button>
										</div>
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
											<a class="text-link" href={lh('/login?mode=register')}>{m.settings_create_account()}</a>
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
									roles: s.roles.map((r) => ({
										...r,
										signups: r.signups.map((sg) => ({ ...sg, userId: null }))
									}))
								}))
							}}
							roleExtra={signupControl}
						/>
					{/each}
				{/if}
			{:else if tab === 'carpool' && result.carpoolVisible}
				<!-- B31/F36: carpool as a plain guest tab, same `CarpoolBoard`
				     the member/admin route renders (`groups/[id]/tabs/
				     CarpoolTab.svelte`), just fed from this page's own
				     resolved guest data instead of a form-action `PageData`.
				     `isAdmin={false}`/`userId=""`: a guest is never an admin,
				     and ownership here is decided by `guest` (`isGuest`
				     inside `CarpoolBoard`, via `carpoolOwnership.ts`), not by
				     comparing a real user id. `form={null}`: every write goes
				     through the `/join/[code]/carpool/...` fetch proxies
				     `CarpoolBoard` swaps to whenever `guest` is set, never a
				     SvelteKit form action. -->
				<CarpoolBoard
					isAdmin={false}
					userId=""
					events={result.carpoolEvents}
					selectedEventId={result.carpoolSelectedEventId}
					posts={result.carpoolPosts}
					form={null}
					guest={{ code: data.code }}
				/>
			{:else if tab === 'about' && result.aboutVisible && result.about}
				<!-- B33/F39: read-only guest counterpart to the member Info/About
				     tab (`groups/[id]/tabs/AboutTab.svelte`'s own non-admin
				     branch) — same two pieces of content, none of the editors,
				     no "Leave group"/join-link controls (a guest is already past
				     the join link, and has nothing to "leave"). -->
				<section class="card">
					<p class="card-eyebrow">{m.groups_about_tab_title()}</p>
					<p class="card-meta body">{result.about.description || m.groups_no_description()}</p>
					{#if result.about.rehearsalWeekday !== null && result.about.rehearsalTime !== null}
						<div class="list-row">
							<span>{m.groups_rehearsals()}</span>
							<span class="dim">{formatRehearsalSchedule(result.about.rehearsalWeekday, result.about.rehearsalTime)}</span>
						</div>
					{/if}
				</section>
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
						<!-- F42: same has-music/has-pdf/youtube-url vocabulary as the
						     member Tracks tab's admin badge row, counting the bundled
						     fixture's own player/PDF/reference too so a demo piece
						     (no Backend flags set) still shows what it offers. -->
						{@const availableHasPlayer = piece.hasMusic || !!bundled?.load}
						{@const availableHasReference = !!piece.youtubeUrl || !!bundled?.youtubeUrl}
						{@const availableHasPdf = piece.hasPdf || !!bundled?.pdfUrl}
						<section class="card track-card">
							<div class="track-card-row">
								<div class="track-info">
									<p class="card-title">{piece.title}</p>
									<p class="card-meta">{m.join_shared({ date: formatEventDate(piece.distributedAt) })}</p>
									{#if availableHasPlayer || availableHasReference || availableHasPdf}
										<!-- Present-only "what's available" line, same
										     compact format as the member card's. -->
										<p class="card-meta">
											{[
												availableHasPlayer ? m.groups_track_has_music() : null,
												availableHasReference ? m.groups_track_has_reference() : null,
												availableHasPdf ? m.groups_track_has_pdf() : null
											]
												.filter(Boolean)
												.join(' · ')}
										</p>
									{/if}
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

	.signup-save-required {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	/* B21 "is this you?" — a short list of guest-match candidates plus a
	   decline link, same density as the signup form above it. */
	.name-match-block {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.name-match-row {
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
