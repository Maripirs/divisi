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
			<div class="btn-row">
				{#if nextBundledPiece}
					<a class="btn btn-primary" href={lh(`/piece/${nextBundledPiece.id}`)}>{m.home_start()}</a>
				{/if}
				<a class="btn btn-outline" href={lh(`/groups/${next.group_id}/homework/${next.id}`)}>{m.home_details()}</a>
			</div>
		</section>
	{/if}

	<!-- "Continue" (a real "last opened piece" card) removed for now — it was
	     a hardcoded fixture (always the same piece, always "20 min ago" for
	     every user), and nothing tracks a real last-opened piece yet. See
	     Frontend/plan.md's backlog for building it for real. -->

	{#if data.homework.length > 0}
		<section class="card">
			<p class="card-eyebrow">{m.home_due_soon()}</p>
			{#each data.homework as hw (hw.id)}
				<a class="list-row-link" href={lh(`/groups/${hw.group_id}/homework/${hw.id}`)}>
					<span>{hw.title}, {hw.range}</span>
					<span class="dim">{formatDate(hw.due_date)}</span>
				</a>
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
</style>
