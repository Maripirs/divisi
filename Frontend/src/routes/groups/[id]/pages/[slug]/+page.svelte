<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import { computeGroupTabs } from '../../groupTabs';
	import '$lib/styles/shell.css';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// F31: same "which view is this" query param the main group page reads
	// (`+page.svelte`) — a link into this page carries it along so the tab
	// strip shows the same set of tabs the visitor just left, and every
	// link back out carries it forward again.
	let mode = $derived<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	let tabs = $derived(computeGroupTabs(data, mode));
</script>

<main class="shell">
	<AppHeader title={data.customPage.title} />

	<div class="tabs" role="tablist">
		{#each tabs as t (t.key ?? t.slug)}
			{#if t.key !== null}
				<a class="tab" href={lh(`/groups/${data.groupId}?tab=${t.key}${mode === 'admin' ? '&view=admin' : ''}`)}>
					{t.label}
				</a>
			{:else}
				<a
					class="tab"
					class:active={t.slug === data.customPage.slug}
					href={lh(`/groups/${data.groupId}/pages/${t.slug}${mode === 'admin' ? '?view=admin' : ''}`)}
				>
					{t.label}
				</a>
			{/if}
		{/each}
	</div>

	{#if data.customPage.template_key === 'carpool_board'}
		<CarpoolBoard
			pageId={data.customPage.id}
			isAdmin={data.isAdmin}
			userId={data.user.id}
			userName={data.user.name}
			events={data.events}
			selectedEventId={data.selectedEventId}
			posts={data.posts}
			{form}
		/>
	{:else}
		<CustomPageView title={data.customPage.title} templateKey={data.customPage.template_key} />
	{/if}
</main>

<BottomNav />
