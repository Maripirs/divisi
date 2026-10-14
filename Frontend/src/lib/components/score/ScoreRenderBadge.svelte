<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	/** The "updating score" badge shown while OSMD re-engraves. Shared by
	 * `ScoreView` and `AdaptiveScoreView` (one badge for all of its
	 * sections). Colors come from the `.score-tokens` custom properties on
	 * an ancestor. */
</script>

<div class="render-status" role="status" aria-live="polite">
	<span class="render-status__dot" aria-hidden="true"></span>
	{m.piece_updating_score()}
</div>

<style>
	/* Pinned near the top of the viewport, not just the score, so the badge
	   is still visible when a Practice Setup change is made with the drawer
	   open over the score (on mobile the drawer covers it entirely). Offset
	   down far enough to clear the player's own top bar (back button +
	   title). `pointer-events: none` so it never eats a tap underneath it. */
	.render-status {
		position: fixed;
		top: calc(3.5rem + env(safe-area-inset-top, 0px));
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--score-chrome-border);
		border-radius: var(--radius-full);
		background: var(--score-chrome);
		box-shadow: var(--shadow);
		color: var(--score-button-text);
		font-size: 0.8125rem;
		font-weight: 650;
		pointer-events: none;
	}
	.render-status__dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--score-button-active);
		animation: render-status-pulse 0.9s ease-in-out infinite;
	}
	@keyframes render-status-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.75);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.render-status__dot {
			animation: none;
			opacity: 0.8;
		}
	}
</style>
