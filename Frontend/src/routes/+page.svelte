<script lang="ts">
	import PieceLibrary from '$lib/components/PieceLibrary.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="shell">
	<AppHeader title="Library" />

	<!-- "Personal" (a user's own uploaded pieces) hidden until there's an
	     actual upload feature — it used to just show the bundled demo
	     library under that heading, which misrepresented it as the user's
	     own. -->

	{#if !data.user}
		<p class="empty-note login-note">
			<a href="/login">Log in</a> to see your groups' shared rehearsal tracks here too.
		</p>
	{:else}
		{#each data.groupSections as { group, pieces } (group.id)}
			{@const playable = pieces.map((p) => getPieceByTitle(p.title)).filter((p) => p !== undefined)}
			{@const notWired = pieces.filter((p) => !getPieceByTitle(p.title))}
			<section class="library-section">
				<div class="library-section-head">
					<h2>{group.name}</h2>
					<a class="section-link" href="/groups/{group.id}">Open group</a>
				</div>
				{#if pieces.length > 0}
					{#if playable.length > 0}
						<PieceLibrary pieces={playable} />
					{/if}
					{#each notWired as piece (piece.piece_id)}
						<div class="piece-card--plain">
							<div class="piece-info">
								<h2>{piece.title}</h2>
								<p>Status: {piece.version_status} · Practice not wired up yet</p>
							</div>
						</div>
					{/each}
				{:else}
					<p class="empty-note">No rehearsal tracks shared with this group yet.</p>
				{/if}
			</section>
		{/each}
	{/if}
</main>

<BottomNav />

<style>
	/* Uses the shared `.shell` container (same max-width/padding/gap as
	   Home/Groups/Settings) so AppHeader sits in an identical frame on
	   every bottom-nav page — a wider/differently-padded container here
	   was making the header look like it changed size when switching
	   pages, when only its surrounding whitespace did. */

.library-section {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.library-section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.library-section h2 {
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--text);
	}

	.section-link {
		flex: 0 0 auto;
		color: var(--accent);
		font-size: 0.8125rem;
		font-weight: 700;
		text-decoration: none;
	}

	.section-link:hover {
		color: var(--accent-hover);
	}

	.empty-note {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.login-note a {
		color: var(--accent);
	}

	.piece-card--plain {
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 0.75rem);
		padding: 0.85rem 1rem;
		background: var(--surface);
	}

	.piece-card--plain + .piece-card--plain {
		margin-top: 0.75rem;
	}

	.piece-info h2 {
		margin: 0 0 0.15rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
	}

	.piece-info p {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
