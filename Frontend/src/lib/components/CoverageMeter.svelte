<script lang="ts">
	/** A thin coverage bar for one responsibility date: `active`/`needed`
	 * signups rolled up across the date's roles (see `coverageTotals` in
	 * `groupCards.ts`). Purely presentational — the caller decides the label
	 * next to it. Color tracks the same three states the per-role
	 * `badge--{status}` chips use: short → danger, exactly full → muted,
	 * extras → accent. */
	let { active, needed }: { active: number; needed: number } = $props();

	let fraction = $derived(needed === 0 ? 1 : Math.min(1, Math.max(0, active / needed)));
	let state = $derived(active < needed ? 'underfilled' : active > needed ? 'overfilled' : 'covered');
</script>

<span class="meter" data-state={state} aria-hidden="true">
	<span class="meter__fill" style:width="{fraction * 100}%"></span>
</span>

<style>
	.meter {
		display: block;
		height: 0.375rem;
		border-radius: var(--radius-full);
		background: var(--surface-2);
		overflow: hidden;
	}

	.meter__fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--text-muted);
	}

	.meter[data-state='underfilled'] .meter__fill {
		background: var(--danger);
	}

	.meter[data-state='overfilled'] .meter__fill {
		background: var(--accent);
	}
</style>
