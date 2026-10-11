<script lang="ts">
	import { VOICE_PARTS, type VoicePart } from '$lib/midi/types';
	import { serializePartScope, toggleSection } from '$lib/notes/sections';
	import { VOICE_PART_LABELS } from '$lib/notes/sectionLabels';
	import { m } from '$lib/paraglide/messages';

	/** Admin authoring control for a note's section tag: "All sections" plus
	 * one toggle per voice part. `value` is `[]` for All; the toggle rules
	 * (All clears the rest, all four collapse back to All) are
	 * `toggleSection`'s. With `name`, also posts the serialized tag in a
	 * hidden input (empty string = All) for a plain form action. */
	let {
		value = $bindable([]),
		name,
		compact = false
	}: {
		value?: VoicePart[];
		name?: string;
		/** Smaller pills, for the dense piece-notes editor. */
		compact?: boolean;
	} = $props();

	const uid = $props.id();
	const labelId = `section-picker-${uid}`;
</script>

<div class="field">
	<span id={labelId} class:sp-label--compact={compact}>{m.notes_sections_field()}</span>
	<div class="sp-row" class:sp-row--compact={compact} role="group" aria-labelledby={labelId}>
		<button
			type="button"
			class="sp-chip"
			class:sp-chip--on={value.length === 0}
			aria-pressed={value.length === 0}
			onclick={() => (value = toggleSection(value, 'all'))}
		>
			{m.notes_sections_all()}
		</button>
		{#each VOICE_PARTS as part (part)}
			<button
				type="button"
				class="sp-chip"
				class:sp-chip--on={value.includes(part)}
				aria-pressed={value.includes(part)}
				onclick={() => (value = toggleSection(value, part))}
			>
				{VOICE_PART_LABELS[part]()}
			</button>
		{/each}
	</div>
	{#if name}
		<input type="hidden" {name} value={serializePartScope(value) ?? ''} />
	{/if}
</div>

<style>
	.sp-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	/* Toggle pills: filled when on, so a multi-selection reads at a glance
	   (unlike the single-choice filter chips, several can be lit at once). */
	.sp-chip {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
	}

	.sp-chip--on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}

	.sp-label--compact {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.sp-row--compact .sp-chip {
		min-height: 1.6rem;
		font-size: 0.74rem;
		padding: 0.15rem 0.55rem;
	}
</style>
