<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getPiece } from '$lib/pieces/registry';
	// Annotations are hidden app-wide for now (see Frontend/plan.md's F3 log) —
	// not imported here.
	import { CONTINUE_PRACTICE } from '$lib/fixtures/appData';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const next = data.homework[0];
	// Real homework points at a real Backend piece — the player only knows
	// bundled demo pieces (see Frontend/plan.md's backlog), so "Start" only
	// shows up if this happens to line up with one; otherwise just "Details".
	const nextBundledPiece = next?.piece_id ? getPiece(next.piece_id) : undefined;

	// "Continue" stays on the existing bundled-demo fixture — no Backend
	// concept for "last opened piece" exists yet (Frontend/plan.md's backlog).
	const continuePiece = getPiece(CONTINUE_PRACTICE.pieceId);

	function formatDate(iso: string | null) {
		return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
	}
</script>

<main class="shell">
	<AppHeader title="Home" />

	{#if next}
		<section class="card card--highlight">
			<p class="card-eyebrow">Next practice</p>
			<p class="card-title">{next.title}</p>
			<p class="card-meta">{next.range} · {formatDate(next.due_date)} · {next.groupName}</p>
			<div class="btn-row">
				{#if nextBundledPiece}
					<a class="btn btn-primary" href="/piece/{nextBundledPiece.id}">Start</a>
				{/if}
				<a class="btn btn-outline" href="/groups/{next.group_id}/homework/{next.id}">Details</a>
			</div>
		</section>
	{/if}

	{#if continuePiece}
		<section class="card">
			<p class="card-eyebrow">Continue</p>
			<p class="card-title">{continuePiece.title}</p>
			<p class="card-meta">{CONTINUE_PRACTICE.voiceView} · Last opened {CONTINUE_PRACTICE.lastOpened}</p>
			<div class="btn-row">
				<a class="btn btn-outline" href="/piece/{continuePiece.id}">Resume</a>
			</div>
		</section>
	{/if}

	<section class="card">
		<p class="card-eyebrow">Due soon</p>
		{#if data.homework.length === 0}
			<p class="empty">Nothing assigned yet.</p>
		{:else}
			{#each data.homework as hw (hw.id)}
				<a class="list-row-link" href="/groups/{hw.group_id}/homework/{hw.id}">
					<span>{hw.title}, {hw.range}</span>
					<span class="dim">{formatDate(hw.due_date)}</span>
				</a>
			{/each}
		{/if}
	</section>

	<section class="card">
		<p class="card-eyebrow">My groups</p>
		{#if data.groups.length === 0}
			<p class="empty">You're not in any groups yet.</p>
		{:else}
			{#each data.groups as group (group.id)}
				<a class="list-row-link" href="/groups/{group.id}">
					<span>{group.name}</span>
					<span class="dim">{group.homeworkCount} active</span>
				</a>
			{/each}
		{/if}
		<!-- No standalone Groups list page anymore — this card is the only
		     place groups show up, so "Join a group" lives here too instead
		     of pointing at a page that no longer exists. -->
		<a class="btn btn-outline btn-block join-group" href="/join">Join a group with a code</a>
	</section>

	<div class="btn-row">
		<a class="btn btn-outline" href="/">Open library</a>
	</div>
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
