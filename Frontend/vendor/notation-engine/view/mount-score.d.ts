import { type MusicXmlBytes } from '../io/mxl.js';
import { type HitResult } from '../layout/hit-test.js';
import type { Markup } from '../layout/markup.js';
import type { LaidOutScore, Rect } from '../layout/types.js';
import type { MeasureRef, NoteId, Score } from '../model/score.js';
import { type OnsetEvent } from '../playback/timeline.js';
import { CanvasRenderer, type CanvasRendererOptions, type ScoreColors } from '../render/renderer.js';
/** Staff space the view lays out at when `staffSpacePx` is not given. */
export declare const DEFAULT_STAFF_SPACE_PX = 10;
/** How far into a measure, in seconds, a step back with `seekMeasure`
 *  rewinds to that measure's own start instead of the previous one. */
export declare const MEASURE_RESTART_SECONDS = 0.5;
export interface MountOptions {
    /** Pixels between two staff lines: the zoom. Default `DEFAULT_STAFF_SPACE_PX`. */
    readonly staffSpacePx?: number;
    /** Fixed system width. Omit it to fit systems to the container's width,
     *  re-cast-off whenever the container resizes. */
    readonly systemWidthPx?: number;
    /** Draw the score's title block (title, subtitle, composer, lyricist)
     *  above the first system. Default true; see `LayoutOptions.header`. */
    readonly header?: boolean;
    /** Announce clef, key and time changes at a system break at the end of
     *  the system before. Default true; see `LayoutOptions.courtesy`. */
    readonly courtesy?: boolean;
    /** Draw the "//" system divider between systems of a score with three or
     *  more staves. Default false; see `LayoutOptions.systemSeparators`. */
    readonly systemSeparators?: boolean;
    /** Where to load the SMuFL font from. Default: the Bravura shipped with
     *  the package (see `loadSmuflFont`). */
    readonly fontUrl?: string | URL;
    /** Colours (`ScoreColors`) and the label font, passed to
     *  `CanvasRenderer`. Change colours later with `setColors`. */
    readonly renderer?: Omit<CanvasRendererOptions, 'fontFamily'>;
    /** Scroll to keep the playback cursor in view. Default true. */
    readonly followScroll?: boolean;
    /**
     * What does the scrolling when it is not the container: an ancestor
     * element, or the page itself (`window`, `document`, or the document's
     * root or scrolling element, all treated alike), for hosts that stack
     * several views (or other content) in one scrolling element or in a page
     * that scrolls as a whole. The container then grows to the score's full
     * height and the canvas sticks to the scroller's top (the viewport's, for
     * the page) while the container passes through view. The container and
     * every element between it and the scroller must not scroll themselves
     * (`overflow: visible`), or the sticky canvas sticks to them instead.
     * Omit it (or pass the container itself) for the default, where the
     * container is the scroll element.
     */
    readonly scrollElement?: HTMLElement | Window | Document;
    /** `false` makes the view silent: `play()` does nothing and no
     *  `AudioContext` is ever created. Default true. */
    readonly playback?: boolean;
}
export interface ScoreViewEvents {
    /** A press on the score. `hit` is the note under the pointer, or `null`
     *  for empty space (so a host can clear its selection). */
    readonly noteclick: (hit: HitResult | null, event: PointerEvent) => void;
    /** A note starting during playback, as `PlaybackEngine`'s `onOnset`. */
    readonly onset: (event: OnsetEvent) => void;
    /** Playback ran off the end of the score (not fired by `stop()`). */
    readonly end: () => void;
    /**
     * The layout was replaced or repainted in a way that can move things:
     * `load`, `setZoom`, a container resize, `refresh` (scoped or not) and
     * `setScore`. Fired after the repaint, with the new layout. A host
     * re-reads `noteBox`/`measureBox`/`staffBoxes` here to move its overlays.
     * Scrolling does not fire it: those boxes are relative to the container's
     * padding box, which scrolling does not change (with `scrollElement` the
     * container itself moves, and overlays inside it move along).
     */
    readonly layout: (layout: LaidOutScore) => void;
}
export interface ScoreView {
    /** Show a new score: stops playback, lays out, scrolls to the top (with
     *  `scrollElement`, only when the container's top was scrolled past).
     *  Synchronous, so it takes no bytes: `load(await importMxl(bytes))`. */
    load(source: string | Score): void;
    /** Start or resume. The first call creates the `AudioContext`, so call it
     *  from a user gesture (a click handler) for the browser to allow sound. */
    play(): void;
    /** Freeze at the current position; notes already sounding ring out. */
    pause(): void;
    /** Silence, rewind to the start and clear the cursor. */
    stop(): void;
    /** Move to `seconds` into the piece, playing on from there if playing. */
    seek(seconds: number): void;
    /** Seek to the first time `noteId` sounds (repeats play it more than
     *  once). Returns false, without seeking, for a note that never sounds. */
    seekToNote(noteId: NoteId): boolean;
    /**
     * Move to the start of the measure `delta` measures away, in playing
     * order (repeats and voltas followed, so a step past a repeat sign lands
     * where the repeat goes back to), playing on from there if playing. A
     * negative step counts from the current measure's start when the
     * position is more than `MEASURE_RESTART_SECONDS` into it, so one step
     * back first rewinds to the measure's own start, like a media player's
     * previous-track button. A step past either end stops at the first or
     * last measure; returns false, without seeking, when that leaves nowhere
     * to go (already at the very start, or already in the last measure) or
     * `delta` is 0.
     */
    seekMeasure(delta: number): boolean;
    readonly isPlaying: boolean;
    readonly positionSeconds: number;
    /** The piece's length in seconds, repeats included. */
    readonly durationSeconds: number;
    /** Re-lay-out at a new staff space, keeping the same part of the score in
     *  view (with `scrollElement`, only when the container is at its top). */
    setZoom(staffSpacePx: number): void;
    readonly staffSpacePx: number;
    /**
     * Change some colours (M9 Slice 6), e.g. when the host switches to a dark
     * theme, and repaint. Keys left out keep their colour; see
     * `CanvasRenderer.setColors`. No relayout: the `layout` event does not
     * fire. The container's own CSS background is the host's to match.
     */
    setColors(colors: Partial<ScoreColors>): void;
    /**
     * Colour individual notes (M9), e.g. green for a pitch hit in a practice
     * mode, or `null` to clear them; replaces the whole map. Repaints only the
     * measures whose note colours changed; no relayout, so the `layout` event
     * does not fire. Selection and the playback cursor win over a note colour,
     * which wins over a staff colour. Kept across `setZoom`, resizes,
     * `refresh` and `setScore` (a deleted note's colour stops drawing);
     * `load` clears them. See `CanvasRenderer.setNoteColors`.
     */
    setNoteColors(colors: ReadonlyMap<NoteId, string> | null): void;
    /** The current note colours, as last set. */
    readonly noteColors: ReadonlyMap<NoteId, string>;
    /** Scroll the container (or `scrollElement`) so `noteId`'s measure is in
     *  view, if it is not. */
    scrollToNote(noteId: NoteId): void;
    /**
     * Where a note's clickable box sits in the container's scroll content: CSS
     * pixels from the top left of the container's padding box, scrolling with
     * the score. An element absolutely positioned at these coordinates inside
     * the container (with the container `position: relative`) lines up with
     * the note at any scroll position and zoom. With `scrollElement` the
     * container does not scroll itself (its `scrollTop` is 0) but moves with
     * the outer scroll, so the same overlays still line up. `null` for an
     * unknown id.
     */
    noteBox(noteId: NoteId): Rect | null;
    /** A measure's whole region (all its ink) in the same coordinates as
     *  `noteBox`, or `null` when the score has no such measure. */
    measureBox(measure: MeasureRef): Rect | null;
    /** One staff's band per system, top to bottom, in the same coordinates as
     *  `noteBox`: the union of its measures' regions there, e.g. to shade a
     *  muted part. Empty for an unknown staff. */
    staffBoxes(staffIndex: number): Rect[];
    /**
     * Replace the markup layer (M9): the host's own marks (breath marks,
     * caesuras, short text) drawn over the score at its scale, anchored to
     * notes or measures. Repaints only the measures whose marks changed; no
     * relayout, so the `layout` event does not fire. The view keeps the list
     * across `setZoom`, resizes, `refresh` and `setScore` (re-resolving it
     * against the new layout, so a mark on a deleted note stops drawing);
     * `load` clears it, since a new score has other notes. Marks are never
     * part of the score: not exported, not undone. See `Markup`.
     */
    setMarkup(marks: readonly Markup[]): void;
    /** The current markup list, as last set. */
    readonly markup: readonly Markup[];
    /** The id of the mark under a pointer event (client coordinates), or
     *  `null`, e.g. from a `noteclick` handler to edit or remove a mark. */
    markupAt(event: {
        readonly clientX: number;
        readonly clientY: number;
    }): string | null;
    /** Where mark `id` is drawn, in the same coordinates as `noteBox`, or
     *  `null` when it is not drawn. */
    markupBox(id: string): Rect | null;
    /** Subscribe; returns the unsubscribe function. */
    on<K extends keyof ScoreViewEvents>(name: K, handler: ScoreViewEvents[K]): () => void;
    readonly score: Score;
    readonly layout: LaidOutScore;
    readonly renderer: CanvasRenderer;
    readonly canvas: HTMLCanvasElement;
    /**
     * Repaint after the host edited `score` in place. With `changed` (the
     * `MeasureRef`s an edit op returned) only those measures are re-laid-out
     * and redrawn, falling back to a whole-score pass when one of them
     * declines (its width changed). Returns true when the scoped path held.
     * Also marks the playback timeline stale; it is rebuilt at the next
     * `play()` that does not interrupt playback.
     */
    refresh(changed?: readonly MeasureRef[]): boolean;
    /**
     * Show a different `Score` object without stopping playback or moving the
     * scroll position, e.g. the one `EditHistory.undo()` swaps in. Otherwise
     * like `refresh()` with no argument.
     */
    setScore(score: Score): void;
    /** Remove the canvas, listeners and observer, stop playback and close the
     *  `AudioContext`. Safe to call more than once. */
    destroy(): void;
}
/**
 * Render `source` (a MusicXML string, the bytes of a `.mxl` or MusicXML file,
 * or a `Score`) into `container` and return a handle to play, zoom and repaint
 * it. Bytes go through `importMxl`.
 *
 * By default the container is the scroll element. The view appends a canvas
 * sized to the visible window (sticky at the container's top, so it can render
 * scores far taller than a browser allows a canvas to be) and a spacer that
 * makes up the rest of the score's height. Give the container a `height` or
 * `max-height`: without one it grows to the whole score and the canvas with
 * it. If its `overflow` is `visible` the view sets `overflow: auto` (restored
 * by `destroy`); no other styling is imposed.
 *
 * With `options.scrollElement` an ancestor or the page scrolls instead: the
 * container's `overflow` is left alone and it grows to the score's full
 * height, the canvas is as tall as the scroller's visible height (the
 * viewport's, less any horizontal scrollbar, for the page) and sticks to its
 * top while the container is in view, and scrolling, following the cursor,
 * `load` and `setZoom` act on the scroller. Several views can share one
 * scroller, each sticking within its own container. Throws when the scroll
 * element does not contain the container, or for the page, when the
 * container is not attached to that document.
 *
 * Resolves once the music font has loaded, since text drawn before then stays
 * as tofu.
 */
export declare function mountScore(container: HTMLElement, source: string | Score | MusicXmlBytes, options?: MountOptions): Promise<ScoreView>;
