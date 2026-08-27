<script lang="ts">
	import { goto } from '$app/navigation';
	import { PIECES } from '$lib/pieces/registry';

	function open(id: string) {
		goto(`/piece/${id}`);
	}
</script>

<main>
	<header class="app-header">
		<h1>Divisi</h1>
		<p class="tagline">Pick a piece to play</p>
	</header>

	<ul class="library-grid">
		{#each PIECES as piece (piece.id)}
			<li>
				<button class="piece-card" onclick={() => open(piece.id)}>
					<span class="piece-title">{piece.title}</span>
					<span class="piece-composer">{piece.composer}</span>
				</button>
			</li>
		{/each}
	</ul>
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

	.library-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
	}

	.piece-card {
		width: 100%;
		text-align: left;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 1.25rem 1.25rem 1.375rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			border-color 0.15s ease;
	}

	.piece-card:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.piece-title {
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text);
	}

	.piece-composer {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
