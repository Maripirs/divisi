<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { THEME_PALETTES, type ResolvedTheme } from '$lib/theme';
	import { clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '$lib/actions/pinchZoom';
	import { m } from '$lib/paraglide/messages';
	// Type-only import: erased at compile time so it can't trigger a runtime
	// module resolution during SSR. OSMD ships as a CJS/UMD bundle Vite's SSR
	// runner can't interop with a static import, so it's only ever
	// *constructed* inside `onMount` via a dynamic `import()`. Same reasoning
	// (and same workaround) as `ScoreView.svelte`.
	import type {
		OpenSheetMusicDisplay as OSMDType,
		PointF2D as PointF2DType
	} from 'opensheetmusicdisplay';

	/**
	 * F14: a read-only OSMD render of the notation editor's working score,
	 * plus the click hit-testing and selection marker the editing surface
	 * (task 3) sits on top of. Deliberately *not* `ScoreView.svelte` — that
	 * component is built around a moving playback cursor (a required
	 * `positionWholeNotes`, an always-shown cursor, annotation cursors,
	 * follow-scroll) that a correction editor has no use for, and it exposes
	 * a note click only as a bare timestamp. The editor needs part-aware
	 * hit-testing (`GraphicSheet.GetNearestNote` -> `sourceNote.ParentStaffEntry`...)
	 * and a selection highlight, which belong on an editor-owned mount rather
	 * than bent into the shared player view.
	 *
	 * This component stays a pure view: it engraves `xml` (re-engraving
	 * whenever it changes, since every edit re-serializes the model), reports
	 * a clicked notehead back through `onPickNote`, and parks OSMD's cursor
	 * on `selectedOnset` as the selection marker. The editor page owns the
	 * `EditableScore`, resolves the click, and decides what is selected.
	 */
	let {
		xml,
		scoreTheme = 'light',
		rendering = $bindable(false),
		selectedOnset = undefined,
		playbackWholeNotes = undefined,
		seams = [],
		onPickNote = undefined,
		fill = false
	}: {
		xml: string;
		scoreTheme?: ResolvedTheme;
		// F15: page joins a B16 paged OMR run wasn't sure how to merge, each
		// at an absolute whole-note onset in the working model with a short
		// human-readable reason. The view draws a labelled rule at each so an
		// admin can find and fix the seam. Pure overlay — never part of `xml`.
		seams?: { onsetWholeNotes: number; reason: string }[];
		// When true, the view grows to fill its parent (a flex column) and
		// the score itself becomes the only scroll region, instead of the
		// default fixed `max-height`. Used by the full-screen editor shell.
		fill?: boolean;
		// Bindable out: true while OSMD is (re-)engraving, so the parent can
		// show its own "updating" hint next to whatever triggered the change.
		rendering?: boolean;
		// Absolute whole-note onset of the selected note, or undefined for no
		// selection. The page resolves a click/keyboard selection to a model
		// note and passes its onset back down; the view parks OSMD's playback
		// cursor there as the on-screen selection marker (see
		// `parkSelectionCursor`). A plain number, not the note object, keeps
		// this component ignorant of the editable model.
		selectedOnset?: number | undefined;
		// F14 reopened: while the editor is playing back, the page drives this
		// with the audio position (whole notes from the start). The single
		// OSMD cursor is shared — when this is set it tracks playback and the
		// selection marker is suppressed; back to `undefined` on stop restores
		// the selection marker. Follow-scroll keeps it in view; the page's
		// "scroll to cursor" button calls `scrollCursorIntoView()`.
		playbackWholeNotes?: number | undefined;
		// Called when the user clicks a notehead. The page resolves the hit
		// to a `<note>` via `EditableScore.findByOnset` and updates selection.
		onPickNote?: (hit: {
			onsetWholeNotes: number;
			partId: string;
			staff: number;
			octave: number | undefined;
		}) => void;
	} = $props();

	let container: HTMLDivElement;
	// $state, not a plain `let`: assigned after `onMount`'s dynamic import
	// resolves, and the render effect below has to re-run once it exists.
	let osmd = $state<OSMDType | undefined>(undefined);
	// The `PointF2D` constructor, captured from the same dynamic import as
	// OSMD itself (a type-only static import can't give us the runtime value,
	// and OSMD's CJS bundle can't be statically imported under SSR).
	let pointF2D: (new (x: number, y: number) => PointF2DType) | undefined;
	let loadedXml: string | undefined;
	let loadError = $state<string | null>(null);
	let zoom = $state(1);
	// True only once a first `load()` + `render()` has completed — the zoom
	// and theme effects re-render in place and must not fire before OSMD has
	// a sheet to render (calling `render()` on an unloaded OSMD throws). Same
	// guard `ScoreView.svelte` gets from its `cursorReady`.
	let renderedOnce = $state(false);

	function osmdOptions(theme: ResolvedTheme) {
		const palette = THEME_PALETTES[theme];
		return {
			autoResize: true,
			drawTitle: false,
			followCursor: false,
			backend: 'svg',
			coloringEnabled: true,
			colorStemsLikeNoteheads: true,
			defaultColorMusic: palette.ink,
			defaultColorNotehead: palette.ink,
			defaultColorStem: palette.ink,
			defaultColorRest: palette.muted,
			defaultColorLabel: palette.muted,
			pageBackgroundColor: palette.surface
		};
	}

	onMount(async () => {
		const osmdModule = await import('opensheetmusicdisplay');
		pointF2D = osmdModule.PointF2D;
		osmd = new osmdModule.OpenSheetMusicDisplay(container, osmdOptions(scoreTheme));
		container.addEventListener('click', handlePick);
		// A manual scroll/zoom means "let me read where I want" — stop
		// yanking the view back to the cursor until "scroll to cursor" is
		// pressed again.
		container.addEventListener('wheel', disengageFollow, { passive: true });
		container.addEventListener('touchmove', disengageFollow, { passive: true });
	});

	onDestroy(() => {
		container?.removeEventListener('click', handlePick);
		container?.removeEventListener('wheel', disengageFollow);
		container?.removeEventListener('touchmove', disengageFollow);
		osmd = undefined;
	});

	// Click -> nearest notehead -> report its identity to the page. Ported
	// from the F14 spike: OSMD's `GetNearestNote` takes sheet-space
	// coordinates (SVG units, 10 * Zoom px each), and OSMD numbers staves
	// globally, so we hand the page the in-instrument staff index plus the
	// MusicXML part id and let it resolve the actual `<note>`.
	function handlePick(event: MouseEvent): void {
		const osmdRef = osmd;
		if (!osmdRef || !pointF2D || !onPickNote || !renderedOnce) return;
		const rect = container.getBoundingClientRect();
		const perPixel = 1 / (10 * osmdRef.Zoom);
		// `scrollLeft`/`scrollTop`: the container scrolls, and `rect` is only
		// the visible box, so add the hidden offset to get true sheet space.
		const x = (event.clientX - rect.left + container.scrollLeft) * perPixel;
		const y = (event.clientY - rect.top + container.scrollTop) * perPixel;
		const nearest = osmdRef.GraphicSheet.GetNearestNote(
			new pointF2D(x, y),
			new pointF2D(1, 1)
		);
		// OSMD's deep source model isn't fully surfaced in its types, hence
		// the cast — same shape the spike relied on.
		const src = nearest?.sourceNote as
			| {
					getAbsoluteTimestamp(): { RealValue: number };
					ParentStaffEntry?: {
						ParentStaff?: { Id?: number; ParentInstrument?: { IdString?: string } };
					};
					Pitch?: { Octave?: number };
			  }
			| undefined;
		if (!src) return;
		const onsetWholeNotes = src.getAbsoluteTimestamp().RealValue;
		const staff = src.ParentStaffEntry?.ParentStaff?.Id ?? 1;
		const partId = src.ParentStaffEntry?.ParentStaff?.ParentInstrument?.IdString ?? '';
		// OSMD's `Pitch.Octave` is scientific octave minus 3.
		const octave = src.Pitch?.Octave != null ? src.Pitch.Octave + 3 : undefined;
		onPickNote({ onsetWholeNotes, partId, staff, octave });
	}

	// The selection marker. F14's spike found that coloring a
	// `GraphicalNote` doesn't survive OSMD rebuilding its graphical sheet on
	// every re-engrave, whereas the playback cursor is re-derived from
	// timestamps on each render, so it is the reliable marker here. Walk the
	// cursor forward to the last entry at or before `selectedOnset`.
	function parkSelectionCursor(): void {
		const cursor = osmd?.cursor;
		if (!cursor) return;
		if (selectedOnset === undefined) {
			cursor.hide();
			return;
		}
		cursor.show();
		cursor.reset();
		walkCursorTo(selectedOnset);
	}

	// Step the shared cursor forward to the last entry at or before `target`
	// (whole notes). Assumes the caller has positioned it at or before
	// `target` already (both callers `reset()` first when needed). OSMD's
	// cursor only moves via next()/previous(), no direct jump.
	function walkCursorTo(target: number): void {
		const cursor = osmd?.cursor;
		if (!cursor) return;
		let guard = 0;
		while (
			cursor.iterator.currentTimeStamp.RealValue < target &&
			!cursor.iterator.EndReached &&
			guard++ < 100000
		) {
			cursor.next();
			if (cursor.iterator.currentTimeStamp.RealValue > target) {
				cursor.previous();
				break;
			}
		}
	}

	// Playback cursor: drive the shared cursor from the audio position. Only
	// `reset()`s when seeking backward — this runs every animation frame while
	// playing, so re-walking from 0 each call would be needlessly expensive
	// for the common case of just advancing. Same shape as `ScoreView`'s
	// `setCursorTimestamp`.
	function drivePlaybackCursor(target: number): void {
		const cursor = osmd?.cursor;
		if (!cursor) return;
		cursor.show();
		const current = () => cursor.iterator.currentTimeStamp.RealValue;
		if (Math.abs(current() - target) < 1e-6) return;
		if (target < current()) cursor.reset();
		walkCursorTo(target);
	}

	// Places the shared cursor for whichever mode is active — playback while
	// `playbackWholeNotes` is set, otherwise the selection marker. Called
	// after every re-engrave/zoom/theme change (OSMD rebuilds the cursor with
	// the sheet) and whenever either input moves.
	function placeCursor(): void {
		if (!osmd || !renderedOnce) return;
		if (playbackWholeNotes !== undefined) {
			drivePlaybackCursor(playbackWholeNotes);
			followCursorIfNeeded();
		} else {
			parkSelectionCursor();
		}
	}

	// MARK: - Follow-scroll (ported from ScoreView, simplified — here the
	// `.score-container` is itself the scroll region, no ancestor walk).

	// On by default so playback keeps the cursor in view; a manual wheel/
	// touch/scroll disengages it (the page's "scroll to cursor" button
	// re-engages via `scrollCursorIntoView`).
	let following = true;
	// OSMD writes an absolute, scroll-independent px offset to
	// `cursorElement.style.top` — constant along a system, changing only when
	// the cursor moves to a new system/page. Tracking it recenters on every
	// new row, not just once the cursor scrolls off screen. Reset on a fresh
	// load and when playback toggles.
	let lastCursorSystemTop: number | undefined;

	function currentCursorSystemTop(): number | undefined {
		const raw = osmd?.cursor.cursorElement?.style.top;
		if (!raw) return undefined;
		const parsed = parseFloat(raw);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	function jumpToCursor(): void {
		const element = osmd?.cursor.cursorElement;
		if (!element || !container) return;
		const el = element.getBoundingClientRect();
		const box = container.getBoundingClientRect();
		container.scrollTop += el.top + el.height / 2 - (box.top + box.height / 2);
		container.scrollLeft += el.left + el.width / 2 - (box.left + box.width / 2);
	}

	function followCursorIfNeeded(): void {
		if (!following) return;
		const element = osmd?.cursor.cursorElement;
		if (!element || !container) return;
		const top = currentCursorSystemTop();
		if (top !== undefined && top !== lastCursorSystemTop) {
			lastCursorSystemTop = top;
			jumpToCursor();
			return;
		}
		const el = element.getBoundingClientRect();
		const box = container.getBoundingClientRect();
		if (el.left < box.left || el.right > box.right) jumpToCursor();
	}

	/** Re-engages follow and brings the cursor back into view — for the
	 * page's "scroll to cursor" control, since reading ahead is expected to
	 * lose the cursor off screen. */
	export function scrollCursorIntoView(): void {
		following = true;
		lastCursorSystemTop = currentCursorSystemTop();
		jumpToCursor();
	}

	function disengageFollow(): void {
		following = false;
	}

	// Re-engrave whenever `xml` changes — the editor hands a freshly
	// serialized model after every edit, and OSMD has no partial update, so
	// each change is a full `load()` + `render()`. `loadedXml` guards against
	// re-running on an unrelated reactive tick.
	$effect(() => {
		const currentXml = xml;
		const osmdRef = osmd;
		if (!osmdRef || currentXml === loadedXml) return;
		loadedXml = currentXml;
		rendering = true;
		loadError = null;
		osmdRef.setOptions(osmdOptions(scoreTheme));
		osmdRef.Zoom = zoom;
		Promise.resolve()
			.then(() => osmdRef.load(currentXml))
			.then(() => {
				osmdRef.render();
				renderedOnce = true;
				// A fresh sheet: the first system counts as "changed" again.
				lastCursorSystemTop = undefined;
				// Measure seam positions before parking the cursor — both walk
				// the shared cursor, so seams first, then `placeCursor()` puts
				// it back on the selection/playback position.
				measureSeams();
				// OSMD rebuilds the cursor with the sheet, so re-place it
				// (playback or selection) after every re-engrave.
				placeCursor();
			})
			.catch((e: unknown) => {
				loadError = String(e);
			})
			.finally(() => {
				rendering = false;
			});
	});

	// Re-render at the new zoom / theme. OSMD rebuilds the whole graphical
	// sheet, so both are applied by re-rendering, not by restyling the SVG.
	// Guarded on `renderedOnce` so this never runs before the load effect
	// above has given OSMD a sheet.
	$effect(() => {
		const level = zoom;
		const theme = scoreTheme;
		if (!osmd || !renderedOnce) return;
		osmd.setOptions(osmdOptions(theme));
		osmd.Zoom = level;
		osmd.render();
		lastCursorSystemTop = undefined;
		measureSeams();
		placeCursor();
	});

	// Re-place the cursor when the selection or the playback position moves
	// without an edit — keyboard nav changes `selectedOnset`, and the RAF
	// loop changes `playbackWholeNotes`, neither of which touches `xml`, so
	// the re-engrave effect above doesn't run.
	let wasPlaying = false;
	$effect(() => {
		const onset = selectedOnset;
		const pb = playbackWholeNotes;
		void onset;
		if (!osmd || !renderedOnce) return;
		// Entering playback re-engages follow (a pre-playback manual scroll
		// shouldn't leave the cursor un-followed once playback starts) and
		// re-arms the "new system" tracking so the first jump lands.
		const playingNow = pb !== undefined;
		if (playingNow && !wasPlaying) {
			following = true;
			lastCursorSystemTop = undefined;
		}
		wasPlaying = playingNow;
		placeCursor();
	});

	// MARK: - Seam markers (F15)

	// Content-space positions (px within the scrolling `.score-container`) of
	// each seam, recomputed after every re-engrave / zoom / theme change and
	// when `seams` itself changes — not on cursor moves, so playback doesn't
	// thrash it. Measured by transiently walking the shared cursor to each
	// seam onset; `placeCursor()` must run afterwards to put the cursor back.
	let seamMarks = $state<{ key: string; top: number; left: number; height: number; reason: string }[]>(
		[]
	);

	function measureSeams(): void {
		const cursor = osmd?.cursor;
		if (!cursor || !renderedOnce || !container || seams.length === 0) {
			seamMarks = [];
			return;
		}
		const box = container.getBoundingClientRect();
		const marks: typeof seamMarks = [];
		for (const seam of seams) {
			cursor.show();
			cursor.reset();
			walkCursorTo(seam.onsetWholeNotes);
			const el = cursor.cursorElement;
			if (!el) continue;
			const r = el.getBoundingClientRect();
			marks.push({
				key: `${seam.onsetWholeNotes}:${seam.reason}`,
				top: r.top - box.top + container.scrollTop,
				left: r.left - box.left + container.scrollLeft,
				height: r.height || 48,
				reason: seam.reason
			});
		}
		seamMarks = marks;
	}

	// Recompute seam positions when the seam set changes (a fresh report, or
	// an edit shifted onsets). Re-engrave/zoom/theme are handled inline in
	// their own effects so `measureSeams()` and `placeCursor()` stay ordered.
	$effect(() => {
		void seams;
		if (!osmd || !renderedOnce) return;
		measureSeams();
		placeCursor();
	});

	function zoomBy(delta: number): void {
		zoom = clampZoom(zoom + delta);
	}

	function resetZoom(): void {
		zoom = 1;
	}
</script>

<div class="editor-score" class:fill data-theme={scoreTheme}>
	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={m.zoom_out()}>−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={m.zoom_in()}>+</button>
	</div>
	<div class="score-container" bind:this={container}>
		{#each seamMarks as mark (mark.key)}
			<div
				class="seam-mark"
				style:top="{mark.top}px"
				style:left="{mark.left}px"
				style:height="{mark.height}px"
			>
				<span class="seam-flag">{mark.reason}</span>
			</div>
		{/each}
	</div>
	{#if loadError}
		<p class="error">{m.piece_editor_score_render_failed()}</p>
	{/if}
</div>

<style>
	.editor-score {
		--score-page: var(--surface);
		--score-chrome: var(--surface-2);
		--score-chrome-border: var(--border);
		--score-button: var(--surface);
		--score-button-hover: color-mix(in srgb, var(--accent) 15%, var(--surface));
		--score-button-active: var(--accent);
		--score-button-active-text: var(--accent-contrast);
		--score-button-text: var(--text);
		border: 1px solid var(--score-chrome-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--score-page);
	}

	/* Full-screen editor: fill the parent flex column and let the sheet
	   itself be the scroll region (no fixed `max-height`, no rounded card
	   edges against the viewport). */
	.editor-score.fill {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		border-radius: 0;
		border-left: none;
		border-right: none;
		border-bottom: none;
	}
	.editor-score.fill .score-container {
		flex: 1 1 auto;
		max-height: none;
	}

	.zoom-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--score-chrome-border);
		background: var(--score-chrome);
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.zoom-controls button {
		min-width: 2.125rem;
		border: 1px solid var(--score-chrome-border);
		background: var(--score-button);
		color: var(--score-button-text);
		border-radius: var(--radius-full);
		padding: 0.25rem 0.6rem;
		font-size: 0.8125rem;
		font-weight: 700;
		cursor: pointer;
	}
	.zoom-controls button:hover:not(:disabled) {
		background: var(--score-button-hover);
	}
	.zoom-controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.zoom-level {
		min-width: 4rem;
		background: var(--score-button-active) !important;
		color: var(--score-button-active-text) !important;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.score-container {
		width: 100%;
		max-height: 70vh;
		overflow: auto;
		background: var(--score-page);
		touch-action: pan-x pan-y;
		/* Noteheads are clickable to select; hint it across the sheet. */
		cursor: pointer;
		/* Anchor for the absolutely-positioned seam markers (F15). They live
		   in this scrolling box, so they scroll with the engraving. */
		position: relative;
	}
	.score-container :global(svg) {
		display: block;
		min-width: 100%;
		background: var(--score-page);
	}

	/* F15: a labelled rule at each unresolved page join from a paged OMR
	   run. `pointer-events: none` so it never blocks a notehead click. */
	.seam-mark {
		position: absolute;
		width: 0;
		border-left: 2px dashed var(--danger);
		pointer-events: none;
		z-index: 2;
	}
	.seam-flag {
		position: absolute;
		top: 0;
		left: 0.25rem;
		max-width: 16rem;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		background: var(--danger);
		color: var(--danger-contrast, #fff);
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1.3;
		white-space: normal;
	}

	.error {
		color: var(--danger);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
	}
</style>
