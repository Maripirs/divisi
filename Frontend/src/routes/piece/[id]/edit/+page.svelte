<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Edit access was already resolved in `+page.server.ts` (this route
	// isn't the cold-start-sensitive shared-link path the player is, so its
	// `load` can afford the Backend calls), so `data.access` is settled by
	// the time this client-only component mounts and there's no client-side
	// "resolving" state here. A cold Backend is covered by the root layout's
	// "waiting for backend" pill while `load` blocks, then the `unreachable`
	// card below if it times out. `'granted'` is the only state that will
	// eventually host the real editor (later F14 tasks); the rest mirror the
	// player route's notFound/unreachable handling.
	// `$derived`, not a plain `const`: SvelteKit reuses this component across
	// a navigation between two `/piece/[id]/edit` ids (no remount), so these
	// have to track `data` rather than freeze its first value.
	const backToPieceHref = $derived(lh(`/piece/${data.id}`));
	const headerTitle = $derived(data.pieceTitle ?? m.piece_editor_title());
</script>

<main class="shell">
	<AppHeader title={headerTitle} />

	{#if data.access === 'granted'}
		<section class="card">
			<p class="card-eyebrow">{m.piece_editor_title()}</p>
			<p class="card-meta">{m.piece_editor_coming_soon()}</p>
			<div class="btn-row">
				<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
			</div>
		</section>
	{:else if data.access === 'notFound'}
		<section class="card">
			<p class="card-meta">{m.piece_not_found()}</p>
			<div class="btn-row">
				<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
			</div>
		</section>
	{:else if data.access === 'unreachable'}
		<section class="card">
			<p class="card-meta">{m.errors_could_not_reach_server()}</p>
			<div class="btn-row">
				<button class="btn" onclick={() => location.reload()}>{m.piece_retry()}</button>
			</div>
		</section>
	{:else}
		<!-- 'denied': the Backend resolved the piece fine, this user just
		     isn't its owner (personal piece) or an admin of its group. The
		     editor never mounts for them; the save endpoint would 403 them
		     too, so this is a friendly bounce, not the only guard. -->
		<section class="card">
			<p class="card-eyebrow">{m.error_403_title()}</p>
			<p class="card-meta">{m.piece_editor_no_edit_access()}</p>
			<div class="btn-row">
				<a class="btn btn-primary" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
			</div>
		</section>
	{/if}
</main>
