<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCalendarDate } from '$lib/utils/dates';
	import { m } from '$lib/paraglide/messages';
	import type { HomeworkCardItem } from './groupCards';

	/** A1: one homework/assignment card, rendered from a normalized item on
	 * both the member group page and the guest join page. The two callers
	 * previously kept byte-similar copies diverging only in field casing
	 * (member snake_case, guest camelCase — normalized away at the call
	 * site now) and the member-only collapse toggle + admin controls.
	 *
	 * `collapsible` (member only) turns the summary into a tappable
	 * `<button>` that collapses the card to a single date + piece row;
	 * collapse state is local per card (any number collapsed at once,
	 * independently — see the group page's original note). Guests get the
	 * plain always-expanded card.
	 *
	 * `children` renders after the instructions in the expanded state — the
	 * member page puts the Practice link + admin edit trigger / inline edit
	 * form there; the guest page passes nothing. */
	let {
		item,
		collapsible = false,
		children
	}: {
		item: HomeworkCardItem;
		collapsible?: boolean;
		children?: Snippet;
	} = $props();

	let collapsed = $state(false);

	const eyebrow = $derived(formatCalendarDate(item.dueDate, m.home_no_due_date()));
	const meta = $derived(item.range + (item.pieceTitle ? ` · ${item.pieceTitle}` : ''));
</script>

<section class="card">
	{#if collapsible && collapsed}
		<button
			type="button"
			class="hw-collapsed-row"
			aria-expanded="false"
			onclick={() => (collapsed = false)}
		>
			<span class="hw-collapsed-text">
				<span class="card-eyebrow">{eyebrow}</span>
				<span class="card-title">{item.pieceTitle ?? item.title}</span>
			</span>
			<span class="chevron" aria-hidden="true"></span>
		</button>
	{:else}
		{#if collapsible}
			<button
				type="button"
				class="hw-summary"
				aria-expanded="true"
				onclick={() => (collapsed = true)}
			>
				<span class="hw-summary-text">
					<p class="card-eyebrow">{eyebrow}</p>
					<p class="card-title">{item.title}</p>
					<p class="card-meta">{meta}</p>
				</span>
				<span class="chevron is-open" aria-hidden="true"></span>
			</button>
		{:else}
			<p class="card-eyebrow">{eyebrow}</p>
			<p class="card-title">{item.title}</p>
			<p class="card-meta">{meta}</p>
		{/if}
		{#if item.instructions}
			<p class="card-note">&ldquo;{item.instructions}&rdquo;</p>
		{/if}
		{@render children?.()}
	{/if}
</section>

<style>
	/* A card's tappable summary — full detail by default, no button chrome
	   of its own (just an unstyled wrapper around the same
	   eyebrow/title/meta the plain markup uses), so tapping the
	   date/title/range collapses the card without looking like a separate
	   control sitting on top of them. The `.chevron` on the trailing edge
	   is the only "tap to toggle" affordance. */
	.hw-summary {
		all: unset;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		cursor: pointer;
	}

	.hw-summary-text {
		min-width: 0;
	}

	.hw-summary .chevron {
		margin-top: 0.4rem;
	}

	/* The collapsed state that tap produces — one row, date + piece (or
	   title if no piece is linked), same eyebrow/title styling reused
	   inline instead of stacked. */
	.hw-collapsed-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		border: none;
		background: none;
		padding: 0;
		margin: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.hw-collapsed-text {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.hw-collapsed-row .card-eyebrow,
	.hw-collapsed-row .card-title {
		margin: 0;
	}
</style>
