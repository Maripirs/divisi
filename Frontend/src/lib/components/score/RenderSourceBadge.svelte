<script lang="ts" module>
	/** What makes the sound: the in-browser FluidSynth (js-synthesizer,
	 * `MidiPlayer`) or the piece's YouTube reference recording. */
	export type AudioSourceTool = 'synth' | 'youtube';
	/** What draws the page: OSMD, notation-engine, or the uploaded PDF
	 * through pdf.js. */
	export type VisualSourceTool = 'osmd' | 'engine' | 'pdf';
</script>

<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	/** A small tag pinned under the top bar naming the tools behind what is
	 * heard and seen, for A/B testing renderers (shown only when the URL has
	 * a `renderer` param, see `showRenderSources`). Tool names are product
	 * names, so they are not translated; only the labels are. Carries
	 * `.score-tokens` itself, since it renders outside any score view. */
	let { audio, visual }: { audio: AudioSourceTool | null; visual: VisualSourceTool } = $props();

	const AUDIO_NAMES: Record<AudioSourceTool, string> = { synth: 'FluidSynth', youtube: 'YouTube' };
	const VISUAL_NAMES: Record<VisualSourceTool, string> = {
		osmd: 'OSMD',
		engine: 'notation-engine',
		pdf: 'PDF.js'
	};
</script>

<div class="render-sources score-tokens" class:engine={visual === 'engine'}>
	{#if audio}
		<span><span class="label">{m.piece_render_sources_audio()}</span> {AUDIO_NAMES[audio]}</span>
		<span class="sep" aria-hidden="true">·</span>
	{/if}
	<span><span class="label">{m.piece_render_sources_visual()}</span> {VISUAL_NAMES[visual]}</span>
</div>

<style>
	/* Pinned under the player's top bar like `ScoreRenderBadge`, but in the
	   left corner so the two never overlap. Purely informational, so it
	   lets taps through to the score underneath. */
	.render-sources {
		position: fixed;
		top: calc(3.5rem + env(safe-area-inset-top, 0px));
		left: 0.5rem;
		z-index: 4;
		display: flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.15rem 0.6rem;
		border: 1px solid var(--score-chrome-border);
		border-radius: var(--radius-full);
		background: var(--score-chrome);
		color: var(--score-button-text);
		font-size: 0.6875rem;
		font-weight: 650;
		opacity: 0.85;
		pointer-events: none;
	}

	.label {
		font-weight: 500;
		opacity: 0.7;
	}

	.sep {
		opacity: 0.5;
	}

	/* The engine is the thing under test: give it the accent so a glance
	   tells the two renderers apart. */
	.engine {
		border-color: var(--palette-accent);
	}
</style>
