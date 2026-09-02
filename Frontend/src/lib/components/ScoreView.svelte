<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { type DisplayMode, type VisualState } from '$lib/midi/types';
	import { THEME_PALETTES, highlightedMutedInk, type ResolvedTheme } from '$lib/theme';
	import {
		paintableLeaves,
		renderedStaffBands,
		paintSymbolsInMutedBands
	} from '$lib/components/score/scoreTreatments';
	import { pinchZoom, clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '$lib/actions/pinchZoom';
	import { m } from '$lib/paraglide/messages';
	// Type-only import: erased at compile time, so it can't trigger a
	// runtime module resolution during SSR. OSMD manipulates the DOM
	// directly and only ever gets *constructed* inside `onMount` below, but
	// its package ships as a CJS/UMD bundle that Vite's SSR module runner
	// can't interop with a static top-level `import { ... }` — dynamic
	// `import()` inside `onMount` (browser-only) sidesteps that entirely.
	import type {
		Cursor as CursorAPI,
		CursorOptions,
		OpenSheetMusicDisplay as OSMDType,
		PointF2D as PointF2DType
	} from 'opensheetmusicdisplay';

	/** F4: one annotation's marker on the score — `ScoreView` only needs its
	 * id (to report back which one was clicked) and position, never its
	 * content/ownership (that's the parent's/`AnnotationSheet`'s concern). */
	export interface ScoreAnnotationMarker {
		id: string;
		positionWholeNotes: number;
	}

	/**
	 * Renders engraved notation (OSMD) with a moving cursor tracking
	 * `positionWholeNotes` — the same unit `cursor.iterator.currentTimeStamp`
	 * reports natively, so no ms<->index bookkeeping is needed here. Ported
	 * from the iOS app's `index.html`/`divisiSetCursorTimestamp`, now
	 * running directly in the page instead of across a WKWebView bridge.
	 *
	 * `onNoteClick`, if given, is called with the whole-notes timestamp of
	 * whichever note the user clicked, so the parent can seek playback
	 * there — this component only reports the position, it never seeks
	 * itself, matching `positionWholeNotes` staying parent-owned.
	 *
	 * F4: `annotations` renders one extra OSMD cursor per marker (OSMD
	 * natively supports several simultaneous cursors via `cursorsOptions`/
	 * `osmd.cursors` — see `applyAnnotationMarkers` below), styled as a
	 * short mark above the note rather than the full-height playback bar.
	 * When `annotateMode` is on, clicking a note calls `onAnnotationPlace`
	 * with its timestamp instead of `onNoteClick` seeking there.
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
		zoom = $bindable(1),
		rendering = $bindable(false),
		showBadge = true
	}: {
		xml: string;
		positionWholeNotes: number;
		displayMode?: DisplayMode;
		staffVisualStates?: VisualState[];
		scoreTheme?: ResolvedTheme;
		onNoteClick?: (wholeNotes: number) => void;
		annotations?: ScoreAnnotationMarker[];
		annotateMode?: boolean;
		onAnnotationPlace?: (wholeNotes: number) => void;
		onAnnotationMarkerClick?: (id: string) => void;
		// Bindable rather than a plain prop — both the +/− buttons/pinch
		// gesture in here and the parent's persisted-settings restore on
		// load need to drive the same value.
		zoom?: number;
		// Bindable out: true while OSMD is (re-)engraving a new score, so the
		// parent can dim/disable whatever control triggered the change and
		// show its own "updating" hint next to it.
		rendering?: boolean;
		// Lets the parent suppress this component's own floating badge when
		// it's showing that feedback somewhere better placed (e.g. right in
		// the Practice Setup drawer).
		showBadge?: boolean;
	} = $props();

	let container: HTMLDivElement;
	// $state (not a plain `let`): assigned asynchronously below, after
	// `onMount`'s dynamic import resolves — the effects that read `osmd`
	// need to re-run once it becomes available, which only happens for
	// reactive state, not a plain variable mutated later.
	let osmd = $state<OSMDType | undefined>(undefined);
	let loadedXml: string | undefined;
	let cursorReady = $state(false);
	let loadError = $state<string | null>(null);

	const CURSOR_TYPE_THIN_LEFT = 1;
	// F4: "short thin line on top of stave and left of the note" — reads as
	// a small mark sitting above a note rather than a full-height bar
	// through it, so an annotation marker doesn't look like a second
	// playback cursor. Both are `CursorType` enum values (OSMD's real enum
	// can't be imported as a runtime value here — only type-only imports of
	// its module are safe during SSR, see the import comment above), same
	// literal-constant approach as `CURSOR_TYPE_THIN_LEFT`.
	const CURSOR_TYPE_MARKER = 2;
	// A slight vertical scale-up reads as a nice "couple pixels over" overhang
	// on a single staff, but the same multiplier blows up badly once OSMD's
	// native cursor height already spans several staves (flat/highlighted
	// mode) — so it's only applied when exactly one staff is visible;
	// multi-staff cursors keep OSMD's own untouched geometry.
	const CURSOR_HEIGHT_SCALE = 1.75;
	// On by default. OSMD's own built-in follow-cursor (`FollowCursor` +
	// `cursor.CursorOptions.follow`) is kept permanently off below — its
	// `cursor.update()` does an animated `scrollIntoView({behavior: 'smooth'})`
	// on *every* step, not just when the cursor actually leaves view, which
	// reads as constant scroll-animation during playback. `following` here
	// instead drives our own `followCursorIfNeeded()`, called after every
	// cursor step: a plain `scrollTop`/`scrollLeft` assignment, and only when
	// the cursor's bounding box has actually left the container's viewport.
	// Disengages the moment the human scrolls or drags manually (see the
	// touch/wheel handlers below), so it never fights them — `following`
	// only comes back via the "scroll to cursor" control re-engaging it.
	let following = $state(true);

	interface ScoreColors {
		music: string;
		notehead: string;
		stem: string;
		rest: string;
		label: string;
		cursor: string;
		cursorAlpha: number;
		page: string;
	}

	// Captured from the same dynamic import as OSMD itself (see the import
	// comment above) so `handleContainerClick` can construct one — it's a
	// plain value class, not something worth a second dynamic import.
	let PointF2D: (new (x: number, y: number) => PointF2DType) | undefined;

	onMount(async () => {
		const osmdModule = await import('opensheetmusicdisplay');
		PointF2D = osmdModule.PointF2D;
		osmd = new osmdModule.OpenSheetMusicDisplay(container, osmdOptions(displayMode, scoreTheme));
		container.addEventListener('click', handleContainerClick);
		container.addEventListener('wheel', cancelFollow, { passive: true });
		window.addEventListener('resize', handleWindowResize);
	});

	onDestroy(() => {
		container?.removeEventListener('click', handleContainerClick);
		container?.removeEventListener('wheel', cancelFollow);
		window.removeEventListener('resize', handleWindowResize);
		if (resizeReapplyTimeout !== undefined) clearTimeout(resizeReapplyTimeout);
		osmd = undefined;
	});

	// OSMD's own resize handling redraws the whole graphical sheet, but on
	// its own ~200ms debounce and without ever calling back into our custom
	// cursor styling/muted-staff repaint — those only ever get (re)applied
	// from our own render calls (see the zoom/displayMode effects above).
	// Left alone, any resize (including the synthetic one +page.svelte
	// fires after unhiding this view) silently reverts the cursor to OSMD's
	// bare default the moment it redraws. Reapplying after a delay longer
	// than OSMD's own debounce, rather than immediately, makes sure that
	// redraw has actually finished first.
	let resizeReapplyTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleWindowResize(): void {
		if (resizeReapplyTimeout !== undefined) clearTimeout(resizeReapplyTimeout);
		resizeReapplyTimeout = setTimeout(() => {
			resizeReapplyTimeout = undefined;
			if (cursorReady) applyScoreTreatments();
		}, 300);
	}

	function cancelFollow(): void {
		following = false;
	}

	/** Hit-tests a click against the rendered score and, if it landed near a
	 * note, reports that note's timestamp via `onNoteClick`. Screen pixels
	 * -> OSMD's internal coordinate space is `10 * Zoom` px per unit — OSMD's
	 * own documented conversion for hit-testing (`unitInPixels`), so this
	 * stays correct across the zoom controls above without extra bookkeeping:
	 * `Zoom` already accounts for `autoResize`'s container-fit scaling, since
	 * that's the same value driving the rendered viewBox. */
	function handleContainerClick(event: MouseEvent): void {
		if (!osmd || !PointF2D || !cursorReady) return;
		const rect = container.getBoundingClientRect();
		const unitsPerPixel = 1 / (10 * osmd.Zoom);
		const clickPosition = new PointF2D(
			(event.clientX - rect.left) * unitsPerPixel,
			(event.clientY - rect.top) * unitsPerPixel
		);
		const note = osmd.GraphicSheet.GetNearestNote(clickPosition, new PointF2D(1, 1));
		if (!note) return;
		const timestamp = note.sourceNote.getAbsoluteTimestamp().RealValue;
		// F4: a click on an existing marker (its `cursorElement`) is handled
		// by that element's own listener below, which stops propagation
		// before it ever reaches here — so a click that does reach here is
		// always "place a new one"/"seek", never "open an existing marker".
		if (annotateMode) onAnnotationPlace?.(timestamp);
		else onNoteClick?.(timestamp);
	}

	// Resolves only after the browser has painted at least once. A single
	// requestAnimationFrame callback runs *before* the paint it schedules,
	// so two back-to-back guarantee one full frame has been painted in
	// between — long enough for the `rendering` badge to actually show
	// before load()/render() seize the main thread.
	function waitForPaint(): Promise<void> {
		return new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	}

	$effect(() => {
		const currentXml = xml;
		if (!osmd || currentXml === loadedXml) return;
		const osmdRef = osmd;
		loadedXml = currentXml;
		cursorReady = false;
		rendering = true;
		loadError = null;
		lastCursorSystemTop = undefined;
		osmdRef.setOptions(osmdOptions(displayMode, scoreTheme));
		// Yield a painted frame before load() and again before render() so
		// the "updating score" badge is on screen the whole time the main
		// thread is blocked, not revealed only once the work is already done.
		Promise.resolve()
			.then(waitForPaint)
			.then(() => osmdRef.load(currentXml))
			.then(waitForPaint)
			.then(() => {
				osmdRef.render();
				applyScoreTreatments();
				cursorReady = true;
			})
			.catch((e: unknown) => {
				loadError = String(e);
			})
			.finally(() => {
				rendering = false;
			});
	});

	$effect(() => {
		if (!cursorReady) return;
		setCursorTimestamp(positionWholeNotes);
	});

	/** OSMD's `render()` rebuilds the whole graphical sheet from scratch —
	 * the container's content height changes (zoom) or reflows (display
	 * mode), so a plain `scrollTop` left untouched no longer points at the
	 * same music: zooming in, in particular, was throwing away whatever
	 * the singer had scrolled to and dropping them back near the top.
	 * Anchors on the vertical *center* of the viewport as a fraction of
	 * total content height, measured before the re-render and restored
	 * right after — an approximation (it doesn't track a specific note),
	 * but keeps "roughly what I was looking at" roughly in view instead of
	 * losing your place on every zoom step. */
	function renderPreservingScroll(): void {
		if (!osmd) return;
		const oldHeight = container.scrollHeight;
		const anchor = oldHeight > 0 ? (container.scrollTop + container.clientHeight / 2) / oldHeight : 0;
		osmd.render();
		const newHeight = container.scrollHeight;
		container.scrollTop = anchor * newHeight - container.clientHeight / 2;
	}

	// Re-renders at the new zoom level and re-shows the cursor — OSMD
	// rebuilds the whole graphical sheet (including the cursor element) on
	// render(), so the cursor has to be told to reappear at its current
	// position rather than surviving the re-render on its own.
	$effect(() => {
		const level = zoom;
		if (!osmd || !cursorReady) return;
		osmd.Zoom = level;
		renderPreservingScroll();
		applyScoreTreatments();
	});

	$effect(() => {
		const mode = displayMode;
		const theme = scoreTheme;
		staffVisualStates;
		if (!osmd || !cursorReady) return;
		osmd.setOptions(osmdOptions(mode, theme));
		osmd.render();
		applyScoreTreatments();
	});

	// F4: `cursorsOptions` (built by `osmdOptions`) has to actually contain
	// one entry per marker before `osmd.cursors[i + 1]` exists to position —
	// a plain re-render without first widening/narrowing that array via
	// `setOptions` wouldn't add or drop cursor objects to match a changed
	// annotation count.
	$effect(() => {
		annotations;
		if (!osmd || !cursorReady) return;
		osmd.setOptions(osmdOptions(displayMode, scoreTheme));
		osmd.render();
		applyScoreTreatments();
	});

	function applyScoreTreatments(): void {
		showCursor();
		applyHighlightedStaffTreatment();
		applyAnnotationMarkers();
	}

	function showCursor(): void {
		if (!osmd) return;
		osmd.cursor.CursorOptions = cursorOptions(displayMode, scoreTheme);
		osmd.cursor.show();
		requestAnimationFrame(applyCursorTreatment);
	}

	function applyCursorTreatment(): void {
		const element = osmd?.cursor.cursorElement;
		if (!element) return;
		const singleStaff = (staffVisualStates?.length ?? 0) <= 1;
		if (singleStaff) {
			element.style.transform = `scaleY(${CURSOR_HEIGHT_SCALE})`;
			element.style.transformOrigin = 'center center';
		} else {
			element.style.transform = '';
			element.style.transformOrigin = '';
		}
		element.style.width = '3px';
		element.style.borderRadius = '999px';
		element.style.pointerEvents = 'none';
		applyCurrentNoteTreatment();
		followCursorIfNeeded();
	}

	// SVG elements (noteheads + stems) currently wearing the `.current-note`
	// accent class, so the next step can un-mark exactly them rather than
	// needing to know what color they're "supposed" to revert to — a plain
	// CSS class toggle, not `GraphicalNote.setColor()` (which mutates the
	// SVG directly with no way back), so un-marking just lets whatever
	// `applyHighlightedStaffTreatment` already painted show through again,
	// untouched.
	let currentNoteElements: HTMLElement[] = [];

	/** Accent-colors the notehead(s)/stem(s) the cursor is currently sitting
	 * on. Reaches into VexFlow-specific accessors (`getNoteheadSVGs`/
	 * `getStemSVG`) that aren't on the base `GraphicalNote` type — safe here
	 * since OSMD only ships the VexFlow SVG backend, the one this component
	 * already assumes elsewhere (`GetNearestNote` hit-testing, etc).
	 * `paintableLeaves` (see `score/scoreTreatments`) drills each returned
	 * VexFlow group down to the actual painted leaves. */
	function applyCurrentNoteTreatment(): void {
		for (const element of currentNoteElements) element.classList.remove('current-note');
		currentNoteElements = [];
		if (!osmd?.cursor) return;
		const notes = osmd.cursor.GNotesUnderCursor() as unknown as Array<{
			getNoteheadSVGs?: () => HTMLElement[];
			getStemSVG?: () => HTMLElement | undefined;
			getFlagSVG?: () => HTMLElement | undefined;
			getModifierSVGs?: () => HTMLElement[];
		}>;
		for (const note of notes) {
			for (const group of note.getNoteheadSVGs?.() ?? []) {
				for (const element of paintableLeaves(group)) {
					element.classList.add('current-note');
					currentNoteElements.push(element);
				}
			}
			const stem = note.getStemSVG?.();
			if (stem) {
				for (const element of paintableLeaves(stem)) {
					element.classList.add('current-note');
					currentNoteElements.push(element);
				}
			}
			// The flag ("tail") on an unbeamed eighth-note-or-shorter note —
			// same `<g>`-wrapping-a-leaf shape as the notehead, so it needs
			// the same drill-down.
			const flag = note.getFlagSVG?.();
			if (flag) {
				for (const element of paintableLeaves(flag)) {
					element.classList.add('current-note');
					currentNoteElements.push(element);
				}
			}
			// Everything else VexFlow attaches to the note as a "modifier" —
			// accidentals (sharp/flat/natural), augmentation dots,
			// articulations — all live in one shared `vf-modifiers` group.
			for (const group of note.getModifierSVGs?.() ?? []) {
				for (const element of paintableLeaves(group)) {
					element.classList.add('current-note');
					currentNoteElements.push(element);
				}
			}
		}
	}

	function applyHighlightedStaffTreatment(): void {
		if (!osmd) return;
		const resolved = scoreTheme ?? 'light';
		const activeColor = themeFor(displayMode, resolved).music;
		const inactiveColor = highlightedMutedInk(resolved);
		const states = staffVisualStates ?? [];
		const svg = container?.querySelector('svg') ?? null;
		const bands = renderedStaffBands(svg, states, activeColor, inactiveColor);
		paintSymbolsInMutedBands(
			svg,
			osmd?.cursor.cursorElement as Node | undefined,
			bands,
			activeColor,
			inactiveColor
		);
	}

	function cursorOptions(mode: DisplayMode | undefined, activeTheme: ResolvedTheme | undefined): CursorOptions {
		const theme = themeFor(mode, activeTheme);
		return {
			type: CURSOR_TYPE_THIN_LEFT,
			color: theme.cursor,
			alpha: theme.cursorAlpha,
			// Always off — OSMD's own follow-cursor animates a scrollIntoView
			// on every step (see the `following` declaration comment above);
			// `followCursorIfNeeded()` replaces it with our own instant jump.
			follow: false
		};
	}

	// F4: a fixed color rather than a theme token — deliberately distinct
	// from the playback cursor's accent color (which already means "current
	// position") and from the highlighted/muted staff palette, so a marker
	// reads as its own kind of mark at a glance. Placeholder values (an
	// amber Anthropic hasn't design-reviewed) — a real design pass, if the
	// human wants one, belongs in `$lib/theme.ts` alongside the other
	// tokens, not hardcoded here.
	function markerColor(activeTheme: ResolvedTheme | undefined): string {
		return (activeTheme ?? 'light') === 'dark' ? '#fbbf24' : '#b45309';
	}

	function markerCursorOptions(activeTheme: ResolvedTheme | undefined): CursorOptions {
		return {
			type: CURSOR_TYPE_MARKER,
			color: markerColor(activeTheme),
			alpha: 1,
			follow: false
		};
	}

	function osmdOptions(mode: DisplayMode | undefined, activeTheme: ResolvedTheme | undefined) {
		const theme = themeFor(mode, activeTheme);
		return {
			autoResize: true,
			drawTitle: false,
			followCursor: false,
			coloringEnabled: true,
			colorStemsLikeNoteheads: true,
			defaultColorMusic: theme.music,
			defaultColorNotehead: theme.notehead,
			defaultColorStem: theme.stem,
			defaultColorRest: theme.rest,
			defaultColorLabel: theme.label,
			pageBackgroundColor: theme.page,
			// Index 0 is always the playback cursor (`osmd.cursor`); one more
			// entry per annotation marker follows, positioned/styled by
			// `applyAnnotationMarkers` via `osmd.cursors[i + 1]`.
			cursorsOptions: [cursorOptions(mode, activeTheme), ...annotations.map(() => markerCursorOptions(activeTheme))]
		};
	}

	function themeFor(mode: DisplayMode | undefined, activeTheme: ResolvedTheme | undefined) {
		const resolved = activeTheme ?? 'light';
		const palette = THEME_PALETTES[resolved];
		const alpha = resolved === 'dark' ? 0.86 : 0.92;
		return {
			music: palette.ink,
			notehead: palette.ink,
			stem: palette.ink,
			rest: palette.muted,
			label: palette.muted,
			cursor: palette.accent,
			cursorAlpha: alpha,
			page: palette.surface
		} satisfies ScoreColors;
	}

	/** `container` (`.score-container`) only actually scrolls horizontally
	 * (`overflow-x: auto`) — vertical overflow isn't clipped here at all, it
	 * expands into whatever ancestor scrolls instead (`.score-area` on the
	 * player page). So "the scroll container" is different per axis, and
	 * neither one is necessarily `container` itself; this walks up from
	 * `container` to find whichever ancestor is actually the scrolling
	 * element for a given axis. */
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

	/** Centers whichever ancestor actually scrolls on the cursor element via
	 * a direct `scrollTop`/`scrollLeft` assignment — an instant jump, never
	 * an animated scroll (unlike OSMD's own built-in follow-cursor,
	 * permanently disabled above, which uses
	 * `scrollIntoView({behavior: 'smooth', ...})`). */
	function jumpToCursor(): void {
		const element = osmd?.cursor.cursorElement;
		if (!element || !container) return;
		const elementRect = element.getBoundingClientRect();
		const verticalScroller = nearestScrollable(container, 'y');
		if (verticalScroller) {
			const scrollerRect = verticalScroller.getBoundingClientRect();
			verticalScroller.scrollTop +=
				elementRect.top + elementRect.height / 2 - (scrollerRect.top + scrollerRect.height / 2);
		}
		const horizontalScroller = nearestScrollable(container, 'x');
		if (horizontalScroller) {
			const scrollerRect = horizontalScroller.getBoundingClientRect();
			horizontalScroller.scrollLeft +=
				elementRect.left + elementRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2);
		}
	}

	// OSMD sets `cursorElement.style.top` to an absolute, scroll-independent
	// pixel offset within the rendered score — constant while the cursor
	// moves horizontally through a system, and only changing when it moves
	// to a new system (row) or page. Tracking that (rather than only
	// reacting once the cursor visually leaves the viewport) is what lets
	// `followCursorIfNeeded` recenter on every new system, not just once the
	// cursor would otherwise scroll off screen. Reset to `undefined`
	// whenever a new score loads (see the xml-load effect above), so the
	// first system of a fresh piece still counts as "changed".
	let lastCursorSystemTop: number | undefined;

	function currentCursorSystemTop(): number | undefined {
		const raw = osmd?.cursor.cursorElement?.style.top;
		if (!raw) return undefined;
		const parsed = parseFloat(raw);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	/** Called after every cursor step while `following` is on. Recenters
	 * whenever the cursor has moved to a new system (row/page) — keeping the
	 * current system centered rather than waiting for the cursor to actually
	 * scroll off screen — and otherwise only nudges horizontally if zoom/pan
	 * has pushed it out of view sideways within the same system. */
	function followCursorIfNeeded(): void {
		if (!following) return;
		const element = osmd?.cursor.cursorElement;
		if (!element || !container) return;
		const currentTop = currentCursorSystemTop();
		if (currentTop !== undefined && currentTop !== lastCursorSystemTop) {
			lastCursorSystemTop = currentTop;
			jumpToCursor();
			return;
		}
		const elementRect = element.getBoundingClientRect();
		const horizontalScroller = nearestScrollable(container, 'x');
		const outOfViewX = horizontalScroller
			? (() => {
					const r = horizontalScroller.getBoundingClientRect();
					return elementRect.left < r.left || elementRect.right > r.right;
				})()
			: false;
		if (outOfViewX) jumpToCursor();
	}

	/** Scrolls the container so the playback cursor is back in view, then
	 * keeps following it — for a "bring me to cursor" control next to the
	 * transport, since a human scrolling/zooming to read ahead is expected
	 * to lose the cursor off screen sometimes. Disengages the moment they
	 * scroll or drag manually (see the touch/wheel handlers below). */
	export function scrollCursorIntoView(): void {
		following = true;
		jumpToCursor();
		lastCursorSystemTop = currentCursorSystemTop();
	}

	function zoomBy(delta: number): void {
		zoom = clampZoom(zoom + delta);
	}

	function resetZoom(): void {
		zoom = 1;
	}

	/** Steps `cursor` forward one note at a time until it reaches (or just
	 * passes, then backs off one) `target` — shared by the playback
	 * cursor's `setCursorTimestamp` and the annotation markers'
	 * `applyAnnotationMarkers` below. Assumes `cursor` is already
	 * positioned at-or-before `target` (both callers `reset()`/check that
	 * before calling this); OSMD's cursor only supports stepping via
	 * next()/previous(), no direct jump. */
	function stepCursorTo(cursor: CursorAPI, target: number): void {
		const iterator = cursor.iterator;
		const current = () => iterator.currentTimeStamp.RealValue;
		// Step forward one note at a time, but undo any step that lands
		// past `target` via `previous()`. OSMD's cursor jumps between
		// discrete note onsets, so a single next() can overshoot into the
		// future — backing off the overshoot keeps the cursor on the last
		// note at-or-before target instead.
		let attempts = 0;
		while (current() < target && !iterator.EndReached && attempts < 10_000) {
			cursor.next();
			if (current() > target) {
				cursor.previous();
				break;
			}
			attempts++;
		}
	}

	/** Moves the playback cursor to sit on whichever voice entry is current
	 * at `target` (whole notes from the start). Only resets to the start
	 * when seeking backward — called every animation frame during playback
	 * (see `+page.svelte`'s `tick()`), so re-walking from 0 on every call
	 * would be needlessly expensive for the common case of just advancing. */
	function setCursorTimestamp(target: number): void {
		if (!osmd?.cursor) return;
		const iterator = osmd.cursor.iterator;
		const current = () => iterator.currentTimeStamp.RealValue;
		if (Math.abs(current() - target) < 1e-6) return;

		if (target < current()) {
			osmd.cursor.reset();
			showCursor();
		}
		stepCursorTo(osmd.cursor, target);
		requestAnimationFrame(applyCursorTreatment);
	}

	// F4: DOM elements OSMD created for the *previous* render's annotation
	// markers — `render()` tears down and rebuilds the whole graphical
	// sheet (see the playback cursor's own version of this note above), so
	// every call has to re-bind click handling on whatever fresh elements
	// exist now rather than assuming last time's still do.
	function applyAnnotationMarkers(): void {
		if (!osmd?.cursors) return;
		for (let i = 0; i < annotations.length; i++) {
			const marker = annotations[i];
			// Index 0 is always the playback cursor (see `osmdOptions`).
			const cursor = osmd.cursors[i + 1];
			if (!cursor) continue;
			cursor.reset();
			stepCursorTo(cursor, marker.positionWholeNotes);
			cursor.show();
			const element = cursor.cursorElement;
			if (!element) continue;
			element.style.pointerEvents = 'auto';
			element.style.cursor = 'pointer';
			element.title = m.piece_annotation_marker_title();
			element.onclick = (event: MouseEvent) => {
				// Stops this from also reaching `handleContainerClick` on
				// `container` (this element is inside it) — a click on an
				// existing marker opens it, never seeks/places a new one.
				event.stopPropagation();
				onAnnotationMarkerClick?.(marker.id);
			};
		}
	}
</script>

<div class="score-view" data-mode={displayMode ?? 'solo'} data-theme={scoreTheme ?? 'light'} data-annotate={annotateMode}>
	<div class="zoom-controls">
		{#if annotateMode}
			<!-- F4: the only cue (besides the parent's own "Cancel"/toggle
			     control) that a tap on the score places a marker instead of
			     seeking — a plain text hint here rather than a color change on
			     the whole score, which would fight the display-mode/muted-staff
			     coloring already using color to mean something else. -->
			<span class="annotate-hint">{m.piece_tap_to_place_annotation()}</span>
		{/if}
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={m.zoom_out()}>−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={m.zoom_in()}>+</button>
	</div>
	<div
		class="score-container"
		class:annotate-mode={annotateMode}
		bind:this={container}
		use:pinchZoom={{ zoom, onZoom: (z) => (zoom = z), onPan: cancelFollow }}
	></div>
	{#if rendering && showBadge}
		<div class="render-status" role="status" aria-live="polite">
			<span class="render-status__dot" aria-hidden="true"></span>
			{m.piece_updating_score()}
		</div>
	{/if}
	{#if loadError}
		<p class="error">{loadError}</p>
	{/if}
</div>

<style>
	.score-view {
		--score-page: var(--surface);
		--score-chrome: var(--surface-2);
		--score-chrome-border: var(--border);
		--score-button: var(--surface);
		--score-button-hover: color-mix(in srgb, var(--accent) 15%, var(--surface));
		--score-button-active: var(--accent);
		--score-button-active-text: var(--accent-contrast);
		--score-button-text: var(--text);
	}

	.zoom-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.25rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--score-chrome-border);
		background: var(--score-chrome);
		/* `.score-view` itself doesn't scroll — the score's vertical scroll
		   happens on an ancestor (`.score-area` in the player page) — so
		   `sticky` pins this to that ancestor's viewport top instead of
		   scrolling away with the score content above it. */
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
	/* Pinned near the top of the viewport, not just the score — so the badge
	   is still visible when a Practice Setup change is made with the drawer
	   open over the score (on mobile the drawer covers it entirely). Offset
	   down far enough to clear the player's own top bar (back button +
	   title). `pointer-events: none` so it never eats a tap underneath it. */
	.render-status {
		position: fixed;
		top: calc(3.5rem + env(safe-area-inset-top, 0px));
		left: 50%;
		transform: translateX(-50%);
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--score-chrome-border);
		border-radius: var(--radius-full);
		background: var(--score-chrome);
		box-shadow: var(--shadow);
		color: var(--score-button-text);
		font-size: 0.8125rem;
		font-weight: 650;
		pointer-events: none;
	}
	.render-status__dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--score-button-active);
		animation: render-status-pulse 0.9s ease-in-out infinite;
	}
	@keyframes render-status-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.75);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.render-status__dot {
			animation: none;
			opacity: 0.8;
		}
	}
	.annotate-hint {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.score-container {
		width: 100%;
		overflow-x: auto;
		cursor: pointer;
		background: var(--score-page);
		border-radius: 0;
		padding: 0;
		/* Keep native panning (both axes — this container can scroll
		   horizontally too, see overflow-x above) but hand pinch-zoom to our
		   own gesture handler instead of the browser's native whole-page
		   zoom, which would scale the app's fixed top/bottom bars too. */
		touch-action: pan-x pan-y;
	}
	/* F4: the only whole-score cue that taps place a marker right now — see
	   `.annotate-hint`'s comment above for why nothing on the score's own
	   coloring changes. */
	.score-container.annotate-mode {
		cursor: crosshair;
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}

	.score-container :global(svg) {
		display: block;
		min-width: 100%;
		background: var(--score-page);
	}

	/* The notehead(s)/stem the cursor is currently on — `!important` since
	   it has to win over `paintSymbolsInMutedBands`'s inline fill/stroke,
	   which doesn't know to skip these elements. Toggled via `classList`
	   in `applyCurrentNoteTreatment`, not scoped to this component's own
	   markup (OSMD renders these into `container` itself), hence `:global`. */
	.score-container :global(.current-note) {
		fill: var(--accent) !important;
		stroke: var(--accent) !important;
	}

	.error {
		color: var(--danger);
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
	}
</style>
