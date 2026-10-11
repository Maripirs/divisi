<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCalendarDate } from '$lib/utils/dates';
	import { renderNoteMarkdown } from '$lib/utils/noteMarkdown';
	import { m } from '$lib/paraglide/messages';
	import SectionBadges from './SectionBadges.svelte';
	import type { WeeklyNoteCardItem } from './groupCards';

	/** A1: one weekly-note card, shared between the member group page and
	 * the guest join page. Both rendered the same "Week of <date>" eyebrow
	 * + title + markdown body from byte-similar copies.
	 *
	 * `editing` + `edit` (member admin only): when editing, the whole
	 * header is replaced by the slotted edit form. `children` renders after
	 * the body otherwise — the member page's Edit trigger + delete confirm. */
	let {
		item,
		editing = false,
		edit,
		children
	}: {
		item: WeeklyNoteCardItem;
		editing?: boolean;
		edit?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section class="card">
	{#if editing && edit}
		{@render edit()}
	{:else}
		<div class="wn-head">
			<p class="card-eyebrow">
				{m.join_week_of({ date: formatCalendarDate(item.noteDate, m.home_no_due_date()) })}
			</p>
			<SectionBadges sections={item.sections} />
		</div>
		<p class="card-title">{item.title}</p>
		{#if item.body}
			<div class="card-note note-markdown">{@html renderNoteMarkdown(item.body)}</div>
		{/if}
		{@render children?.()}
	{/if}
</section>

<style>
	/* Eyebrow + section badge on one line, wrapping under it when narrow. */
	.wn-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.5rem;
	}
</style>
