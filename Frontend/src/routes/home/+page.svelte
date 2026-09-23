<script lang="ts">
	import { browser } from '$app/environment';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import LoadingBlock from '$lib/components/LoadingBlock.svelte';
	import { getPiece } from '$lib/pieces/registry';
	// Annotations are hidden app-wide for now (see Frontend/plan.md's F3 log) —
	// not imported here.
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { formatCalendarDate, formatEventDate } from '$lib/utils/dates';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One "Due soon" list, not a separate spotlight card for the top item —
	// two sections both listing homework read as one idea split in two even
	// once they no longer repeat the same entry (see git log for the
	// earlier attempt that just de-duped instead of merging). Already
	// sorted soonest-first, so position alone communicates priority.
	//
	// Homework doesn't get its own page either (per the human's call) —
	// each row expands in place instead of navigating to
	// `/groups/[id]/homework/[hwId]`, same pattern as the group page's own
	// homework list. One id expanded at a time.
	let expandedHomeworkId = $state<string | null>(null);

	// A responsibility date only shows on Home at all when it's actually
	// relevant (see +page.server.ts's `reason`) — "needs volunteers" or
	// "you're signed up". Only the former is dismissible: the latter is the
	// member's own commitment, not a call they can opt out of by hiding it.
	// Local-only (not synced across devices) since this is a soft "not
	// interested" preference, not data — reappears if the same date somehow
	// becomes relevant again later (e.g. the member's own signup is removed).
	const DISMISSED_KEY = 'divisi.dismissedResponsibilities';

	function loadDismissedResponsibilities(): Set<string> {
		if (!browser) return new Set();
		try {
			const parsed: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]');
			return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
		} catch {
			return new Set();
		}
	}

	let dismissedResponsibilityIds = $state<Set<string>>(loadDismissedResponsibilities());

	function dismissResponsibility(id: string): void {
		const next = new Set(dismissedResponsibilityIds);
		next.add(id);
		dismissedResponsibilityIds = next;
		if (browser) window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
	}
</script>

<main class="shell">
	<AppHeader title={m.home_title()} />

	<!-- "Continue" (a real "last opened piece" card) removed for now — it was
	     a hardcoded fixture (always the same piece, always "20 min ago" for
	     every user), and nothing tracks a real last-opened piece yet. See
	     Frontend/plan.md's backlog for building it for real. -->

	<!-- Deliberately quieter than "My groups" below (plain divided rows, no
	     border/background box per row) — that section is the actual
	     top-level nav on this page; a `card--highlight`-style item per
	     homework entry made the page read as an equally-weighted wall of
	     buttons instead of one clear hierarchy. -->
	{#await data.home}
		<LoadingBlock />
	{:then home}
		{@const visibleResponsibilities = home.responsibilities.filter(
			(r) => !dismissedResponsibilityIds.has(r.id)
		)}
	{#if home.homework.length > 0}
		<section class="card">
			<p class="card-eyebrow">{m.home_due_soon()}</p>
			{#each home.homework as hw (hw.id)}
				<!-- Real homework points at a real Backend piece — the player
				     only knows bundled demo pieces (see Frontend/plan.md's
				     backlog), so a "Start" shortcut only shows up if this
				     happens to line up with one; a real piece still gets a
				     "Practice" link, just one tap further in via expand. -->
				{@const bundledPiece = hw.piece_id ? getPiece(hw.piece_id) : undefined}
				{#if hw.instructions || hw.piece_id}
					<button
						type="button"
						class="hw-row"
						aria-expanded={expandedHomeworkId === hw.id}
						onclick={() => (expandedHomeworkId = expandedHomeworkId === hw.id ? null : hw.id)}
					>
						<span>{hw.title}, {hw.range}</span>
						<span class="hw-row-end">
							<span class="dim">{formatCalendarDate(hw.due_date, m.home_no_due_date())}</span>
							<span class="chevron" class:is-open={expandedHomeworkId === hw.id} aria-hidden="true"></span>
						</span>
					</button>
				{:else}
					<!-- Nothing to expand into (no instructions, no linked piece) —
					     plain info row, no chevron implying there's more to tap. -->
					<div class="hw-row hw-row--static">
						<span>{hw.title}, {hw.range}</span>
						<span class="dim">{formatCalendarDate(hw.due_date, m.home_no_due_date())}</span>
					</div>
				{/if}
				{#if expandedHomeworkId === hw.id}
					<div class="due-soon-detail">
						{#if hw.instructions}
							<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
						{/if}
						{#if bundledPiece}
							<a class="btn btn-primary btn-block" href={lh(`/piece/${bundledPiece.id}`)}>{m.home_start()}</a>
						{:else if hw.piece_id}
							<a class="btn btn-outline btn-block" href={lh(`/piece/${hw.piece_id}`)}>{m.homework_detail_practice()}</a>
						{/if}
					</div>
				{/if}
			{/each}
		</section>
	{/if}

	<!-- Only shown at all when there's something upcoming — unlike "Due soon"
	     above, an empty-state card here would just be noise for the common
	     case of a group with no responsibilities feature in use. -->
	{#if visibleResponsibilities.length > 0}
		<section class="card">
			<p class="card-eyebrow">{m.home_upcoming_responsibilities()}</p>
			{#each visibleResponsibilities as r (r.id)}
				<div class="resp-row">
					<a class="resp-link" href={lh(`/groups/${r.groupId}?tab=responsibilities`)}>
						<span class="resp-info">
							<span>{r.roleSetNames} · {r.groupName}</span>
							<!-- The reason this showed up at all — see
							     +page.server.ts's `reason` for why. -->
							<span class="resp-reason" class:resp-reason--enrolled={r.reason === 'enrolled'}>
								{r.reason === 'enrolled' ? m.home_resp_enrolled() : m.join_coverage_underfilled()}
							</span>
						</span>
						<span class="dim">{formatEventDate(r.date, m.home_no_due_date())}</span>
					</a>
					{#if r.reason === 'needs_volunteers'}
						<button
							type="button"
							class="resp-dismiss"
							onclick={() => dismissResponsibility(r.id)}
							aria-label={m.home_resp_dismiss()}
							title={m.home_resp_dismiss()}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	<section class="card">
		<p class="card-eyebrow">{m.home_my_groups()}</p>
		{#if home.groups.length === 0}
			<p class="empty">{m.home_no_groups()}</p>
		{:else}
			{#each home.groups as group (group.id)}
				<a class="list-row-link" href={lh(`/groups/${group.id}`)}>
					<span>{group.name}</span>
					<span class="dim">{m.home_active_count({ count: group.homeworkCount })}</span>
				</a>
			{/each}
		{/if}
		<!-- No standalone Groups list page anymore — this card is the only
		     place groups show up, so "Join a group" lives here too instead
		     of pointing at a page that no longer exists. -->
		<a class="btn btn-outline btn-block join-group" href={lh('/join')}>{m.home_join_group()}</a>
	</section>
	{:catch}
		<section class="card">
			<p class="empty">{m.load_failed()}</p>
			<a class="btn btn-outline btn-block join-group" href={lh('/join')}>{m.home_join_group()}</a>
		</section>
	{/await}

	<!-- Library folded in here now that the persistent bottom nav (which
	     used to carry a standalone Library tab) is gone — this row is the
	     only way to reach it. Reuses the exact `?lib=1` href the root
	     route's own redirect guard checks for (see its `+page.server.ts`),
	     not a new route of its own. -->
	<section class="card">
		<a class="list-row-link" href={lh('/?lib=1')}>
			<span>{m.library_title()}</span>
			<span class="dim">{m.home_library_note()}</span>
		</a>
	</section>
</main>

<style>
	.join-group {
		margin-top: 0.75rem;
	}

	/* Quieter than `.list-row-link` (no border/background box per row) —
	   see the template comment above the "Due soon" section for why. Still
	   a real `<button>` when it toggles, just styled as a plain divided
	   list rather than a stack of buttons. */
	.hw-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 0.55rem 0.1rem;
		border: none;
		border-bottom: 1px solid var(--border);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.hw-row--static {
		cursor: default;
	}

	.hw-row-end {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 0 0 auto;
	}

	.hw-row .dim {
		color: var(--text-muted);
		font-size: 0.8125rem;
		white-space: nowrap;
	}

	/* A "Due soon" row's expanded detail — sits right under that row, not
	   inside it (the row itself is a `<button>`, so this has to be a sibling
	   rather than nested content). Indented slightly so it still reads as
	   belonging to the row above it. */
	.due-soon-detail {
		padding-left: 0.1rem;
		padding-bottom: 0.3rem;
	}

	/* Same box `.list-row-link` draws, but as the wrapper instead of the
	   link itself — the optional dismiss button sits inside this box as a
	   second flex item, alongside (not nested inside) the link, so the two
	   are independently tappable. */
	.resp-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}

	.resp-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.resp-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.resp-reason {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.resp-reason--enrolled {
		color: var(--accent);
	}

	.resp-dismiss {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border: none;
		background: none;
		padding: 0;
		color: var(--text-muted);
		cursor: pointer;
	}

	.resp-dismiss:hover {
		color: var(--text);
	}
</style>
