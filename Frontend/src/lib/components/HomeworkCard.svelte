<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCalendarDate } from '$lib/utils/dates';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
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
	 * The Play button (`item.pieceId`) sits beside the summary/collapsed row
	 * as its own sibling, not inside the expand toggle or `children` — it
	 * needs to work whether or not the card is collapsed, and both the
	 * member and guest DTOs carry a piece id.
	 *
	 * `children` renders after the instructions in the expanded state — the
	 * member page puts the admin edit trigger / inline edit form there; the
	 * guest page passes nothing.
	 *
	 * `bare` (member only) drops the outer `.card` box in favor of a plain
	 * divided row, for when a caller groups several homework items under
	 * one shared day card of its own (see the Homework tab's per-due-date
	 * grouping) — nesting a bordered `.card` per item inside that would
	 * double up the boxing. `showDate` likewise defaults to on but the same
	 * caller turns it off, since the day card's own header already states
	 * the date every item in the group shares. */
	let {
		item,
		collapsible = false,
		bare = false,
		showDate = true,
		children
	}: {
		item: HomeworkCardItem;
		collapsible?: boolean;
		bare?: boolean;
		showDate?: boolean;
		children?: Snippet;
	} = $props();

	let collapsed = $state(false);

	const eyebrow = $derived(showDate ? formatCalendarDate(item.dueDate, m.home_no_due_date()) : '');
	const meta = $derived(item.range + (item.pieceTitle ? ` · ${item.pieceTitle}` : ''));
</script>

{#snippet cardBody()}
	<div class="hw-card-row">
		{#if collapsible && collapsed}
			<button
				type="button"
				class="hw-collapsed-row"
				aria-expanded="false"
				onclick={() => (collapsed = false)}
			>
				<span class="hw-collapsed-text">
					{#if showDate}<span class="card-eyebrow">{eyebrow}</span>{/if}
					<span class="card-title">{item.pieceTitle ?? item.title}</span>
				</span>
			</button>
		{:else if collapsible}
			<button
				type="button"
				class="hw-summary"
				aria-expanded="true"
				onclick={() => (collapsed = true)}
			>
				<span class="hw-summary-text">
					{#if showDate}<p class="card-eyebrow">{eyebrow}</p>{/if}
					<p class="card-title">{item.title}</p>
					<p class="card-meta">{meta}</p>
				</span>
			</button>
		{:else}
			<div class="hw-summary-text">
				{#if showDate}<p class="card-eyebrow">{eyebrow}</p>{/if}
				<p class="card-title">{item.title}</p>
				<p class="card-meta">{meta}</p>
			</div>
		{/if}
		{#if item.pieceId}
			<!-- Sits just left of the chevron below so the two trailing
			     controls read as one cluster, consistent with Home's own
			     homework rows. -->
			<a class="hw-play-btn" href={lh(`/piece/${item.pieceId}`)} aria-label={m.home_start()}>
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M8 5v14l11-7z" />
				</svg>
			</a>
		{/if}
		{#if collapsible}
			<span class="chevron" class:is-open={!collapsed} aria-hidden="true"></span>
		{/if}
	</div>
	{#if !(collapsible && collapsed)}
		{#if item.instructions}
			<p class="card-note">&ldquo;{item.instructions}&rdquo;</p>
		{/if}
		{@render children?.()}
	{/if}
{/snippet}

{#if bare}
	<div class="hw-card-bare">{@render cardBody()}</div>
{:else}
	<section class="card">{@render cardBody()}</section>
{/if}

<style>
	/* `bare` mode's row: a plain divided row instead of `.card`'s own
	   border/background/shadow box, for nesting several under one shared
	   day card (see the doc comment on `bare` above). */
	.hw-card-bare {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}

	.hw-card-bare:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	/* Holds whichever summary/collapsed row applies, the Play button, and
	   (collapsible only) the chevron — all independently tappable/visual
	   siblings, not nested inside the toggle (that toggle is itself a
	   `<button>` in the collapsible cases, so neither the link nor a bare
	   `<span>` can live inside it). Play sits just left of the chevron so
	   the two trailing controls read as one cluster. */
	.hw-card-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* A card's tappable summary — full detail by default, no button chrome
	   of its own (just an unstyled wrapper around the same
	   eyebrow/title/meta the plain markup uses), so tapping the
	   date/title/range collapses the card without looking like a separate
	   control sitting on top of them. The chevron and Play button are its
	   trailing siblings in `.hw-card-row`, not nested inside it — see the
	   doc comment there. */
	.hw-summary {
		all: unset;
		display: flex;
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}

	.hw-summary-text {
		flex: 1;
		min-width: 0;
	}

	/* The collapsed state that tap produces — one row, date + piece (or
	   title if no piece is linked), same eyebrow/title styling reused
	   inline instead of stacked. */
	.hw-collapsed-row {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
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

	/* Same triangle-in-a-circle as the player's own `.play-btn`
	   (`piece/[id]/+page.svelte`) at row scale — always visible whenever
	   there's a piece to jump into, independent of collapse state. */
	.hw-play-btn {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--accent-contrast);
		transition: background-color 0.15s ease;
	}

	.hw-play-btn:hover {
		background: var(--accent-hover);
	}

	.hw-play-btn svg {
		width: 14px;
		height: 14px;
	}
</style>
