<script lang="ts">
	import PieceLibrary from '$lib/components/PieceLibrary.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import LoadingBlock from '$lib/components/LoadingBlock.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import { buildRemotePiece } from '$lib/pieces/remotePiece';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="shell">
	<AppHeader title={m.library_title()} />

	<!-- "Personal" (a user's own uploaded pieces) hidden until there's an
	     actual upload feature — it used to just show the bundled demo
	     library under that heading, which misrepresented it as the user's
	     own. -->

	{#if !data.user}
		<p class="empty-note login-note">
			<a href={lh('/login')}>{m.library_log_in()}</a> {m.library_log_in_note()}
		</p>
	{:else}
		{#await data.groupSections}
			<LoadingBlock />
		{:then groupSections}
		{#each groupSections as { group, pieces } (group.id)}
			<!-- Only pieces with a real practice file get shown here — a
			     distributed track with nothing wired up yet has nothing this
			     view could do with it, same call the group page's own Tracks
			     tab makes for a member (as opposed to its admin view, which
			     does list them so an admin knows what still needs fixing).
			     A bundled registry match (now just Lacrymosa/Thor, see
			     registry.ts) still gets that fixture's `Piece`; every other
			     real Backend piece builds one from its own library entry
			     instead — same has_music/has_pdf gate the group Tracks tab
			     and guest join page already use, so a group's own uploaded
			     repertoire shows up here too, not just the two public demos. -->
			{@const playable = pieces
				.map((p) =>
					// The bundled-registry title match is only a fallback for a
					// piece with nothing of its own wired up yet — once a group
					// has uploaded a real music file/PDF for it (even one that
					// happens to share a bundled piece's title), that real
					// content has to win, or an admin's own upload would
					// silently keep playing/showing the bundled fixture instead.
					p.has_music || p.has_pdf
						? buildRemotePiece({
								pieceId: p.piece_id,
								title: p.title,
								composer: p.composer,
								hasMusic: p.has_music,
								hasPdf: p.has_pdf,
								youtubeUrl: p.youtube_url,
								defaultTempoBpm: p.default_tempo_bpm,
								presentation: p.presentation ?? null,
								groupId: group.id
							})
						: getPieceByTitle(p.title)
				)
				.filter((p) => p !== undefined)}
			<section class="library-section">
				<div class="library-section-head">
					<h2>{group.name}</h2>
					<a class="section-link" href={lh(`/groups/${group.id}`)}>{m.library_open_group()}</a>
				</div>
				{#if playable.length > 0}
					<PieceLibrary pieces={playable} />
				{:else}
					<p class="empty-note">{m.library_no_tracks()}</p>
				{/if}
			</section>
		{/each}
		{:catch}
			<p class="empty-note">{m.load_failed()}</p>
		{/await}
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
</style>
