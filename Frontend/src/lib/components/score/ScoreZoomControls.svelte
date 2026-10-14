<script lang="ts">
	import { clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '$lib/actions/pinchZoom';
	import { m } from '$lib/paraglide/messages';

	/** The floating +/−/reset zoom pill. Sticks to the bottom of the viewport
	 * for as long as its parent box is on screen, so it has to be the parent's
	 * first child for that to cover the whole score. Shared by `ScoreView`
	 * and `AdaptiveScoreView` (one pill over all of its sections). Colors come
	 * from the `.score-tokens` custom properties on an ancestor. */
	let { zoom = $bindable(1) }: { zoom?: number } = $props();

	function zoomBy(delta: number): void {
		zoom = clampZoom(zoom + delta);
	}

	function resetZoom(): void {
		zoom = 1;
	}
</script>

<div class="zoom-controls-anchor">
	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={m.zoom_out()}>−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={m.zoom_in()}>+</button>
	</div>
</div>

<style>
	/* This pill used to be `position: absolute` inside `.score-view`, whose
	   own box is exactly as tall as the full rendered score (every system,
	   not just one page) -- for anything longer than a single screen, that
	   put it many thousands of pixels below the fold, visible only once
	   scrolled all the way past the entire piece (the actual bug report
	   this fixes: the controls read as "missing" because they were never
	   within reach of a normal scroll).

	   `position: sticky; bottom: ...` looks like the fix, but doesn't behave
	   the way `sticky; top: ...` does for an element that starts anywhere
	   other than the *bottom* of a tall container: a bottom-sticky element
	   only starts sticking once its container's own bottom edge nears the
	   viewport, i.e. only in the final screenful of a long score, not
	   throughout it (confirmed empirically, not just from docs -- Chromium
	   scrolled a `bottom`-sticky pill 1:1 with the content for the first
	   ~95% of this score before it ever caught). `top: 100%` sticks using
	   top's (correctly-behaving) semantics instead, targeting 100% of the
	   nearest scrolling ancestor's height -- the visual bottom edge of the
	   viewport -- and `height: 0` keeps this anchor from adding real layout
	   space now that it's a normal-flow box instead of one taken out of
	   flow. The actual visible pill sits inside it, pulled up into view by
	   `translateY` since the anchor's own (zero-height) box would otherwise
	   place it just below the fold. */
	.zoom-controls-anchor {
		position: sticky;
		top: 100%;
		height: 0;
		/* `z-index: auto` on a sticky element doesn't reliably paint above a
		   static sibling in every engine (confirmed empirically: without
		   this, OSMD's SVG -- a plain static, in-flow sibling -- was still
		   winning hit-testing/paint over this anchor's own sticky content).
		   An explicit value forces a real stacking context. */
		z-index: 2;
	}

	.zoom-controls {
		transform: translateY(calc(-100% - 0.75rem));
		margin-left: auto;
		margin-right: 0.75rem;
		display: flex;
		justify-content: flex-end;
		gap: 2px;
		padding: 3px;
		width: fit-content;
		background: var(--score-page);
		border: 1px solid var(--score-chrome-border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
		z-index: 1;
	}
	.zoom-controls button {
		min-width: 2.125rem;
		border: none;
		background: transparent;
		color: var(--score-button-text);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}
	.zoom-controls button:hover:not(:disabled) {
		background: var(--score-button-hover);
	}
	.zoom-controls button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.zoom-level {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
</style>
