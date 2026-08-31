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
		onPickNote = undefined
	}: {
		xml: string;
		scoreTheme?: ResolvedTheme;
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
	});

	onDestroy(() => {
		container?.removeEventListener('click', handlePick);
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
		const target = selectedOnset;
		let guard = 0;
		while (
			cursor.iterator.currentTimeStamp.RealValue < target &&
			!cursor.iterator.EndReached &&
			guard++ < 10000
		) {
			cursor.next();
			if (cursor.iterator.currentTimeStamp.RealValue > target) {
				cursor.previous();
				break;
			}
		}
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
				// OSMD rebuilds the cursor with the sheet, so re-place the
				// selection marker after every re-engrave.
				parkSelectionCursor();
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
		parkSelectionCursor();
	});

	// Re-park when the selection moves without an edit — keyboard
	// ArrowLeft/ArrowRight between notes changes `selectedOnset` but not
	// `xml`, so the re-engrave effect above doesn't run.
	$effect(() => {
		const onset = selectedOnset;
		void onset;
		if (!osmd || !renderedOnce) return;
		parkSelectionCursor();
	});

	function zoomBy(delta: number): void {
		zoom = clampZoom(zoom + delta);
	}

	function resetZoom(): void {
		zoom = 1;
	}
</script>

<div class="editor-score" data-theme={scoreTheme}>
	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={m.zoom_out()}>−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={m.zoom_in()}>+</button>
	</div>
	<div class="score-container" bind:this={container}></div>
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
	}
	.score-container :global(svg) {
		display: block;
		min-width: 100%;
		background: var(--score-page);
	}

	.error {
		color: var(--danger);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
	}
</style>
