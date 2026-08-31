<script lang="ts">
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initTheme } from '$lib/theme';
	import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children, data } = $props();

	onMount(() => initTheme());

	// Cold-start reconcile: `+layout.server.ts` gave up waiting on a
	// still-waking Backend and painted with an optimistic session (real id,
	// blank name/email) plus streamed page data. Now that we're interactive
	// (the Backend has almost certainly finished booting), re-run every
	// `load` to swap in the real profile and settle anything still pending.
	let reconciling = $state(false);
	onMount(async () => {
		if (!data.sessionPending) return;
		reconciling = true;
		try {
			await invalidateAll();
		} finally {
			reconciling = false;
		}
	});

	// A little "waiting for backend…" pill for a page navigation that's
	// taking a while, mainly for Render's free-tier cold start (the
	// Backend can take tens of seconds to wake up from idle). Delayed by
	// 500ms so a normal, already-warm navigation never flashes it. If the
	// wait drags past a few seconds it's almost certainly a cold start, so
	// the pill expands into a plain-language explanation (`longWait`).
	let showBackendStatus = $state(false);
	let longWait = $state(false);
	$effect(() => {
		if (!navigating.to) {
			showBackendStatus = false;
			longWait = false;
			return;
		}
		const pill = setTimeout(() => (showBackendStatus = true), 500);
		const explain = setTimeout(() => (longWait = true), 3500);
		return () => {
			clearTimeout(pill);
			clearTimeout(explain);
		};
	});

	// The cold-start reconcile (above) is a long wait by definition (the
	// server already missed its budget once), so explain it straight away
	// rather than after another 3.5s timer.
	const explainWaking = $derived(longWait || reconciling);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Mounted once here (not per-page) so any `AppHeader`'s gear icon opens
     the same overlay in place, regardless of which page triggered it — see
     `$lib/stores/settingsDrawer.svelte.ts`. -->
<SettingsDrawer />

{#if showBackendStatus || reconciling}
	<div
		class="backend-status"
		class:backend-status--explain={explainWaking}
		role="status"
		aria-live="polite"
	>
		<span class="backend-status-spinner" aria-hidden="true"></span>
		<span>{explainWaking ? m.layout_backend_waking() : m.layout_waiting_for_backend()}</span>
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

	/* Cold start: the one-line pill grows into a readable card that wraps a
	   full sentence or two of explanation. */
	.backend-status--explain {
		align-items: flex-start;
		gap: 0.55rem;
		max-width: min(22rem, calc(100vw - 2rem));
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-md);
		font-weight: 400;
		line-height: 1.45;
		text-align: left;
	}

	.backend-status--explain .backend-status-spinner {
		margin-top: 0.15rem;
	}

	.backend-status-spinner {
		width: 0.7rem;
		height: 0.7rem;
		flex-shrink: 0;
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
