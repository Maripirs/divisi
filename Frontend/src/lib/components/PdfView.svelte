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
		createText,
		deleteMark,
		listMarks,
		updateMark,
		type MarkupScope,
		type MarkupMark
	} from '$lib/api/pieceMarkup';
	import StampShape from '$lib/components/StampShape.svelte';
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
	/** `'none'` hides saved marks entirely; `'mine'` / `'group'` pick which
	 * scope's marks load. Bindable so the host page can drive it from its own
	 * UI (the piece route's Practice Setup drawer) instead of a control
	 * floating on the PDF. */
	type MarkupVisibility = 'none' | MarkupScope;

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
		 * feature. Doesn't by itself show the toolbar/marks; see this
		 * component's own `annotationMode` (F12) for the on/off within that. */
		canMarkup?: boolean;
		currentUserId?: string;
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

	// --- Markup (freehand drawing) ---

	/** `height / width` of each page's rendered canvas, at whatever scale it
	 * was last drawn at — since both dimensions scale by the same factor on
	 * zoom, this ratio stays constant regardless of zoom level, and is what
	 * lets the SVG overlay's `viewBox` exactly match the page's true shape
	 * (see `strokePathD`'s point-space doc above). Populated in
	 * `renderAllPages`, once real page dimensions are known. */
	let pageAspects = $state<number[]>([]);
	let marks = $state<MarkupMark[]>([]);
	let marksLoadedKey: string | undefined;

	// F12: a master edit-mode toggle separate from which tool is armed. The
	// visibility control (now in the piece route's Practice Setup drawer)
	// decides whether saved marks are shown.
	let annotationMode = $state(false);
	type MarkupTool = 'pen' | 'stamp' | 'text' | 'eraser' | null;
	let tool = $state<MarkupTool>(null);
	const PEN_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#111827'];
	const PEN_WIDTHS = [0.0018, 0.003, 0.005];
	let penColor = $state(PEN_COLORS[0]);
	let penWidth = $state(PEN_WIDTHS[1]);

	const STAMPS: { type: string; label: () => string }[] = [
		{ type: 'crescendo', label: () => m.markup_stamp_crescendo() },
		{ type: 'diminuendo', label: () => m.markup_stamp_diminuendo() },
		{ type: 'breath', label: () => m.markup_stamp_breath() },
		{ type: 'no-breath', label: () => m.markup_stamp_no_breath() },
		{ type: 'cutoff', label: () => m.markup_stamp_cutoff() },
		{ type: 'fermata', label: () => m.markup_stamp_fermata() },
		{ type: 'tenuto', label: () => m.markup_stamp_tenuto() },
		{ type: 'accent', label: () => m.markup_stamp_accent() },
		{ type: 'staccato', label: () => m.markup_stamp_staccato() },
		{ type: 'phrase-arc', label: () => m.markup_stamp_phrase_arc() }
	];
	let stampType = $state(STAMPS[0].type);
	const MIN_STAMP_SIZE = 0.024;
	const MAX_STAMP_SIZE = 0.08;
	const STAMP_SIZE_STEP = 0.002;
	const DEFAULT_STAMP_SIZE = 0.04;
	let stampSize = $state(DEFAULT_STAMP_SIZE);
	const MIN_TEXT_SIZE = 0.024;
	const MAX_TEXT_SIZE = 0.08;
	const TEXT_SIZE_STEP = 0.002;
	// Coarser than the slider's step — the −/+ buttons on an open editor are
	// for quick nudges, not fine tuning.
	const TEXT_SIZE_NUDGE = 0.008;
	const DEFAULT_TEXT_SIZE = 0.04;
	let textSize = $state(DEFAULT_TEXT_SIZE);

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
	let textEditorInput = $state<HTMLInputElement | undefined>();
	let textEditor = $state<{
		markId?: string;
		pageIndex: number;
		x: number;
		y: number;
		value: string;
		color: string;
		width: number;
		openedAt: number;
	} | null>(null);
	let activeTextDrag = $state<{
		markId: string;
		pageIndex: number;
		start: [number, number];
		origin: [number, number];
		moved: boolean;
	} | null>(null);

	$effect(() => {
		const id = pieceId;
		const visibility = markupVisibility;
		if (!canMarkup || !id || visibility === 'none') {
			marks = [];
			marksLoadedKey = undefined;
			return;
		}
		const key = `${id}:${visibility}`;
		if (marksLoadedKey === key) return;
		marksLoadedKey = key;
		void loadMarks(id, visibility, key);
	});

	async function loadMarks(id: string, scope: MarkupScope, key: string): Promise<void> {
		try {
			const loaded = await listMarks(id, scope);
			if (marksLoadedKey === key) marks = loaded;
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

	function isOwnMark(mark: MarkupMark): boolean {
		return mark.userId === currentUserId;
	}

	/** SVG path `d` for a stroke's point list — a plain polyline (move to
	 * the first point, line to every point after), not a smoothed curve.
	 * Good enough for handwriting-speed input; a curve-fit pass is a
	 * possible later polish, not attempted here. */
	function strokePathD(points: [number, number][]): string {
		if (points.length === 0) return '';
		return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
	}

	function sizeForStamp(mark: MarkupMark): number {
		return mark.width ?? DEFAULT_STAMP_SIZE;
	}

	function sizeForText(mark: MarkupMark): number {
		return mark.width ?? DEFAULT_TEXT_SIZE;
	}

	function textHitWidth(mark: MarkupMark): number {
		return Math.max(sizeForText(mark), (mark.text?.length ?? 1) * sizeForText(mark) * 0.54);
	}

	function textEditorStyle(pageIndex: number): string {
		if (!textEditor) return '';
		const aspect = pageAspects[pageIndex] ?? 1.4142;
		const canvasWidth = canvasRefs[pageIndex]?.getBoundingClientRect().width ?? 720;
		const fontSize = Math.max(14, Math.round(textEditor.width * canvasWidth));
		return [
			`left: ${textEditor.x * 100}%`,
			`top: ${(textEditor.y / aspect) * 100}%`,
			`color: ${textEditor.color}`,
			`font-size: ${fontSize}px`
		].join('; ');
	}

	async function focusTextEditor(): Promise<void> {
		await tick();
		textEditorInput?.focus();
		textEditorInput?.select();
	}

	function openTextEditorForCreate(pageIndex: number, point: [number, number]): void {
		textEditor = {
			pageIndex,
			x: point[0],
			y: point[1],
			value: '',
			color: penColor,
			width: textSize,
			openedAt: performance.now()
		};
		void focusTextEditor();
	}

	function openTextEditorForMark(mark: MarkupMark, pageIndex: number): void {
		if (mark.kind !== 'text' || !isOwnMark(mark) || mark.x === null || mark.y === null) return;
		textEditor = {
			markId: mark.id,
			pageIndex,
			x: mark.x,
			y: mark.y,
			value: mark.text ?? '',
			color: mark.color,
			width: sizeForText(mark),
			openedAt: performance.now()
		};
		void focusTextEditor();
	}

	function cancelTextEditor(): void {
		textEditor = null;
	}

	/** A blur within the first moments of opening is almost always a stray
	 * focus steal (a post-tap synthetic mouse event, a layout shift) rather
	 * than the user tabbing away — re-focus instead of committing an empty
	 * field and closing. A genuine blur after that commits as normal. */
	function handleTextEditorBlur(): void {
		if (textEditor && !textEditor.value.trim() && performance.now() - textEditor.openedAt < 400) {
			void focusTextEditor();
			return;
		}
		void commitTextEditor();
	}

	async function commitTextEditor(): Promise<void> {
		const editor = textEditor;
		if (!editor || !pieceId) return;
		const value = editor.value.trim();
		textEditor = null;
		if (!value) return;
		markupError = null;
		try {
			if (editor.markId) {
				const updated = await updateMark(pieceId, editor.markId, {
					color: editor.color,
					width: editor.width,
					text: value,
					x: editor.x,
					y: editor.y
				});
				marks = marks.map((mark) => (mark.id === updated.id ? updated : mark));
			} else {
				const created = await createText(pieceId, editor.pageIndex + 1, editor.color, editor.width, value, editor.x, editor.y);
				marks = [...marks, created];
				recentMarkIds = [...recentMarkIds, created.id];
			}
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	/** Nudge the size of the text in the open editor. Live-updates the
	 * editor preview via `textEditorStyle`; `commitTextEditor` persists the
	 * new `width` on blur/Enter. */
	function nudgeTextEditorSize(delta: number): void {
		if (!textEditor) return;
		const next = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, textEditor.width + delta));
		textEditor.width = next;
		// Keep the tool's default in step too, so the next new text matches
		// the size the user just settled on. Focus stays in the field on its
		// own — the buttons' `pointerdown` preventDefault sees to that.
		if (!textEditor.markId) textSize = next;
	}

	/** The editor's × — drop the mark being edited (or, for a not-yet-saved
	 * text, just close the editor). */
	function deleteTextEditorMark(): void {
		const markId = textEditor?.markId;
		textEditor = null;
		if (markId) void removeMark(markId);
	}

	function setTool(next: MarkupTool): void {
		tool = tool === next ? null : next;
		activeStroke = null;
		activeTextDrag = null;
	}

	/** Flips the master toggle. Turning it off also disarms whatever tool was
	 * selected and drops any in-progress stroke — otherwise the mode could
	 * come back on already armed, or a pointerup after the layer's already
	 * unmounted could try to commit a stroke nobody can see anymore. */
	function toggleAnnotationMode(): void {
		if (!annotationMode && markupVisibility === 'none') markupVisibility = 'mine';
		annotationMode = !annotationMode;
		if (!annotationMode) {
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
		}
	}

	// Visibility now lives on the host (the Practice Setup drawer). When it
	// switches to `'none'` the editing surface has nothing to draw on, so
	// disarm the master toggle and any in-progress mark — same cleanup
	// `toggleAnnotationMode` does when turned off directly.
	$effect(() => {
		if (markupVisibility === 'none' && annotationMode) {
			annotationMode = false;
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
		}
	});

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
		if (!canMarkup || !annotationMode || !tool) return;
		const point = pointFromEvent(event, pageIndex);
		if (!point) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		if (tool === 'pen') {
			activeStrokePage = pageIndex;
			activeStroke = [point];
		} else if (tool === 'stamp') {
			void placeStamp(pageIndex, point);
		} else if (tool === 'text') {
			// Suppress the compatibility mouse events a tap fires after
			// `touchend` — one of them lands on this layer and blurs the text
			// field we're about to focus, which would commit it empty and
			// close it before anything could be typed.
			event.preventDefault();
			openTextEditorForCreate(pageIndex, point);
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
			const created = await createStamp(pieceId, pageIndex + 1, penColor, stampType, stampSize, point[0], point[1]);
			marks = [...marks, created];
			recentMarkIds = [...recentMarkIds, created.id];
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	function handleTextPointerDown(event: PointerEvent, mark: MarkupMark, pageIndex: number): void {
		if (!annotationMode || !isOwnMark(mark) || mark.x === null || mark.y === null) return;
		event.stopPropagation();
		// Same reason as the text-create branch in `handleMarkupPointerDown`:
		// keep the post-tap compatibility mouse events from blurring the
		// editor this may open on pointerup.
		event.preventDefault();
		const point = pointFromEvent(event, pageIndex);
		if (!point) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		textEditor = null;
		activeTextDrag = {
			markId: mark.id,
			pageIndex,
			start: point,
			origin: [mark.x, mark.y],
			moved: false
		};
	}

	function handleTextPointerMove(event: PointerEvent): void {
		const drag = activeTextDrag;
		if (!drag) return;
		event.stopPropagation();
		const point = pointFromEvent(event, drag.pageIndex);
		if (!point) return;
		const nextX = Math.max(0, Math.min(1, drag.origin[0] + point[0] - drag.start[0]));
		const aspect = pageAspects[drag.pageIndex] ?? 1.4142;
		const nextY = Math.max(0, Math.min(aspect, drag.origin[1] + point[1] - drag.start[1]));
		const moved = drag.moved || Math.hypot(nextX - drag.origin[0], nextY - drag.origin[1]) > 0.006;
		activeTextDrag = { ...drag, moved };
		marks = marks.map((mark) => (mark.id === drag.markId ? { ...mark, x: nextX, y: nextY } : mark));
	}

	async function handleTextPointerUp(event: PointerEvent, mark: MarkupMark, pageIndex: number): Promise<void> {
		const drag = activeTextDrag;
		if (!drag || drag.markId !== mark.id) return;
		event.stopPropagation();
		activeTextDrag = null;
		const current = marks.find((candidate) => candidate.id === mark.id) ?? mark;
		if (!drag.moved) {
			openTextEditorForMark(current, pageIndex);
			return;
		}
		if (!pieceId || current.x === null || current.y === null) return;
		markupError = null;
		try {
			const updated = await updateMark(pieceId, current.id, { x: current.x, y: current.y });
			marks = marks.map((candidate) => (candidate.id === updated.id ? updated : candidate));
		} catch (err) {
			marks = marks.map((candidate) =>
				candidate.id === mark.id ? { ...candidate, x: drag.origin[0], y: drag.origin[1] } : candidate
			);
			markupError = markupErrorMessage(err);
		}
	}

	function handleTextPointerCancel(mark: MarkupMark): void {
		const drag = activeTextDrag;
		if (!drag || drag.markId !== mark.id) return;
		activeTextDrag = null;
		marks = marks.map((candidate) =>
			candidate.id === mark.id ? { ...candidate, x: drag.origin[0], y: drag.origin[1] } : candidate
		);
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
		const hit = marksForPage(pageIndex)
			.filter(isOwnMark)
			.find((mark) => {
				if (mark.kind === 'stamp') {
					return (
						mark.x !== null &&
						mark.y !== null &&
						Math.hypot(mark.x - point[0], mark.y - point[1]) < Math.max(ERASE_RADIUS, sizeForStamp(mark) * 0.65)
					);
				}
				if (mark.kind === 'text') {
					return (
						mark.x !== null &&
						mark.y !== null &&
						point[0] >= mark.x - ERASE_RADIUS * 0.5 &&
						point[0] <= mark.x + textHitWidth(mark) + ERASE_RADIUS * 0.5 &&
						point[1] >= mark.y - ERASE_RADIUS * 0.5 &&
						point[1] <= mark.y + sizeForText(mark) * 1.25 + ERASE_RADIUS * 0.5
					);
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
		if (annotationMode && tool !== null) return;
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
						{#if canMarkup && markupVisibility !== 'none'}
							<svg
								class="markup-layer"
								class:markup-layer--editable={annotationMode}
								class:markup-layer--active={annotationMode && tool !== null}
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
										<g class="stamp-mark" style:color={mark.color} transform={`translate(${mark.x} ${mark.y}) scale(${sizeForStamp(mark)})`}>
											<StampShape type={mark.stampType} />
										</g>
									{:else if mark.kind === 'text' && mark.x !== null && mark.y !== null && mark.text}
										<g
											class="text-mark"
											class:text-mark--editable={annotationMode && isOwnMark(mark)}
											style:color={mark.color}
											transform={`translate(${mark.x} ${mark.y})`}
											role="button"
											tabindex={annotationMode && isOwnMark(mark) ? 0 : -1}
											aria-label={m.markup_text_field()}
											onpointerdown={(e) => handleTextPointerDown(e, mark, i)}
											onpointermove={handleTextPointerMove}
											onpointerup={(e) => handleTextPointerUp(e, mark, i)}
											onpointercancel={() => handleTextPointerCancel(mark)}
											onkeydown={(event) => {
												if ((event.key === 'Enter' || event.key === ' ') && annotationMode && isOwnMark(mark)) {
													event.preventDefault();
													openTextEditorForMark(mark, i);
												}
											}}
										>
											<rect
												class="text-mark-hitbox"
												x="-0.006"
												y="-0.006"
												width={textHitWidth(mark) + 0.012}
												height={sizeForText(mark) * 1.25}
												rx="0.004"
											/>
											<text x="0" y="0" font-size={sizeForText(mark)} fill="currentColor" dominant-baseline="hanging">{mark.text}</text>
										</g>
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
							{#if textEditor && textEditor.pageIndex === i}
								<form
									class="text-editor"
									style={textEditorStyle(i)}
									onsubmit={(event) => {
										event.preventDefault();
										void commitTextEditor();
									}}
								>
									<!-- `pointerdown` preventDefault keeps focus in the field so the
									     blur-commit does not fire (and null `textEditor`) before these
									     handlers run. -->
									<div class="text-editor-tools">
										<button
											type="button"
											onpointerdown={(event) => event.preventDefault()}
											onclick={() => nudgeTextEditorSize(-TEXT_SIZE_NUDGE)}
											disabled={textEditor.width <= MIN_TEXT_SIZE}
											aria-label={m.markup_text_smaller()}
										>
											−
										</button>
										<button
											type="button"
											onpointerdown={(event) => event.preventDefault()}
											onclick={() => nudgeTextEditorSize(TEXT_SIZE_NUDGE)}
											disabled={textEditor.width >= MAX_TEXT_SIZE}
											aria-label={m.markup_text_larger()}
										>
											+
										</button>
										<button
											type="button"
											class="text-editor-delete"
											onpointerdown={(event) => event.preventDefault()}
											onclick={() => deleteTextEditorMark()}
											aria-label={m.markup_text_delete()}
										>
											×
										</button>
									</div>
									<input
										bind:this={textEditorInput}
										value={textEditor.value}
										oninput={(event) => {
											if (textEditor) textEditor.value = (event.currentTarget as HTMLInputElement).value;
										}}
										onkeydown={(event) => {
											if (event.key === 'Escape') cancelTextEditor();
										}}
										onblur={() => handleTextEditorBlur()}
										aria-label={m.markup_text_field()}
									/>
								</form>
							{/if}
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
		<!-- F12: bottom-left. The master on/off button sits at the bottom;
		     turning it on expands the tool panel upward directly above it, so
		     the two read as one control. Saved marks stay visible as
		     read-only markup whenever the button is off. -->
		<div class="markup-panel">
			<button
				class="annotation-mode-toggle"
				class:active={annotationMode}
				onclick={toggleAnnotationMode}
				aria-label={annotationMode ? m.markup_mode_off() : m.markup_mode_on()}
				aria-pressed={annotationMode}
			>
				✎
			</button>
			{#if annotationMode}
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
					<svg class="tool-stamp-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
						<StampShape type={stampType} />
					</svg>
				</button>
				<button
					class="tool-btn tool-btn--text"
					class:active={tool === 'text'}
					onclick={() => setTool('text')}
					aria-label={m.markup_tool_text()}
					aria-pressed={tool === 'text'}
				>
					T
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
			{#if tool === 'pen' || tool === 'stamp' || tool === 'text'}
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
							<svg class="stamp-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
								<StampShape type={stamp.type} />
							</svg>
						</button>
					{/each}
				</div>
				<div class="stamp-size-control">
					<svg class="stamp-size-preview stamp-size-preview--small" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
						<StampShape type={stampType} />
					</svg>
					<input
						type="range"
						min={MIN_STAMP_SIZE}
						max={MAX_STAMP_SIZE}
						step={STAMP_SIZE_STEP}
						value={stampSize}
						oninput={(event) => (stampSize = Number((event.currentTarget as HTMLInputElement).value))}
						aria-label={m.markup_stamp_size()}
					/>
					<svg class="stamp-size-preview stamp-size-preview--large" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
						<StampShape type={stampType} />
					</svg>
				</div>
			{/if}
			{#if tool === 'text'}
				<div class="text-size-control">
					<span class="text-size-preview text-size-preview--small" aria-hidden="true">T</span>
					<input
						type="range"
						min={MIN_TEXT_SIZE}
						max={MAX_TEXT_SIZE}
						step={TEXT_SIZE_STEP}
						value={textSize}
						oninput={(event) => (textSize = Number((event.currentTarget as HTMLInputElement).value))}
						aria-label={m.markup_text_size()}
					/>
					<span class="text-size-preview text-size-preview--large" aria-hidden="true">T</span>
				</div>
			{/if}
			{#if markupError}
				<p class="markup-error">{markupError}</p>
			{/if}
			</div>
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

	.markup-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: pan-x pan-y;
		pointer-events: none;
	}

	.markup-layer--editable {
		pointer-events: auto;
	}

	.markup-layer--active {
		/* A tool is armed — a single-finger drag draws instead of scrolling
		   the page, so native panning has to be fully handed over here. */
		touch-action: none;
		cursor: crosshair;
	}

	.stamp-mark {
		pointer-events: none;
	}

	.text-mark {
		pointer-events: none;
	}

	.markup-layer--editable .text-mark--editable {
		pointer-events: auto;
		cursor: move;
	}

	.text-mark-hitbox {
		fill: transparent;
	}

	.text-mark text {
		font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		font-weight: 750;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 0.003;
		stroke-linejoin: round;
		user-select: none;
	}

	.text-editor {
		position: absolute;
		z-index: 2;
		transform: translate(-0.25rem, -0.25rem);
		margin: 0;
		color: inherit;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	/* Sits just above the field while a text is being written or edited:
	   −/+ nudge its size, × drops it. */
	.text-editor-tools {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
	}

	.text-editor-tools button {
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text);
		border-radius: var(--radius-full);
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
	}

	.text-editor-tools button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.text-editor-tools button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.text-editor-tools .text-editor-delete {
		color: var(--danger);
	}

	.text-editor input {
		min-width: 7rem;
		max-width: min(18rem, 58vw);
		border: 2px solid currentColor;
		border-radius: var(--radius-md);
		background: var(--surface);
		color: currentColor;
		box-shadow: var(--shadow);
		padding: 0.2rem 0.35rem;
		font: inherit;
		font-weight: 750;
		outline: none;
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

	/* Bottom-left, opposite `.zoom-controls` (bottom-right). The always-present
	   on/off button anchors the group; the tool panel (when open) sits beside
	   it on a wide enough viewport, or stacked above it on a narrow one.
	   `column-reverse` keeps the button pinned to the bottom while the panel
	   grows upward (button is first in the DOM). */
	.markup-panel {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 0.4rem;
		max-width: calc(100% - 1.5rem);
		max-height: calc(100% - 1.5rem);
	}

	/* Enough room to lay the panel out to the right of the button rather
	   than above it. */
	@media (min-width: 560px) {
		.markup-panel {
			flex-direction: row;
			align-items: flex-end;
		}
	}

	.annotation-mode-toggle {
		min-width: 2.125rem;
		min-height: 2.125rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.annotation-mode-toggle:hover {
		background: var(--surface-2);
	}

	.annotation-mode-toggle.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.markup-toolbar {
		min-height: 0;
		min-width: 0;
		flex: 0 1 auto;
		overflow-y: auto;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		transform-origin: bottom left;
		animation: markup-toolbar-expand-up 0.16s ease-out;
	}

	@keyframes markup-toolbar-expand-up {
		from {
			opacity: 0;
			transform: scaleY(0.55) translateY(0.35rem);
		}

		to {
			opacity: 1;
			transform: none;
		}
	}

	/* Beside-the-button layout: unfold horizontally out of the button
	   instead of upward. */
	@media (min-width: 560px) {
		.markup-toolbar {
			transform-origin: left center;
			animation-name: markup-toolbar-expand-side;
		}
	}

	@keyframes markup-toolbar-expand-side {
		from {
			opacity: 0;
			transform: scaleX(0.55) translateX(-0.35rem);
		}

		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.markup-toolbar {
			animation: none;
		}
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

	.tool-btn--text {
		font-family: ui-serif, Georgia, serif;
		font-size: 1.05rem;
		font-weight: 800;
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

	.stamp-btn {
		width: 2rem;
		height: 2rem;
	}

	.width-btn.active,
	.stamp-btn.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.tool-stamp-icon,
	.stamp-icon,
	.stamp-size-preview {
		display: block;
		color: currentColor;
		overflow: visible;
	}

	.tool-stamp-icon {
		width: 1.2rem;
		height: 1.2rem;
	}

	.stamp-icon {
		width: 1.15rem;
		height: 1.15rem;
	}

	.stamp-size-control,
	.text-size-control {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.1rem 0.25rem 0.15rem;
		color: var(--text-muted);
	}

	.stamp-size-control input,
	.text-size-control input {
		width: min(10rem, 48vw);
		accent-color: var(--accent);
		cursor: pointer;
	}

	.stamp-size-preview {
		color: var(--text-muted);
	}

	.stamp-size-preview--small {
		width: 0.85rem;
		height: 0.85rem;
	}

	.stamp-size-preview--large {
		width: 1.45rem;
		height: 1.45rem;
	}

	.text-size-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.45rem;
		font-family: ui-serif, Georgia, serif;
		font-weight: 800;
		line-height: 1;
		color: var(--text-muted);
	}

	.text-size-preview--small {
		font-size: 0.8rem;
	}

	.text-size-preview--large {
		font-size: 1.35rem;
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
