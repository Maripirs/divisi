<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A `<details>/<summary>` disclosure with a built-in rotating chevron
	 * and the native-marker reset every consumer otherwise re-copies. Two
	 * visual treatments:
	 *
	 *  - `panel`  — a bordered card with its own surface/radius, summary
	 *    padded. The piece-page Piece Notes panel.
	 *  - `inline` — no chrome, a small accent-coloured summary sitting under
	 *    a divider. A Rehearsal Tracks card's expandable notes.
	 *
	 * The consumer supplies the summary label (rendered after the chevron)
	 * and the body. `open` is bindable. */
	let {
		open = $bindable(false),
		variant = 'inline',
		summary,
		children
	}: {
		open?: boolean;
		variant?: 'panel' | 'inline';
		summary: Snippet;
		children: Snippet;
	} = $props();
</script>

<details class="disclosure disclosure--{variant}" bind:open>
	<summary>
		<svg class="disclosure-chevron" viewBox="0 0 24 24" aria-hidden="true"
			><path d="M6 9l6 6 6-6" /></svg
		>
		{@render summary()}
	</summary>
	{@render children()}
</details>

<style>
	.disclosure > summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.disclosure > summary::-webkit-details-marker {
		display: none;
	}

	.disclosure-chevron {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 0.15s ease;
	}

	.disclosure[open] .disclosure-chevron {
		transform: rotate(180deg);
	}

	/* panel */
	.disclosure--panel {
		margin: 0.5rem 1rem 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		text-align: left;
	}

	.disclosure--panel > summary {
		padding: 0.55rem 0.8rem;
		font-weight: 600;
		font-size: 0.88rem;
	}

	/* inline */
	.disclosure--inline {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.disclosure--inline > summary {
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent);
	}

	.disclosure--inline .disclosure-chevron {
		width: 0.9rem;
		height: 0.9rem;
	}

	.disclosure--inline[open] > summary {
		margin-bottom: 0.5rem;
	}
</style>
