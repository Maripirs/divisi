<script lang="ts">
	import PieceLibrary from '$lib/components/PieceLibrary.svelte';
	import { SFCC_PIECES } from '$lib/pieces/registry';
</script>

<main>
	<header class="app-header">
		<h1>SFCC</h1>
		<p class="tagline">Pieces</p>
	</header>

	<PieceLibrary pieces={SFCC_PIECES} />

	<a class="section-link" href="/">Demos</a>
</main>

<style>
	main {
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1.25rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.app-header {
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.app-header h1 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 800;
		color: var(--text);
	}

	.tagline {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--text-muted);
	}

	.section-link {
		align-self: center;
		color: var(--accent);
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
	}

	.section-link:hover {
		color: var(--accent-hover);
	}
</style>
