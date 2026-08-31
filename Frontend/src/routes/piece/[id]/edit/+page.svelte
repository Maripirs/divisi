<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import EditorScoreView from '$lib/components/EditorScoreView.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { resolvedTheme } from '$lib/theme';
	import type { EditableScore, EditableNote, DurationType } from '$lib/musicxml/editableScore';
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
	// Task 5: save-in-flight + last save failure (a friendly message from the
	// `edit/save` endpoint's `error()`, or a generic fallback). Task 6: the
	// unsaved-changes guard below reads `dirty`.
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	// Task 3b: pending dot count for the duration control (0 -> 1 -> 2 -> 0).
	// Kept in sync with the selected note's real dot count by the effect
	// below, so the toggle always shows what is actually on the page.
	let durationDots = $state<0 | 1 | 2>(0);
	// A transient message for an edit the model refused (a duration that
	// doesn't land on the grid, or a lengthening that would overfill the
	// bar). Cleared on the next selection or successful edit, and auto-clears
	// after a few seconds.
	let editNotice = $state<string | null>(null);
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
	// The selected note's written duration, re-read from the model after
	// every selection or edit (keyed off `selectedNote`, which is a fresh
	// object each `reindex()`). Drives the active state on the duration
	// buttons and the re-apply when the dot count is cycled.
	const selectedDuration = $derived.by(() =>
		score && selectedNote ? score.noteDuration(selectedNote.index) : null
	);
	const canDurationEdit = $derived(selectedNote != null);
	const durationTypes: readonly DurationType[] = ['whole', 'half', 'quarter', 'eighth', '16th'];
	const durationLabel = (t: DurationType): string =>
		t === 'whole'
			? m.piece_editor_dur_whole()
			: t === 'half'
				? m.piece_editor_dur_half()
				: t === 'quarter'
					? m.piece_editor_dur_quarter()
					: t === 'eighth'
						? m.piece_editor_dur_eighth()
						: m.piece_editor_dur_16th();

	// Task 3c: accidental / key / clef controls. All three route through
	// `applyEdit` like every other edit, so `dirty` / re-serialize / re-render
	// / re-select stay identical. No new keyboard shortcuts — the digit keys
	// are taken by durations and `handleKeydown` is deliberately frozen.
	const accidentalPresets = [
		{ alter: -2, glyph: '♭♭', label: () => m.piece_editor_acc_double_flat() },
		{ alter: -1, glyph: '♭', label: () => m.piece_editor_acc_flat() },
		{ alter: 0, glyph: '♮', label: () => m.piece_editor_acc_natural() },
		{ alter: 1, glyph: '♯', label: () => m.piece_editor_acc_sharp() },
		{ alter: 2, glyph: '♯♯', label: () => m.piece_editor_acc_double_sharp() }
	] as const;
	type ClefId = 'treble' | 'bass' | 'alto' | 'tenor';
	const clefPresets: ReadonlyArray<{ id: ClefId; sign: string; line: number }> = [
		{ id: 'treble', sign: 'G', line: 2 },
		{ id: 'bass', sign: 'F', line: 4 },
		{ id: 'alto', sign: 'C', line: 3 },
		{ id: 'tenor', sign: 'C', line: 4 }
	];
	const clefLabel = (id: ClefId): string =>
		id === 'treble'
			? m.piece_editor_clef_treble()
			: id === 'bass'
				? m.piece_editor_clef_bass()
				: id === 'alto'
					? m.piece_editor_clef_alto()
					: m.piece_editor_clef_tenor();

	// The alter / key / clef in effect at the selection, re-read from the
	// model after every selection or edit (keyed off `selectedNote`, a fresh
	// object each `reindex()`). Drive the toolbar's active state.
	const selectedAlter = $derived(canPitchEdit ? (selectedNote?.pitch?.alter ?? 0) : null);
	const selectedKey = $derived.by(() =>
		score && selectedNote ? score.keyAt(selectedNote.index) : null
	);
	const selectedClef = $derived.by(() =>
		score && selectedNote ? score.clefAt(selectedNote.index) : null
	);
	const keyReadout = (fifths: number | null): string => {
		const v = fifths ?? 0;
		if (v === 0) return m.piece_editor_key_none();
		return v > 0
			? m.piece_editor_key_sharps({ count: v })
			: m.piece_editor_key_flats({ count: -v });
	};

	function applyAccidental(alter: number): void {
		if (!canPitchEdit) return;
		const applied = applyEdit((s, i) => s.setAccidental(i, alter));
		editNotice = applied ? null : m.piece_editor_accidental_refused();
	}

	// Key stepper over `fifths` -7..7, clamped at the ends. Applies to every
	// part at the selected measure via `setKey`.
	function stepKey(delta: 1 | -1): void {
		if (!score || selectedIndex === null || reRendering) return;
		const current = selectedKey ?? 0;
		const next = Math.max(-7, Math.min(7, current + delta));
		if (next === current) return;
		const applied = applyEdit((s, i) => s.setKey(i, next));
		editNotice = applied ? null : m.piece_editor_key_refused();
	}

	function applyClef(preset: { sign: string; line: number }): void {
		if (selectedIndex === null) return;
		const applied = applyEdit((s, i) => s.setClef(i, { sign: preset.sign, line: preset.line }));
		editNotice = applied ? null : m.piece_editor_clef_refused();
	}

	// Keep the dot toggle showing the selected note's real dot count.
	$effect(() => {
		const d = selectedDuration;
		if (d) durationDots = d.dots;
	});

	// Auto-clear the refusal notice so it doesn't linger once the user has
	// moved on.
	$effect(() => {
		if (!editNotice) return;
		const timer = setTimeout(() => (editNotice = null), 4000);
		return () => clearTimeout(timer);
	});

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
		editNotice = null;
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
	// A mutation that returns `false` (the model refused it) is a no-op: it
	// must not flag the score dirty or re-render. Returns whether it applied.
	function applyEdit(mutate: (s: EditableScore, index: number) => boolean | void): boolean {
		if (!score || selectedIndex === null || reRendering) return false;
		if (mutate(score, selectedIndex) === false) return false;
		workingXml = score.serialize();
		dirty = true;
		selectByIndex(selectedIndex);
		return true;
	}

	const transposeSelected = (semitones: number) => applyEdit((s, i) => s.transpose(i, semitones));
	const deleteSelected = () => applyEdit((s, i) => s.deleteToRest(i));

	// Set the selected note's (or chord's) duration through the same
	// `applyEdit` path. `setDuration` refuses a value that doesn't land on
	// the measure's grid or a lengthening the bar can't absorb; surface that
	// as a transient notice rather than a silent nothing.
	function applyDuration(type: DurationType, dots: 0 | 1 | 2 = durationDots): boolean {
		if (!score || selectedIndex === null || reRendering) return false;
		// Already exactly this value: a silent no-op, not a refusal, so it
		// must not warn or flag the score dirty.
		if (selectedDuration && selectedDuration.type === type && selectedDuration.dots === dots) {
			return false;
		}
		const applied = applyEdit((s, i) => s.setDuration(i, { type, dots }));
		editNotice = applied ? null : m.piece_editor_duration_refused();
		return applied;
	}

	// The dot toggle: 0 -> 1 -> 2 -> 0. If a note is selected, re-apply its
	// current type with the new dot count so the toggle has immediate effect;
	// if the model refuses that (off-grid), leave the toggle where it was.
	function cycleDots(): void {
		const next = ((durationDots + 1) % 3) as 0 | 1 | 2;
		const type = selectedDuration?.type;
		if (type && score && selectedIndex !== null && !reRendering) {
			if (!applyDuration(type, next)) return;
		}
		durationDots = next;
	}

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
	// selection between pitched notes, Delete/Backspace = note -> rest,
	// digits 1-5 = set the note value (whole / half / quarter / eighth /
	// 16th), `.` = cycle the dot count 0 -> 1 -> 2 -> 0.
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
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
				event.preventDefault();
				applyDuration(durationTypes[Number(event.key) - 1]);
				break;
			case '.':
				event.preventDefault();
				cycleDots();
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

	// Task 4 + 5: export the edited model to a complete MusicXML document and
	// POST it to `edit/save/+server.ts`, which creates a new `draft` version
	// on this piece (PDF slot carried forward, `source: modification`) and
	// leaves it for the normal submit/approve/distribute review flow. On
	// success, drop the dirty flag (so the guard below doesn't fire on our
	// own redirect) and return to the piece page.
	async function save(): Promise<void> {
		if (!score || saving || !dirty) return;
		saving = true;
		saveError = null;
		try {
			const xml = score.exportMusicXml();
			const base = (data.pieceTitle ?? 'score').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'score';
			const fd = new FormData();
			fd.set(
				'file',
				new File([xml], `${base}.musicxml`, { type: 'application/vnd.recordare.musicxml+xml' })
			);
			let res: Response;
			try {
				res = await fetch(`/piece/${data.id}/edit/save`, { method: 'POST', body: fd });
			} catch {
				saveError = m.errors_could_not_reach_server();
				return;
			}
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				saveError = body.message ?? m.piece_editor_save_failed();
				return;
			}
			dirty = false;
			await goto(backToPieceHref);
		} finally {
			saving = false;
		}
	}

	// Task 6: warn before leaving with unsaved edits. `beforeNavigate` covers
	// in-app navigation (the "Back to this track" link, the header brand
	// link, the browser back button); the `beforeunload` listener covers a
	// tab close or a hard reload. Neither fires once `save()` has cleared
	// `dirty`.
	beforeNavigate((nav) => {
		if (!dirty || saving) return;
		if (!confirm(m.piece_editor_unsaved_warning())) nav.cancel();
	});
	$effect(() => {
		if (!dirty) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});

	onMount(() => {
		if (data.access === 'granted') void loadScore();
	});
</script>

<!-- F14: a focused, full-screen editing surface — same "own chrome, no
     AppHeader/BottomNav" shape as the practice player (`piece/[id]`), so
     moving between playing a track and correcting its notation feels like
     one place. Back arrow + title on the left, the primary Save action
     top-right (the player parks Practice Setup there); the toolbars pin
     under the bar and the score takes the rest of the viewport. -->
<div class="editor-shell">
	<header class="top-bar">
		<a class="icon-btn" href={backToPieceHref} aria-label={m.piece_editor_back_to_piece()}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</a>

		<div class="top-bar-title">
			<h1>{data.pieceTitle ?? 'Divisi'}</h1>
			<p>{m.piece_editor_title()}</p>
		</div>

		{#if data.access === 'granted' && phase === 'ready'}
			<button
				class="btn btn-primary save-btn"
				onclick={save}
				disabled={!dirty || saving || reRendering}
			>
				{saving ? m.piece_editor_saving() : m.piece_editor_save()}
			</button>
		{:else}
			<span class="top-bar-slot" aria-hidden="true"></span>
		{/if}
	</header>

	{#if data.access === 'granted'}
		{#if phase === 'loading'}
			<div class="editor-fill editor-fill--center">
				<div class="status-card">
					<div class="spinner" aria-hidden="true"></div>
					<p role="status" aria-live="polite">{m.piece_editor_loading_score()}</p>
				</div>
			</div>
		{:else if phase === 'ready'}
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
				<div class="editor-toolbars">
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

					<div class="editor-toolbar" role="toolbar" aria-label={m.piece_editor_duration_label()}>
						{#each durationTypes as t (t)}
							<button
								class="btn"
								class:dur-active={selectedDuration?.type === t}
								aria-pressed={selectedDuration?.type === t}
								onclick={() => applyDuration(t)}
								disabled={!canDurationEdit || reRendering}
							>
								{durationLabel(t)}
							</button>
						{/each}
						<button
							class="btn"
							aria-label={m.piece_editor_dots_toggle()}
							onclick={cycleDots}
							disabled={reRendering}
						>
							{m.piece_editor_dots({ count: durationDots })}
						</button>
					</div>

					<div class="editor-toolbar" role="toolbar" aria-label={m.piece_editor_accidental_label()}>
						{#each accidentalPresets as a (a.alter)}
							<button
								class="btn"
								class:dur-active={selectedAlter === a.alter}
								aria-pressed={selectedAlter === a.alter}
								aria-label={a.label()}
								onclick={() => applyAccidental(a.alter)}
								disabled={!canPitchEdit || reRendering}
							>
								{a.glyph}
							</button>
						{/each}

						<span class="editor-stepper" role="group" aria-label={m.piece_editor_key_label()}>
							<button
								class="btn"
								aria-label={m.piece_editor_key_down()}
								onclick={() => stepKey(-1)}
								disabled={selectedIndex === null || reRendering || (selectedKey ?? 0) <= -7}
							>
								−
							</button>
							<span class="editor-readout" aria-live="polite">{keyReadout(selectedKey)}</span>
							<button
								class="btn"
								aria-label={m.piece_editor_key_up()}
								onclick={() => stepKey(1)}
								disabled={selectedIndex === null || reRendering || (selectedKey ?? 0) >= 7}
							>
								+
							</button>
						</span>

						{#each clefPresets as c (c.id)}
							<button
								class="btn"
								class:dur-active={selectedClef?.sign === c.sign && selectedClef?.line === c.line}
								aria-pressed={selectedClef?.sign === c.sign && selectedClef?.line === c.line}
								onclick={() => applyClef(c)}
								disabled={selectedIndex === null || reRendering}
							>
								{clefLabel(c.id)}
							</button>
						{/each}
					</div>

					<p class="editor-status" role="status" aria-live="polite">
						{#if selectedNote}
							{m.piece_editor_selected({ label: selectionLabel() })}
						{:else}
							{m.piece_editor_selection_none()}
						{/if}
					</p>

					{#if editNotice}
						<p class="editor-notice" role="status" aria-live="polite">{editNotice}</p>
					{/if}
					{#if saveError}
						<p class="editor-notice" role="alert">{saveError}</p>
					{/if}
				</div>

				<div class="editor-scroll">
					<EditorScoreView
						xml={workingXml}
						scoreTheme={$resolvedTheme}
						{selectedOnset}
						onPickNote={handlePickNote}
						bind:rendering={reRendering}
						fill
					/>
				</div>

				<footer class="editor-footer">
					<span class="editor-count">{m.piece_editor_notes_loaded({ count: noteCount })}</span>
					<span class="editor-hint">{m.piece_editor_keyboard_hint()}</span>
				</footer>
			</div>
		{:else if errorKind === 'noFile'}
			<div class="editor-fill editor-fill--center">
				<div class="status-card">
					<p>{m.piece_editor_no_music_file()}</p>
					<a class="text-link" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</div>
		{:else if errorKind === 'unreachable'}
			<div class="editor-fill editor-fill--center">
				<div class="status-card status-card--error">
					<p>{m.errors_could_not_reach_server()}</p>
					<button class="text-link" onclick={() => loadScore()}>{m.piece_retry()}</button>
				</div>
			</div>
		{:else if errorKind === 'unsupported'}
			<div class="editor-fill editor-fill--center">
				<div class="status-card">
					<p>{m.piece_editor_unsupported_format()}</p>
					<a class="text-link" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
				</div>
			</div>
		{:else}
			<div class="editor-fill editor-fill--center">
				<div class="status-card status-card--error">
					<p>{m.piece_editor_score_load_failed()}</p>
					{#if errorDetail}<p class="status-detail">{errorDetail}</p>{/if}
					<div class="status-actions">
						<button class="text-link" onclick={() => loadScore()}>{m.piece_retry()}</button>
						<a class="text-link" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
					</div>
				</div>
			</div>
		{/if}
	{:else if data.access === 'notFound'}
		<div class="editor-fill editor-fill--center">
			<div class="status-card status-card--error">
				<p>{m.piece_not_found()}</p>
				<a class="text-link" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
			</div>
		</div>
	{:else if data.access === 'unreachable'}
		<div class="editor-fill editor-fill--center">
			<div class="status-card status-card--error">
				<p>{m.errors_could_not_reach_server()}</p>
				<button class="text-link" onclick={() => location.reload()}>{m.piece_retry()}</button>
			</div>
		</div>
	{:else}
		<!-- 'denied': the Backend resolved the piece fine, this user just
		     isn't its owner (personal piece) or an admin of its group. The
		     editor never mounts for them; the save endpoint would 403 them
		     too, so this is a friendly bounce, not the only guard. -->
		<div class="editor-fill editor-fill--center">
			<div class="status-card status-card--error">
				<p class="status-eyebrow">{m.error_403_title()}</p>
				<p>{m.piece_editor_no_edit_access()}</p>
				<a class="text-link" href={backToPieceHref}>{m.piece_editor_back_to_piece()}</a>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Focused full-screen chrome, matching the practice player's own shell
	   (`piece/[id]`): a fixed viewport-filling column, its own top bar, no
	   AppHeader/BottomNav. */
	.editor-shell {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		overscroll-behavior: none;
	}

	/* Lifted from the player's `.top-bar` so the two read as one place. */
	.top-bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: calc(0.625rem + env(safe-area-inset-top, 0px)) 0.75rem 0.625rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		z-index: 1;
	}

	.top-bar-title {
		flex: 1;
		min-width: 0;
		text-align: center;
	}
	.top-bar-title h1 {
		margin: 0;
		overflow: hidden;
		color: var(--text);
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.top-bar-title p {
		margin: 0.125rem 0 0;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 0.75rem;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.icon-btn:hover {
		background: var(--surface-2);
	}
	.icon-btn svg {
		width: 21px;
		height: 21px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Save takes the slot the player gives Practice Setup. A label reads
	   clearer than an icon for a destructive-ish "make a new draft", so
	   it's a compact pill rather than an `.icon-btn`. */
	.save-btn {
		flex-shrink: 0;
		min-height: 2rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
	}
	/* Keeps the title centered when there's no Save button yet. */
	.top-bar-slot {
		flex-shrink: 0;
		width: 36px;
	}

	/* A viewport-filling area for the loading / error / denied states, so
	   their card sits centered in the same space the score would fill. */
	.editor-fill {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}
	.editor-fill--center {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 2.5rem 1rem;
	}

	.status-card {
		max-width: 520px;
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 2.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-muted);
		text-align: center;
	}
	.status-card p {
		margin: 0;
	}
	.status-card--error {
		color: var(--danger);
	}
	.status-eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.status-detail {
		font-size: 0.8125rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		word-break: break-word;
	}
	.status-actions {
		display: flex;
		gap: 1rem;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid var(--surface-2);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* The focusable editing region — now the whole content column below the
	   top bar. A visible focus ring still matters: the keyboard map only
	   works while this holds focus. Ring drawn inset so the fixed edges
	   don't clip it. */
	.editor-surface {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.editor-surface:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* The toolbars pin under the top bar; only the score scrolls. */
	.editor-toolbars {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		max-height: 40vh;
		overflow-y: auto;
	}

	.editor-scroll {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		overscroll-behavior: contain;
	}

	.editor-footer {
		flex: 0 0 auto;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		padding: 0.4rem 0.75rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.editor-count {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text);
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
	/* The duration value that matches the selected note, so the toolbar
	   reflects the score rather than just being a set of actions. Reused for
	   the accidental and clef active states on the third row. */
	.editor-toolbar .btn.dur-active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	/* The key-signature stepper: −  [readout]  +  as one visual group. */
	.editor-stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.editor-readout {
		min-width: 2.25rem;
		text-align: center;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	.editor-status {
		margin: 0;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	/* A refused edit (off-grid duration, or a lengthening the bar can't
	   hold). Transient, cleared on the next selection or successful edit. */
	.editor-notice {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.editor-hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>
