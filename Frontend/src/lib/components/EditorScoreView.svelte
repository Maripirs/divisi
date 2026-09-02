<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { THEME_PALETTES, type ResolvedTheme } from '$lib/theme';
	import { baseOsmdOptions, quietOsmdLogging } from '$lib/components/score/osmd';
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
		playheadWholeNotes = undefined,
		isPlaying = false,
		seams = [],
		measureMode = false,
		measureBand = null,
		pageBand = null,
		dimOffPage = false,
		onPickNote = undefined,
		onSeekTo = undefined,
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
		// note and passes its onset back down; the view parks the selection
		// cursor (`osmd.cursor`, index 0) there as the on-screen marker (see
		// `placeSelection`). A plain number, not the note object, keeps this
		// component ignorant of the editable model.
		selectedOnset?: number | undefined;
		// F14 reopened: the transport position, in whole notes from the start,
		// whenever audio exists — playing *or* paused, not just during
		// playback. Drives a dedicated playhead cursor (`osmd.cursors[1]`), the
		// accent bar the user can drag or click a spot in the score to move.
		// `undefined` only before audio is first loaded, when no playhead shows.
		playheadWholeNotes?: number | undefined;
		// True while the transport is actually playing — gates follow-scroll so
		// a paused playhead (e.g. right after a click-to-seek) doesn't yank the
		// score around.
		isPlaying?: boolean;
		// F17: Measures mode. When true, a click anywhere in a bar is a
		// selection gesture (never a click-to-seek), and every `onPickNote`
		// carries `extend` (the Shift key) so the page can grow a bar range.
		measureMode?: boolean;
		// F17: the bar range selected in Measures mode — a part id plus an
		// inclusive 0-based measure span. The view tints those bars of that
		// part. `null` when nothing is selected or not in Measures mode.
		measureBand?: {
			partId: string;
			staff: number;
			fromMeasure: number;
			toMeasure: number;
		} | null;
		// F19: the source page focused in the Pages step of the review stepper —
		// an inclusive 0-based measure span. The view tints the *full system*
		// (every part) across that range, one rect per wrapped row, so the admin
		// can see at a glance which bars a page produced. `null` when no page is
		// focused or the draft isn't under review.
		pageBand?: {
			fromMeasure: number;
			toMeasure: number;
		} | null;
		// F19 rework: when true and a page band is present, veil everything above
		// and below the focused page so the current page reads as the only live
		// system. Pure overlay, same recompute triggers as `pageBand`.
		dimOffPage?: boolean;
		// Called when the user clicks a notehead (or, in Measures mode, anywhere
		// in a bar). The page resolves the hit to a `<note>` via
		// `EditableScore.findByOnset` and updates selection. `extend` is the
		// Shift key at click time — Measures mode uses it to extend the range;
		// note mode ignores it.
		onPickNote?: (hit: {
			onsetWholeNotes: number;
			partId: string;
			staff: number;
			octave: number | undefined;
			/** 0-based index of the clicked bar in OSMD's graphical measure list.
			 * Measures mode uses this instead of resolving a bar through
			 * `findByOnset` (which misfires on a part that's tacet at the click's
			 * onset) or the printed `MeasureNumber` (a hand-upload with a pickup
			 * or non-sequential numbers makes that a wrong index). `null` if
			 * OSMD's model didn't surface it. */
			measureIndex: number | null;
			extend: boolean;
		}) => void;
		// Called when the user drags the playhead bar or clicks an empty spot
		// in the score. The page converts the onset to ms and seeks the audio.
		// `play` is always false today (repositions only — playback starts
		// solely from the Play button); the flag is kept for a future
		// click-to-play affordance.
		onSeekTo?: (onsetWholeNotes: number, opts: { play: boolean }) => void;
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

	// Two OSMD cursors, styled off the accent token instead of OSMD's stock
	// green highlight. Index 0 is the selection marker (a translucent accent
	// band on the selected note); index 1 is the playhead (a solid accent
	// bar the user drags / clicks to). Literal `CursorType` values — OSMD
	// ships the enum but importing it here would pull the CJS bundle into
	// SSR (same reason as the type-only OSMD import above). 0 = Standard
	// (highlight rectangle), 1 = ThinLeft (a left-aligned vertical line).
	const SELECTION_CURSOR = 0;
	const PLAYHEAD_CURSOR = 1;

	// The slice of OSMD's `Cursor` this component drives. Kept minimal so the
	// type-only OSMD import doesn't have to name `Cursor` (its CJS bundle
	// can't be imported for values under SSR).
	type CursorLike = {
		show(): void;
		hide(): void;
		reset(): void;
		next(): void;
		previous(): void;
		iterator: { currentTimeStamp: { RealValue: number }; EndReached: boolean };
		cursorElement?: HTMLImageElement & { dataset: DOMStringMap };
	};

	// True while a pointer is dragging the playhead bar — `placePlayhead`
	// yields the cursor to the drag handler, and a synthetic `click` right
	// after the drag is swallowed via `justDragged`.
	let draggingPlayhead = false;
	let justDragged = false;
	let dragSeekOnset: number | null = null;

	function cursorsOptions(theme: ResolvedTheme) {
		const accent = THEME_PALETTES[theme].accent;
		return [
			{ type: 0, color: accent, alpha: theme === 'dark' ? 0.4 : 0.28, follow: false },
			{ type: 1, color: accent, alpha: 1, follow: false }
		];
	}

	function osmdOptions(theme: ResolvedTheme) {
		const palette = THEME_PALETTES[theme];
		return {
			...baseOsmdOptions({ ink: palette.ink, muted: palette.muted, page: palette.surface }),
			backend: 'svg',
			cursorsOptions: cursorsOptions(theme)
		};
	}

	onMount(async () => {
		const osmdModule = await import('opensheetmusicdisplay');
		pointF2D = osmdModule.PointF2D;
		osmd = new osmdModule.OpenSheetMusicDisplay(container, osmdOptions(scoreTheme));
		quietOsmdLogging(osmd);
		// The playhead is driven by `parseMusicXmlFile(workingXml)` audio, which
		// walks the score linearly and never expands repeats. OSMD's cursor
		// iterator follows repeat barlines by default (back-jumps at the end
		// repeat), so on a piece with repeats the cursor loops the repeated
		// bars while the audio plays straight through — `walkCursorTo` then
		// spins its guard loop every frame and the playhead never tracks the
		// sound. Make the cursor walk linearly too. (`EngravingRules` lives on
		// the OSMD instance and survives `setOptions`/`render`, so once is
		// enough.)
		osmd.EngravingRules.CursorIgnoreRepetitions = true;
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
		if (engraveTimer !== undefined) clearTimeout(engraveTimer);
		osmd = undefined;
	});

	// Screen point -> OSMD sheet-space coords (SVG units, 10 * Zoom px each).
	// `scrollLeft`/`scrollTop`: the container scrolls, and `rect` is only the
	// visible box, so add the hidden offset to get true sheet space.
	function sheetPoint(clientX: number, clientY: number): PointF2DType | null {
		const osmdRef = osmd;
		if (!osmdRef || !pointF2D || !renderedOnce) return null;
		const rect = container.getBoundingClientRect();
		const perPixel = 1 / (10 * osmdRef.Zoom);
		return new pointF2D(
			(clientX - rect.left + container.scrollLeft) * perPixel,
			(clientY - rect.top + container.scrollTop) * perPixel
		);
	}

	// The `sourceNote` nearest a screen point. OSMD's deep source model isn't
	// fully surfaced in its types, hence the cast — the shape F14 development
	// relied on.
	type NearestSource = {
		getAbsoluteTimestamp(): { RealValue: number };
		ParentStaffEntry?: {
			ParentStaff?: { Id?: number; ParentInstrument?: { IdString?: string } };
			VerticalSourceStaffEntryContainer?: { ParentMeasure?: { MeasureNumber?: number } };
		};
		Pitch?: { Octave?: number };
	};
	// The graphical note OSMD returns for a hit; walked for its position in
	// OSMD's graphical measure list (which `findByOnset` can't reliably give:
	// a part that's tacet for the opening bars has no note there to match a
	// click's onset against).
	type NearestGraphical = {
		sourceNote?: NearestSource;
		parentVoiceEntry?: {
			parentStaffEntry?: {
				parentMeasure?: {
					MeasureNumber?: number;
					parentSourceMeasure?: { MeasureNumber?: number };
				};
			};
		};
	};
	function nearestGraphicalAt(clientX: number, clientY: number): NearestGraphical | null {
		const p = sheetPoint(clientX, clientY);
		if (!p || !osmd || !pointF2D) return null;
		return (osmd.GraphicSheet.GetNearestNote(p, new pointF2D(1, 1)) as NearestGraphical) ?? null;
	}
	function nearestSourceAt(clientX: number, clientY: number): NearestSource | null {
		return nearestGraphicalAt(clientX, clientY)?.sourceNote ?? null;
	}
	// The hit's 0-based measure index: its position in OSMD's graphical measure
	// list (`GraphicSheet.MeasureList[measureIndex][staffIndex]`), falling back
	// to the source measure's position in document order. Deliberately *not*
	// OSMD's printed `MeasureNumber`: a generated / merged draft is renumbered
	// 1..N so the two agree, but a hand-upload with a pickup (`number="0"`) or
	// non-sequential printed numbers makes the printed number a wrong index (a
	// `number="0"` pickup would map to -1). `null` if neither is reachable.
	function measureIndexOf(g: NearestGraphical | null): number | null {
		const gm = g?.parentVoiceEntry?.parentStaffEntry?.parentMeasure;
		const list = (osmd?.GraphicSheet as { MeasureList?: unknown[][] } | undefined)?.MeasureList;
		if (gm && list) {
			for (let i = 0; i < list.length; i++) {
				if (list[i]?.some((cell) => cell === (gm as unknown))) return i;
			}
		}
		const sm =
			(gm as { parentSourceMeasure?: unknown } | undefined)?.parentSourceMeasure ??
			g?.sourceNote?.ParentStaffEntry?.VerticalSourceStaffEntryContainer?.ParentMeasure;
		const sources = (osmd?.Sheet as { SourceMeasures?: unknown[] } | undefined)?.SourceMeasures;
		if (sm && Array.isArray(sources)) {
			const idx = sources.indexOf(sm);
			if (idx >= 0) return idx;
		}
		return null;
	}

	// A click in the score is either "select this notehead" (an edit gesture,
	// unchanged from F14) or "move the playhead here" (a click on empty staff
	// space — repositions only, never starts the transport; playback begins
	// solely from the Play button). VexFlow renders each notehead as a
	// `g.vf-notehead`; a click whose target sits inside a note glyph is a
	// selection, anything else (staff line, gap between notes, barline) is a seek.
	function handlePick(event: MouseEvent): void {
		if (!osmd || !pointF2D || !renderedOnce) return;
		// The pointerup that ends a playhead drag is followed by a synthetic
		// `click` — ignore it so a drag never also seeks/selects.
		if (justDragged) return;
		const g = nearestGraphicalAt(event.clientX, event.clientY);
		const src = g?.sourceNote;
		if (!src) return;
		const onsetWholeNotes = src.getAbsoluteTimestamp().RealValue;
		const target = event.target as Element | null;
		const onNote = !!target?.closest?.('.vf-notehead, .vf-stavenote, .vf-rest');
		// In Measures mode every click selects a bar; a click on empty staff
		// space only repositions the playhead in note mode (no auto-play).
		if (!onNote && !measureMode) {
			onSeekTo?.(onsetWholeNotes, { play: false });
			return;
		}
		if (!onPickNote) return;
		const staff = src.ParentStaffEntry?.ParentStaff?.Id ?? 1;
		const partId = src.ParentStaffEntry?.ParentStaff?.ParentInstrument?.IdString ?? '';
		// OSMD's `Pitch.Octave` is scientific octave minus 3.
		const octave = src.Pitch?.Octave != null ? src.Pitch.Octave + 3 : undefined;
		onPickNote({
			onsetWholeNotes,
			partId,
			staff,
			octave,
			measureIndex: measureIndexOf(g),
			extend: event.shiftKey
		});
	}

	// Step `cursor` forward to the last entry at or before `target` (whole
	// notes). Assumes it is at or before `target` already (callers `reset()`
	// first when seeking backward). An OSMD cursor only moves via
	// next()/previous(), no direct jump.
	function walkCursorTo(cursor: CursorLike | undefined, target: number): void {
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

	// The selection marker (`osmd.cursors[0]`). F14 found that
	// coloring a `GraphicalNote` doesn't survive OSMD rebuilding its
	// graphical sheet on every re-engrave, whereas a cursor is re-derived
	// from timestamps on each render, so a cursor is the reliable marker.
	//
	// `placeCursor` runs every animation frame while the playhead moves, so
	// this must not re-walk from bar 0 each time: `selectionPlacedAt` tracks
	// where cursor 0 actually sits, and `selectionStale` forces a re-walk
	// after a re-engrave (OSMD rebuilt the element) or after `measureSeams`
	// borrowed cursor 0 to probe seam positions.
	let selectionPlacedAt: number | undefined = undefined;
	let selectionStale = true;
	// Visibility transitions only: OSMD's `cursor.show()` runs a full
	// `update()` (re-walks the graphical sheet to recompute cursor geometry),
	// so calling it every animation frame — as the old unconditional
	// `show()`/`hide()` here did — cost two sheet walks per frame during
	// playback for cursors that mostly weren't moving. Track shown state and
	// only toggle on the edge. Reset to `false` after every `render()` (OSMD
	// rebuilds and re-hides the cursor elements).
	let selectionShown = false;
	let playheadShown = false;
	// True once the current cursor elements have had their accent styling /
	// drag wiring applied. Cleared on every `render()` (fresh elements), then
	// re-applied on the next visibility/position change.
	let cursorsStyled = false;
	// Returns true when it changed the cursor (shown / hidden / re-walked), so
	// `placeCursor` knows to re-run `styleCursors`.
	function placeSelection(): boolean {
		const cursor = osmd?.cursor;
		if (!cursor) return false;
		if (selectedOnset === undefined) {
			selectionPlacedAt = undefined;
			if (!selectionShown) return false;
			cursor.hide();
			selectionShown = false;
			return true;
		}
		let changed = false;
		if (!selectionShown) {
			cursor.show();
			selectionShown = true;
			changed = true;
		}
		if (!selectionStale && selectionPlacedAt === selectedOnset) return changed;
		cursor.reset();
		walkCursorTo(cursor, selectedOnset);
		selectionPlacedAt = selectedOnset;
		selectionStale = false;
		return true;
	}

	// The playhead (`osmd.cursors[1]`) — driven by the transport position
	// every animation frame while playing, so it only `reset()`s when seeking
	// backward (re-walking from 0 each frame would be needless work for the
	// common case of just advancing). Skipped while a drag owns the playhead.
	// Returns true when the playhead was shown/hidden or actually stepped to a
	// new onset — `placeCursor` gates `styleCursors` and follow-scroll on that,
	// so a frame where the transport only advanced a sub-note fraction (most
	// frames at 60fps) does no OSMD or layout work, matching `ScoreView`'s
	// timestamp early-out.
	function placePlayhead(): boolean {
		const cursor = osmd?.cursors?.[PLAYHEAD_CURSOR];
		if (!cursor) return false;
		if (playheadWholeNotes === undefined) {
			if (!playheadShown) return false;
			cursor.hide();
			playheadShown = false;
			return true;
		}
		// A drag owns the cursor while it lasts (see `wirePlayheadDrag`).
		if (draggingPlayhead) return false;
		let changed = false;
		if (!playheadShown) {
			cursor.show();
			playheadShown = true;
			changed = true;
		}
		const current = cursor.iterator.currentTimeStamp.RealValue;
		if (Math.abs(current - playheadWholeNotes) < 1e-6) return changed;
		if (playheadWholeNotes < current) cursor.reset();
		walkCursorTo(cursor, playheadWholeNotes);
		return true;
	}

	// Places both cursors and (re)applies their accent styling. Called after
	// every re-engrave/zoom/theme change (OSMD rebuilds cursor elements with
	// the sheet) and whenever `selectedOnset` / `playheadWholeNotes` move.
	// OSMD cursors default to `SkipInvisibleNotes = true`, so `next()` jumps
	// over any note with `print-object="no"`. The editor renders the raw
	// working model, which keeps hidden notes (unselected voices, page-fill
	// padding from a paged OMR run) in the timeline — with the default the
	// playhead skips from visible note to visible note and reads as "moving
	// per measure, not per note". Force it off on every cursor so
	// `walkCursorTo` stops on every entry; the setter also propagates to the
	// cursor's iterator. Re-asserted here (not once at mount) because OSMD
	// rebuilds the cursors on every `render()`.
	function keepCursorsOnEveryNote(): void {
		for (const cursor of osmd?.cursors ?? []) {
			if (cursor.SkipInvisibleNotes !== false) cursor.SkipInvisibleNotes = false;
		}
	}

	function placeCursor(): void {
		if (!osmd || !renderedOnce) return;
		keepCursorsOnEveryNote();
		const selChanged = placeSelection();
		const headMoved = placePlayhead();
		if (selChanged || headMoved || !cursorsStyled) {
			styleCursors();
			cursorsStyled = true;
		}
		// `followCursorIfNeeded` reads `getBoundingClientRect` (forces a
		// reflow); only worth doing on frames where the playhead actually
		// reached a new note.
		if (isPlaying && headMoved) followCursorIfNeeded();
	}

	// OSMD's `CursorOptions.color` tints the cursor image but leaves it the
	// stock width; the playhead wants a crisp bar and a grab affordance, and
	// both elements are rebuilt on every render() so this re-runs each time.
	function styleCursors(): void {
		const sel = osmd?.cursors?.[SELECTION_CURSOR]?.cursorElement;
		if (sel) {
			sel.style.pointerEvents = 'none';
			sel.style.zIndex = '3';
			// Stable hook for the e2e playhead-sync spec (see `e2e/`), which
			// can't rely on OSMD's `cursorImg-N` id ordering.
			sel.dataset.role = 'selection';
		}
		const play = osmd?.cursors?.[PLAYHEAD_CURSOR]?.cursorElement;
		if (play) {
			play.dataset.role = 'playhead';
			play.style.width = '3px';
			play.style.borderRadius = '999px';
			play.style.zIndex = '5';
			play.style.pointerEvents = 'auto';
			play.style.cursor = draggingPlayhead ? 'grabbing' : 'grab';
			play.style.touchAction = 'none';
			if (play.dataset.dragWired !== '1') wirePlayheadDrag(play);
		}
	}

	// Nearest note onset (whole notes) to a screen point, for click-to-seek
	// and the drag below — the playhead snaps to note onsets rather than
	// free-scrubbing between them, which is what "play from here" wants.
	function nearestOnsetAt(clientX: number, clientY: number): number | null {
		const src = nearestSourceAt(clientX, clientY);
		return src ? src.getAbsoluteTimestamp().RealValue : null;
	}

	// Make the playhead bar draggable. OSMD rebuilds `cursorElement` on every
	// render(), so `styleCursors` re-invokes this on a fresh element (guarded
	// by the `dragWired` marker). Pointer capture keeps the drag alive even
	// when the pointer outruns the 3px bar; each move snaps the playhead to
	// the nearest note, and the release reports that onset to the page.
	function wirePlayheadDrag(el: HTMLImageElement & { dataset: DOMStringMap }): void {
		el.dataset.dragWired = '1';
		const playCursor = () => osmd?.cursors?.[PLAYHEAD_CURSOR] as CursorLike | undefined;

		el.addEventListener('pointerdown', (event: PointerEvent) => {
			if (!renderedOnce) return;
			event.preventDefault();
			event.stopPropagation();
			draggingPlayhead = true;
			dragSeekOnset = null;
			following = false;
			el.style.cursor = 'grabbing';
			// Pointer capture routes every subsequent move/up to this element
			// even when the pointer outruns the 3px bar.
			try {
				el.setPointerCapture(event.pointerId);
			} catch {
				// Ignore — the pointerup/pointercancel listeners still end it.
			}
		});

		el.addEventListener('pointermove', (event: PointerEvent) => {
			if (!draggingPlayhead) return;
			const onset = nearestOnsetAt(event.clientX, event.clientY);
			if (onset == null) return;
			dragSeekOnset = onset;
			const cursor = playCursor();
			if (!cursor) return;
			cursor.show();
			if (onset < cursor.iterator.currentTimeStamp.RealValue) cursor.reset();
			walkCursorTo(cursor, onset);
		});

		const endDrag = (event: PointerEvent) => {
			if (!draggingPlayhead) return;
			draggingPlayhead = false;
			el.style.cursor = 'grab';
			try {
				el.releasePointerCapture(event.pointerId);
			} catch {
				// no-op — capture may never have been taken (see above).
			}
			// Swallow the synthetic click that follows this pointerup.
			justDragged = true;
			setTimeout(() => (justDragged = false), 0);
			if (dragSeekOnset != null) {
				onSeekTo?.(dragSeekOnset, { play: false });
				dragSeekOnset = null;
			}
		};
		el.addEventListener('pointerup', endDrag);
		el.addEventListener('pointercancel', endDrag);
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

	// Follow-scroll tracks whichever cursor is "live": the playhead while
	// there is a transport position, otherwise the selection marker (so the
	// "scroll to cursor" button still works when nothing is playing).
	function activeCursorElement(): HTMLElement | undefined {
		const cursor =
			playheadWholeNotes !== undefined ? osmd?.cursors?.[PLAYHEAD_CURSOR] : osmd?.cursor;
		return cursor?.cursorElement;
	}

	function currentCursorSystemTop(): number | undefined {
		const raw = activeCursorElement()?.style.top;
		if (!raw) return undefined;
		const parsed = parseFloat(raw);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	function jumpToCursor(): void {
		const element = activeCursorElement();
		if (!element || !container) return;
		const el = element.getBoundingClientRect();
		const box = container.getBoundingClientRect();
		container.scrollTop += el.top + el.height / 2 - (box.top + box.height / 2);
		container.scrollLeft += el.left + el.width / 2 - (box.left + box.width / 2);
	}

	function followCursorIfNeeded(): void {
		if (!following) return;
		const element = activeCursorElement();
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

	/** F19 rework: frame the focused page's band at the top of the scroll
	 * region, the way `PdfView.scrollToPage` frames the scan page. */
	export function scrollPageIntoView(): void {
		if (!container || pageBandRects.length === 0) return;
		const top = Math.min(...pageBandRects.map((r) => r.top));
		container.scrollTop = Math.max(0, top - 12);
	}

	function disengageFollow(): void {
		following = false;
	}

	/** Diagnostic seam (dev / `?e2e` only, via the page probe): the current
	 * band inputs and the rects they produced. */
	export function debugMeasureBand(): unknown {
		return { measureMode, measureBand, rectCount: measureBandRects.length, rects: measureBandRects };
	}

	/** F19 diagnostic seam (dev / `?e2e` only): the focused page's band inputs
	 * and the rects they produced. */
	export function debugPageBand(): unknown {
		return {
			pageBand,
			rectCount: pageBandRects.length,
			rects: pageBandRects,
			dimRects: pageDimRects
		};
	}

	/** Test seam (e2e playhead-sync spec): the playhead cursor's current
	 * musical position in whole notes from the start, or `null` before it's
	 * been placed. Lets the spec compare the rendered playhead against the
	 * audio transport position directly, without pixel math off the cursor
	 * element. Not used by the app itself. */
	export function playheadOnset(): number | null {
		const t = osmd?.cursors?.[PLAYHEAD_CURSOR]?.iterator?.currentTimeStamp?.RealValue;
		return typeof t === 'number' ? t : null;
	}

	// Re-engrave whenever `xml`, the zoom, or the theme changes. The editor
	// hands a freshly serialized model after every edit and OSMD has no
	// partial update, so each is a full `load()` + `render()` — hundreds of ms
	// on a real choral score. Two things this has to get right:
	//
	//  - OSMD is not reentrant: a second `load()` before the first settles
	//    corrupts its internal state. A single worker (`engrave`) owns the
	//    pass and loops until the sheet matches the newest inputs, so overlap
	//    is structurally impossible however fast the changes arrive.
	//  - A burst of edits (holding Backspace, rapid transpose) must not pay a
	//    full engrave per keystroke. The page applies model edits freely now;
	//    a short throttle here collapses the resulting `xml` changes into at
	//    most one engrave per `ENGRAVE_THROTTLE_MS`, so the score trails the
	//    edits by one render instead of freezing between them, and catches up
	//    the instant the burst stops.
	let engraving = false;
	let appliedZoom = 1;
	let appliedTheme: ResolvedTheme | undefined;
	let engraveTimer: ReturnType<typeof setTimeout> | undefined;
	const ENGRAVE_THROTTLE_MS = 90;

	// The per-engrave cursor/band repaint. `render()` rebuilds the graphical
	// sheet and both cursor elements, so every derived bit of on-screen state
	// is stale afterwards. `untrack`ed by callers: `measureSeams`/`placeCursor`
	// read `playheadWholeNotes`/`isPlaying`/`selectedOnset`, and without the
	// untrack an `$effect` calling this would re-subscribe to the playback
	// position and re-engrave every animation frame.
	function repaintAfterEngrave(): void {
		renderedOnce = true;
		// Fresh sheet: the first system counts as "changed" again, and OSMD
		// rebuilt cursor 0 at bar 0 — force a re-walk. Drop the shown/styled
		// flags so `placeCursor` re-shows and re-styles the rebuilt elements.
		lastCursorSystemTop = undefined;
		selectionStale = true;
		selectionShown = false;
		playheadShown = false;
		cursorsStyled = false;
		// Seams borrow the shared cursor to probe screen positions, so measure
		// them first, then `placeCursor()` parks it back on the selection /
		// playback position.
		measureSeams();
		placeCursor();
		computeMeasureBand();
		computePageBand();
	}

	async function engrave(): Promise<void> {
		if (engraving || !osmd) return;
		engraving = true;
		rendering = true;
		try {
			// More edits can land while a pass runs — loop until the sheet
			// reflects the newest xml / zoom / theme.
			while (
				osmd &&
				(xml !== loadedXml || zoom !== appliedZoom || scoreTheme !== appliedTheme)
			) {
				const target = xml;
				const level = zoom;
				const theme = scoreTheme;
				loadError = null;
				try {
					osmd.setOptions(osmdOptions(theme));
					osmd.Zoom = level;
					await osmd.load(target);
					if (!osmd) break;
					osmd.render();
					// Mark consumed only after a clean render.
					loadedXml = target;
					appliedZoom = level;
					appliedTheme = theme;
					untrack(() => repaintAfterEngrave());
				} catch (e) {
					loadError = String(e);
					// Consume this input too, so a parse failure doesn't spin
					// the loop; a later edit (new xml) still retries.
					loadedXml = target;
					appliedZoom = level;
					appliedTheme = theme;
				}
			}
		} finally {
			engraving = false;
			rendering = false;
			// Catch an edit that landed in the gap between the loop's last
			// condition check and here (the `$effect` saw `engraving` still
			// true and bailed, and it won't re-run on its own for that).
			scheduleEngrave();
		}
	}

	// Arm a throttled engrave. While a timer is pending or the worker is
	// running this is a no-op — the worker re-reads all three inputs and will
	// not miss a change. At most one engrave per `ENGRAVE_THROTTLE_MS`, so a
	// burst of edits collapses instead of paying a full render each.
	function scheduleEngrave(): void {
		if (!osmd || engraving || engraveTimer !== undefined) return;
		if (xml === loadedXml && zoom === appliedZoom && scoreTheme === appliedTheme) return;
		engraveTimer = setTimeout(() => {
			engraveTimer = undefined;
			void engrave();
		}, ENGRAVE_THROTTLE_MS);
	}

	$effect(() => {
		void xml;
		void zoom;
		void scoreTheme;
		scheduleEngrave();
	});

	// Re-place the cursors when the selection or the playhead position moves
	// without an edit — keyboard nav changes `selectedOnset`, and the RAF
	// loop changes `playheadWholeNotes`, neither of which touches `xml`, so
	// the re-engrave effect above doesn't run.
	let wasPlaying = false;
	$effect(() => {
		const onset = selectedOnset;
		const head = playheadWholeNotes;
		const playing = isPlaying;
		void onset;
		void head;
		if (!osmd || !renderedOnce) return;
		// Entering playback re-engages follow (a pre-playback manual scroll
		// shouldn't leave the cursor un-followed once playback starts) and
		// re-arms the "new system" tracking so the first jump lands.
		if (playing && !wasPlaying) {
			following = true;
			lastCursorSystemTop = undefined;
		}
		wasPlaying = playing;
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
		// This runs before `placeCursor()` after a re-render, so assert the
		// no-skip cursor config here too (see `keepCursorsOnEveryNote`).
		keepCursorsOnEveryNote();
		// This borrows cursor 0 (the selection marker) to probe each seam's
		// screen position, leaving it parked on the last seam — the following
		// `placeSelection()` must re-walk it, not trust its tracked spot. It
		// also `show()`s cursor 0, so keep `selectionShown` in sync or a later
		// `placeSelection()` with nothing selected would skip the `hide()` and
		// leave a stray marker on the last seam.
		selectionStale = true;
		selectionShown = true;
		const box = container.getBoundingClientRect();
		const marks: typeof seamMarks = [];
		for (const seam of seams) {
			cursor.show();
			cursor.reset();
			walkCursorTo(cursor, seam.onsetWholeNotes);
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
		// `untrack` for the same reason as the zoom/theme effect: `placeCursor()`
		// transitively reads the playback position, and this effect must only
		// react to `seams`.
		untrack(() => {
			measureSeams();
			placeCursor();
		});
	});

	// MARK: - Measure-range tint (F17)

	// Content-space rects (px within `.score-container`) for the tinted bar
	// range in Measures mode — one per system row the range crosses. Read
	// straight off OSMD's graphical measure boxes
	// (`GraphicSheet.MeasureList[measureIndex][staffIndex]`), whose
	// `AbsolutePosition` / `Size` are in the same sheet units as the click
	// hit-testing (`* 10 * Zoom` -> px). Recomputed after every re-engrave /
	// zoom / theme change and whenever `measureBand` moves.
	type BoxLike = {
		AbsolutePosition: { x: number; y: number };
		Size: { width: number; height: number };
	};
	type GraphicalMeasureLike = {
		ParentStaff?: { ParentInstrument?: { IdString?: string } };
		PositionAndShape?: BoxLike;
		ParentStaffLine?: { StaffHeight?: number; PositionAndShape?: BoxLike };
	};
	let measureBandRects = $state<
		{ key: string; top: number; left: number; width: number; height: number }[]
	>([]);

	function computeMeasureBand(): void {
		const list = (osmd?.GraphicSheet as { MeasureList?: GraphicalMeasureLike[][] } | undefined)
			?.MeasureList;
		if (!osmd || !renderedOnce || !container || !measureBand || !list) {
			measureBandRects = [];
			return;
		}
		const unit = 10 * osmd.Zoom;
		const { partId, staff } = measureBand;
		const lo = Math.min(measureBand.fromMeasure, measureBand.toMeasure);
		const hi = Math.max(measureBand.fromMeasure, measureBand.toMeasure);
		const pad = 0.7 * unit; // frame the staff with a little margin
		// One rect per system row the range crosses: union the x-range of the
		// in-range bars on that row, take the y/height from the staff itself
		// (`ParentStaffLine.StaffHeight` — a bar's own bbox height collapses to
		// almost nothing for a rest-only measure). Highlight only the staff the
		// clef edit targets (`staff`), so what's tinted is exactly what changes.
		const rows = new Map<number, { top: number; height: number; left: number; right: number }>();
		for (let mi = lo; mi <= hi; mi++) {
			const row = list[mi];
			if (!row) continue;
			const inPart = row.filter((g) => (g?.ParentStaff?.ParentInstrument?.IdString ?? '') === partId);
			const gm = inPart[Math.min(Math.max(0, staff - 1), inPart.length - 1)] ?? inPart[0];
			const box = gm?.PositionAndShape;
			if (!box) continue;
			const x = box.AbsolutePosition.x * unit;
			const w = box.Size.width * unit;
			const staffTop =
				(gm.ParentStaffLine?.PositionAndShape?.AbsolutePosition?.y ?? box.AbsolutePosition.y) * unit;
			const staffH = (gm.ParentStaffLine?.StaffHeight ?? 4) * unit;
			const rowKey = Math.round(staffTop);
			const cur = rows.get(rowKey);
			if (!cur) rows.set(rowKey, { top: staffTop, height: staffH, left: x, right: x + w });
			else {
				cur.left = Math.min(cur.left, x);
				cur.right = Math.max(cur.right, x + w);
			}
		}
		measureBandRects = [...rows.entries()].map(([rowKey, r]) => ({
			key: `${partId}:${staff}:${lo}-${hi}:${rowKey}`,
			top: r.top - pad,
			left: r.left - pad,
			width: r.right - r.left + pad * 2,
			height: r.height + pad * 2
		}));
	}

	$effect(() => {
		void measureBand;
		if (!osmd || !renderedOnce) return;
		// `untrack` for the same reason as the seam / zoom effects — keep this
		// reacting only to `measureBand`, not transitively to playback state.
		untrack(() => computeMeasureBand());
	});

	// MARK: - Page-range tint (F19)

	// Like `measureBandRects`, but spanning every part of the system (the top of
	// the topmost staff to the bottom of the lowest) for the focused page's bar
	// range — one rect per wrapped row. Same `GraphicSheet.MeasureList` geometry
	// and recompute triggers as the F17 measure band.
	let pageBandRects = $state<
		{ key: string; top: number; left: number; width: number; height: number }[]
	>([]);
	// F19 rework: two full-width veils (above the page, below the page) drawn
	// when `dimOffPage`. Same content-space coords as `pageBandRects`.
	let pageDimRects = $state<
		{ key: string; top: number; left: number; width: number; height: number }[]
	>([]);

	function computePageBand(): void {
		const list = (osmd?.GraphicSheet as { MeasureList?: GraphicalMeasureLike[][] } | undefined)
			?.MeasureList;
		if (!osmd || !renderedOnce || !container || !pageBand || !list) {
			pageBandRects = [];
			pageDimRects = [];
			return;
		}
		const unit = 10 * osmd.Zoom;
		const pad = 0.5 * unit;
		const lo = Math.max(0, Math.min(pageBand.fromMeasure, pageBand.toMeasure));
		const hi = Math.min(list.length - 1, Math.max(pageBand.fromMeasure, pageBand.toMeasure));
		// One rect per system row: for each bar in range, union the x-range and
		// the full vertical extent across every staff of every part on that bar.
		// Rows are keyed by the rounded top of that bar's highest staff, which is
		// stable across the bars sharing a system.
		const rows = new Map<number, { top: number; bottom: number; left: number; right: number }>();
		for (let mi = lo; mi <= hi; mi++) {
			const row = list[mi];
			if (!row) continue;
			let barTop = Infinity;
			let barBottom = -Infinity;
			let barLeft = Infinity;
			let barRight = -Infinity;
			for (const gm of row) {
				const box = gm?.PositionAndShape;
				if (!box) continue;
				const x = box.AbsolutePosition.x * unit;
				const w = box.Size.width * unit;
				const staffTop =
					(gm.ParentStaffLine?.PositionAndShape?.AbsolutePosition?.y ?? box.AbsolutePosition.y) *
					unit;
				const staffH = (gm.ParentStaffLine?.StaffHeight ?? 4) * unit;
				barLeft = Math.min(barLeft, x);
				barRight = Math.max(barRight, x + w);
				barTop = Math.min(barTop, staffTop);
				barBottom = Math.max(barBottom, staffTop + staffH);
			}
			if (!Number.isFinite(barTop)) continue;
			const rowKey = Math.round(barTop);
			const cur = rows.get(rowKey);
			if (!cur) rows.set(rowKey, { top: barTop, bottom: barBottom, left: barLeft, right: barRight });
			else {
				cur.left = Math.min(cur.left, barLeft);
				cur.right = Math.max(cur.right, barRight);
				cur.bottom = Math.max(cur.bottom, barBottom);
			}
		}
		const rects = [...rows.entries()].map(([rowKey, r]) => ({
			key: `page:${lo}-${hi}:${rowKey}`,
			top: r.top - pad,
			left: r.left - pad,
			width: r.right - r.left + pad * 2,
			height: r.bottom - r.top + pad * 2
		}));
		pageBandRects = rects;
		if (dimOffPage && rects.length && container) {
			const minTop = Math.min(...rects.map((r) => r.top));
			const maxBottom = Math.max(...rects.map((r) => r.top + r.height));
			const w = container.scrollWidth;
			const h = container.scrollHeight;
			pageDimRects = [
				{ key: 'dim:top', top: 0, left: 0, width: w, height: Math.max(0, minTop) },
				{ key: 'dim:bottom', top: maxBottom, left: 0, width: w, height: Math.max(0, h - maxBottom) }
			];
		} else {
			pageDimRects = [];
		}
	}

	$effect(() => {
		void pageBand;
		void dimOffPage;
		if (!osmd || !renderedOnce) return;
		untrack(() => computePageBand());
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
		{#each pageDimRects as veil (veil.key)}
			<div
				class="page-dim"
				style:top="{veil.top}px"
				style:left="{veil.left}px"
				style:width="{veil.width}px"
				style:height="{veil.height}px"
			></div>
		{/each}
		{#each pageBandRects as band (band.key)}
			<div
				class="page-band"
				style:top="{band.top}px"
				style:left="{band.left}px"
				style:width="{band.width}px"
				style:height="{band.height}px"
			></div>
		{/each}
		{#each measureBandRects as band (band.key)}
			<div
				class="measure-band"
				style:top="{band.top}px"
				style:left="{band.left}px"
				style:width="{band.width}px"
				style:height="{band.height}px"
			></div>
		{/each}
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

	/* F17: the tinted bar range in Measures mode. `pointer-events: none` so a
	   click still reaches the notehead / staff underneath (the page then
	   resolves it to the bar). Sits below the seam rules (z-index 2). */
	.measure-band {
		position: absolute;
		background: color-mix(in srgb, var(--accent) 22%, transparent);
		border: 2px solid var(--accent);
		border-radius: var(--radius-sm);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
		pointer-events: none;
		z-index: 1;
	}

	/* F19: the focused source page's bar range in the Pages review step —
	   spans the full system, sits under the F17 measure band and the seam
	   rules. A quiet wash plus firm left/right edges so the page's start and
	   end read clearly without fighting the notation. */
	.page-band {
		position: absolute;
		background: color-mix(in srgb, var(--accent) 4%, transparent);
		border-left: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
		border-right: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
		border-radius: 2px;
		pointer-events: none;
		/* Same layer as the F17 measure band; drawn earlier in the DOM so the
		   measure band paints on top when both are present. */
		z-index: 1;
	}

	/* F19 rework: the off-page veil, a near-opaque wash of the page background
	   above and below the focused page, so only the current system stays crisp.
	   Sits above the engraving and the seam rules; the page band's own strip is
	   never covered (the veils stop at its edges). */
	.page-dim {
		position: absolute;
		background: var(--bg);
		opacity: 0.72;
		pointer-events: none;
		z-index: 4;
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
