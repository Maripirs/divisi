<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	// Type-only import — see ScoreView.svelte's identical comment on why OSMD
	// (and here, pdf.js) needs a dynamic `import()` inside `onMount` rather
	// than a static top-level one: both are DOM/worker-dependent packages
	// SvelteKit's SSR can't statically import, and this route already
	// disables SSR (`+page.ts`) for exactly this reason.
	import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import PdfMarkupLayer from '$lib/components/pdf/PdfMarkupLayer.svelte';
	import PdfMarkupPanel from '$lib/components/pdf/PdfMarkupPanel.svelte';
	import { createPdfMarkupController, type MarkupVisibility } from '$lib/components/pdf/pdfMarkup.svelte';
	import { clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '$lib/actions/pinchZoom';
	import { m } from '$lib/paraglide/messages';

	/**
	 * Renders a PDF with our own +/- zoom controls instead of an `<iframe>` —
	 * mobile Safari's iframe-embedded PDF viewer turned out to be a
	 * stripped-down build with no toolbar and no pinch-zoom at all, a platform
	 * limitation no CSS/JS from outside the iframe can fix. Rendering via
	 * pdf.js onto canvases gives identical zoom behavior on every platform,
	 * matching ScoreView's own zoom controls.
	 *
	 * Deliberately no two-finger pinch-to-zoom here (ScoreView still has it):
	 * re-rendering every page through pdf.js on each gesture frame left the
	 * canvases resizing and blanking mid-pinch, which read as the page
	 * distorting. A two-finger gesture just pans/scrolls the pane natively
	 * (`touch-action: pan-x pan-y`); zoom is the +/- buttons only.
	 *
	 * When `canMarkup` is on, also renders a piaScore-style markup layer on
	 * top of each page: pen strokes, stamps, and text annotations. Visibility
	 * can be personal or group-wide (see `$lib/api/pieceMarkup.ts`). Points
	 * are stored as fractions of the page's own rendered *width* (not a
	 * 0-1-per-axis square), so a
	 * stroke's thickness reads the same in both directions and a mark
	 * stays correctly placed across zoom levels without any conversion.
	 */
	let {
		pdfUrl,
		zoom = $bindable(1),
		active = true,
		pieceId,
		canMarkup = false,
		currentUserId,
		markupVisibility = $bindable('mine')
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
		/** Whether markup is available *at all* — the parent gates this on
		 * "logged in + a real Backend piece", same condition
		 * `piece/[id]/+page.svelte` already used for the score annotation
		 * feature. Doesn't by itself show the toolbar/marks; see the markup
		 * controller's own `annotationMode` (F12) for the on/off within that. */
		canMarkup?: boolean;
		currentUserId?: string;
		/** `'none'` hides saved marks entirely; `'mine'` / `'group'` pick which
		 * scope's marks load. Bindable so the host page can drive it from its
		 * own UI (the piece route's Practice Setup drawer) instead of a control
		 * floating on the PDF. */
		markupVisibility?: MarkupVisibility;
	} = $props();

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
	/** `height / width` of each page's rendered canvas, at whatever scale it
	 * was last drawn at — since both dimensions scale by the same factor on
	 * zoom, this ratio stays constant regardless of zoom level, and is what
	 * lets the markup overlay's `viewBox` exactly match the page's true shape
	 * (see the component doc comment above for the point-space). Populated in
	 * `renderAllPages`, once real page dimensions are known, and read by the
	 * markup controller through its `aspectFor` dep. */
	let pageAspects = $state<number[]>([]);

	// --- Markup (freehand drawing) ---
	// The whole markup editor (tools, stamps, text overlay, eraser, undo, API
	// sync) lives in `createPdfMarkupController` + `PdfMarkupLayer` +
	// `PdfMarkupPanel` (round-2 cleanup step 5). pdf.js keeps the canvases and
	// `pageAspects`; the controller reads a page's canvas/aspect through the
	// getter deps below.
	const markup = createPdfMarkupController({
		pieceId: () => pieceId,
		canMarkup: () => canMarkup,
		currentUserId: () => currentUserId,
		getMarkupVisibility: () => markupVisibility,
		setMarkupVisibility: (value) => (markupVisibility = value),
		aspectFor: (pageIndex) => pageAspects[pageIndex] ?? 1.4142,
		canvasFor: (pageIndex) => canvasRefs[pageIndex]
	});

	// Load marks for the current `(pieceId, visibility)`, and disarm the
	// editor when visibility goes to `'none'`. Kept here as `$effect`s (rather
	// than inside the factory) so rune-effect lifecycle stays in the
	// component, matching step 4.
	$effect(() => {
		markup.syncMarksForVisibility();
	});
	$effect(() => {
		markup.syncAnnotationModeWithVisibility();
	});

	onMount(() => {
		const resizeObserver = new ResizeObserver(() => {
			if (doc) void computeBaseScaleAndRender(doc);
		});
		resizeObserver.observe(container);
		return () => {
			resizeObserver.disconnect();
		};
	});

	onDestroy(() => {
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
			// pdfjs v6 fetches these at runtime from URLs it's handed — there's
			// no build-time import for them. The directories are copied out of
			// the `pdfjs-dist` package into `static/pdfjs/` by an inline Vite
			// plugin (see `vite.config.ts`). Without `wasmUrl`, a scanned PDF
			// (one JBIG2/JPEG2000 image per page) fails to decode and every page
			// renders blank white; `cMapUrl` covers CJK/non-Latin text and
			// `standardFontDataUrl` non-embedded base-14 fonts.
			const task = pdfjsLib.getDocument({
				url,
				wasmUrl: '/pdfjs/wasm/',
				cMapUrl: '/pdfjs/cmaps/',
				cMapPacked: true,
				standardFontDataUrl: '/pdfjs/standard_fonts/'
			});
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

	/** F16: scroll a 1-based page into view within the pane — the editor
	 * calls this when "Next seam" lands on a failed-OMR-page seam so the
	 * reference scan for that page is right there beside the empty bars.
	 * No-op until that page's canvas has mounted. */
	export function scrollToPage(pageNumber: number): void {
		const canvas = canvasRefs[pageNumber - 1];
		if (canvas) canvas.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
		zoom = clampZoom(zoom + delta);
	}

	function resetZoom(): void {
		zoom = 1;
	}

	// --- Click-drag panning (mouse) ---
	// Grab-and-drag to move around the page, the way a desktop PDF viewer
	// works — most useful when zoomed in past the container. Mouse only:
	// touch already pans/scrolls natively (`touch-action: pan-x pan-y`, one
	// finger or two), and a finger-drag that also scrolled here would fight
	// that. Skipped while a markup tool is armed (the overlay
	// owns that drag, to draw) and when the press lands on a control or an
	// editable mark.
	let panning = $state(false);
	let panOrigin = { x: 0, y: 0, left: 0, top: 0 };

	function handlePanPointerDown(event: PointerEvent): void {
		if (event.pointerType !== 'mouse' || event.button !== 0) return;
		if (markup.annotationMode && markup.tool !== null) return;
		if ((event.target as Element | null)?.closest('button, input, .text-editor, .text-mark--editable')) {
			return;
		}
		const overflowsX = container.scrollWidth > container.clientWidth;
		const overflowsY = container.scrollHeight > container.clientHeight;
		if (!overflowsX && !overflowsY) return;
		panning = true;
		panOrigin = {
			x: event.clientX,
			y: event.clientY,
			left: container.scrollLeft,
			top: container.scrollTop
		};
		container.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function handlePanPointerMove(event: PointerEvent): void {
		if (!panning) return;
		container.scrollLeft = panOrigin.left - (event.clientX - panOrigin.x);
		container.scrollTop = panOrigin.top - (event.clientY - panOrigin.y);
	}

	function endPan(event: PointerEvent): void {
		if (!panning) return;
		panning = false;
		if (container.hasPointerCapture(event.pointerId)) {
			container.releasePointerCapture(event.pointerId);
		}
	}
</script>

<div class="pdf-view">
	<!-- Scroll region; the pointer handlers add mouse click-drag panning as a
	     progressive enhancement over the native scroll, no role needed. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="pdf-container"
		class:panning
		bind:this={container}
		onpointerdown={handlePanPointerDown}
		onpointermove={handlePanPointerMove}
		onpointerup={endPan}
		onpointercancel={endPan}
	>
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
						<PdfMarkupLayer
							pageIndex={i}
							aspect={pageAspects[i] ?? 1.4142}
							canvas={canvasRefs[i]}
							{markup}
							{canMarkup}
							{markupVisibility}
						/>
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
		<PdfMarkupPanel {markup} />
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
		cursor: grab;
	}

	.pdf-container.panning {
		cursor: grabbing;
		user-select: none;
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
</style>
