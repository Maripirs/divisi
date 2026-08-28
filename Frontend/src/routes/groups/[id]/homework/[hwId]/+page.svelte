<script lang="ts">
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(iso: string | null) {
		if (!iso) return 'No due date';
		return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
	}
</script>

<main class="shell">
	<p class="crumbs"><a href="/groups/{data.group.id}">{data.group.name}</a> / Homework</p>
	<h1 class="title">{data.homework.title}</h1>
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

<style>
	.title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text);
	}

	.due {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.body {
		color: var(--text);
	}
</style>
