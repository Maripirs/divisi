<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	// Placeholder shown in a route's content area while a streamed `load`
	// promise is still in flight, mainly the Backend cold-starting on the
	// first visit of the day (see `+layout.server.ts`). Deliberately plain:
	// a spinner and a line of text, not a skeleton mimicking the real
	// layout, since what's coming varies (library sections, Home cards).
	let { label = m.loading() }: { label?: string } = $props();
</script>

<div class="loading-block" role="status" aria-live="polite">
	<span class="loading-block-spinner" aria-hidden="true"></span>
	<span>{label}</span>
</div>

<style>
	.loading-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 2.5rem 1rem;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.loading-block-spinner {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		animation: loading-block-spin 0.7s linear infinite;
	}

	@keyframes loading-block-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
