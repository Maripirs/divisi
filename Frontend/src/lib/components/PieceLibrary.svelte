<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PieceSummary } from '$lib/pieces/types';

	interface Props {
		pieces: PieceSummary[];
	}

	let { pieces }: Props = $props();

	function openPlayer(id: string) {
		goto(`/piece/${id}`);
	}
</script>

<ul class="library-grid">
	{#each pieces as piece (piece.id)}
		<li class="piece-card">
			<div class="piece-info">
				<h2>{piece.title}</h2>
				<p>{piece.composer}</p>
			</div>
			<div class="piece-actions">
				<button class="piece-action piece-action--primary" onclick={() => openPlayer(piece.id)}>
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M8 5v14l11-7z" />
					</svg>
					<span>Player</span>
				</button>
				<a class="piece-action" href={piece.pdfUrl} target="_blank" rel="noreferrer">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M7 3h7l5 5v13H7z" />
						<path d="M14 3v5h5" />
					</svg>
					<span>PDF</span>
				</a>
			</div>
		</li>
	{/each}
</ul>

<style>
	.library-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
	}

	.piece-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.piece-info {
		min-width: 0;
	}

	.piece-info h2 {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 1.0625rem;
		font-weight: 700;
		line-height: 1.25;
		color: var(--text);
	}

	.piece-info p {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.piece-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.piece-action {
		min-height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
	}

	.piece-action:hover {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.piece-action--primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.piece-action--primary:hover {
		background: var(--accent-hover);
	}

	.piece-action svg {
		width: 16px;
		height: 16px;
		flex: 0 0 auto;
	}

	.piece-action:not(.piece-action--primary) svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
