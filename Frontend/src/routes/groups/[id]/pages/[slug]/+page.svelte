<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<main class="shell">
	<AppHeader title={data.customPage.title} />
	<a class="text-link" href={lh(`/groups/${data.groupId}?tab=pages`)}>{m.pages_back()}</a>
	{#if data.customPage.template_key === 'carpool_board'}
		<CarpoolBoard
			pageId={data.customPage.id}
			isAdmin={data.isAdmin}
			userId={data.user.id}
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
