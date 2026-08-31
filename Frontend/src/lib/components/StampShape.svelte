<script lang="ts">
	let { type }: { type: string | null } = $props();

	function fallbackGlyph(value: string | null): string {
		switch (value) {
			case 'breath':
				return '’';
			case 'accent':
				return '>';
			case 'fermata':
				return '\u{1D110}';
			case 'staccato':
				return '·';
			case 'circle':
				return '○';
			case 'star':
				return '★';
			default:
				return '?';
		}
	}
</script>

{#if type === 'crescendo'}
	<path class="stamp-stroke" d="M 0.4 -0.26 L -0.4 0 L 0.4 0.26" />
{:else if type === 'diminuendo'}
	<path class="stamp-stroke" d="M -0.4 -0.26 L 0.4 0 L -0.4 0.26" />
{:else if type === 'breath'}
	<path class="stamp-stroke" d="M 0.14 -0.35 C 0.02 -0.18 -0.05 -0.02 -0.02 0.16 C 0 0.29 0.08 0.38 0.2 0.42" />
{:else if type === 'no-breath'}
	<path class="stamp-stroke" d="M -0.42 0.12 C -0.18 -0.22 0.18 -0.22 0.42 0.12" />
	<path class="stamp-stroke" d="M -0.08 0.28 L 0.08 -0.26" />
{:else if type === 'cutoff'}
	<path class="stamp-stroke" d="M 0 -0.36 L 0 0.28" />
	<path class="stamp-stroke" d="M -0.34 0.28 L 0.34 0.28" />
{:else if type === 'fermata'}
	<path class="stamp-stroke" d="M -0.42 0.08 C -0.26 -0.3 0.26 -0.3 0.42 0.08" />
	<circle class="stamp-fill" cx="0" cy="0.12" r="0.075" />
{:else if type === 'tenuto'}
	<path class="stamp-stroke" d="M -0.36 0 L 0.36 0" />
{:else if type === 'accent'}
	<path class="stamp-stroke" d="M -0.36 -0.22 L 0.36 0 L -0.36 0.22" />
{:else if type === 'staccato'}
	<circle class="stamp-fill" cx="0" cy="0" r="0.12" />
{:else if type === 'phrase-arc'}
	<path class="stamp-stroke" d="M -0.44 0.16 C -0.18 -0.2 0.18 -0.2 0.44 0.16" />
{:else}
	<text class="stamp-text" x="0" y="0" text-anchor="middle" dominant-baseline="central">
		{fallbackGlyph(type)}
	</text>
{/if}

<style>
	.stamp-stroke {
		fill: none;
		stroke: currentColor;
		stroke-width: 0.075;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.stamp-fill {
		fill: currentColor;
	}

	.stamp-text {
		fill: currentColor;
		font-family: ui-serif, Georgia, serif;
		font-size: 0.9px;
		font-weight: 700;
	}
</style>
