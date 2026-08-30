<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	// Type-only import — see ScoreView.svelte's identical comment on why OSMD
	// (and here, pdf.js) needs a dynamic `import()` inside `onMount` rather
	// than a static top-level one: both are DOM/worker-dependent packages
	// SvelteKit's SSR can't statically import, and this route already
	// disables SSR (`+page.ts`) for exactly this reason.
	import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import {
		MarkupApiError,
		createStamp,
		createStroke,
		deleteMark,
		listMarks,
		type MarkupMark
	} from '$lib/api/pieceMarkup';
	import { m } from '$lib/paraglide/messages';

	/**
	 * Renders a PDF with our own zoom controls (+/- buttons and a two-finger
	 * pinch gesture, both driving the same `zoom` state) instead of an
	 * `<iframe>` — mobile Safari's iframe-embedded PDF viewer turned out to
	 * be a stripped-down build with no toolbar and no pinch-zoom at all,
	 * a platform limitation no CSS/JS from outside the iframe can fix.
	 * Rendering via pdf.js onto canvases gives identical zoom behavior on
	 * every platform, matching ScoreView's own zoom controls.
	 *
	 * When `canMarkup` is on, also renders a piaScore-style freehand
	 * drawing layer on top of each page — pen strokes and stamps, personal
	 * only (see `$lib/api/pieceMarkup.ts`). Points are stored as fractions
	 * of the page's own rendered *width* (not a 0-1-per-axis square), so a
	 * stroke's thickness reads the same in both directions and a mark
	 * stays correctly placed across zoom levels without any conversion.
	 */
	let {
		pdfUrl,
		zoom = $bindable(1),
		active = true,
		pieceId,
		canMarkup = false
	}: {
		pdfUrl: string;
		zoom?: number;
		/** Whether this view is the one currently shown (vs. sitting behind a
		 * `display: none` sibling pane, per the parent route's "both panes
		 * stay mounted" comment). A `ResizeObserver` never delivers an entry
		 * for a target with no box while hidden, so if this loads while the
		 * PDF pane isn't the active tab, `container.clientWidth` is 0 and
		 * `computeBaseScaleAndRender` bails out — nothing else would ever
		 * retry it once the tab is switched. Re-checking on the `false` ->
		 * `true` transition covers that case. */
		active?: boolean;
		/** The real Backend piece id marks are stored against — `undefined`
		 * for a bundled fixture PDF (no real `Piece` row to key marks to). */
		pieceId?: string;
		/** Whether to show the drawing toolbar/layer at all — the parent
		 * gates this on "logged in + a real Backend piece", same condition
		 * `piece/[id]/+page.svelte` already used for the score annotation
		 * feature. */
		canMarkup?: boolean;
	} = $props();

	const MIN_ZOOM = 0.5;
	const MAX_ZOOM = 2;
	const ZOOM_STEP = 0.1;

	let container: HTMLDivElement;
	let pageCount = $state(0);
	let canvasRefs: HTMLCanvasElement[] = $state([]);
	let doc: PDFDocumentProxy | undefined;
	// `getDocument()` returns this *loading task*, distinct from the
	// `PDFDocumentProxy` its `.promise` resolves to — `.destroy()` (for
	// cleanup) only exists on the task, not the resolved proxy.
	let loadingTask: PDFDocumentLoadingTask | undefined;
	// The scale that makes one PDF point fill the container's width at
	// zoom=1 — recomputed on load and on container resize, same "fit then
	// zoom from there" idea as ScoreView's OSMD `autoResize`.
	let baseScale = $state(1);
	let loadedUrl: string | undefined;
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let renderToken = 0;

	// --- Markup (freehand drawing) ---

	/** `height / width` of each page's rendered canvas, at whatever scale it
	 * was last drawn at — since both dimensions scale by the same factor on
	 * zoom, this ratio stays constant regardless of zoom level, and is what
	 * lets the SVG overlay's `viewBox` exactly match the page's true shape
	 * (see `strokePathD`'s point-space doc above). Populated in
	 * `renderAllPages`, once real page dimensions are known. */
	let pageAspects = $state<number[]>([]);
	let marks = $state<MarkupMark[]>([]);
	let marksLoadedForPiece: string | undefined;

	type MarkupTool = 'pen' | 'stamp' | 'eraser' | null;
	let tool = $state<MarkupTool>(null);
	const PEN_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#111827'];
	const PEN_WIDTHS = [0.0018, 0.003, 0.005];
	let penColor = $state(PEN_COLORS[0]);
	let penWidth = $state(PEN_WIDTHS[1]);

	const STAMPS: { type: string; glyph: string; label: () => string }[] = [
		{ type: 'breath', glyph: '’', label: () => m.markup_stamp_breath() },
		{ type: 'accent', glyph: '>', label: () => m.markup_stamp_accent() },
		{ type: 'fermata', glyph: '\u{1D110}', label: () => m.markup_stamp_fermata() },
		{ type: 'staccato', glyph: '·', label: () => m.markup_stamp_staccato() },
		{ type: 'circle', glyph: '○', label: () => m.markup_stamp_circle() },
		{ type: 'star', glyph: '★', label: () => m.markup_stamp_star() }
	];
	let stampType = $state(STAMPS[0].type);

	// Both read directly in the template (the live-stroke preview, the
	// Undo button's disabled state) alongside `activeStroke`/`marks`, so
	// both need to be real `$state` too, not plain bookkeeping — a plain
	// `let` here only happened to work by luck of update ordering, which
	// `svelte-check` correctly flagged.
	let activeStrokePage = $state(-1);
	let activeStroke = $state<[number, number][] | null>(null);
	// Ids created this browser session, oldest first — undo pops the last
	// one. Deliberately not persisted/restored across reloads; a session-
	// local stack, same as any ordinary pen-and-paper undo would be.
	let recentMarkIds = $state<string[]>([]);
	let markupError = $state<string | null>(null);

	$effect(() => {
		const id = pieceId;
		if (!canMarkup || !id || marksLoadedForPiece === id) return;
		marksLoadedForPiece = id;
		void loadMarks(id);
	});

	async function loadMarks(id: string): Promise<void> {
		try {
			marks = await listMarks(id);
		} catch {
			// A failed load just means no prior marks show yet — not worth a
			// blocking error state on top of the PDF's own; the toolbar still
			// works and a new mark's own save will surface its own error if
			// the Backend is genuinely unreachable.
		}
	}

	function marksForPage(pageIndex: number): MarkupMark[] {
		const pageNumber = pageIndex + 1;
		return marks.filter((mark) => mark.pageNumber === pageNumber);
	}

	/** SVG path `d` for a stroke's point list — a plain polyline (move to
	 * the first point, line to every point after), not a smoothed curve.
	 * Good enough for handwriting-speed input; a curve-fit pass is a
	 * possible later polish, not attempted here. */
	function strokePathD(points: [number, number][]): string {
		if (points.length === 0) return '';
		return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
	}

	function stampGlyph(type: string | null): string {
		return STAMPS.find((s) => s.type === type)?.glyph ?? '?';
	}

	function setTool(next: MarkupTool): void {
		tool = tool === next ? null : next;
		activeStroke = null;
	}

	function markupErrorMessage(err: unknown): string {
		return err instanceof MarkupApiError ? err.message : m.errors_could_not_reach_server();
	}

	/** Converts a pointer event into page-space coordinates: both x *and* y
	 * are fractions of the page's rendered *width* (not width/height
	 * respectively) — see the component doc comment above for why. */
	function pointFromEvent(event: PointerEvent, pageIndex: number): [number, number] | null {
		const canvas = canvasRefs[pageIndex];
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0) return null;
		return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.width];
	}

	function handleMarkupPointerDown(event: PointerEvent, pageIndex: number): void {
		if (!canMarkup || !tool) return;
		const point = pointFromEvent(event, pageIndex);
		if (!point) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		if (tool === 'pen') {
			activeStrokePage = pageIndex;
			activeStroke = [point];
		} else if (tool === 'stamp') {
			void placeStamp(pageIndex, point);
		} else if (tool === 'eraser') {
			eraseNear(pageIndex, point);
		}
	}

	function handleMarkupPointerMove(event: PointerEvent, pageIndex: number): void {
		if (tool === 'pen' && activeStroke !== null && activeStrokePage === pageIndex) {
			const point = pointFromEvent(event, pageIndex);
			if (point) activeStroke = [...activeStroke, point];
		} else if (tool === 'eraser' && event.buttons === 1) {
			const point = pointFromEvent(event, pageIndex);
			if (point) eraseNear(pageIndex, point);
		}
	}

	async function handleMarkupPointerUp(): Promise<void> {
		const points = activeStroke;
		const pageIndex = activeStrokePage;
		activeStroke = null;
		// A plain tap (no real drag) isn't a stroke worth saving.
		if (tool !== 'pen' || !points || points.length < 2 || !pieceId) return;
		markupError = null;
		try {
			const created = await createStroke(pieceId, pageIndex + 1, penColor, penWidth, points);
			marks = [...marks, created];
			recentMarkIds = [...recentMarkIds, created.id];
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	async function placeStamp(pageIndex: number, point: [number, number]): Promise<void> {
		if (!pieceId) return;
		markupError = null;
		try {
			const created = await createStamp(pieceId, pageIndex + 1, penColor, stampType, point[0], point[1]);
			marks = [...marks, created];
			recentMarkIds = [...recentMarkIds, created.id];
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	// Page-width fractions — matches the point-space `pointFromEvent` uses,
	// so this stays a sensible hit-test radius at any zoom level.
	const ERASE_RADIUS = 0.02;

	function distanceToSegment(a: [number, number], b: [number, number], p: [number, number]): number {
		const [ax, ay] = a;
		const [bx, by] = b;
		const [px, py] = p;
		const dx = bx - ax;
		const dy = by - ay;
		const lengthSq = dx * dx + dy * dy;
		const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
		return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
	}

	function distanceToStroke(points: [number, number][], point: [number, number]): number {
		let min = Infinity;
		for (let i = 0; i < points.length - 1; i++) {
			min = Math.min(min, distanceToSegment(points[i], points[i + 1], point));
		}
		return min;
	}

	function eraseNear(pageIndex: number, point: [number, number]): void {
		const hit = marksForPage(pageIndex).find((mark) => {
			if (mark.kind === 'stamp') {
				return mark.x !== null && mark.y !== null && Math.hypot(mark.x - point[0], mark.y - point[1]) < ERASE_RADIUS;
			}
			return mark.points !== null && distanceToStroke(mark.points, point) < ERASE_RADIUS;
		});
		if (hit) void removeMark(hit.id);
	}

	async function removeMark(id: string): Promise<void> {
		if (!pieceId) return;
		marks = marks.filter((mark) => mark.id !== id);
		recentMarkIds = recentMarkIds.filter((recentId) => recentId !== id);
		markupError = null;
		try {
			await deleteMark(pieceId, id);
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	function undoLastMark(): void {
		const lastId = recentMarkIds[recentMarkIds.length - 1];
		if (lastId) void removeMark(lastId);
	}

	onMount(() => {
		const resizeObserver = new ResizeObserver(() => {
			if (doc) void computeBaseScaleAndRender(doc);
		});
		resizeObserver.observe(container);
		container.addEventListener('touchstart', handleTouchStart, { passive: true });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd);
		container.addEventListener('touchcancel', handleTouchEnd);
		return () => {
			resizeObserver.disconnect();
			container.removeEventListener('touchstart', handleTouchStart);
			container.removeEventListener('touchmove', handleTouchMove);
			container.removeEventListener('touchend', handleTouchEnd);
			container.removeEventListener('touchcancel', handleTouchEnd);
		};
	});

	onDestroy(() => {
		if (pinchRaf !== null) cancelAnimationFrame(pinchRaf);
		void loadingTask?.destroy();
	});

	$effect(() => {
		const url = pdfUrl;
		if (url === loadedUrl) return;
		loadedUrl = url;
		void load(url);
	});

	async function load(url: string): Promise<void> {
		loading = true;
		loadError = null;
		const token = ++renderToken;
		const previousTask = loadingTask;
		try {
			const pdfjsLib = await import('pdfjs-dist');
			const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
			const task = pdfjsLib.getDocument({ url });
			loadingTask = task;
			const loaded = await task.promise;
			if (token !== renderToken) {
				void task.destroy();
				return;
			}
			void previousTask?.destroy();
			doc = loaded;
			pageCount = loaded.numPages;
			canvasRefs = [];
			// The {#each} that creates the <canvas> elements only mounts once
			// `loading` is false (see the template's {#if loading}/{:else}) —
			// so `loading` has to flip first, then `tick()` waits for that DOM
			// update to actually land, before `canvasRefs` has anything real
			// in it to render into. Doing this in the other order (as before)
			// left every page's `canvasRefs[i]` undefined on first load, so
			// `renderAllPages` silently skipped all of them and the PDF only
			// appeared once some later action (e.g. a zoom click) re-ran it.
			loading = false;
			await tick();
			await computeBaseScaleAndRender(loaded);
		} catch (e) {
			loadError = String(e);
			loading = false;
		}
	}

	// On a plain navigation the PDF fetch is slow enough that by the time it
	// resolves, the page's own layout has long since settled — masking a
	// race where `container.clientWidth` is still 0 right after mount. A
	// reload can be fast enough (PDF served from cache) to actually hit that
	// window, especially when this pane is the persisted default and so is
	// already `active` at first render — no hidden->visible transition ever
	// happens for the `active`-prop effect below to catch, and the
	// `ResizeObserver`'s one guaranteed initial callback fires at mount
	// (before `doc` exists) with nothing left to retry it once the real
	// size does show up, since the size never actually changes again after
	// that. Retrying a few frames instead of bailing once covers it either
	// way. `attempt` bounds it (~0.5s) rather than risking a runaway loop if
	// the container is genuinely, persistently zero-width.
	async function computeBaseScaleAndRender(pdf: PDFDocumentProxy, attempt = 0): Promise<void> {
		if (!container.clientWidth) {
			if (attempt >= 30) return;
			requestAnimationFrame(() => {
				if (doc === pdf) void computeBaseScaleAndRender(pdf, attempt + 1);
			});
			return;
		}
		const firstPage = await pdf.getPage(1);
		const naturalWidth = firstPage.getViewport({ scale: 1 }).width;
		baseScale = container.clientWidth / naturalWidth;
		await renderAllPages(pdf);
	}

	// Load/resize/zoom/the `active` transition can all independently decide
	// a render pass is needed, and on a fast (e.g. cache-served) reload
	// several of those can fire within the same tick. The `token` check
	// below only ever runs *between* pages, so it doesn't stop two calls
	// racing on the *same* page: pdf.js throws if `page.render()` is called
	// again on a canvas that already has one in flight, which silently
	// killed everything after whatever page was mid-render — "only the
	// first page/segment shows" and stays that way, since nothing retries a
	// call that died to an uncaught rejection. Tracking (and cancelling) any
	// in-flight `RenderTask` per canvas before starting a new one on it
	// closes that race properly, rather than just reducing how often it's
	// hit.
	let activeRenderTasks: (RenderTask | undefined)[] = [];

	async function renderAllPages(pdf: PDFDocumentProxy): Promise<void> {
		const token = ++renderToken;
		const scale = baseScale * zoom;
		for (let i = 0; i < pdf.numPages; i++) {
			if (token !== renderToken) return;
			const page = await pdf.getPage(i + 1);
			const viewport = page.getViewport({ scale });
			const canvas = canvasRefs[i];
			if (!canvas) continue;
			activeRenderTasks[i]?.cancel();
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			// Ratio is scale-invariant (both dimensions scale together), but
			// recomputing here rather than once at load keeps it correct even
			// if a future change ever varies scale per-page.
			pageAspects[i] = viewport.height / viewport.width;
			const ctx = canvas.getContext('2d');
			if (!ctx) continue;
			const task = page.render({ canvasContext: ctx, viewport, canvas });
			activeRenderTasks[i] = task;
			try {
				await task.promise;
			} catch (e) {
				if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e;
			} finally {
				if (activeRenderTasks[i] === task) activeRenderTasks[i] = undefined;
			}
		}
	}

	$effect(() => {
		const level = zoom;
		level;
		if (!doc || loading) return;
		void renderAllPages(doc);
	});

	// See the `active` prop doc above: retry the layout-dependent
	// computation on the `false` -> `true` transition, since a load that
	// finished while this pane was hidden never got a real width to work
	// with. `wasActive` is plain (not `$state`) bookkeeping, not something
	// this effect should itself re-run on.
	// svelte-ignore state_referenced_locally
	let wasActive = active;
	$effect(() => {
		const isActive = active;
		if (isActive && !wasActive && doc && !loading) {
			void computeBaseScaleAndRender(doc);
		}
		wasActive = isActive;
	});

	function zoomBy(delta: number): void {
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((zoom + delta) * 100) / 100));
	}

	function resetZoom(): void {
		zoom = 1;
	}

	// Mirrors ScoreView's identical pinch-gesture handling — see its own
	// comments for the rationale (rAF-throttled commits, native pinch-zoom
	// disabled only on this container via `touch-action` below so the app's
	// anchored bars never scale with it).
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
		if (!pinchState || event.touches.length !== 2) return;
		event.preventDefault();
		const scale = touchDistance(event.touches) / pinchState.initialDistance;
		pendingZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(pinchState.initialZoom * scale * 100) / 100));
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
</script>

<div class="pdf-view">
	<div class="pdf-container" bind:this={container}>
		{#if loading}
			<div class="status-card">
				<div class="spinner" aria-hidden="true"></div>
				<p>{m.pdf_loading()}</p>
			</div>
		{:else if loadError}
			<div class="status-card status-card--error">
				<p>{m.pdf_load_error()}</p>
				<p class="status-detail">{loadError}</p>
			</div>
		{:else}
			{#each Array.from({ length: pageCount }) as _, i (i)}
				<div class="pdf-page">
					<div class="page-inner">
						<canvas bind:this={canvasRefs[i]}></canvas>
						{#if canMarkup}
							<svg
								class="markup-layer"
								class:markup-layer--active={tool !== null}
								viewBox="0 0 1 {pageAspects[i] ?? 1.4142}"
								preserveAspectRatio="xMidYMid meet"
								role="presentation"
								onpointerdown={(e) => handleMarkupPointerDown(e, i)}
								onpointermove={(e) => handleMarkupPointerMove(e, i)}
								onpointerup={handleMarkupPointerUp}
								onpointercancel={handleMarkupPointerUp}
							>
								{#each marksForPage(i) as mark (mark.id)}
									{#if mark.kind === 'stroke' && mark.points}
										<path
											d={strokePathD(mark.points)}
											stroke={mark.color}
											stroke-width={mark.width ?? PEN_WIDTHS[1]}
											fill="none"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{:else if mark.kind === 'stamp' && mark.x !== null && mark.y !== null}
										<text x={mark.x} y={mark.y} fill={mark.color} font-size={0.035} text-anchor="middle" dominant-baseline="central">
											{stampGlyph(mark.stampType)}
										</text>
									{/if}
								{/each}
								{#if activeStroke && activeStrokePage === i}
									<path
										d={strokePathD(activeStroke)}
										stroke={penColor}
										stroke-width={penWidth}
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								{/if}
							</svg>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label={m.zoom_out()}>−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label={m.zoom_in()}>+</button>
	</div>

	{#if canMarkup}
		<div class="markup-toolbar">
			<div class="tool-row">
				<button
					class="tool-btn"
					class:active={tool === 'pen'}
					onclick={() => setTool('pen')}
					aria-label={m.markup_tool_pen()}
					aria-pressed={tool === 'pen'}
				>
					✎
				</button>
				<button
					class="tool-btn"
					class:active={tool === 'stamp'}
					onclick={() => setTool('stamp')}
					aria-label={m.markup_tool_stamp()}
					aria-pressed={tool === 'stamp'}
				>
					{stampGlyph(stampType)}
				</button>
				<button
					class="tool-btn"
					class:active={tool === 'eraser'}
					onclick={() => setTool('eraser')}
					aria-label={m.markup_tool_eraser()}
					aria-pressed={tool === 'eraser'}
				>
					⌫
				</button>
				<button class="tool-btn" onclick={undoLastMark} disabled={recentMarkIds.length === 0} aria-label={m.markup_undo()}>
					↺
				</button>
			</div>
			{#if tool === 'pen' || tool === 'stamp'}
				<div class="option-row">
					{#each PEN_COLORS as color (color)}
						<button
							class="color-swatch"
							class:active={penColor === color}
							style:background={color}
							onclick={() => (penColor = color)}
							aria-label={color}
						></button>
					{/each}
				</div>
			{/if}
			{#if tool === 'pen'}
				<div class="option-row">
					{#each PEN_WIDTHS as width, i (width)}
						<button
							class="width-btn"
							class:active={penWidth === width}
							onclick={() => (penWidth = width)}
							aria-label={m.markup_pen_width()}
						>
							<span class="width-dot" style:width="{4 + i * 3}px" style:height="{4 + i * 3}px"></span>
						</button>
					{/each}
				</div>
			{/if}
			{#if tool === 'stamp'}
				<div class="option-row">
					{#each STAMPS as stamp (stamp.type)}
						<button
							class="stamp-btn"
							class:active={stampType === stamp.type}
							onclick={() => (stampType = stamp.type)}
							aria-label={stamp.label()}
						>
							{stamp.glyph}
						</button>
					{/each}
				</div>
			{/if}
			{#if markupError}
				<p class="markup-error">{markupError}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.pdf-view {
		position: relative;
		height: 100%;
	}

	.pdf-container {
		height: 100%;
		overflow: auto;
		background: var(--score-page, var(--surface-2));
		touch-action: pan-x pan-y;
	}

	.pdf-page {
		/* `width: max-content` (floored by `min-width: 100%`) rather than a
		   plain block div: at 100% width it'd never grow past the container
		   even once the zoomed canvas inside it does, so `.pdf-container`'s
		   `overflow: auto` would never see any horizontal overflow to
		   actually scroll through. */
		width: max-content;
		min-width: 100%;
		margin: 0 auto;
		display: flex;
		justify-content: center;
		padding: 0.5rem 0;
	}

	.pdf-page :global(canvas) {
		max-width: none;
		box-shadow: var(--shadow);
	}

	/* Wraps canvas + its markup overlay so the overlay's `inset: 0` lines up
	   exactly with the canvas's own box — `display: table` shrink-wraps to
	   the canvas's intrinsic size the same way `inline-block` would, but
	   without `inline-block`'s baseline-alignment whitespace quirks. */
	.page-inner {
		position: relative;
		display: table;
	}

	.markup-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: pan-x pan-y;
	}

	.markup-layer--active {
		/* A tool is armed — a single-finger drag draws instead of scrolling
		   the page, so native panning has to be fully handed over here. */
		touch-action: none;
		cursor: crosshair;
	}

	.markup-layer text {
		user-select: none;
	}

	.status-card {
		max-width: 520px;
		margin: 2.5rem auto 0;
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

	.status-card--error {
		color: var(--danger);
	}

	.status-detail {
		font-size: 0.8125rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		word-break: break-word;
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

	.zoom-controls {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
	}

	.zoom-controls button {
		min-width: 2.125rem;
		border: none;
		background: transparent;
		color: var(--text);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}

	.zoom-controls button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.zoom-controls button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.zoom-level {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	/* Opposite corner from `.zoom-controls` so the two floating panels never
	   overlap. */
	.markup-toolbar {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		max-width: calc(100% - 1.5rem);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}

	.tool-row,
	.option-row {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.tool-btn {
		min-width: 2.125rem;
		min-height: 2.125rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text);
		border-radius: var(--radius-md);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.tool-btn:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.tool-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.tool-btn.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.color-swatch {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid transparent;
		border-radius: 50%;
		padding: 0;
		cursor: pointer;
	}

	.color-swatch.active {
		border-color: var(--text);
	}

	.width-btn,
	.stamp-btn {
		min-width: 2rem;
		min-height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		border-radius: var(--radius-md);
		font-size: 0.9375rem;
		cursor: pointer;
	}

	.width-btn.active,
	.stamp-btn.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.width-dot {
		display: block;
		border-radius: 50%;
		background: currentColor;
	}

	.markup-error {
		margin: 0;
		max-width: 14rem;
		font-size: 0.75rem;
		color: var(--danger);
	}
</style>
