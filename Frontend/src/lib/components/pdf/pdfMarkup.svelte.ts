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
	createCue,
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

/** Which layer an armed tool draws into: the caller's own `personal` marks,
 * or the shared `group` (director) layer. Only an owning-group admin can
 * pick `'director'`; it always starts at `'mine'` so an admin never scribbles
 * on the shared layer by accident. */
export type MarkupDrawTarget = 'mine' | 'director';

export type MarkupTool = 'pen' | 'stamp' | 'text' | 'eraser' | 'cue' | null;

type ActiveCueDrag = {
	markId: string;
	pageIndex: number;
	start: [number, number];
	origin: [number, number];
	moved: boolean;
} | null;

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

/** F22 cue-point time helpers. A cue stores milliseconds into the reference
 * recording; the edit UI shows/takes plain `m:ss`. Pure and exported so the
 * branch table is unit-testable without the runes factory (same split as the
 * geometry helpers above). */
export function msToMinSec(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Parses `m:ss` (seconds 0-59) into milliseconds, or `null` when the string
 * isn't a well-formed timestamp. */
export function parseMinSec(value: string): number | null {
	const match = value.trim().match(/^(\d+):([0-5]?\d)$/);
	if (!match) return null;
	return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

/** F21 gating, pulled out as a pure fn so the branch matrix is unit-testable
 * without instantiating the runes factory (same split as the geometry
 * helpers above). A `personal` mark is its creator's to move / edit / erase;
 * a `group` (director-layer) mark is only interactive for an owning-group
 * admin who is in annotation mode with the director draw target selected.
 * Everyone else sees the group layer read-only. */
export function markInteractivity(
	scope: MarkupScope,
	ctx: {
		isOwn: boolean;
		isOwningGroupAdmin: boolean;
		annotationMode: boolean;
		drawTarget: MarkupDrawTarget;
	}
): boolean {
	if (scope === 'group') {
		return ctx.isOwningGroupAdmin && ctx.annotationMode && ctx.drawTarget === 'director';
	}
	return ctx.isOwn;
}

/** The scope a newly drawn mark is saved with, given the current draw target. */
export function scopeForDrawTarget(drawTarget: MarkupDrawTarget): MarkupScope {
	return drawTarget === 'director' ? 'group' : 'personal';
}

/** F22 per-mark visibility rule, pulled out as a pure fn so its branch matrix
 * is unit-testable without instantiating the runes factory (same split as
 * `markInteractivity`). A `cue` is gated *only* by `showCues` (the bottom
 * bar's audio source being the reference recording) — never by the mine /
 * director layer toggles, so cue glyphs are always shown in the player for
 * every viewer, members and guests alike. Every other kind still follows its
 * own layer toggle. The caller has already matched the page. */
export function markVisibleOnPage(
	mark: Pick<MarkupMark, 'kind' | 'scope'>,
	ctx: { showMine: boolean; showDirector: boolean; showCues: boolean }
): boolean {
	if (mark.kind === 'cue') return ctx.showCues;
	return mark.scope === 'group' ? ctx.showDirector : ctx.showMine;
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
	/** `showMineMarkup` / `showDirectorMarkup` are the two independent,
	 * session-local visibility toggles, `$bindable` on `PdfView` and two-way-
	 * bound by the parent route. They are additive: both layers can show at
	 * once. Arming annotation mode forces `showMine` on; picking the director
	 * draw target forces `showDirector` on, so the controller needs write
	 * access to both. */
	getShowMine: () => boolean;
	setShowMine: (value: boolean) => void;
	getShowDirector: () => boolean;
	setShowDirector: (value: boolean) => void;
	/** `isOwningGroupAdmin` prop: whether the caller is an admin of this
	 * piece's owning group. Gates the `'director'` draw target and whether
	 * group-layer marks are interactive. Always false for a personal piece,
	 * a non-admin member, or a guest. */
	isOwningGroupAdmin: () => boolean;
	/** `pageAspects[pageIndex] ?? 1.4142`. `pageAspects` is written by pdf.js
	 * (`renderAllPages`, which stays in `PdfView`); the markup geometry only
	 * reads it. */
	aspectFor: (pageIndex: number) => number;
	/** `canvasRefs[pageIndex]`. The controller cannot see `canvasRefs`
	 * directly. */
	canvasFor: (pageIndex: number) => HTMLCanvasElement | undefined;
	/** F22: the reference recording's current playhead in ms, or `null` when
	 * no reference player exists yet. Captured when a cue is dropped. */
	getReferencePositionMs: () => number | null;
	/** F22: whether the cue tool may be used — the piece has a reference
	 * recording and the bottom bar's audio source is that recording. Gates
	 * the toolbar button and cue placement. */
	canPlaceCue: () => boolean;
	/** F22: whether the bottom bar's audio source is the reference recording.
	 * Cues are meaningless against "My mix", so they are hidden (not just
	 * un-editable) when this is false. */
	audioSourceIsReference: () => boolean;
	/** F22: tapping an existing cue jumps the reference recording here and
	 * plays. The host owns the reference player, so it does the seek/play. */
	onCueTap: (timeMs: number) => void;
	/** F22: a loader for the group-layer cue glyphs, shown in the player for
	 * every viewer independent of the "Show director markup" toggle and of
	 * `canMarkup` (so guests get them too). Returns the loader fn for a real
	 * group piece that has a reference recording, or `null` for a fixture / a
	 * piece with no reference recording (no cues to show). */
	cueLoader: () => (() => Promise<MarkupMark[]>) | null;
}

export function createPdfMarkupController(deps: PdfMarkupControllerDeps) {
	// One array holds both layers; each mark carries its own `scope`, so
	// `marksForPage` filters to whichever toggles are on and the CRUD paths
	// stay single. Loaded marks of a scope are kept in memory even while
	// their toggle is off (re-enabling shows them again without a refetch).
	let marks = $state<MarkupMark[]>([]);
	// Session bookkeeping, not reactive: the `${pieceId}:<scope>` key whose
	// marks of that scope are currently loaded, one per layer.
	let personalLoadedKey: string | undefined;
	let groupLoadedKey: string | undefined;
	// F22: the `${pieceId}:cues` key whose group cue glyphs are currently
	// loaded into `marks` for the player. Separate from `groupLoadedKey`: cues
	// load unconditionally (not behind "Show director markup"), for guests too.
	let cuesLoadedKey: string | undefined;

	// F12: a master edit-mode toggle separate from which tool is armed. The
	// visibility toggles (in the piece route's Practice Setup drawer) decide
	// whether saved marks are shown at all.
	let annotationMode = $state(false);
	// F21: which layer an armed tool draws into. Only ever `'director'` while
	// annotation mode is on and the caller is an owning-group admin.
	let drawTarget = $state<MarkupDrawTarget>('mine');
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
	// F22: an in-progress cue drag, and which cue's mm:ss editor is open in
	// the toolbar. `selectedCueId` only means anything while annotation mode
	// is on and the cue is interactive (see `selectedCue`).
	let activeCueDrag = $state<ActiveCueDrag>(null);
	let selectedCueId = $state<string | null>(null);
	// Bumped on every focus request. `PdfMarkupLayer` owns the text input's ref
	// and re-focuses off an `$effect` that depends on this counter, so the
	// blur-guard re-focus path works without the controller touching the DOM.
	let textEditorFocusRequest = $state(0);

	function requestTextEditorFocus(): void {
		textEditorFocusRequest++;
	}

	/** Drives the mark list off `(pieceId, showMine, showDirector)`. `PdfView`
	 * calls this from an `$effect`, so the reactive reads below register as
	 * deps. Loads each layer the first time its toggle turns on and leaves it
	 * cached after; a toggle going off just stops `marksForPage` rendering it. */
	function syncMarksForVisibility(): void {
		const id = deps.pieceId();
		if (!deps.canMarkup() || !id) {
			marks = [];
			personalLoadedKey = undefined;
			groupLoadedKey = undefined;
			return;
		}
		if (deps.getShowMine()) {
			const key = `${id}:personal`;
			if (personalLoadedKey !== key) {
				personalLoadedKey = key;
				void loadScope(id, 'personal', key);
			}
		}
		if (deps.getShowDirector()) {
			const key = `${id}:group`;
			if (groupLoadedKey !== key) {
				groupLoadedKey = key;
				void loadScope(id, 'group', key);
			}
		}
	}

	async function loadScope(id: string, scope: MarkupScope, key: string): Promise<void> {
		try {
			const loaded = await listMarks(id, scope);
			const currentKey = scope === 'group' ? groupLoadedKey : personalLoadedKey;
			if (currentKey !== key) return;
			// Swap in just this scope's marks; leave the other layer untouched.
			marks = [...marks.filter((mark) => mark.scope !== scope), ...loaded];
		} catch {
			// A failed load just means no prior marks show yet, not worth a
			// blocking error state on top of the PDF's own; the toolbar still
			// works and a new mark's own save will surface its own error if the
			// Backend is genuinely unreachable.
		}
	}

	/** F22: load the group-layer cue glyphs for the player, independent of the
	 * "Show director markup" toggle and of `canMarkup` (guests included). The
	 * host supplies a `cueLoader` only for a real group piece with a reference
	 * recording; a fixture or a piece without one passes `null` and no cues
	 * load. `PdfView` calls this from an `$effect`.
	 *
	 * Interplay with `loadScope(id, 'group', …)`: if "Show director markup"
	 * later pulls the full group scope, that swap replaces every
	 * `scope === 'group'` mark with the server list (cues included), so there
	 * is no duplication and the cues persist. `loadCues`'s own id `Set` covers
	 * the reverse order (cues already in `marks` when the group scope loads on
	 * top would be filtered by `loadScope`'s replace, then re-added here on the
	 * next `syncCues` only if the key changed — it will not, so no churn). */
	function syncCues(): void {
		const id = deps.pieceId();
		const loader = deps.cueLoader();
		if (!id || !loader) return;
		const key = `${id}:cues`;
		if (cuesLoadedKey === key) return;
		cuesLoadedKey = key;
		void loadCues(loader, key);
	}

	async function loadCues(loader: () => Promise<MarkupMark[]>, key: string): Promise<void> {
		try {
			const loaded = await loader();
			if (cuesLoadedKey !== key) return;
			const have = new Set(marks.map((mark) => mark.id));
			marks = [...marks, ...loaded.filter((cue) => !have.has(cue.id))];
		} catch {
			// Same rationale as `loadScope`: a failed load just means no cues
			// show yet, not worth a blocking error state over the PDF's own.
		}
	}

	// The visibility toggles + admin flag live on the host. When nothing is
	// visible anymore, disarm the master toggle and any in-progress mark (the
	// same cleanup `toggleAnnotationMode` does when turned off directly); and
	// snap the draw target back to `'mine'` whenever `'director'` is no longer
	// allowed. `PdfView` calls this from an `$effect`.
	function syncAnnotationModeWithVisibility(): void {
		if (annotationMode && !deps.getShowMine() && !deps.getShowDirector()) {
			annotationMode = false;
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
			activeCueDrag = null;
			selectedCueId = null;
		}
		if (drawTarget === 'director' && !(annotationMode && deps.isOwningGroupAdmin())) {
			drawTarget = 'mine';
			// The cue tool is director-only; clear it the same way `setDrawTarget`
			// does when switching back to "mine".
			if (tool === 'cue') {
				tool = null;
				selectedCueId = null;
				activeCueDrag = null;
			}
		}
	}

	/** The scope an armed tool writes into right now. */
	function currentScope(): MarkupScope {
		return scopeForDrawTarget(drawTarget);
	}

	function marksForPage(pageIndex: number): MarkupMark[] {
		const pageNumber = pageIndex + 1;
		const ctx = {
			showMine: deps.getShowMine(),
			showDirector: deps.getShowDirector(),
			// F22: a cue's timestamp only means anything against the reference
			// recording — hide cues entirely under "My mix" and in score view.
			// A cue is gated *only* by this, never the layer toggles, so cue
			// glyphs are always in the player for members and guests alike.
			showCues: deps.audioSourceIsReference()
		};
		return marks.filter((mark) => mark.pageNumber === pageNumber && markVisibleOnPage(mark, ctx));
	}

	function isOwnMark(mark: MarkupMark): boolean {
		return mark.userId === deps.currentUserId();
	}

	/** Whether the caller may move / edit / erase this mark. A `personal` mark
	 * is its creator's; a `group` mark is only interactive for an owning-group
	 * admin whose draw target is the director layer. */
	function isMarkInteractive(mark: MarkupMark): boolean {
		return markInteractivity(mark.scope, {
			isOwn: isOwnMark(mark),
			isOwningGroupAdmin: deps.isOwningGroupAdmin(),
			annotationMode,
			drawTarget
		});
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
		if (mark.kind !== 'text' || !isMarkInteractive(mark) || mark.x === null || mark.y === null) return;
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
				const created = await createText(
					pieceId,
					editor.pageIndex + 1,
					editor.color,
					editor.width,
					value,
					editor.x,
					editor.y,
					currentScope()
				);
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
		activeCueDrag = null;
		selectedCueId = null;
	}

	/** Flips the master toggle. Arming it turns "Show my markup" on if it was
	 * off (F21). Turning it off also disarms whatever tool was selected, drops
	 * any in-progress stroke, and resets the draw target, otherwise the mode
	 * could come back on already armed or aimed at the shared layer, or a
	 * pointerup after the layer's already unmounted could try to commit a
	 * stroke nobody can see anymore. */
	function toggleAnnotationMode(): void {
		if (!annotationMode && !deps.getShowMine()) deps.setShowMine(true);
		annotationMode = !annotationMode;
		if (!annotationMode) {
			tool = null;
			activeStroke = null;
			activeStrokePage = -1;
			textEditor = null;
			activeTextDrag = null;
			activeCueDrag = null;
			selectedCueId = null;
			drawTarget = 'mine';
		}
	}

	/** F21: switch which layer an armed tool draws into. `'director'` is a
	 * no-op unless the caller is an owning-group admin; picking it also turns
	 * "Show director markup" on so the admin sees what they are editing.
	 * Picking `'mine'` keeps "Show my markup" on for the same reason. */
	function setDrawTarget(target: MarkupDrawTarget): void {
		if (target === 'director') {
			if (!deps.isOwningGroupAdmin()) return;
			deps.setShowDirector(true);
		} else {
			deps.setShowMine(true);
			// The cue tool is director-only; its button is about to vanish, so
			// disarm it (mirrors what `setTool` resets).
			if (tool === 'cue') {
				tool = null;
				selectedCueId = null;
				activeCueDrag = null;
			}
		}
		drawTarget = target;
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
		} else if (tool === 'cue') {
			event.preventDefault();
			void placeCue(pageIndex, point);
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
			const created = await createStroke(pieceId, pageIndex + 1, penColor, penWidth, points, currentScope());
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
			const created = await createStamp(
				pieceId,
				pageIndex + 1,
				penColor,
				stampType,
				stampSize,
				point[0],
				point[1],
				currentScope()
			);
			marks = [...marks, created];
			recentMarkIds = [...recentMarkIds, created.id];
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	/** F22: the cue tool is director-layer only. It needs a usable reference
	 * recording (`canPlaceCue`), an owning-group admin caller, and the director
	 * draw target selected. On "mine" the button is simply hidden; there is no
	 * personal-cue path anymore. */
	function cuePlacementAllowed(): boolean {
		return deps.canPlaceCue() && deps.isOwningGroupAdmin() && drawTarget === 'director';
	}

	/** F22: drop a cue at `point`, capturing the reference recording's
	 * current playhead. A null playhead (no reference player yet) saves at
	 * `0`; the mm:ss editor can re-time it afterward. Always saved with
	 * `scope === 'group'` (the director layer is the only place cues live). */
	async function placeCue(pageIndex: number, point: [number, number]): Promise<void> {
		const pieceId = deps.pieceId();
		if (!pieceId || !cuePlacementAllowed()) return;
		markupError = null;
		try {
			const created = await createCue(
				pieceId,
				pageIndex + 1,
				penColor,
				point[0],
				point[1],
				Math.max(0, Math.round(deps.getReferencePositionMs() ?? 0)),
				currentScope()
			);
			marks = [...marks, created];
			recentMarkIds = [...recentMarkIds, created.id];
			selectedCueId = created.id;
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	/** Whether tapping this cue right now should edit it (annotation mode +
	 * interactive) rather than jump the recording. */
	function cueIsEditable(mark: MarkupMark): boolean {
		return annotationMode && isMarkInteractive(mark);
	}

	function handleCuePointerDown(event: PointerEvent, mark: MarkupMark, pageIndex: number): void {
		if (mark.kind !== 'cue') return;
		// A cue is always its own interaction (play or edit), never a canvas
		// draw underneath it.
		event.stopPropagation();
		if (!cueIsEditable(mark) || mark.x === null || mark.y === null) return;
		event.preventDefault();
		const point = pointFromEvent(event, pageIndex);
		if (!point) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		activeCueDrag = {
			markId: mark.id,
			pageIndex,
			start: point,
			origin: [mark.x, mark.y],
			moved: false
		};
	}

	function handleCuePointerMove(event: PointerEvent): void {
		const drag = activeCueDrag;
		if (!drag) return;
		event.stopPropagation();
		const point = pointFromEvent(event, drag.pageIndex);
		if (!point) return;
		const nextX = Math.max(0, Math.min(1, drag.origin[0] + point[0] - drag.start[0]));
		const aspect = deps.aspectFor(drag.pageIndex);
		const nextY = Math.max(0, Math.min(aspect, drag.origin[1] + point[1] - drag.start[1]));
		const moved = drag.moved || Math.hypot(nextX - drag.origin[0], nextY - drag.origin[1]) > 0.006;
		activeCueDrag = { ...drag, moved };
		marks = marks.map((candidate) =>
			candidate.id === drag.markId ? { ...candidate, x: nextX, y: nextY } : candidate
		);
	}

	async function handleCuePointerUp(event: PointerEvent, mark: MarkupMark): Promise<void> {
		if (mark.kind !== 'cue') return;
		event.stopPropagation();
		const drag = activeCueDrag;
		if (!drag || drag.markId !== mark.id) {
			// No drag was started: a plain tap.
			if (!cueIsEditable(mark)) deps.onCueTap(mark.timeMs ?? 0);
			else selectedCueId = selectedCueId === mark.id ? null : mark.id;
			return;
		}
		activeCueDrag = null;
		if (!drag.moved) {
			selectedCueId = selectedCueId === mark.id ? null : mark.id;
			return;
		}
		const current = marks.find((candidate) => candidate.id === mark.id) ?? mark;
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

	function handleCuePointerCancel(mark: MarkupMark): void {
		const drag = activeCueDrag;
		if (!drag || drag.markId !== mark.id) return;
		activeCueDrag = null;
		marks = marks.map((candidate) =>
			candidate.id === mark.id ? { ...candidate, x: drag.origin[0], y: drag.origin[1] } : candidate
		);
	}

	/** Re-time the cue whose mm:ss editor is open. Optimistic, with a Backend
	 * round trip that reconciles. */
	async function setSelectedCueTime(ms: number): Promise<void> {
		const id = selectedCueId;
		const pieceId = deps.pieceId();
		if (!id || !pieceId) return;
		const safe = Math.max(0, Math.round(ms));
		marks = marks.map((mark) => (mark.id === id ? { ...mark, timeMs: safe } : mark));
		markupError = null;
		try {
			const updated = await updateMark(pieceId, id, { timeMs: safe });
			marks = marks.map((mark) => (mark.id === updated.id ? updated : mark));
		} catch (err) {
			markupError = markupErrorMessage(err);
		}
	}

	function deleteSelectedCue(): void {
		const id = selectedCueId;
		selectedCueId = null;
		if (id) void removeMark(id);
	}

	function handleTextPointerDown(event: PointerEvent, mark: MarkupMark, pageIndex: number): void {
		if (!annotationMode || !isMarkInteractive(mark) || mark.x === null || mark.y === null) return;
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
			.filter(isMarkInteractive)
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
		get drawTarget() {
			return drawTarget;
		},
		/** Whether the "Drawing into" control should be offered at all: an
		 * owning-group admin only. */
		get canDrawDirector() {
			return deps.isOwningGroupAdmin();
		},
		get showMine() {
			return deps.getShowMine();
		},
		get showDirector() {
			return deps.getShowDirector();
		},
		/** F22: whether cue glyphs are on the page right now — the reference
		 * recording is the selected audio source and at least one cue is
		 * loaded. `PdfMarkupLayer` mounts its SVG off this for cue-only viewers
		 * (guests included), independent of `canMarkup` and the layer toggles. */
		get cuesVisible() {
			return deps.audioSourceIsReference() && marks.some((mark) => mark.kind === 'cue');
		},
		/** F22: whether the cue tool should appear. Director-layer only: a
		 * usable reference recording, an owning-group admin caller, and the
		 * director draw target selected. `PdfMarkupPanel` shows/hides the button
		 * off this. */
		get canPlaceCue() {
			return cuePlacementAllowed();
		},
		get selectedCueId() {
			return selectedCueId;
		},
		/** The cue whose mm:ss editor the toolbar should show: a selected cue
		 * that is genuinely editable right now (annotation mode + interactive).
		 * `null` otherwise, so the toolbar row simply isn't rendered. */
		get selectedCue(): MarkupMark | null {
			if (!selectedCueId) return null;
			const mark = marks.find((candidate) => candidate.id === selectedCueId);
			if (!mark || mark.kind !== 'cue' || !cueIsEditable(mark)) return null;
			return mark;
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
		isMarkInteractive,
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
		setDrawTarget,
		handleMarkupPointerDown,
		handleMarkupPointerMove,
		handleMarkupPointerUp,
		handleTextPointerDown,
		handleTextPointerMove,
		handleTextPointerUp,
		handleTextPointerCancel,
		handleCuePointerDown,
		handleCuePointerMove,
		handleCuePointerUp,
		handleCuePointerCancel,
		setSelectedCueTime,
		deleteSelectedCue,
		undoLastMark,
		setPenColor,
		setPenWidth,
		setStampType,
		setStampSize,
		setTextSize,
		syncMarksForVisibility,
		syncCues,
		syncAnnotationModeWithVisibility
	};
}

export type PdfMarkupController = ReturnType<typeof createPdfMarkupController>;
