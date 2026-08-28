<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	// Type-only import — see ScoreView.svelte's identical comment on why OSMD
	// (and here, pdf.js) needs a dynamic `import()` inside `onMount` rather
	// than a static top-level one: both are DOM/worker-dependent packages
	// SvelteKit's SSR can't statically import, and this route already
	// disables SSR (`+page.ts`) for exactly this reason.
	import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

	/**
	 * Renders a PDF with our own zoom controls (+/- buttons and a two-finger
	 * pinch gesture, both driving the same `zoom` state) instead of an
	 * `<iframe>` — mobile Safari's iframe-embedded PDF viewer turned out to
	 * be a stripped-down build with no toolbar and no pinch-zoom at all,
	 * a platform limitation no CSS/JS from outside the iframe can fix.
	 * Rendering via pdf.js onto canvases gives identical zoom behavior on
	 * every platform, matching ScoreView's own zoom controls.
	 */
	let {
		pdfUrl,
		zoom = $bindable(1),
		active = true
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

	async function computeBaseScaleAndRender(pdf: PDFDocumentProxy): Promise<void> {
		if (!container.clientWidth) return;
		const firstPage = await pdf.getPage(1);
		const naturalWidth = firstPage.getViewport({ scale: 1 }).width;
		baseScale = container.clientWidth / naturalWidth;
		await renderAllPages(pdf);
	}

	async function renderAllPages(pdf: PDFDocumentProxy): Promise<void> {
		const token = ++renderToken;
		const scale = baseScale * zoom;
		for (let i = 0; i < pdf.numPages; i++) {
			if (token !== renderToken) return;
			const page = await pdf.getPage(i + 1);
			const viewport = page.getViewport({ scale });
			const canvas = canvasRefs[i];
			if (!canvas) continue;
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) continue;
			await page.render({ canvasContext: ctx, viewport, canvas }).promise;
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
				<p>Loading PDF...</p>
			</div>
		{:else if loadError}
			<div class="status-card status-card--error">
				<p>Couldn't load the PDF.</p>
				<p class="status-detail">{loadError}</p>
			</div>
		{:else}
			{#each Array.from({ length: pageCount }) as _, i (i)}
				<div class="pdf-page">
					<canvas bind:this={canvasRefs[i]}></canvas>
				</div>
			{/each}
		{/if}
	</div>

	<div class="zoom-controls">
		<button onclick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
		<button onclick={resetZoom} class="zoom-level">{Math.round(zoom * 100)}%</button>
		<button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
	</div>
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
