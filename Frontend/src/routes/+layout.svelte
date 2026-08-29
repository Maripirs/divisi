<script lang="ts">
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initTheme } from '$lib/theme';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	onMount(() => initTheme());

	// A little "waiting for backend…" pill for a page navigation that's
	// taking a while — mainly for Render's free-tier cold start (the
	// Backend can take tens of seconds to wake up from idle). Delayed by
	// 500ms so a normal, already-warm navigation never flashes it.
	let showBackendStatus = $state(false);
	$effect(() => {
		if (!navigating.to) {
			showBackendStatus = false;
			return;
		}
		const timer = setTimeout(() => (showBackendStatus = true), 500);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Mounted once here (not per-page) so any `AppHeader`'s gear icon opens
     the same overlay in place, regardless of which page triggered it — see
     `$lib/stores/settingsDrawer.svelte.ts`. -->
<SettingsDrawer />

{#if showBackendStatus}
	<div class="backend-status" role="status" aria-live="polite">
		<span class="backend-status-spinner" aria-hidden="true"></span>
		{m.layout_waiting_for_backend()}
	</div>
{/if}

<style>
	.backend-status {
		position: fixed;
		top: calc(0.75rem + env(safe-area-inset-top, 0px));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		box-shadow: var(--shadow);
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 700;
		z-index: 30;
		pointer-events: none;
	}

	.backend-status-spinner {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		animation: backend-status-spin 0.7s linear infinite;
	}

	@keyframes backend-status-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
