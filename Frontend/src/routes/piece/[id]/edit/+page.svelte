<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import EditorScoreView from '$lib/components/EditorScoreView.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { resolvedTheme } from '$lib/theme';
	import type { EditableScore } from '$lib/musicxml/editableScore';
	import { loadEditableScore, UnsupportedMusicFileError } from '$lib/musicxml/loadEditableScore';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Edit access was already resolved in `+page.server.ts` (this route
	// isn't the cold-start-sensitive shared-link path the player is, so its
	// `load` can afford the Backend calls), so `data.access` is settled by
	// the time this client-only component mounts and there's no client-side
	// "resolving" state here. A cold Backend is covered by the root layout's
	// "waiting for backend" pill while `load` blocks, then the `unreachable`
	// card below if it times out. `'granted'` is the only state that hosts
	// the editor; the rest mirror the player route's notFound/unreachable
	// handling.
	// `$derived`, not a plain `const`: SvelteKit reuses this component across
	// a navigation between two `/piece/[id]/edit` ids (no remount), so these
	// have to track `data` rather than freeze its first value.
	const backToPieceHref = $derived(lh(`/piece/${data.id}`));
	const headerTitle = $derived(data.pieceTitle ?? m.piece_editor_title());

	// F14 task 2: on the `granted` state, fetch the track's current music
	// file, build the editable model, and render it read-only. Editing
	// interaction (click a note -> change it) is a later task; this one only
	// has to get a correct model on screen with loading/error states.
	type EditorErrorKind = 'noFile' | 'unreachable' | 'unsupported' | 'parseError';
	let phase = $state<'loading' | 'ready' | 'error'>('loading');
	let errorKind = $state<EditorErrorKind | null>(null);
	// Raw detail for the parse-failure case only (e.g. `EditableScore`'s
	// "MusicXML did not parse: ..."), shown under the friendly message.
	let errorDetail = $state<string | null>(null);
	// The editable model. Task 2 only renders its serialized output; tasks
	// 3-4 mutate it in place (transpose/delete/duration/key) and re-serialize
	// into `workingXml` after each edit. Kept here, not reparsed per task, so
	// the "one Document mutated in place" design holds across the build.
	let score = $state<EditableScore | undefined>(undefined);
	let workingXml = $state('');
	const noteCount = $derived(score?.list().length ?? 0);

	async function loadScore(): Promise<void> {
		phase = 'loading';
		errorKind = null;
		errorDetail = null;

		let res: Response;
		try {
			// The existing proxy resolves the piece's current version and
			// streams its file, attaching the session server-side.
			res = await fetch(`/piece/${data.id}/file`);
		} catch {
			// A genuine network failure reaching our own proxy — same class of
			// problem as the proxy's own synthetic 503.
			phase = 'error';
			errorKind = 'unreachable';
			return;
		}

		if (res.status === 404) {
			phase = 'error';
			errorKind = 'noFile';
			return;
		}
		if (res.status === 503) {
			// Backend unreachable from the proxy (see `file/+server.ts`).
			phase = 'error';
			errorKind = 'unreachable';
			return;
		}
		if (!res.ok) {
			phase = 'error';
			errorKind = 'parseError';
			errorDetail = `HTTP ${res.status}`;
			return;
		}

		try {
			const bytes = await res.arrayBuffer();
			// `loaded.sourceFormat` ('midi' | 'musicxml') is available for a
			// later task's "this came from a MIDI file, so the rhythm is
			// quantized" hint; task 2 doesn't surface it yet.
			const loaded = loadEditableScore(bytes);
			score = loaded.score;
			workingXml = loaded.score.serialize();
			phase = 'ready';
		} catch (err) {
			if (err instanceof UnsupportedMusicFileError) {
				phase = 'error';
				errorKind = 'unsupported';
				return;
			}
			// `EditableScore` throws "MusicXML did not parse: ..." on bad
			// input; a MIDI source can also fail in `parseMidiFile` /
			// `convertAllParts`. Either way it's a "can't read this file"
			// state, with the raw reason kept for the detail line.
			phase = 'error';
			errorKind = 'parseError';
			errorDetail = err instanceof Error ? err.message : String(err);
		}
	}

	onMount(() => {
		if (data.access === 'granted') void loadScore();
	});
</script>

<main class="shell">
	<AppHeader title={headerTitle} />

	{#if data.access === 'granted'}
		{#if phase === 'loading'}
			<section class="card">
				<p class="card-eyebrow">{m.piece_editor_title()}</p>
				<p class="card-meta" role="status" aria-live="polite">{m.piece_editor_loading_score()}</p>
			</section>
		{:else if phase === 'ready'}
			<section class="card">
				<p class="card-eyebrow">{m.piece_editor_title()}</p>
				<p class="card-note">{m.piece_editor_notes_loaded({ count: noteCount })}</p>
				<EditorScoreView xml={workingXml} scoreTheme={$resolvedTheme} />
				<div class="btn-row">
					<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</section>
		{:else if errorKind === 'noFile'}
			<section class="card">
				<p class="card-meta">{m.piece_editor_no_music_file()}</p>
				<div class="btn-row">
					<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</section>
		{:else if errorKind === 'unreachable'}
			<section class="card">
				<p class="card-meta">{m.errors_could_not_reach_server()}</p>
				<div class="btn-row">
					<button class="btn" onclick={() => loadScore()}>{m.piece_retry()}</button>
				</div>
			</section>
		{:else if errorKind === 'unsupported'}
			<section class="card">
				<p class="card-eyebrow">{m.piece_editor_title()}</p>
				<p class="card-meta">{m.piece_editor_unsupported_format()}</p>
				<div class="btn-row">
					<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</section>
		{:else}
			<section class="card">
				<p class="card-eyebrow">{m.piece_editor_title()}</p>
				<p class="card-meta">{m.piece_editor_score_load_failed()}</p>
				{#if errorDetail}<p class="card-note">{errorDetail}</p>{/if}
				<div class="btn-row">
					<button class="btn" onclick={() => loadScore()}>{m.piece_retry()}</button>
					<a class="btn" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</section>
		{/if}
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
