<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(iso: string | null) {
		if (!iso) return m.home_no_due_date();
		return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
	}
</script>

<main class="shell">
	<AppHeader title={data.homework.title} />
	<p class="crumbs"><a href={lh(`/groups/${data.group.id}`)}>{data.group.name}</a> / {m.homework_tab_title()}</p>
	<p class="due">{formatDate(data.homework.due_date)} · {data.homework.range}</p>

	{#if data.homework.instructions}
		<section class="card">
			<p class="card-eyebrow">{m.new_homework_instructions()}</p>
			<p class="card-meta body">{data.homework.instructions}</p>
		</section>
	{/if}

	{#if data.pieceTitle}
		<section class="card">
			<p class="card-eyebrow">{m.new_homework_piece()}</p>
			<p class="card-meta body">{data.pieceTitle}</p>
			<p class="card-note">
				{m.homework_detail_practice_note()}
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
