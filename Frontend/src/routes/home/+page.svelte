<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getPiece } from '$lib/pieces/registry';
	// Annotations are hidden app-wide for now (see Frontend/plan.md's F3 log) —
	// not imported here.
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const next = data.homework[0];
	// Real homework points at a real Backend piece — the player only knows
	// bundled demo pieces (see Frontend/plan.md's backlog), so "Start" only
	// shows up if this happens to line up with one; otherwise just "Details".
	const nextBundledPiece = next?.piece_id ? getPiece(next.piece_id) : undefined;

	// Homework doesn't get its own page (per the human's call) — "Details"
	// expands a card in place instead of navigating to
	// `/groups/[id]/homework/[hwId]`, same pattern as the group page's own
	// homework list. One id at a time, keyed across both the spotlighted
	// card and the "Due soon" list below.
	let expandedHomeworkId = $state<string | null>(null);

	function formatDate(iso: string | null) {
		return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : m.home_no_due_date();
	}
</script>

<main class="shell">
	<AppHeader title={m.home_title()} />

	{#if next}
		<section class="card card--highlight">
			<p class="card-eyebrow">{m.home_next_practice()}</p>
			<p class="card-title">{next.title}</p>
			<p class="card-meta">{next.range} · {formatDate(next.due_date)} · {next.groupName}</p>
			{#if expandedHomeworkId === next.id && next.instructions}
				<p class="card-note">&ldquo;{next.instructions}&rdquo;</p>
			{/if}
			<div class="btn-row">
				{#if nextBundledPiece}
					<a class="btn btn-primary" href={lh(`/piece/${nextBundledPiece.id}`)}>{m.home_start()}</a>
				{:else if expandedHomeworkId === next.id && next.piece_id}
					<a class="btn btn-primary" href={lh(`/piece/${next.piece_id}`)}>{m.homework_detail_practice()}</a>
				{/if}
				<!-- Only worth expanding if there's instructions or a piece to
				     practice behind it — otherwise the button would flip its
				     chevron and reveal nothing. -->
				{#if next.instructions || next.piece_id}
					<button
						type="button"
						class="btn btn-outline disclosure-btn"
						aria-expanded={expandedHomeworkId === next.id}
						onclick={() => (expandedHomeworkId = expandedHomeworkId === next.id ? null : next.id)}
					>
						<span>{m.home_details()}</span>
						<span class="chevron" class:is-open={expandedHomeworkId === next.id} aria-hidden="true"></span>
					</button>
				{/if}
			</div>
		</section>
	{/if}

	<!-- "Continue" (a real "last opened piece" card) removed for now — it was
	     a hardcoded fixture (always the same piece, always "20 min ago" for
	     every user), and nothing tracks a real last-opened piece yet. See
	     Frontend/plan.md's backlog for building it for real. -->

	<!-- The spotlighted card above already covers `data.homework[0]` — this
	     list is everything *after* it, so the same assignment never shows
	     twice on one page. -->
	{#if data.homework.length > 1}
		<section class="card">
			<p class="card-eyebrow">{m.home_due_soon()}</p>
			{#each data.homework.slice(1) as hw (hw.id)}
				{#if hw.instructions || hw.piece_id}
					<button
						type="button"
						class="list-row-link is-expandable"
						class:is-open={expandedHomeworkId === hw.id}
						aria-expanded={expandedHomeworkId === hw.id}
						onclick={() => (expandedHomeworkId = expandedHomeworkId === hw.id ? null : hw.id)}
					>
						<span>{hw.title}, {hw.range}</span>
						<span class="dim">{formatDate(hw.due_date)}</span>
					</button>
				{:else}
					<!-- Nothing to expand into (no instructions, no linked piece) —
					     plain info row, no chevron implying there's more to tap. -->
					<div class="list-row-link no-chevron">
						<span>{hw.title}, {hw.range}</span>
						<span class="dim">{formatDate(hw.due_date)}</span>
					</div>
				{/if}
				{#if expandedHomeworkId === hw.id}
					<div class="due-soon-detail">
						{#if hw.instructions}
							<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
						{/if}
						{#if hw.piece_id}
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
	{#if data.responsibilities.length > 0}
		<section class="card">
			<p class="card-eyebrow">{m.home_upcoming_responsibilities()}</p>
			{#each data.responsibilities as r (r.id)}
				<a class="list-row-link" href={lh(`/groups/${r.groupId}?tab=responsibilities`)}>
					<span>{r.schedule_name} · {r.groupName}</span>
					<span class="dim">{formatDate(r.date)}</span>
				</a>
			{/each}
		</section>
	{/if}

	<section class="card">
		<p class="card-eyebrow">{m.home_my_groups()}</p>
		{#if data.groups.length === 0}
			<p class="empty">{m.home_no_groups()}</p>
		{:else}
			{#each data.groups as group (group.id)}
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

</main>

<BottomNav />

<style>
	.btn-row {
		flex-wrap: wrap;
	}

	.btn-row .btn {
		flex: 1 1 auto;
	}

	.join-group {
		margin-top: 0.75rem;
	}

	/* A "Due soon" row's expanded detail — sits right under that row, not
	   inside it (the row itself is a `<button>`, so this has to be a sibling
	   rather than nested content). Indented slightly so it still reads as
	   belonging to the row above it. */
	.due-soon-detail {
		padding-left: 0.9rem;
	}
</style>
