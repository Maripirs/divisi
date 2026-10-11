<script lang="ts">
	import type { VoicePart } from '$lib/midi/types';
	import { VOICE_PART_LABELS } from '$lib/notes/sectionLabels';
	import { m } from '$lib/paraglide/messages';

	/** A note's section tag as one small badge ("Tenor · Bass"). Renders
	 * nothing for an All note, so untagged cards stay as clean as before. */
	let { sections }: { sections: readonly VoicePart[] } = $props();

	const names = $derived(sections.map((p) => VOICE_PART_LABELS[p]()));
</script>

{#if names.length > 0}
	<span class="sb-badge" title={m.notes_sections_for({ sections: names.join(', ') })}>
		<span class="sb-sr">{m.notes_sections_for({ sections: names.join(', ') })}</span>
		<span aria-hidden="true">{names.join(' · ')}</span>
	</span>
{/if}

<style>
	.sb-badge {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		max-width: 100%;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--accent);
		font-size: 0.7rem;
		font-weight: 700;
		line-height: 1.3;
		padding: 0.1rem 0.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sb-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
