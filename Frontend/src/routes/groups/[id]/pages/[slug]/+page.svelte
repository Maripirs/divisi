<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="shell">
	<AppHeader title={data.customPage.title} />
	<a class="text-link" href={lh(`/groups/${data.groupId}?tab=pages`)}>{m.pages_back()}</a>
	<CustomPageView title={data.customPage.title} templateKey={data.customPage.template_key} />
</main>

<BottomNav />
