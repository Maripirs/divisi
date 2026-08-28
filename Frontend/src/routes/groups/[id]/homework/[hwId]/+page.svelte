<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(iso: string | null) {
		if (!iso) return 'No due date';
		return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
	}
</script>

<main class="shell">
	<AppHeader title={data.homework.title} />
	<p class="crumbs"><a href="/groups/{data.group.id}">{data.group.name}</a> / Homework</p>
	<p class="due">{formatDate(data.homework.due_date)} · {data.homework.range}</p>

	{#if data.homework.instructions}
		<section class="card">
			<p class="card-eyebrow">Instructions</p>
			<p class="card-meta body">{data.homework.instructions}</p>
		</section>
	{/if}

	{#if data.pieceTitle}
		<section class="card">
			<p class="card-eyebrow">Piece</p>
			<p class="card-meta body">{data.pieceTitle}</p>
			<p class="card-note">
				Practicing this piece from an assignment isn't wired up yet — playback for
				group-shared pieces is still backlogged (see Frontend/plan.md).
			</p>
		</section>
	{/if}
</main>

<BottomNav />

<style>
	.due {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.body {
		color: var(--text);
	}
</style>
