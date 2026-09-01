<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import EditorScoreView from '$lib/components/EditorScoreView.svelte';
	import PdfView from '$lib/components/PdfView.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { resolvedTheme } from '$lib/theme';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, MidiPlayer } from '$lib/audio/player';
	import { parseMusicXmlFile } from '$lib/musicxml/parser';
	import type { MixPart, ParsedMIDI } from '$lib/midi/types';
	import type { EditableScore, EditableNote, DurationType } from '$lib/musicxml/editableScore';
	import { loadEditableScore, UnsupportedMusicFileError } from '$lib/musicxml/loadEditableScore';
	import type { PagedReport } from '$lib/server/backendTypes';
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

	// Leaving the editor: if we got here by navigating inside the app (from
	// the piece page or the group Tracks tab), a plain `<a href>` to the
	// piece page would *push* a third entry, so the history stack reads
	// [origin, editor, piece] and "back, back" bounces piece <-> editor.
	// Track how we arrived; `leaveEditor()` then does a genuine `history.back()`
	// for an in-app arrival and only falls back to a (replacing) navigation
	// for a cold / direct load, where there's nothing to go back to.
	let cameFromApp = false;
	afterNavigate((nav) => {
		if (nav.type !== 'enter' && nav.from) cameFromApp = true;
	});

	function leaveEditor(): void {
		if (cameFromApp) history.back();
		else void goto(backToPieceHref, { replaceState: true });
	}

	// Anchor click -> `leaveEditor()`, but let the browser handle
	// modifier / middle clicks (open in new tab) via the real `href`.
	function onLeaveClick(event: MouseEvent): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		leaveEditor();
	}

	// Side-by-side reference PDF. `data.hasPdf` (resolved server-side) gates
	// the toggle so there's no probe request; the pane fetches the piece's
	// current-version PDF through the same proxy the player route uses.
	// Read-only here — markup lives in the practice player, not the editor.
	const pdfHref = $derived(`/piece/${data.id}/pdf`);
	let pdfPaneOpen = $state(false);
	let pdfZoom = $state(1);

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
	let scoreView: EditorScoreView | undefined = $state();

	// F15: seam review. When this track's music came from a B16 paged OMR run
	// that couldn't merge every page join cleanly (`data.pagedReportJobId`),
	// the run's report lists those joins by merged-measure number. We map
	// each to an onset in the working model so `EditorScoreView` can draw a
	// marker there, and offer a "next seam" jump. Onsets can shift as the
	// admin edits, so the mapping is derived from the live model, keyed on
	// `workingXml`, not resolved once.
	let seamBoundaries = $state<{ measure: number; reason: string; page: number }[]>([]);
	let seamAt = $state(-1); // index of the seam "Next seam" last jumped to
	const seams = $derived.by(() => {
		void workingXml; // re-resolve onsets after every edit
		if (!score || seamBoundaries.length === 0) return [];
		return seamBoundaries
			.map((b) => ({ ...b, onsetWholeNotes: score!.measureOnset(b.measure) }))
			.filter((s): s is { measure: number; reason: string; page: number; onsetWholeNotes: number } =>
				s.onsetWholeNotes != null
			)
			.sort((a, b) => a.onsetWholeNotes - b.onsetWholeNotes);
	});
	// Pared to what `EditorScoreView` needs: onset + a short label.
	const seamMarkers = $derived(
		seams.map((s) => ({
			onsetWholeNotes: s.onsetWholeNotes,
			reason: m.piece_editor_seam_flag({ page: s.page })
		}))
	);

	async function loadSeams(): Promise<void> {
		seamBoundaries = [];
		seamAt = -1;
		if (!data.pagedReportJobId) return;
		try {
			const res = await fetch(`/omr/jobs/${data.pagedReportJobId}/paged-report`);
			if (!res.ok) return; // seam hints are a bonus, never block the editor
			const report = (await res.json()) as PagedReport;
			seamBoundaries = report.unresolved_boundaries
				.filter((b) => b.merged_measure != null)
				.map((b) => ({
					measure: b.merged_measure as number,
					reason: b.reason ?? '',
					page: b.before_page
				}));
		} catch {
			// No overlay; the editor is still fully usable.
		}
	}

	// Jump the view to the next seam, cycling. Selecting the nearest note to
	// the seam onset parks the selection cursor there and follow-scroll
	// centres it (same machinery the "scroll to cursor" button uses).
	function goToNextSeam(): void {
		if (seams.length === 0 || !score) return;
		seamAt = (seamAt + 1) % seams.length;
		const target = seams[seamAt];
		const near = score.findByOnset(target.onsetWholeNotes, {});
		if (near) {
			selectByIndex(near.index);
			previewSelected();
		}
		scoreView?.scrollCursorIntoView();
	}

	// Keep the readout index valid if the seam set shrinks (an edit dropped a
	// boundary's measure, say).
	$effect(() => {
		if (seamAt >= seams.length) seamAt = -1;
	});

	// F14 reopened: in-editor playback. The audio path is the same one the
	// player route uses, fed from the working model rather than a file:
	// `score.serialize()` -> `parseMusicXmlFile()` (`ParsedMIDI`) ->
	// `MidiPlayer` (FluidSynth via an AudioWorklet). Everything here is
	// desktop-first for this pass.
	//
	// The `MidiPlayer` is created lazily on the first Play (see
	// `ensurePlayer`) and torn down in `onDestroy`. `parsedAudio` is memoized
	// on the exact `workingXml` it was parsed from — an edit invalidates it,
	// but re-parsing only happens on the next play/seek, never eagerly per
	// keystroke (a full parse is not free).
	let player: MidiPlayer | undefined;
	let playerCreating = false;
	let destroyed = false;
	let rafHandle = 0;
	// The last `workingXml` successfully parsed, plus its result. A parse
	// failure (an edit that briefly left the model invalid) leaves the old
	// cache in place and surfaces `audioParseError` instead.
	let parsedAudio: ParsedMIDI | undefined;
	let parsedAudioXml: string | undefined;
	// The `workingXml` currently loaded into the synth. `undefined` until the
	// first successful load; differs from `workingXml` after an edit, which is
	// exactly `audioStale`.
	let audioLoadedXml = $state<string | undefined>(undefined);
	let audioParseError = $state<string | null>(null);
	// `MidiPlayer.create()` failed (WASM/AudioWorklet unavailable, e.g. a
	// non-secure context) — the transport renders disabled with this reason.
	let audioUnavailable = $state(false);
	let isPlaying = $state(false);
	let positionMs = $state(0);
	let durationMs = $state(0);
	let tempoBpm = $state(120);
	let baseTempoBpm = $state(120);
	// Per-bucket playback volume (SATB + accompaniment), 0..1, keyed by the
	// `ParsedMIDI.parts` id. Seeded to 0.5 (this app's "even") as parts are
	// discovered; survives a reload so a mid-session mix isn't lost.
	let mixVolumes = $state<Record<string, number>>({});
	let mixParts = $state<ParsedMIDI['parts']>([]);
	let mixPanelOpen = $state(false);

	// True once an edit has landed since the audio was last loaded: the
	// currently-playing (or paused) audio is now behind the score. Cleared by
	// the next (re)load in `syncAudioToModel`.
	const audioStale = $derived(audioLoadedXml !== undefined && audioLoadedXml !== workingXml);
	const seekPct = $derived(durationMs > 0 ? (positionMs / durationMs) * 100 : 0);
	// Musical position in whole notes, for the playback cursor. `parseMusicXmlFile`
	// reports position in ms of musical time at the original tempo; a whole
	// note is `4 * 60000 / baseTempoBpm` ms of that.
	const msPerWholeNote = $derived(baseTempoBpm > 0 ? (4 * 60_000) / baseTempoBpm : 0);
	const playbackWholeNotes = $derived(
		isPlaying && msPerWholeNote > 0 ? positionMs / msPerWholeNote : undefined
	);

	function describeTempo(bpm: number): string {
		return `${bpm} BPM (${Math.round((bpm / baseTempoBpm) * 100)}%)`;
	}

	function formatTime(ms: number): string {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	// Parse `workingXml` to `ParsedMIDI`, memoized on the exact string. A
	// failure keeps the previous good parse and records the reason; callers
	// check `audioParseError` before proceeding.
	function currentParsedAudio(): ParsedMIDI | null {
		if (parsedAudio && parsedAudioXml === workingXml) return parsedAudio;
		try {
			const result = parseMusicXmlFile(workingXml);
			parsedAudio = result;
			parsedAudioXml = workingXml;
			audioParseError = null;
			return result;
		} catch (err) {
			audioParseError = err instanceof Error ? err.message : String(err);
			return null;
		}
	}

	// Lazily bring up the synth — on the first Play, or the first note preview
	// (a later task), whichever comes first. Returns null if it's still
	// coming up (caller just no-ops; the click that triggered it is the retry)
	// or if the engine isn't available at all.
	async function ensurePlayer(): Promise<MidiPlayer | null> {
		if (player) return player;
		if (playerCreating || audioUnavailable) return null;
		playerCreating = true;
		try {
			const created = await MidiPlayer.create();
			if (destroyed) {
				created.destroy();
				return null;
			}
			player = created;
			return created;
		} catch {
			audioUnavailable = true;
			return null;
		} finally {
			playerCreating = false;
		}
	}

	// (Re)load the working model into the synth, preserving the play/pause
	// state and landing back at `targetMs` (clamped to the possibly-changed
	// duration). Called on the first Play and whenever `audioStale` and the
	// user asks to play or seek.
	async function syncAudioToModel(p: MidiPlayer, targetMs: number): Promise<boolean> {
		const parsed = currentParsedAudio();
		if (!parsed) return false;
		const wasPlaying = p.isPlaying;
		await p.load(parsed);
		if (destroyed) return false;
		audioLoadedXml = parsedAudioXml;
		durationMs = p.duration;
		baseTempoBpm = p.baseBPM;
		// Keep the human's tempo choice across a reload; otherwise adopt the
		// file's own.
		if (tempoBpm < MIN_TEMPO_BPM || tempoBpm > MAX_TEMPO_BPM) tempoBpm = p.tempoBPM;
		p.setTempo(tempoBpm);
		// Discover parts and push the current mix.
		mixParts = parsed.parts;
		const next = { ...mixVolumes };
		for (const part of parsed.parts) {
			if (next[part.id] === undefined) next[part.id] = 0.5;
			p.setPartVolume(part.id, next[part.id]);
		}
		mixVolumes = next;
		const clamped = Math.min(durationMs, Math.max(0, targetMs));
		p.seek(clamped);
		positionMs = clamped;
		if (wasPlaying) await p.play();
		return true;
	}

	async function togglePlay(): Promise<void> {
		const p = await ensurePlayer();
		if (!p) return;
		if (p.isPlaying) {
			p.pause();
			return;
		}
		if (audioLoadedXml !== workingXml) {
			if (!(await syncAudioToModel(p, positionMs))) return;
		}
		await p.play();
	}

	async function seekAudio(ms: number): Promise<void> {
		const p = player;
		if (!p) {
			positionMs = Math.max(0, ms);
			return;
		}
		if (audioLoadedXml !== workingXml) {
			if (!(await syncAudioToModel(p, ms))) return;
			return;
		}
		p.seek(ms);
		positionMs = p.positionMs;
	}

	function stepTempo(delta: number): void {
		const next = Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, tempoBpm + delta));
		if (next === tempoBpm) return;
		tempoBpm = next;
		player?.setTempo(next);
	}

	function setMixVolume(partId: string, value: number): void {
		mixVolumes = { ...mixVolumes, [partId]: value };
		player?.setPartVolume(partId as MixPart, value);
	}

	function resetMix(): void {
		const next: Record<string, number> = { ...mixVolumes };
		for (const part of mixParts) next[part.id] = 0.5;
		mixVolumes = next;
		for (const part of mixParts) player?.setPartVolume(part.id as MixPart, 0.5);
	}

	const mixIsEven = $derived(mixParts.every((p) => (mixVolumes[p.id] ?? 0.5) === 0.5));

	function tick(): void {
		if (player) {
			positionMs = player.positionMs;
			isPlaying = player.isPlaying;
		}
		rafHandle = requestAnimationFrame(tick);
	}

	// Note preview: sound the selected/re-pitched note through the same synth
	// (a dedicated preview channel, independent of transport + mix) so a
	// correction can be heard, not just seen. Called on click-select and
	// after a pitch edit (immediate), and on arrow-key nav (debounced, so a
	// held key doesn't machine-gun — the note you land on plays when you
	// pause). Not on duration/key/clef edits.
	const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
	let previewTimer: ReturnType<typeof setTimeout> | undefined;

	function pitchToMidi(p: { step: string; alter: number; octave: number }): number {
		return (p.octave + 1) * 12 + (STEP_SEMITONES[p.step] ?? 0) + p.alter;
	}

	function previewSelected(immediate = true): void {
		const n = selectedNote;
		if (!n || n.isRest || !n.pitch) return;
		const midi = pitchToMidi(n.pitch);
		if (previewTimer) {
			clearTimeout(previewTimer);
			previewTimer = undefined;
		}
		if (immediate) {
			void playPreview(midi);
		} else {
			previewTimer = setTimeout(() => {
				previewTimer = undefined;
				void playPreview(midi);
			}, 140);
		}
	}

	async function playPreview(midi: number): Promise<void> {
		const p = player ?? (await ensurePlayer());
		p?.previewNote(midi);
	}

	onDestroy(() => {
		destroyed = true;
		if (rafHandle) cancelAnimationFrame(rafHandle);
		if (previewTimer) clearTimeout(previewTimer);
		player?.destroy();
		player = undefined;
	});

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
		if (applied) previewSelected();
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
		if (note) {
			selectByIndex(note.index);
			previewSelected();
		}
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

	function transposeSelected(semitones: number): void {
		if (applyEdit((s, i) => s.transpose(i, semitones))) previewSelected();
	}
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
				previewSelected(false);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				stepSelection(-1);
				previewSelected(false);
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

		// F16: the editor loads (and saves back to) the piece's *working
		// draft* — resolved server-side in `+page.server.ts` by B17's
		// create-or-get. Without an id there is nothing to edit.
		if (!data.workingDraftId) {
			phase = 'error';
			errorKind = 'unreachable';
			return;
		}

		let res: Response;
		try {
			// Streams the working-draft version's music file (not the piece's
			// live version, which `/piece/[id]/file` would give), session
			// attached server-side.
			res = await fetch(`/piece/${data.id}/edit/file?v=${encodeURIComponent(data.workingDraftId)}`);
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
			// F15: if this music came from a paged OMR run with seams, pull the
			// report and map its boundaries onto the model. Fire-and-forget —
			// the editor is usable with or without the overlay.
			void loadSeams();
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

	// F16: export the edited model to a complete MusicXML document and PUT it
	// into the piece's working draft *in place* (`edit/save/+server.ts` ->
	// B17 `PUT /library/versions/{id}/file`) — no new version row per save,
	// and it stays a `draft`. The editor stays open (iterative editing); the
	// draft only becomes the live version via "Publish as live version".
	// `everEdited` latches so the header badge stops saying "Live version"
	// once anything has been saved this session.
	let everEdited = $state(false);
	async function save(): Promise<void> {
		if (!score || saving || !dirty || !data.workingDraftId) return;
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
			fd.set('versionId', data.workingDraftId);
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
			everEdited = true;
			editNotice = m.piece_editor_saved();
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
		rafHandle = requestAnimationFrame(tick);
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
		<a
			class="icon-btn"
			href={backToPieceHref}
			onclick={onLeaveClick}
			aria-label={m.piece_editor_back_to_piece()}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</a>

		<div class="top-bar-title">
			<h1>{data.pieceTitle ?? 'Divisi'}</h1>
			<p>{m.piece_editor_title()}</p>
		</div>

		{#if data.access === 'granted' && phase === 'ready'}
			<div class="top-bar-actions">
				{#if data.hasPdf}
					<button
						class="icon-btn"
						class:icon-btn--active={pdfPaneOpen}
						onclick={() => (pdfPaneOpen = !pdfPaneOpen)}
						aria-label={m.piece_editor_pdf_pane()}
						aria-pressed={pdfPaneOpen}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<rect x="3" y="4" width="8" height="16" rx="1" />
							<rect x="13" y="4" width="8" height="16" rx="1" />
						</svg>
					</button>
				{/if}
				<button
					class="icon-btn"
					class:icon-btn--active={mixPanelOpen}
					onclick={() => (mixPanelOpen = !mixPanelOpen)}
					aria-label={m.piece_editor_mix_panel()}
					aria-pressed={mixPanelOpen}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
						<circle cx="15" cy="6" r="2" />
						<circle cx="9" cy="12" r="2" />
						<circle cx="17" cy="18" r="2" />
					</svg>
				</button>
				<button
					class="btn btn-primary save-btn"
					onclick={save}
					disabled={!dirty || saving || reRendering}
				>
					{saving ? m.piece_editor_saving() : m.piece_editor_save()}
				</button>
			</div>
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
			<!-- The editing surface and the optional reference-PDF pane share
			     this row; the transport bar below stays full width. -->
			<div class="editor-body" class:editor-body--split={pdfPaneOpen && data.hasPdf}>
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
						bind:this={scoreView}
						xml={workingXml}
						scoreTheme={$resolvedTheme}
						{selectedOnset}
						{playbackWholeNotes}
						seams={seamMarkers}
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

			{#if pdfPaneOpen && data.hasPdf}
				<aside class="pdf-pane" aria-label={m.piece_editor_pdf_pane()}>
					<PdfView pdfUrl={pdfHref} bind:zoom={pdfZoom} active={pdfPaneOpen} />
				</aside>
			{/if}
			</div>

			<!-- F14 reopened: the transport, in the same visual language as the
			     practice player's bottom bar. Fed from the working model (see
			     `syncAudioToModel`), not a file. -->
			<footer class="transport-bar">
				{#if seams.length > 0}
					<div class="seam-bar" role="group" aria-label={m.piece_editor_seam_group()}>
						<button class="seam-next" onclick={goToNextSeam}>
							{m.piece_editor_seam_next()}
						</button>
						<span class="seam-readout" role="status" aria-live="polite">
							{#if seamAt >= 0 && seamAt < seams.length}
								{m.piece_editor_seam_counter({
									n: seamAt + 1,
									total: seams.length,
									reason: seams[seamAt].reason
								})}
							{:else}
								{m.piece_editor_seam_hint({ count: seams.length })}
							{/if}
						</span>
					</div>
				{/if}
				{#if audioUnavailable}
					<p class="transport-msg" role="status">{m.piece_editor_transport_unavailable()}</p>
				{:else if audioParseError}
					<p class="transport-msg transport-msg--error" role="alert">
						{m.piece_editor_transport_parse_error()}
					</p>
				{:else}
					{#if audioStale}
						<p class="transport-hint" role="status" aria-live="polite">
							{m.piece_editor_audio_stale()}
						</p>
					{/if}
					<div class="transport-row">
						<button
							class="play-btn"
							onclick={togglePlay}
							aria-label={isPlaying ? m.piece_pause() : m.piece_play()}
						>
							{#if isPlaying}
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
								</svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path d="M8 5v14l11-7z" />
								</svg>
							{/if}
						</button>

						<div class="scrubber">
							<input
								type="range"
								class="seek-slider"
								style:--fill="{seekPct}%"
								min="0"
								max={durationMs || 1}
								value={positionMs}
								disabled={durationMs === 0}
								aria-label={m.piece_seek()}
								oninput={(e) => seekAudio(Number((e.target as HTMLInputElement).value))}
							/>
							<div class="time-row">
								<span>{formatTime(positionMs)}</span>
								<span>{formatTime(durationMs)}</span>
							</div>
						</div>

						<button
							class="icon-btn"
							onclick={() => scoreView?.scrollCursorIntoView()}
							aria-label={m.piece_scroll_to_cursor()}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="12" cy="12" r="3" />
								<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
							</svg>
						</button>

						<div class="tempo-mini" role="group" aria-label={m.piece_tempo()}>
							<button
								class="tempo-step"
								onclick={() => stepTempo(-1)}
								disabled={tempoBpm <= MIN_TEMPO_BPM}
								aria-label={m.piece_decrease_tempo()}
							>
								−
							</button>
							<span class="tempo-readout">{describeTempo(tempoBpm)}</span>
							<button
								class="tempo-step"
								onclick={() => stepTempo(1)}
								disabled={tempoBpm >= MAX_TEMPO_BPM}
								aria-label={m.piece_increase_tempo()}
							>
								+
							</button>
						</div>
					</div>
				{/if}
			</footer>

			{#if mixPanelOpen}
				<button
					class="mix-backdrop"
					onclick={() => (mixPanelOpen = false)}
					aria-label={m.piece_editor_close_mix()}
				></button>
				<aside class="mix-panel" aria-label={m.piece_editor_mix_panel()}>
					<header class="mix-header">
						<h2>{m.piece_editor_mix_panel()}</h2>
						<button
							class="icon-btn"
							onclick={() => (mixPanelOpen = false)}
							aria-label={m.piece_editor_close_mix()}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</header>
					{#if mixParts.length === 0}
						<p class="mix-empty">{m.piece_editor_mix_after_play()}</p>
					{:else}
						<div class="mix-rows">
							{#each mixParts as part (part.id)}
								<div class="mix-row">
									<span class="mix-label">{part.label}</span>
									<input
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={mixVolumes[part.id] ?? 0.5}
										aria-label={m.piece_editor_part_volume({ part: part.label })}
										oninput={(e) =>
											setMixVolume(part.id, Number((e.target as HTMLInputElement).value))}
									/>
									<span class="mix-value">{Math.round((mixVolumes[part.id] ?? 0.5) * 100)}</span>
								</div>
							{/each}
						</div>
						{#if !mixIsEven}
							<button class="text-link" onclick={resetMix}>{m.piece_editor_reset_mix()}</button>
						{/if}
					{/if}
				</aside>
			{/if}
		{:else if errorKind === 'noFile'}
			<div class="editor-fill editor-fill--center">
				<div class="status-card">
					<p>{m.piece_editor_no_music_file()}</p>
					<a class="text-link" href={backToPieceHref} onclick={onLeaveClick}>
						{m.piece_editor_back_to_piece()}
					</a>
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
					<a class="text-link" href={backToPieceHref} onclick={onLeaveClick}>
						{m.piece_editor_back_to_piece()}
					</a>
				</div>
			</div>
		{:else}
			<div class="editor-fill editor-fill--center">
				<div class="status-card status-card--error">
					<p>{m.piece_editor_score_load_failed()}</p>
					{#if errorDetail}<p class="status-detail">{errorDetail}</p>{/if}
					<div class="status-actions">
						<button class="text-link" onclick={() => loadScore()}>{m.piece_retry()}</button>
						<a class="text-link" href={backToPieceHref} onclick={onLeaveClick}>
							{m.piece_editor_back_to_piece()}
						</a>
					</div>
				</div>
			</div>
		{/if}
	{:else if data.access === 'notFound'}
		<div class="editor-fill editor-fill--center">
			<div class="status-card status-card--error">
				<p>{m.piece_not_found()}</p>
				<a class="text-link" href={backToPieceHref} onclick={onLeaveClick}>
					{m.piece_editor_back_to_piece()}
				</a>
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
				<a class="text-link" href={backToPieceHref} onclick={onLeaveClick}>
					{m.piece_editor_back_to_piece()}
				</a>
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
		/* A pinch anywhere in the editor must never trigger the browser's
		   whole-page zoom (which scales the fixed bars too). The score and
		   PDF containers already block it locally; setting it on the shell
		   covers the toolbars, top bar, transport bar and every gap between.
		   Child scroll areas still pan/scroll normally, and the PDF pane's
		   own pinch-to-zoom (JS-driven) is unaffected. */
		touch-action: pan-x pan-y;
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
	/* Holds the editing surface and, when toggled on, the reference-PDF pane
	   side by side. The transport bar is a sibling of this, so it stays full
	   width under both. */
	.editor-body {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
	}

	.editor-surface {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.editor-surface:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* The reference PDF, docked to the right of the editing surface. `PdfView`
	   fills its host (`height: 100%`), so this just needs a definite box. */
	.pdf-pane {
		flex: 0 0 clamp(280px, 42%, 620px);
		min-width: 0;
		min-height: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
	}

	/* Narrow viewports can't fit two columns — stack the PDF under the
	   surface instead, each taking half the height. */
	@media (max-width: 860px) {
		.editor-body--split {
			flex-direction: column;
		}
		.editor-body--split .pdf-pane {
			flex: 1 1 45%;
			border-left: none;
			border-top: 1px solid var(--border);
		}
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

	/* Right side of the top bar: Mix toggle + Save, in the slot the player
	   gives Practice Setup. */
	.top-bar-actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.icon-btn--active {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.icon-btn--active:hover {
		background: var(--accent-hover);
	}

	/* The transport — lifted from the practice player's `.bottom-bar`. */
	.transport-bar {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.6rem 1rem calc(0.6rem + env(safe-area-inset-bottom, 0px));
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.transport-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.transport-msg {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.transport-msg--error {
		color: var(--danger);
	}
	.transport-hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* F15: the seam-review strip above the transport row. */
	.seam-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.seam-next {
		flex-shrink: 0;
		border: 1px solid var(--danger);
		background: color-mix(in srgb, var(--danger) 12%, var(--surface));
		color: var(--danger);
		border-radius: var(--radius-full);
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	.seam-next:hover {
		background: color-mix(in srgb, var(--danger) 20%, var(--surface));
	}
	.seam-readout {
		font-size: 0.75rem;
		color: var(--text-muted);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.play-btn {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	.play-btn:hover {
		background: var(--accent-hover);
	}
	.play-btn svg {
		width: 20px;
		height: 20px;
	}

	.scrubber {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.seek-slider {
		background: linear-gradient(
			to right,
			var(--accent) 0%,
			var(--accent) var(--fill),
			var(--surface-2) var(--fill),
			var(--surface-2) 100%
		);
	}
	.seek-slider:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.time-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}

	.tempo-mini {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.tempo-step {
		min-width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}
	.tempo-step:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.tempo-readout {
		min-width: 6.5rem;
		text-align: center;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	/* Mix panel: a right-hand drawer, the editor's analogue of Practice
	   Setup. Same backdrop/slide-in shape as the player's menu drawer. */
	.mix-backdrop {
		position: fixed;
		inset: 0;
		border: none;
		background: rgba(10, 10, 20, 0.35);
		z-index: 2;
		cursor: default;
	}
	.mix-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(340px, 100vw);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		padding: calc(1rem + env(safe-area-inset-top, 0px)) 1.25rem
			calc(1.5rem + env(safe-area-inset-bottom, 0px));
		border-left: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow);
		z-index: 3;
	}
	.mix-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.mix-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
		color: var(--text);
	}
	.mix-empty {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.mix-rows {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.mix-row {
		display: grid;
		grid-template-columns: 5.5rem 1fr 2rem;
		align-items: center;
		gap: 0.6rem;
	}
	.mix-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mix-value {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		text-align: right;
	}
</style>
