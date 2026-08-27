<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { type DisplayMode, type VisualState } from '$lib/midi/types';
	import { THEME_PALETTES, highlightedMutedInk, type ResolvedTheme } from '$lib/theme';
	// Type-only import: erased at compile time, so it can't trigger a
	// runtime module resolution during SSR. OSMD manipulates the DOM
	// directly and only ever gets *constructed* inside `onMount` below, but
	// its package ships as a CJS/UMD bundle that Vite's SSR module runner
	// can't interop with a static top-level `import { ... }` — dynamic
	// `import()` inside `onMount` (browser-only) sidesteps that entirely.
	import type {
		CursorOptions,
		OpenSheetMusicDisplay as OSMDType,
		PointF2D as PointF2DType
	} from 'opensheetmusicdisplay';

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
	 */
	let {
		xml,
		positionWholeNotes,
		displayMode,
		staffVisualStates,
		scoreTheme,
		onNoteClick,
		zoom = $bindable(1)
	}: {
		xml: string;
		positionWholeNotes: number;
		displayMode?: DisplayMode;
		staffVisualStates?: VisualState[];
		scoreTheme?: ResolvedTheme;
		onNoteClick?: (wholeNotes: number) => void;
		// Bindable rather than a plain prop — both the +/− buttons/pinch
		// gesture in here and the parent's persisted-settings restore on
		// load need to drive the same value.
		zoom?: number;
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

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 2;
	const ZOOM_STEP = 0.1;
	const CURSOR_TYPE_THIN_LEFT = 1;
	// A slight vertical scale-up reads as a nice "couple pixels over" overhang
	// on a single staff, but the same multiplier blows up badly once OSMD's
	// native cursor height already spans several staves (flat/highlighted
	// mode) — so it's only applied when exactly one staff is visible;
	// multi-staff cursors keep OSMD's own untouched geometry.
	const CURSOR_HEIGHT_SCALE = 1.75;
	// Once engaged (via `scrollCursorIntoView`), OSMD's own cursor.update()
	// keeps scrolling the cursor into view on every subsequent step for as
	// long as both `FollowCursor` and the cursor's own `follow` option stay
	// true — no custom continuous-scroll loop needed on our end. Disengages
	// the moment the human scrolls or drags manually, so it never fights
	// them.
	let following = $state(false);

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

	interface StaffBand {
		top: number;
		bottom: number;
		state: VisualState;
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
		container.addEventListener('touchstart', handleTouchStart, { passive: true });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd);
		container.addEventListener('touchcancel', handleTouchEnd);
		container.addEventListener('wheel', cancelFollow, { passive: true });
	});

	onDestroy(() => {
		container?.removeEventListener('click', handleContainerClick);
		container?.removeEventListener('touchstart', handleTouchStart);
		container?.removeEventListener('touchmove', handleTouchMove);
		container?.removeEventListener('touchend', handleTouchEnd);
		container?.removeEventListener('touchcancel', handleTouchEnd);
		container?.removeEventListener('wheel', cancelFollow);
		if (pinchRaf !== null) cancelAnimationFrame(pinchRaf);
		osmd = undefined;
	});

	function cancelFollow(): void {
		following = false;
	}

	// Two-finger pinch drives the same `zoom` state the +/− buttons do, so
	// score-only zoom works without touching the page's own bars — those
	// live outside this component entirely. Native pinch-zoom is disabled
	// on this container via `touch-action` in the stylesheet below, since
	// that's a whole-page camera pass that would scale the anchored
	// top/bottom bars right along with the score.
	let pinchState: { initialDistance: number; initialZoom: number } | null = null;
	let pinchRaf: number | null = null;
	let pendingZoom: number | null = null;

	function touchDistance(touches: TouchList): number {
		return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
	}

	function handleTouchStart(event: TouchEvent): void {
		if (event.touches.length !== 2) {
			pinchState = null;
			return;
		}
		pinchState = { initialDistance: touchDistance(event.touches), initialZoom: zoom };
	}

	function handleTouchMove(event: TouchEvent): void {
		if (event.touches.length === 1) {
			// A one-finger drag is a manual scroll/pan, not a pinch — let it
			// proceed natively, just stop auto-following since the human is
			// clearly looking somewhere else on purpose.
			cancelFollow();
			return;
		}
		if (!pinchState || event.touches.length !== 2) return;
		event.preventDefault();
		const scale = touchDistance(event.touches) / pinchState.initialDistance;
		pendingZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(pinchState.initialZoom * scale * 100) / 100));
		// Committing straight into `zoom` on every touchmove would trigger a
		// full OSMD re-render dozens of times a second — throttle to once
		// per animation frame instead.
		if (pinchRaf === null) {
			pinchRaf = requestAnimationFrame(() => {
				pinchRaf = null;
				if (pendingZoom !== null) zoom = pendingZoom;
			});
		}
	}

	function handleTouchEnd(event: TouchEvent): void {
		if (event.touches.length >= 2) return;
		pinchState = null;
		if (pinchRaf !== null) {
			cancelAnimationFrame(pinchRaf);
			pinchRaf = null;
		}
		if (pendingZoom !== null) {
			zoom = pendingZoom;
			pendingZoom = null;
		}
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
		onNoteClick?.(note.sourceNote.getAbsoluteTimestamp().RealValue);
	}

	$effect(() => {
		const currentXml = xml;
		if (!osmd || currentXml === loadedXml) return;
		loadedXml = currentXml;
		cursorReady = false;
		loadError = null;
		osmd.setOptions(osmdOptions(displayMode, scoreTheme));
		osmd
			.load(currentXml)
			.then(() => {
				osmd!.render();
				applyScoreTreatments();
				cursorReady = true;
			})
			.catch((e: unknown) => {
				loadError = String(e);
			});
	});

	$effect(() => {
		if (!cursorReady) return;
		setCursorTimestamp(positionWholeNotes);
	});

	// Re-renders at the new zoom level and re-shows the cursor — OSMD
	// rebuilds the whole graphical sheet (including the cursor element) on
	// render(), so the cursor has to be told to reappear at its current
	// position rather than surviving the re-render on its own.
	$effect(() => {
		const level = zoom;
		if (!osmd || !cursorReady) return;
		osmd.Zoom = level;
		osmd.render();
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

	// Cheap on/off toggle — no re-render needed, `FollowCursor`/the cursor's
	// own `follow` option are read live by OSMD's cursor.update() each time
	// it moves.
	$effect(() => {
		const isFollowing = following;
		if (!osmd || !cursorReady) return;
		osmd.FollowCursor = isFollowing;
		osmd.cursor.CursorOptions = cursorOptions(displayMode, scoreTheme);
	});

	function applyScoreTreatments(): void {
		showCursor();
		applyHighlightedStaffTreatment();
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
	}

	function applyHighlightedStaffTreatment(): void {
		if (!osmd) return;
		const resolved = scoreTheme ?? 'light';
		const activeColor = themeFor(displayMode, resolved).music;
		const inactiveColor = highlightedMutedInk(resolved);
		const states = staffVisualStates ?? [];
		const bands = renderedStaffBands(states);
		paintSymbolsInMutedBands(bands, activeColor, inactiveColor);
	}

	function renderedStaffBands(states: VisualState[]): StaffBand[] {
		const svg = container?.querySelector('svg');
		if (!svg || states.length === 0) return [];
		const lineCandidates = [...svg.querySelectorAll<SVGElement>('path, line')]
			.map((element) => ({ element, box: svgBox(element) }))
			.filter((entry): entry is { element: SVGElement; box: DOMRect } => entry.box !== null)
			.filter(({ box }) => box.width >= 48 && box.height <= 1);
		const lineYs = clusteredNumbers(lineCandidates.map(({ box }) => box.y + box.height / 2), 2);
		const staffLineGroups: number[][] = [];
		let currentGroup: number[] = [];

		for (const y of lineYs) {
			const previous = currentGroup[currentGroup.length - 1];
			if (previous === undefined || y - previous <= 14) {
				currentGroup.push(y);
			} else {
				if (currentGroup.length >= 5) staffLineGroups.push(currentGroup);
				currentGroup = [y];
			}
		}
		if (currentGroup.length >= 5) staffLineGroups.push(currentGroup);

		const staffCenters = staffLineGroups.map((group) => (group[0] + group[group.length - 1]) / 2);
		const bands = staffLineGroups.map((group, index) => {
			const topLine = group[0];
			const bottomLine = group[group.length - 1];
			const previous = staffCenters[index - 1];
			const current = staffCenters[index];
			const next = staffCenters[index + 1];
			return {
				top: previous === undefined ? topLine - 30 : (previous + current) / 2,
				bottom: next === undefined ? bottomLine + 30 : (current + next) / 2,
				state: states[index % states.length] ?? 'active'
			};
		});

		for (const { element, box } of lineCandidates) {
			const centerY = box.y + box.height / 2;
			const band = bands.find((candidate) => centerY >= candidate.top && centerY <= candidate.bottom);
			if (band) paintSvgElement(element, band.state === 'muted' ? highlightedMutedInk(scoreTheme ?? 'light') : themeFor(displayMode, scoreTheme).music);
		}
		return bands;
	}

	function clusteredNumbers(values: number[], tolerance: number): number[] {
		const sorted = [...values].sort((a, b) => a - b);
		const clusters: number[][] = [];
		for (const value of sorted) {
			const cluster = clusters[clusters.length - 1];
			const anchor = cluster?.[cluster.length - 1];
			if (!cluster || anchor === undefined || Math.abs(value - anchor) > tolerance) clusters.push([value]);
			else cluster.push(value);
		}
		return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
	}

	function paintSymbolsInMutedBands(bands: StaffBand[], activeColor: string, inactiveColor: string): void {
		if (bands.length === 0) return;
		const svg = container?.querySelector('svg');
		if (!svg) return;
		const symbols = svg.querySelectorAll<SVGElement>('path, line, text, rect, polygon, polyline, circle, ellipse');
		const cursorElement = osmd?.cursor.cursorElement as Node | undefined;
		for (const symbol of symbols) {
			if (symbol === cursorElement || cursorElement?.contains(symbol)) continue;
			const box = svgBox(symbol);
			if (!box || box.width + box.height === 0) continue;
			const centerY = box.y + box.height / 2;
			const band = bands.find((candidate) => centerY >= candidate.top && centerY <= candidate.bottom);
			if (!band) continue;
			paintSvgElement(symbol, band.state === 'muted' ? inactiveColor : activeColor);
		}
	}

	function svgBox(element: SVGElement): DOMRect | null {
		if (!('getBBox' in element)) return null;
		try {
			return (element as SVGGraphicsElement).getBBox();
		} catch {
			return null;
		}
	}

	function paintSvgElement(element: SVGElement, color: string): void {
		if (hasPaint(element, 'stroke')) {
			element.setAttribute('stroke', color);
			element.style.stroke = color;
		}
		if (hasPaint(element, 'fill')) {
			element.setAttribute('fill', color);
			element.style.fill = color;
		}
	}

	function hasPaint(element: SVGElement, attribute: 'stroke' | 'fill'): boolean {
		const value = element.getAttribute(attribute);
		const styleValue = element.style[attribute];
		const computed = getComputedStyle(element)[attribute];
		return [value, styleValue, computed].some((paint) => !!paint && paint !== 'none' && paint !== 'transparent');
	}

	function cursorOptions(mode: DisplayMode | undefined, activeTheme: ResolvedTheme | undefined): CursorOptions {
		const theme = themeFor(mode, activeTheme);
		return {
			type: CURSOR_TYPE_THIN_LEFT,
			color: theme.cursor,
			alpha: theme.cursorAlpha,
			follow: following
		};
	}

	function osmdOptions(mode: DisplayMode | undefined, activeTheme: ResolvedTheme | undefined) {
		const theme = themeFor(mode, activeTheme);
		return {
			autoResize: true,
			drawTitle: false,
			followCursor: following,
			coloringEnabled: true,
			colorStemsLikeNoteheads: true,
			defaultColorMusic: theme.music,
			defaultColorNotehead: theme.notehead,
			defaultColorStem: theme.stem,
			defaultColorRest: theme.rest,
			defaultColorLabel: theme.label,
			pageBackgroundColor: theme.page,
			cursorsOptions: [cursorOptions(mode, activeTheme)]
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

	/** Scrolls the container so the playback cursor is back in view, then
	 * keeps following it — for a "bring me to cursor" control next to the
	 * transport, since a human scrolling/zooming to read ahead is expected
	 * to lose the cursor off screen sometimes. Disengages the moment they
	 * scroll or drag manually (see the touch/wheel handlers below). */
	export function scrollCursorIntoView(): void {
		following = true;
		osmd?.cursor.cursorElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function zoomBy(delta: number): void {
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((zoom + delta) * 100) / 100));
	}

	function resetZoom(): void {
		zoom = 1;
	}

	/** Moves the cursor to sit on whichever voice entry is current at
	 * `target` (whole notes from the start). OSMD's cursor only supports
	 * stepping via next()/reset(), so this replays from the start whenever
	 * seeking backward rather than jumping directly. */
	function setCursorTimestamp(target: number): void {
		if (!osmd?.cursor) return;
		const iterator = osmd.cursor.iterator;
		const current = () => iterator.currentTimeStamp.RealValue;
		if (Math.abs(current() - target) < 1e-6) return;

		if (target < current()) {
			osmd.cursor.reset();
			showCursor();
		}
		// Step forward one note at a time, but undo any step that lands
		// past `target` via `previous()`. OSMD's cursor jumps between
		// discrete note onsets, so a single next() can overshoot into the
		// future; left uncorrected, next frame sees target still behind
		// that overshot position, takes the `target < current()` branch
		// above, and resets all the way back to the start — repeating
		// every frame as a beginning<->current flicker. Backing off the
		// overshoot keeps the cursor on the last note at-or-before target.
		let attempts = 0;
		while (current() < target && !iterator.EndReached && attempts < 10_000) {
			osmd.cursor.next();
			if (current() > target) {
				osmd.cursor.previous();
				break;
			}
			attempts++;
		}
		requestAnimationFrame(applyCursorTreatment);
	}
</script>

<div class="score-view" data-mode={displayMode ?? 'solo'} data-theme={scoreTheme ?? 'light'}>
	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
	</div>
	<div class="score-container" bind:this={container}></div>
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
