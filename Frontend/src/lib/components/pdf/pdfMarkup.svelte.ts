// The freehand PDF markup editor: pen strokes, stamps, text annotations, an
// eraser, and a session-local undo stack, all layered on top of the pdf.js
// pages rendered by `PdfView.svelte`. Marks round-trip through
// `$lib/api/pieceMarkup` (the same server-side-session proxy pattern as score
// annotations). Points are stored as fractions of a page's rendered *width*,
// see `PdfView`'s component doc comment for why.
//
// Round-2 cleanup step 5: lifted wholesale out of `PdfView.svelte`, which was
// carrying two unrelated features (pdf.js render/zoom/pan and this markup
// editor). Mirrors step 4's `player/annotations.svelte.ts`: a factory that
// owns every markup `$state` decl plus every CRUD / erase / undo / text-editor
// action, with the component-side values it needs threaded in as getter-style
// deps rather than closed over. pdf.js keeps ownership of the canvases and of
// `pageAspects`; this module reads a page's aspect and canvas element only
// through the `aspectFor` / `canvasFor` deps.
//
// The three pure geometry helpers (`strokePathD`, `distanceToSegment`,
// `distanceToStroke`) are plain exported functions, not factory methods, and
// are unit-tested in `pdfMarkup.test.ts` (same pure-fn split as steps 1-2).
// The factory itself is not unit-tested: instantiating it pulls in `$state`,
// the awkward-outside-a-component case step 4 also stayed clear of.

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
import { m } from '$lib/paraglide/messages';

/** `'none'` hides saved marks entirely; `'mine'` / `'group'` pick which
 * scope's marks load. Bindable on `PdfView` so the host page can drive it from
 * its own UI (the piece route's Practice Setup drawer) instead of a control
 * floating on the PDF. */
export type MarkupVisibility = 'none' | MarkupScope;

export type MarkupTool = 'pen' | 'stamp' | 'text' | 'eraser' | null;

// `null` closed; otherwise a brand-new text being written (`markId` unset) or
// an existing text mark being edited.
type TextEditorState = {
	markId?: string;
	pageIndex: number;
	x: number;
	y: number;
	value: string;
	color: string;
	width: number;
	openedAt: number;
} | null;

type ActiveTextDrag = {
	markId: string;
	pageIndex: number;
	start: [number, number];
	origin: [number, number];
	moved: boolean;
} | null;

export const PEN_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#111827'];
export const PEN_WIDTHS = [0.0018, 0.003, 0.005];

export const STAMPS: { type: string; label: () => string }[] = [
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

export const MIN_STAMP_SIZE = 0.024;
export const MAX_STAMP_SIZE = 0.08;
export const STAMP_SIZE_STEP = 0.002;
const DEFAULT_STAMP_SIZE = 0.04;

export const MIN_TEXT_SIZE = 0.024;
export const MAX_TEXT_SIZE = 0.08;
export const TEXT_SIZE_STEP = 0.002;
// Coarser than the slider's step: the -/+ buttons on an open editor are for
// quick nudges, not fine tuning.
export const TEXT_SIZE_NUDGE = 0.008;
const DEFAULT_TEXT_SIZE = 0.04;

// Page-width fractions, matching the point-space `pointFromEvent` uses, so
// this stays a sensible hit-test radius at any zoom level.
const ERASE_RADIUS = 0.02;

/** SVG path `d` for a stroke's point list: a plain polyline (move to the first
 * point, line to every point after), not a smoothed curve. Good enough for
 * handwriting-speed input; a curve-fit pass is a possible later polish, not
 * attempted here. */
export function strokePathD(points: [number, number][]): string {
	if (points.length === 0) return '';
	return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

export function distanceToSegment(a: [number, number], b: [number, number], p: [number, number]): number {
	const [ax, ay] = a;
	const [bx, by] = b;
	const [px, py] = p;
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSq = dx * dx + dy * dy;
	const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToStroke(points: [number, number][], point: [number, number]): number {
	let min = Infinity;
	for (let i = 0; i < points.length - 1; i++) {
		min = Math.min(min, distanceToSegment(points[i], points[i + 1], point));
	}
	return min;
}

export interface PdfMarkupControllerDeps {
	/** `pieceId` prop: the real Backend piece id marks are stored against,
	 * `undefined` for a bundled fixture PDF (no real `Piece` row to key marks
	 * to). */
	pieceId: () => string | undefined;
	/** `canMarkup` prop: whether markup is available *at all* (the parent gates
	 * on "logged in + a real Backend piece"). */
	canMarkup: () => boolean;
	/** `currentUserId` prop: tells the current user's own marks apart from a
	 * group's. */
	currentUserId: () => string | undefined;
	/** `markupVisibility` is `$bindable` on `PdfView` and two-way-bound by the
	 * parent route; `toggleAnnotationMode` mutates it, so the controller needs
	 * read *and* write access. */
	getMarkupVisibility: () => MarkupVisibility;
	setMarkupVisibility: (value: MarkupVisibility) => void;
	/** `pageAspects[pageIndex] ?? 1.4142`. `pageAspects` is written by pdf.js
	 * (`renderAllPages`, which stays in `PdfView`); the markup geometry only
	 * reads it. */
	aspectFor: (pageIndex: number) => number;
	/** `canvasRefs[pageIndex]`. The controller cannot see `canvasRefs`
	 * directly. */
	canvasFor: (pageIndex: number) => HTMLCanvasElement | undefined;
}

export function createPdfMarkupController(deps: PdfMarkupControllerDeps) {
	let marks = $state<MarkupMark[]>([]);
	// Session bookkeeping, not reactive: the `${pieceId}:${visibility}` key
	// whose marks are currently loaded.
	let marksLoadedKey: string | undefined;

	// F12: a master edit-mode toggle separate from which tool is armed. The
	// visibility control (in the piece route's Practice Setup drawer) decides
	// whether saved marks are shown at all.
	let annotationMode = $state(false);
	let tool = $state<MarkupTool>(null);
	let penColor = $state(PEN_COLORS[0]);
	let penWidth = $state(PEN_WIDTHS[1]);
	let stampType = $state(STAMPS[0].type);
	let stampSize = $state(DEFAULT_STAMP_SIZE);
	let textSize = $state(DEFAULT_TEXT_SIZE);

	// Both read directly in `PdfMarkupLayer`'s template (the live-stroke
	// preview, the Undo button's disabled state) alongside `activeStroke` /
	// `marks`, so both need to be real `$state` too, not plain bookkeeping.
	let activeStrokePage = $state(-1);
	let activeStroke = $state<[number, number][] | null>(null);
	// Ids created this browser session, oldest first: undo pops the last one.
	// Deliberately not persisted/restored across reloads; a session-local
	// stack, same as any ordinary pen-and-paper undo would be.
	let recentMarkIds = $state<string[]>([]);
	let markupError = $state<string | null>(null);
	let textEditor = $state<TextEditorState>(null);
	let activeTextDrag = $state<ActiveTextDrag>(null);
	// Bumped on every focus request. `PdfMarkupLayer` owns the text input's ref
	// and re-focuses off an `$effect` that depends on this counter, so the
	// blur-guard re-focus path works without the controller touching the DOM.
	let textEditorFocusRequest = $state(0);

	function requestTextEditorFocus(): void {
		textEditorFocusRequest++;
	}

	/** Drives the mark list off `(pieceId, visibility)`. `PdfView` calls this
	 * from an `$effect`, so the reactive reads below register as deps. */
	function syncMarksForVisibility(): void {
		const id = deps.pieceId();
		const visibility = deps.getMarkupVisibility();
		if (!deps.canMarkup() || !id || visibility === 'none') {
			marks = [];
			marksLoadedKey = undefined;
			return;
		}
		const key = `${id}:${visibility}`;
		if (marksLoadedKey === key) return;
		marksLoadedKey = key;
		void loadMarks(id, visibility, key);
	}

	async function loadMarks(id: string, scope: MarkupScope, key: string): Promise<void> {
		try {
			const loaded = await listMarks(id, scope);
			if (marksLoadedKey === key) marks = loaded;
		} catch {
			// A failed load just means no prior marks show yet, not worth a
			// blocking error state on top of the PDF's own; the toolbar still
			// works and a new mark's own save will surface its own error if the
			// Backend is genuinely unreachable.
		}
	}

	// Visibility lives on the host (the Practice Setup drawer). When it
	// switches to `'none'` the editing surface has nothing to draw on, so
	// disarm the master toggle and any in-progress mark, the same cleanup
	// `toggleAnnotationMode` does when turned off directly. `PdfView` calls
	// this from an `$effect`.
	function syncAnnotationModeWithVisibility(): void {
		if (deps.getMarkupVisibility() === 'none' && annotationMode) {
			annotationMode = false;
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
		}
	}

	function marksForPage(pageIndex: number): MarkupMark[] {
		const pageNumber = pageIndex + 1;
		return marks.filter((mark) => mark.pageNumber === pageNumber);
	}

	function isOwnMark(mark: MarkupMark): boolean {
		return mark.userId === deps.currentUserId();
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
		// Snapshot to a local const so TS narrows `textEditor` past the guard.
		const editor = textEditor;
		if (!editor) return '';
		const aspect = deps.aspectFor(pageIndex);
		const canvasWidth = deps.canvasFor(pageIndex)?.getBoundingClientRect().width ?? 720;
		const fontSize = Math.max(14, Math.round(editor.width * canvasWidth));
		return [
			`left: ${editor.x * 100}%`,
			`top: ${(editor.y / aspect) * 100}%`,
			`color: ${editor.color}`,
			`font-size: ${fontSize}px`
		].join('; ');
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
		requestTextEditorFocus();
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
		requestTextEditorFocus();
	}

	function cancelTextEditor(): void {
		textEditor = null;
	}

	function setTextEditorValue(value: string): void {
		if (textEditor) textEditor.value = value;
	}

	/** A blur within the first moments of opening is almost always a stray
	 * focus steal (a post-tap synthetic mouse event, a layout shift) rather
	 * than the user tabbing away: re-focus instead of committing an empty
	 * field and closing. A genuine blur after that commits as normal. */
	function handleTextEditorBlur(): void {
		if (textEditor && !textEditor.value.trim() && performance.now() - textEditor.openedAt < 400) {
			requestTextEditorFocus();
			return;
		}
		void commitTextEditor();
	}

	async function commitTextEditor(): Promise<void> {
		const editor = textEditor;
		const pieceId = deps.pieceId();
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

	/** Nudge the size of the text in the open editor. Live-updates the editor
	 * preview via `textEditorStyle`; `commitTextEditor` persists the new
	 * `width` on blur/Enter. */
	function nudgeTextEditorSize(delta: number): void {
		if (!textEditor) return;
		const next = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, textEditor.width + delta));
		textEditor.width = next;
		// Keep the tool's default in step too, so the next new text matches the
		// size the user just settled on. Focus stays in the field on its own:
		// the buttons' `pointerdown` preventDefault sees to that.
		if (!textEditor.markId) textSize = next;
	}

	/** The editor's x: drop the mark being edited (or, for a not-yet-saved
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
	 * selected and drops any in-progress stroke, otherwise the mode could come
	 * back on already armed, or a pointerup after the layer's already unmounted
	 * could try to commit a stroke nobody can see anymore. */
	function toggleAnnotationMode(): void {
		if (!annotationMode && deps.getMarkupVisibility() === 'none') deps.setMarkupVisibility('mine');
		annotationMode = !annotationMode;
		if (!annotationMode) {
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
		}
	}

	function markupErrorMessage(err: unknown): string {
		return err instanceof MarkupApiError ? err.message : m.errors_could_not_reach_server();
	}

	/** Converts a pointer event into page-space coordinates: both x *and* y are
	 * fractions of the page's rendered *width* (not width/height respectively),
	 * see `PdfView`'s component doc comment for why. */
	function pointFromEvent(event: PointerEvent, pageIndex: number): [number, number] | null {
		const canvas = deps.canvasFor(pageIndex);
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0) return null;
		return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.width];
	}

	function handleMarkupPointerDown(event: PointerEvent, pageIndex: number): void {
		if (!deps.canMarkup() || !annotationMode || !tool) return;
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
			// `touchend`: one of them lands on this layer and blurs the text
			// field we're about to focus, which would commit it empty and close
			// it before anything could be typed.
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
		const pieceId = deps.pieceId();
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
		const pieceId = deps.pieceId();
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
		// keep the post-tap compatibility mouse events from blurring the editor
		// this may open on pointerup.
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
		const aspect = deps.aspectFor(drag.pageIndex);
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
		const pieceId = deps.pieceId();
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
		const pieceId = deps.pieceId();
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

	function setPenColor(color: string): void {
		penColor = color;
	}
	function setPenWidth(width: number): void {
		penWidth = width;
	}
	function setStampType(type: string): void {
		stampType = type;
	}
	function setStampSize(size: number): void {
		stampSize = size;
	}
	function setTextSize(size: number): void {
		textSize = size;
	}

	return {
		get annotationMode() {
			return annotationMode;
		},
		get tool() {
			return tool;
		},
		get penColor() {
			return penColor;
		},
		get penWidth() {
			return penWidth;
		},
		get stampType() {
			return stampType;
		},
		get stampSize() {
			return stampSize;
		},
		get textSize() {
			return textSize;
		},
		get activeStroke() {
			return activeStroke;
		},
		get activeStrokePage() {
			return activeStrokePage;
		},
		get recentMarkIds() {
			return recentMarkIds;
		},
		get markupError() {
			return markupError;
		},
		get textEditor() {
			return textEditor;
		},
		get textEditorFocusRequest() {
			return textEditorFocusRequest;
		},
		marksForPage,
		isOwnMark,
		sizeForStamp,
		sizeForText,
		textHitWidth,
		textEditorStyle,
		openTextEditorForMark,
		cancelTextEditor,
		setTextEditorValue,
		handleTextEditorBlur,
		commitTextEditor,
		nudgeTextEditorSize,
		deleteTextEditorMark,
		setTool,
		toggleAnnotationMode,
		handleMarkupPointerDown,
		handleMarkupPointerMove,
		handleMarkupPointerUp,
		handleTextPointerDown,
		handleTextPointerMove,
		handleTextPointerUp,
		handleTextPointerCancel,
		undoLastMark,
		setPenColor,
		setPenWidth,
		setStampType,
		setStampSize,
		setTextSize,
		syncMarksForVisibility,
		syncAnnotationModeWithVisibility
	};
}

export type PdfMarkupController = ReturnType<typeof createPdfMarkupController>;
