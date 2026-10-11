<script lang="ts">
	import { get } from 'svelte/store';
	import { playerDefaults } from '$lib/playerDefaults';
	import { SECTION_FILTERS, defaultSectionFilter, type SectionFilter } from '$lib/notes/sections';
	import { sectionFilterLabel } from '$lib/notes/sectionLabels';
	import { m } from '$lib/paraglide/messages';

	/** The singer-side "Everyone / Soprano / Alto / Tenor / Bass" filter above
	 * a notes list (weekly notes, piece notes). Callers render it only when
	 * some note is actually tagged (`hasSectionTags`) and ignore `value`
	 * otherwise.
	 *
	 * Seeds `value` itself: the singer's saved voice part when
	 * `defaultToVoice`, else Everyone (an admin authoring notes wants to see
	 * all of them, including the one they just tagged for another section).
	 * Picking a chip is a per-view choice, never written back to the saved
	 * voice. Seeded in an effect rather than at init because the saved voice
	 * lives in localStorage, which the server render can't see. */
	let {
		value = $bindable('everyone'),
		defaultToVoice = true,
		compact = false
	}: {
		value?: SectionFilter;
		defaultToVoice?: boolean;
		/** Smaller pills, for the dense piece-notes panel. */
		compact?: boolean;
	} = $props();

	$effect(() => {
		value = defaultToVoice ? defaultSectionFilter(get(playerDefaults)) : 'everyone';
	});
</script>

<div class="sc-row" class:sc-row--compact={compact} role="group" aria-label={m.notes_sections_filter_label()}>
	{#each SECTION_FILTERS as filter (filter)}
		<button
			type="button"
			class="sc-chip"
			class:sc-chip--on={value === filter}
			aria-pressed={value === filter}
			onclick={() => (value = filter)}
		>
			{sectionFilterLabel(filter)}
		</button>
	{/each}
</div>

<style>
	/* Wraps rather than scrolling: five short labels fit one row on most
	   phones, and a second row beats a hidden, swipe-to-find chip. */
	.sc-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}

	/* Same pill as the shell's `.tab`, a touch tighter. */
	.sc-chip {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
	}

	.sc-chip--on {
		background: var(--surface-2);
		border-color: var(--accent);
		color: var(--accent);
	}

	.sc-row--compact .sc-chip {
		min-height: 1.6rem;
		font-size: 0.74rem;
		padding: 0.15rem 0.55rem;
	}
</style>
