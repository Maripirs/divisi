<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { type DisplayMode, type VisualState } from '$lib/midi/types';
	import { THEME_PALETTES, highlightedMutedInk, type ResolvedTheme } from '$lib/theme';
	import { pinchZoom } from '$lib/actions/pinchZoom';
	import ScoreZoomControls from '$lib/components/score/ScoreZoomControls.svelte';
	import ScoreRenderBadge from '$lib/components/score/ScoreRenderBadge.svelte';
	import {
		buildOnsetGroups,
		groupIndexAt,
		layoutToContainer,
		midiPitchForEngineNote,
		nearestByX,
		printedMeasureNumber,
		staffInkMap,
		stepAcrossStaves,
		stepInVoice,
		systemStaffExtent,
		type LayoutToContainer,
		type OnsetGroup
	} from '$lib/components/score/engineAdapter';
	import { m } from '$lib/paraglide/messages';
	// Type-only imports: erased at compile time. The engine itself is loaded
	// with a dynamic `import()` inside `onMount` (browser-only), the same way
	// ScoreView loads OSMD, so the OSMD path's bundle never carries it and
	// SSR never touches its canvas/DOM code.
	import type { Measure, Note, NoteId, OnsetIndex, Score, ScoreView as EngineView } from 'notation-engine';

	type EngineModule = typeof import('notation-engine');

	interface Marker {
		id: string;
		positionWholeNotes: number;
	}

	/**
	 * notation-engine's stand-in for `ScoreView.svelte`, behind
	 * `?renderer=engine` (see `score/scoreRenderer.ts`): the same props and
	 * the same exported `scrollCursorIntoView`, so a page or
	 * `AdaptiveScoreView` can swap one for the other.
	 *
	 * The engine draws to a canvas and knows nothing about Divisi's clock,
	 * so the host-side pieces live here and in `score/engineAdapter.ts`:
	 * - Cursor: `positionWholeNotes` -> the onset group at or before it (via
	 *   the engine's `createOnsetIndex`), accented with the renderer's
	 *   playback-cursor colour, plus a DOM bar and follow-scroll like
	 *   ScoreView's, since the engine draws no bar of its own.
	 * - Clicks: the note under the tap (the engine's `hitTest`), else the
	 *   nearest note in the tapped measure, reported as a whole-note
	 *   timestamp, MIDI pitch and printed measure number (`Measure.number`).
	 *   The tapped note itself takes the engine's selection colour
	 *   (`renderer.setSelection`) until the cursor plays past it.
	 * - Muted staves: `renderer.setStaffColors`, in the same
	 *   `highlightedMutedInk` ScoreView paints them with.
	 * - Annotation markers: DOM buttons over the score, moved on every
	 *   `layout` event.
	 * - Step mode: `practiceNoteIds` replaces the position-driven cursor
	 *   with the host's practice step (painted the same way, scrolled to
	 *   with the engine's `scrollToNote`), and `onScore` hands the host the
	 *   imported `Score` to build its steps from.
	 * The engine never plays audio here (`playback: false`): Divisi's own
	 * `MidiPlayer` owns sound and drives `positionWholeNotes`.
	 */
	let {
		xml,
		positionWholeNotes,
		displayMode,
		staffVisualStates,
		scoreTheme,
		onNoteClick,
		annotations = [],
		annotateMode = false,
		onAnnotationPlace,
		onAnnotationMarkerClick,
		onMeasureClick,
		cursorActive = true,
		zoom = $bindable(1),
		autoFitZoom = $bindable(false),
		rendering = $bindable(false),
		showBadge = true,
		showZoomControls = true,
		practiceNoteIds = null,
		onScore
	}: {
		xml: string;
		positionWholeNotes: number;
		displayMode?: DisplayMode;
		staffVisualStates?: VisualState[];
		scoreTheme?: ResolvedTheme;
		onNoteClick?: (wholeNotes: number, midiPitch: number | null) => void;
		annotations?: Marker[];
		annotateMode?: boolean;
		onAnnotationPlace?: (wholeNotes: number) => void;
		onAnnotationMarkerClick?: (id: string) => void;
		onMeasureClick?: (measureNumber: number) => void;
		/** False for a section outside the current playback position. */
		cursorActive?: boolean;
		zoom?: number;
		// Accepted for ScoreView parity and cleared after the first load, but
		// a no-op: the engine casts systems off to the container's width, so
		// a measure always fits across without zooming out.
		autoFitZoom?: boolean;
		// True while the engine imports and lays out a new score.
		rendering?: boolean;
		showBadge?: boolean;
		showZoomControls?: boolean;
		/** Step mode's current step (note ids of the shown score): the cursor
		 * sits on these instead of following `positionWholeNotes`, and a tap
		 * only reports the note (no selection). `null` outside Step mode. */
		practiceNoteIds?: readonly NoteId[] | null;
		/** Called with every score the view shows (and its onset index), so
		 * Step mode can walk the same note ids the view paints. */
		onScore?: (score: Score, onsets: OnsetIndex) => void;
	} = $props();

	// Staff space at zoom 1, matching OSMD's 10 px per unit at `Zoom` 1.
	const STAFF_SPACE_AT_ZOOM_1 = 10;
	// How long the zoom has to sit still before the real relayout runs.
	// `setZoom` relays the whole score out (a few hundred ms on a long one),
	// so a pinch or a run of +/- taps previews with a CSS scale instead.
	const ZOOM_SETTLE_MS = 250;
	// Fixed, distinct from the playback accent: same values as ScoreView's
	// `markerColor`.
	const MARKER_COLOR = { light: '#b45309', dark: '#fbbf24' } as const;

	let container: HTMLDivElement;
	let cursorBar = $state<HTMLDivElement | undefined>();
	// $state.raw: these are big engine objects the effects need to notice
	// being replaced, never deeply proxied.
	let engine = $state.raw<EngineModule | undefined>();
	let view = $state.raw<EngineView | undefined>();
	let groups = $state.raw<OnsetGroup[]>([]);
	let loadError = $state<string | null>(null);
	// Bumped on every engine `layout` event (load, zoom, resize), so the
	// overlay positions re-derive.
	let layoutVersion = $state(0);
	// Theme the current view was mounted with: the renderer has no colour
	// setter, so a theme change remounts (fast: no re-import).
	let mountedTheme: ResolvedTheme | undefined;
	let loadedXml: string | undefined;
	// Bumped per load so a slower, superseded load drops its result.
	let loadToken = 0;
	let destroyed = false;
	let remounting = false;
	let unsubscribeLayout: (() => void) | undefined;
	// The ancestor that scrolls vertically (`.score-area` on the player,
	// `.pane-score-scroll` on review), handed to the engine as its
	// `scrollElement`. `null` when there is none: the container then scrolls
	// itself, capped in height (see `.self-scroll`). `undefined` until
	// `onMount` has looked.
	let outerScroller = $state<HTMLElement | null | undefined>(undefined);

	// Per note: its engine model, the measure it sits in and its written
	// onset in whole notes (rests included, grace notes not).
	let noteInfo = new Map<NoteId, { note: Note; measure: Measure; onset: number | undefined }>();
	// Which onset group the cursor sits on, so a frame that does not cross
	// an onset costs nothing.
	let cursorGroup = -2;
	let cursorIds: readonly NoteId[] = [];
	// The tapped note, painted in the engine's selection colour. A tap also
	// seeks there, so it is left out of the cursor's ids (the renderer's
	// cursor colour would otherwise win over the selection). Cleared once
	// the cursor has reached its onset and moved on. "Reached" matters: the
	// host's position arrives a frame or more after the tap (it polls its
	// player per animation frame), so until then the cursor still sits on
	// the old onset.
	let selectedId = $state<NoteId | null>(null);
	let selectionReached = false;
	let cursorSelectedId: NoteId | null = null;

	// Same follow policy as ScoreView: recentre on every new system with an
	// instant jump, until the human scrolls or drags themselves.
	let following = $state(true);
	let lastCursorSystemTop: number | undefined;

	// Zoom actually laid out, and the pending commit while previewing.
	let appliedZoom = $state(1);
	let zoomTimer: ReturnType<typeof setTimeout> | undefined;
	let previewScale = $derived(view && zoom !== appliedZoom ? zoom / appliedZoom : 1);

	onMount(async () => {
		outerScroller = scrollAncestor(container.parentElement);
		container.addEventListener('click', handleContainerClick);
		container.addEventListener('wheel', cancelFollow, { passive: true });
		const module = await import('notation-engine');
		if (destroyed) return;
		engine = module;
	});

	onDestroy(() => {
		destroyed = true;
		container?.removeEventListener('click', handleContainerClick);
		container?.removeEventListener('wheel', cancelFollow);
		if (zoomTimer !== undefined) clearTimeout(zoomTimer);
		unsubscribeLayout?.();
		view?.destroy();
		view = undefined;
	});

	function cancelFollow(): void {
		following = false;
	}

	/** The nearest ancestor set up to scroll vertically, scrolling yet or
	 * not (at mount the score is not in it yet, so ScoreView's
	 * `nearestScrollable` test of "overflows now" would miss it). */
	function scrollAncestor(start: HTMLElement | null): HTMLElement | null {
		let node = start;
		while (node && node !== document.body && node !== document.documentElement) {
			const overflow = getComputedStyle(node).overflowY;
			if (overflow === 'auto' || overflow === 'scroll') return node;
			node = node.parentElement;
		}
		return null;
	}

	// Same as ScoreView's: lets the "updating score" badge paint before the
	// import and layout seize the main thread.
	function waitForPaint(): Promise<void> {
		return new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	}

	/** Resolves once the container has a width: the player pane can be
	 * `display: none` behind the PDF tab, and casting systems off to a zero
	 * width would lay the score out one measure per line. */
	function waitForWidth(): Promise<void> {
		if (container.clientWidth > 0) return Promise.resolve();
		return new Promise((resolve) => {
			const observer = new ResizeObserver(() => {
				if (container.clientWidth > 0 || destroyed) {
					observer.disconnect();
					resolve();
				}
			});
			observer.observe(container);
		});
	}

	function palette(theme: ResolvedTheme | undefined) {
		const resolved = theme ?? 'light';
		const colors = THEME_PALETTES[resolved];
		return { ink: colors.ink, page: colors.surface, accent: colors.accent, muted: highlightedMutedInk(resolved) };
	}

	$effect(() => {
		const currentXml = xml;
		if (!engine || currentXml === loadedXml) return;
		loadedXml = currentXml;
		void load(engine, currentXml);
	});

	async function load(module: EngineModule, source: string): Promise<void> {
		const token = ++loadToken;
		loadError = null;
		try {
			// Not `rendering` while hidden behind the PDF view: the piece
			// page dims and disables its menu while a score renders, which
			// would lock the very View switch that reveals this pane.
			await waitForWidth();
			if (token !== loadToken || destroyed) return;
			rendering = true;
			await waitForPaint();
			if (token !== loadToken || destroyed) return;
			const score = module.importMusicXml(source);
			await mount(module, score);
			if (token !== loadToken || destroyed) return;
			// See the prop's comment: nothing to fit, just consume the flag so
			// it behaves like ScoreView's one-shot.
			if (autoFitZoom) autoFitZoom = false;
		} catch (e) {
			if (token === loadToken) loadError = String(e);
		} finally {
			if (token === loadToken) rendering = false;
		}
	}

	/** Shows `score`: a first mount, a remount for a new theme, or a plain
	 * `load` into the existing view. */
	async function mount(module: EngineModule, score: Score): Promise<void> {
		const theme = scoreTheme ?? 'light';
		if (view && mountedTheme === theme) {
			view.load(score);
		} else {
			unsubscribeLayout?.();
			view?.destroy();
			view = undefined;
			const colors = palette(theme);
			const level = zoom;
			const mounted = await module.mountScore(container, score, {
				playback: false,
				followScroll: false,
				staffSpacePx: STAFF_SPACE_AT_ZOOM_1 * level,
				scrollElement: outerScroller ?? undefined,
				renderer: { foreground: colors.ink, background: colors.page, playbackCursor: colors.accent }
			});
			if (destroyed) {
				mounted.destroy();
				return;
			}
			mountedTheme = theme;
			appliedZoom = level;
			unsubscribeLayout = mounted.on('layout', () => layoutVersion++);
			view = mounted;
		}
		indexScore(module, view.score);
		lastCursorSystemTop = undefined;
		layoutVersion++;
	}

	function indexScore(module: EngineModule, score: Score): void {
		const onsetIndex = module.createOnsetIndex(score);
		groups = buildOnsetGroups(score, onsetIndex);
		const onsets = new Map<NoteId, number>();
		for (const group of groups) for (const id of group.noteIds) onsets.set(id, group.wholes);
		noteInfo = new Map();
		for (const staff of score.staves) {
			for (const measure of staff.measures) {
				for (const note of measure.notes) noteInfo.set(note.id, { note, measure, onset: onsets.get(note.id) });
			}
		}
		// A fresh score (or renderer) has no cursor painted yet, and a
		// selection from the previous score does not carry over.
		cursorGroup = -2;
		cursorIds = [];
		if (view) paintSelection(view, null);
		selectedId = null;
		cursorSelectedId = null;
		practiceShown = null;
		onScore?.(score, onsetIndex);
	}

	// Theme change: remount with the new colours (the renderer takes them
	// only at construction). TODO(engine): a renderer colour setter would
	// make this a repaint instead of a remount.
	$effect(() => {
		const theme = scoreTheme ?? 'light';
		const module = engine;
		const current = view;
		if (!module || !current || mountedTheme === undefined || mountedTheme === theme || remounting) return;
		remounting = true;
		rendering = true;
		void mount(module, current.score).finally(() => {
			remounting = false;
			rendering = false;
		});
	});

	// Muted staves in `highlightedMutedInk`, the rest in the theme's ink:
	// what ScoreView's `applyHighlightedStaffTreatment` paints. The renderer
	// keeps the colours across relayouts, so only a new view, new states or
	// a new theme repaint.
	$effect(() => {
		const current = view;
		const states = staffVisualStates ?? [];
		const colors = palette(scoreTheme);
		if (!current) return;
		const map = staffInkMap(current.score.staves.length, states, colors.ink, colors.muted);
		if (current.renderer.setStaffColors(map).length > 0) current.renderer.drawAll();
	});

	// Layout -> container coordinates, re-derived per layout (see
	// `layoutToContainer`). `null` before the first layout.
	let toContainer = $derived.by((): LayoutToContainer | null => {
		layoutVersion;
		const current = view;
		const first = current?.layout.measures[0];
		if (!current || !first) return null;
		const box = current.measureBox({ staffIndex: first.staffIndex, measureIndex: first.index });
		return box ? layoutToContainer(first.region, box) : null;
	});

	/** The container-space strip a cursor or marker at `noteIds` sits on:
	 * left of the earliest head, spanning the system's staves. */
	function onsetStrip(noteIds: readonly NoteId[]): { x: number; top: number; bottom: number } | null {
		const current = view;
		const transform = toContainer;
		if (!current || !transform || noteIds.length === 0) return null;
		let x = Infinity;
		for (const id of noteIds) {
			const box = current.noteBox(id);
			if (box) x = Math.min(x, box.x);
		}
		const measure = noteInfo.get(noteIds[0])?.measure;
		if (!Number.isFinite(x) || !measure) return null;
		const extent = systemStaffExtent(current.layout, measure.index);
		if (!extent) return null;
		return {
			x,
			top: transform.originY + extent.top * transform.scale,
			bottom: transform.originY + extent.bottom * transform.scale
		};
	}

	// --- Cursor ------------------------------------------------------------

	let cursorBox = $state<{ x: number; top: number; height: number } | null>(null);
	// The practice step the cursor was last painted and scrolled to.
	let practiceShown: readonly NoteId[] | null = null;

	$effect(() => {
		layoutVersion;
		const position = positionWholeNotes;
		const active = cursorActive;
		const current = view;
		const onsets = groups;
		const practice = practiceNoteIds;
		let selected = selectedId;
		if (!current) return;
		if (practice) {
			showPracticeStep(current, practice, selected);
			return;
		}
		if (practiceShown) {
			// Back from Step mode: repaint the position cursor from scratch.
			practiceShown = null;
			cursorGroup = -2;
		}
		if (!active) {
			setCursorIds(current, []);
			if (selected) {
				paintSelection(current, null);
				selectedId = null;
			}
			cursorGroup = -2;
			cursorBox = null;
			return;
		}
		const index = groupIndexAt(onsets, position);
		const groupIds = index >= 0 ? onsets[index].noteIds : [];
		if (selected && groupIds.includes(selected)) selectionReached = true;
		else if (selected && selectionReached) {
			paintSelection(current, null);
			selectedId = selected = null;
		}
		if (index !== cursorGroup || selected !== cursorSelectedId) {
			cursorGroup = index;
			cursorSelectedId = selected;
			setCursorIds(current, selected ? groupIds.filter((id) => id !== selected) : groupIds);
		}
		// The whole onset, selected note included: it places the bar even when
		// the selection is the onset's only note.
		const strip = onsetStrip(groupIds);
		// A few px left of the head, like OSMD's thin-left cursor. Built in a
		// local: reading `cursorBox` back here would make this effect depend
		// on what it just wrote.
		const box = strip ? { x: strip.x - 5, top: strip.top, height: strip.bottom - strip.top } : null;
		cursorBox = box;
		if (box) requestAnimationFrame(followCursorIfNeeded);
	});

	/** Step mode's cursor: the step's notes in the playback-cursor colour and
	 * the bar at their onset, scrolled into view (only when the step
	 * changes, so a relayout never fights the human's own scrolling). A
	 * Listen-mode selection does not carry over. */
	function showPracticeStep(current: EngineView, ids: readonly NoteId[], selected: NoteId | null): void {
		if (selected) {
			paintSelection(current, null);
			selectedId = null;
		}
		const moved = ids !== practiceShown;
		if (moved) {
			practiceShown = ids;
			cursorGroup = -2;
			cursorSelectedId = null;
			setCursorIds(current, ids);
			if (ids.length > 0) current.scrollToNote(ids[0]);
		}
		const strip = onsetStrip(ids);
		cursorBox = strip ? { x: strip.x - 5, top: strip.top, height: strip.bottom - strip.top } : null;
		if (moved) lastCursorSystemTop = cursorBox?.top;
	}

	/** Accents the notes the cursor sits on (heads, stems, flags, ties: the
	 * renderer's playback-cursor colour wins over staff ink), repainting only
	 * the measures that changed. */
	function setCursorIds(current: EngineView, ids: readonly NoteId[]): void {
		if (ids.length === 0 && cursorIds.length === 0) return;
		cursorIds = ids;
		const changed = current.renderer.setPlaybackCursor(ids);
		for (const { staffIndex, index } of changed) current.renderer.redrawMeasure(index, staffIndex);
	}

	/** The engine's own note selection, repainting only the measures whose
	 * look changed. */
	function paintSelection(current: EngineView, id: NoteId | null): void {
		const changed = current.renderer.setSelection(id);
		for (const { staffIndex, index } of changed) current.renderer.redrawMeasure(index, staffIndex);
	}

	/** ScoreView's `nearestScrollable`, unchanged: the ancestor that actually
	 * scrolls on `axis` right now. */
	function nearestScrollable(start: HTMLElement, axis: 'x' | 'y'): HTMLElement | null {
		let node: HTMLElement | null = start;
		while (node) {
			const style = getComputedStyle(node);
			const overflow = axis === 'x' ? style.overflowX : style.overflowY;
			const scrollable =
				axis === 'x' ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
			if ((overflow === 'auto' || overflow === 'scroll') && scrollable) return node;
			node = node.parentElement;
		}
		return null;
	}

	/** Centres whichever element scrolls (the container itself or an
	 * ancestor such as `.score-area`, which is what lets a stacked divisi
	 * section follow into view) on the cursor bar, as an instant jump. */
	function jumpToCursor(): void {
		if (!cursorBar || !container) return;
		const barRect = cursorBar.getBoundingClientRect();
		const vertical = nearestScrollable(container, 'y');
		if (vertical) {
			const scrollerRect = vertical.getBoundingClientRect();
			vertical.scrollTop += barRect.top + barRect.height / 2 - (scrollerRect.top + scrollerRect.height / 2);
		}
		const horizontal = nearestScrollable(container, 'x');
		if (horizontal) {
			const scrollerRect = horizontal.getBoundingClientRect();
			horizontal.scrollLeft += barRect.left - (scrollerRect.left + scrollerRect.width / 2);
		}
	}

	/** After every cursor step while following: recentre when the cursor
	 * reaches a new system, as ScoreView does. */
	function followCursorIfNeeded(): void {
		if (!following || !cursorBox) return;
		if (cursorBox.top !== lastCursorSystemTop) {
			lastCursorSystemTop = cursorBox.top;
			jumpToCursor();
		}
	}

	/** Brings the playback cursor back into view and resumes following it
	 * (the "scroll to cursor" control). Same contract as ScoreView's. */
	export function scrollCursorIntoView(): void {
		following = true;
		jumpToCursor();
		lastCursorSystemTop = cursorBox?.top;
	}

	// --- Zoom --------------------------------------------------------------

	// Any zoom change (buttons, pinch, a restored setting) previews as a CSS
	// scale at once and relays out once it settles.
	$effect(() => {
		const level = zoom;
		if (!view) return;
		if (zoomTimer !== undefined) clearTimeout(zoomTimer);
		if (level === appliedZoom) return;
		zoomTimer = setTimeout(() => {
			zoomTimer = undefined;
			if (!view || destroyed) return;
			appliedZoom = level;
			view.setZoom(STAFF_SPACE_AT_ZOOM_1 * level);
		}, ZOOM_SETTLE_MS);
	});

	// --- Annotation markers ------------------------------------------------

	let markerBoxes = $derived.by(() => {
		layoutVersion;
		toContainer;
		const onsets = groups;
		if (!view) return [] as { id: string; x: number; y: number; height: number }[];
		const out: { id: string; x: number; y: number; height: number }[] = [];
		// About a staff space and a half tall, at the current zoom.
		const height = Math.max(12, (toContainer?.scale ?? 1) * view.layout.staffSpacePx * 1.6);
		for (const marker of annotations) {
			const index = groupIndexAt(onsets, marker.positionWholeNotes);
			if (index < 0) continue;
			const strip = onsetStrip(onsets[index].noteIds);
			if (!strip) continue;
			// A short mark standing on the top staff, left of the note: OSMD's
			// `CURSOR_TYPE_MARKER` look.
			out.push({ id: marker.id, x: strip.x - 3, y: strip.top - height * 0.4, height });
		}
		return out;
	});

	// --- Clicks ------------------------------------------------------------

	/** A tap on the score: the note under it, else the nearest note in the
	 * tapped measure (OSMD's `GetNearestNote` tolerates a near miss; the
	 * engine's `hitTest` does not). Reports exactly what ScoreView's
	 * `handleContainerClick` does. A `click` rather than the engine's own
	 * `noteclick`, which fires on `pointerdown`: on touch that would seek on
	 * the start of every scroll drag. */
	function handleContainerClick(event: MouseEvent): void {
		const current = view;
		const module = engine;
		const transform = toContainer;
		if (!current || !module || !transform || rendering || previewScale !== 1) return;
		// A marker's own `onclick` opens it. Svelte delegates that handler to
		// the document root, so its `stopPropagation` runs after this native
		// listener has already fired: skip marker clicks here explicitly.
		if (event.target instanceof Element && event.target.closest('.marker')) return;
		// Container padding-box coordinates, the space `noteBox` reports in.
		const rect = container.getBoundingClientRect();
		const x = event.clientX - rect.left - container.clientLeft + container.scrollLeft;
		const y = event.clientY - rect.top - container.clientTop + container.scrollTop;
		const layoutX = (x - transform.originX) / transform.scale;
		const layoutY = (y - transform.originY) / transform.scale;
		let noteId: NoteId | null = module.hitTest(current.layout, layoutX, layoutY)?.noteId ?? null;
		if (!noteId) {
			const hit = module.hitTestMeasure(current.layout, layoutX, layoutY);
			const measure =
				hit &&
				current.layout.measures.find((lm) => lm.index === hit.measureIndex && lm.staffIndex === hit.staffIndex);
			const near = measure ? nearestByX(measure.notes.map((n) => ({ id: n.id, box: n.bounds })), layoutX) : null;
			noteId = near?.id ?? null;
		}
		if (!noteId) return;
		const info = noteInfo.get(noteId);
		const timestamp = info?.onset;
		if (!info || timestamp === undefined) return;
		if (annotateMode) onAnnotationPlace?.(timestamp);
		// Step mode moves its own cursor there; no selection to paint.
		else if (practiceNoteIds) onNoteClick?.(timestamp, midiPitchForEngineNote(info.note));
		else selectNote(current, noteId);
		onMeasureClick?.(printedMeasureNumber(info.measure));
	}

	/** Selects `noteId` and reports it like a tap (the host seeks there and,
	 * stopped, sounds its pitch). `false` for a note with no onset. */
	function selectNote(current: EngineView, noteId: NoteId): boolean {
		const info = noteInfo.get(noteId);
		if (!info || info.onset === undefined) return false;
		paintSelection(current, noteId);
		selectedId = noteId;
		selectionReached = false;
		onNoteClick?.(info.onset, midiPitchForEngineNote(info.note));
		return true;
	}

	// --- Keyboard ----------------------------------------------------------

	// notation-engine's read mode: the selection is a cursor the arrow keys
	// move. The host owns the keys and asks here first; `false` means there
	// is no selection to move, so its own arrow behaviour applies.

	/** Left/Right: the next or previous event in the selected note's voice.
	 * At either end it stays put (still `true`: the key was ours). */
	export function stepSelection(direction: 1 | -1): boolean {
		return stepTo((current, from) => stepInVoice(current.score, from, direction));
	}

	/** Up/Down: the same onset on the staff above or below. */
	export function stepStaff(direction: 1 | -1): boolean {
		return stepTo((current, from) =>
			stepAcrossStaves(current.score, (id) => noteInfo.get(id)?.onset, from, direction)
		);
	}

	function stepTo(next: (current: EngineView, from: NoteId) => NoteId | null): boolean {
		const current = view;
		const from = selectedId;
		if (!current || !from || annotateMode || practiceNoteIds) return false;
		const target = next(current, from);
		if (target && selectNote(current, target)) current.scrollToNote(target);
		return true;
	}

</script>

<div
	class="score-view score-tokens"
	data-renderer="engine"
	data-mode={displayMode ?? 'solo'}
	data-theme={scoreTheme ?? 'light'}
	data-annotate={annotateMode}
>
	{#if showZoomControls}
		<ScoreZoomControls bind:zoom />
	{/if}
	<div
		class="score-container"
		class:self-scroll={outerScroller === null}
		class:annotate-mode={annotateMode}
		class:previewing={previewScale !== 1}
		style:transform={previewScale !== 1 ? `scale(${previewScale})` : undefined}
		bind:this={container}
		use:pinchZoom={{ zoom, onZoom: (z) => (zoom = z), onPan: cancelFollow }}
	>
		<!-- Overlays sit in the container's padding box, the space the
		     engine's `noteBox`/`measureBox` report in; the engine appends its
		     canvas after this. -->
		<div class="overlay">
			{#if cursorBox && cursorActive}
				<div
					class="cursor-bar"
					bind:this={cursorBar}
					style:left="{cursorBox.x}px"
					style:top="{cursorBox.top}px"
					style:height="{cursorBox.height}px"
					style:background={palette(scoreTheme).accent}
				></div>
			{/if}
			{#each markerBoxes as marker (marker.id)}
				<button
					type="button"
					class="marker"
					style:left="{marker.x}px"
					style:top="{marker.y}px"
					style:height="{marker.height}px"
					style:background={MARKER_COLOR[scoreTheme === 'dark' ? 'dark' : 'light']}
					title={m.piece_annotation_marker_title()}
					aria-label={m.piece_annotation_marker_title()}
					onclick={(event) => {
						// A click on an existing marker opens it, never seeks or
						// places a new one (same as ScoreView's marker handler).
						event.stopPropagation();
						onAnnotationMarkerClick?.(marker.id);
					}}
				></button>
			{/each}
		</div>
	</div>
	{#if rendering && showBadge}
		<ScoreRenderBadge />
	{/if}
	{#if loadError}
		<p class="error">{loadError}</p>
	{/if}
</div>

<style>
	.score-view {
		position: relative;
	}

	/* Must not scroll itself when an ancestor is the engine's
	   `scrollElement` (its sticky canvas would stick to this instead), so no
	   `overflow` here: the engine casts systems off to this width, so there
	   is nothing to scroll sideways. */
	.score-container {
		position: relative;
		width: 100%;
		cursor: pointer;
		background: var(--score-page);
		transform-origin: top center;
		/* Same as ScoreView: native panning, our own pinch. */
		touch-action: pan-x pan-y;
	}
	/* No scrolling ancestor: the engine scrolls the container itself, which
	   needs a height cap or it grows (and its canvas with it) to the whole
	   score. */
	.score-container.self-scroll {
		max-height: 80vh;
	}
	.score-container.annotate-mode {
		cursor: crosshair;
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}
	.score-container.previewing {
		will-change: transform;
	}

	.overlay {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		/* Above the engine's sticky canvas. */
		z-index: 2;
		pointer-events: none;
	}

	/* ScoreView restyles OSMD's cursor to this: a 3px accent pill. */
	.cursor-bar {
		position: absolute;
		width: 3px;
		border-radius: 999px;
		opacity: 0.9;
	}

	.marker {
		position: absolute;
		width: 4px;
		padding: 0;
		border: 0;
		border-radius: 1px;
		pointer-events: auto;
		cursor: pointer;
	}

	.error {
		color: var(--danger);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
	}
</style>
