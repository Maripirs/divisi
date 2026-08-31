<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import EditorScoreView from '$lib/components/EditorScoreView.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { resolvedTheme } from '$lib/theme';
	import type { EditableScore, EditableNote } from '$lib/musicxml/editableScore';
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

	// F14 task 3: the editing surface. `selectedIndex` is the stable
	// document-order id of the picked note — edits mutate a `<note>` in
	// place and never renumber, so it survives a re-serialize. `selectedNote`
	// is re-read from the model after every selection or edit so its (maybe
	// moved) onset drives the cursor marker in `EditorScoreView`. `dirty`
	// flips on the first applied edit; task 5 (save) and task 6 (unsaved-nav
	// guard) both read it.
	let selectedIndex = $state<number | null>(null);
	let selectedNote = $state<EditableNote | undefined>(undefined);
	let dirty = $state(false);
	// Bound out of `EditorScoreView`: true while OSMD re-engraves. Edits are
	// held off until it settles so two `osmd.load()` calls can't overlap (a
	// real risk on a held arrow key — the spike serialized edits the same
	// way with its `busy` flag).
	let reRendering = $state(false);
	let surfaceEl = $state<HTMLDivElement | undefined>(undefined);

	const selectedOnset = $derived(selectedNote?.onsetWholeNotes);
	const canPitchEdit = $derived(
		selectedNote != null && !selectedNote.isRest && selectedNote.pitch != null
	);

	// A compact label for the status line: the note's pitch (e.g. "F#4"), or
	// a localized "rest" once it has been deleted.
	function selectionLabel(): string {
		const n = selectedNote;
		if (!n) return '';
		if (n.isRest || !n.pitch) return m.piece_editor_rest_label();
		const { step, alter, octave } = n.pitch;
		const acc = alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : '';
		return `${step}${acc}${octave}`;
	}

	function selectByIndex(index: number | null): void {
		selectedIndex = index;
		selectedNote = index === null ? undefined : score?.get(index);
	}

	// Resolve a notehead click (reported by `EditorScoreView`) back to a
	// `<note>` in the model. OSMD numbers staves globally, so the hit carries
	// the in-instrument staff index plus the part id for `findByOnset`.
	function handlePickNote(hit: {
		onsetWholeNotes: number;
		partId: string;
		staff: number;
		octave: number | undefined;
	}): void {
		if (!score) return;
		const note = score.findByOnset(hit.onsetWholeNotes, {
			partId: hit.partId,
			staff: hit.staff,
			octave: hit.octave
		});
		if (note) selectByIndex(note.index);
	}

	// Apply one in-place mutation, re-serialize for the re-engrave, and keep
	// the same note selected (its index is stable; its onset may have moved).
	function applyEdit(mutate: (s: EditableScore, index: number) => void): void {
		if (!score || selectedIndex === null || reRendering) return;
		mutate(score, selectedIndex);
		workingXml = score.serialize();
		dirty = true;
		selectByIndex(selectedIndex);
	}

	const transposeSelected = (semitones: number) => applyEdit((s, i) => s.transpose(i, semitones));
	const deleteSelected = () => applyEdit((s, i) => s.deleteToRest(i));

	// Move the selection to the previous/next pitched note in document
	// order, so the score can be corrected from the keyboard alone. Rests
	// (including a note just deleted to one) are skipped.
	function stepSelection(delta: 1 | -1): void {
		if (!score) return;
		const pitched = score.list().filter((n) => !n.isRest && n.pitch != null);
		if (pitched.length === 0) return;
		if (selectedIndex === null) {
			selectByIndex((delta === 1 ? pitched[0] : pitched[pitched.length - 1]).index);
			return;
		}
		const at = pitched.findIndex((n) => n.index === selectedIndex);
		let nextPos: number;
		if (at === -1) {
			// The current selection isn't pitched any more (deleted to a
			// rest): jump to the nearest pitched note on the requested side.
			if (delta === 1) {
				const after = pitched.findIndex((n) => n.index > selectedIndex!);
				nextPos = after === -1 ? pitched.length - 1 : after;
			} else {
				let before = 0;
				for (let k = 0; k < pitched.length; k++) {
					if (pitched[k].index < selectedIndex!) before = k;
				}
				nextPos = before;
			}
		} else {
			nextPos = Math.min(pitched.length - 1, Math.max(0, at + delta));
		}
		selectByIndex(pitched[nextPos].index);
	}

	// Keyboard editing. Bound to the editor surface (a `tabindex="0"`
	// region), so it is only live while that region holds focus, and it
	// bails when a text field is focused. Keys: ArrowUp/Down = pitch +/-1
	// semitone, Shift+ArrowUp/Down = +/-1 octave, ArrowLeft/Right = move the
	// selection between pitched notes, Delete/Backspace = note -> rest.
	function handleKeydown(event: KeyboardEvent): void {
		if (phase !== 'ready' || !score) return;
		const el = event.target as HTMLElement | null;
		if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				transposeSelected(event.shiftKey ? 12 : 1);
				break;
			case 'ArrowDown':
				event.preventDefault();
				transposeSelected(event.shiftKey ? -12 : -1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				stepSelection(1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				stepSelection(-1);
				break;
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				deleteSelected();
				break;
		}
	}

	// Once the score is on screen, focus the editing region so the keyboard
	// map works without a click first (the on-screen hint documents it).
	$effect(() => {
		if (phase === 'ready') surfaceEl?.focus({ preventScroll: true });
	});

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
			selectByIndex(null);
			dirty = false;
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

				<!--
					The editing surface is a custom keyboard-driven widget
					(`role="application"`): the arrow-key map in `handleKeydown`
					is only live while this region holds focus, which is exactly
					the constraint task 3 asks for. The a11y linter still treats
					a `<div>` as non-interactive, hence the scoped ignore.
				-->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					class="editor-surface"
					bind:this={surfaceEl}
					role="application"
					aria-label={m.piece_editor_editing_region()}
					tabindex="0"
					onkeydown={handleKeydown}
				>
					<div class="editor-toolbar" role="toolbar" aria-label={m.piece_editor_editing_region()}>
						<button
							class="btn"
							onclick={() => transposeSelected(1)}
							disabled={!canPitchEdit || reRendering}
						>
							{m.piece_editor_pitch_up()}
						</button>
						<button
							class="btn"
							onclick={() => transposeSelected(-1)}
							disabled={!canPitchEdit || reRendering}
						>
							{m.piece_editor_pitch_down()}
						</button>
						<button
							class="btn"
							onclick={() => transposeSelected(12)}
							disabled={!canPitchEdit || reRendering}
						>
							{m.piece_editor_octave_up()}
						</button>
						<button
							class="btn"
							onclick={() => transposeSelected(-12)}
							disabled={!canPitchEdit || reRendering}
						>
							{m.piece_editor_octave_down()}
						</button>
						<button
							class="btn"
							onclick={deleteSelected}
							disabled={selectedIndex === null || reRendering}
						>
							{m.piece_editor_delete_note()}
						</button>
					</div>

					<p class="editor-status" role="status" aria-live="polite">
						{#if selectedNote}
							{m.piece_editor_selected({ label: selectionLabel() })}
						{:else}
							{m.piece_editor_selection_none()}
						{/if}
					</p>

					<EditorScoreView
						xml={workingXml}
						scoreTheme={$resolvedTheme}
						{selectedOnset}
						onPickNote={handlePickNote}
						bind:rendering={reRendering}
					/>

					<p class="editor-hint">{m.piece_editor_keyboard_hint()}</p>
				</div>

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

<style>
	/* The focusable editing region. A visible focus ring matters here — the
	   keyboard map only works while this holds focus. */
	.editor-surface {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-radius: var(--radius-lg);
		outline-offset: 3px;
	}
	.editor-surface:focus-visible {
		outline: 2px solid var(--accent);
	}

	.editor-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.editor-toolbar .btn {
		padding: 0.35rem 0.65rem;
		font-size: 0.8125rem;
	}

	.editor-status {
		margin: 0;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	.editor-hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
