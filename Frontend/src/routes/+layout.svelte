<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initTheme } from '$lib/theme';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';

	let { children } = $props();

	onMount(() => initTheme());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Mounted once here (not per-page) so any `AppHeader`'s gear icon opens
     the same overlay in place, regardless of which page triggered it — see
     `$lib/stores/settingsDrawer.svelte.ts`. -->
<SettingsDrawer />
