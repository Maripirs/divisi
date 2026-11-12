import { type HitResult } from '../layout/hit-test.js';
import type { LaidOutScore, Rect } from '../layout/types.js';
import type { MeasureRef, NoteId, Score } from '../model/score.js';
import { type OnsetEvent } from '../playback/timeline.js';
import { CanvasRenderer, type CanvasRendererOptions } from '../render/renderer.js';
/** Staff space the view lays out at when `staffSpacePx` is not given. */
export declare const DEFAULT_STAFF_SPACE_PX = 10;
export interface MountOptions {
    /** Pixels between two staff lines: the zoom. Default `DEFAULT_STAFF_SPACE_PX`. */
    readonly staffSpacePx?: number;
    /** Fixed system width. Omit it to fit systems to the container's width,
     *  re-cast-off whenever the container resizes. */
    readonly systemWidthPx?: number;
    /** Where to load the SMuFL font from. Default: the Bravura shipped with
     *  the package (see `loadSmuflFont`). */
    readonly fontUrl?: string | URL;
    /** Colours and the label font, passed to `CanvasRenderer`. */
    readonly renderer?: Omit<CanvasRendererOptions, 'fontFamily'>;
    /** Scroll to keep the playback cursor in view. Default true. */
    readonly followScroll?: boolean;
    /**
     * An ancestor of the container that does the scrolling, for hosts that
     * stack several views (or other content) in one scrolling element. The
     * container then grows to the score's full height and the canvas sticks
     * to this element's top while the container passes through view. The
     * container and every element between it and this one must not scroll
     * themselves (`overflow: visible`), or the sticky canvas sticks to them
     * instead. Omit it (or pass the container itself) for the default, where
     * the container is the scroll element. Document scrolling is not
     * supported: pass an element.
     */
    readonly scrollElement?: HTMLElement;
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
     *  `scrollElement`, only when the container's top was scrolled past). */
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
    readonly isPlaying: boolean;
    readonly positionSeconds: number;
    /** The piece's length in seconds, repeats included. */
    readonly durationSeconds: number;
    /** Re-lay-out at a new staff space, keeping the same part of the score in
     *  view (with `scrollElement`, only when the container is at its top). */
    setZoom(staffSpacePx: number): void;
    readonly staffSpacePx: number;
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
 * Render `source` (a MusicXML string or a `Score`) into `container` and return
 * a handle to play, zoom and repaint it.
 *
 * By default the container is the scroll element. The view appends a canvas
 * sized to the visible window (sticky at the container's top, so it can render
 * scores far taller than a browser allows a canvas to be) and a spacer that
 * makes up the rest of the score's height. Give the container a `height` or
 * `max-height`: without one it grows to the whole score and the canvas with
 * it. If its `overflow` is `visible` the view sets `overflow: auto` (restored
 * by `destroy`); no other styling is imposed.
 *
 * With `options.scrollElement` an ancestor scrolls instead: the container's
 * `overflow` is left alone and it grows to the score's full height, the canvas
 * is as tall as that ancestor's visible height and sticks to its top while the
 * container is in view, and scrolling, following the cursor, `load` and
 * `setZoom` act on the ancestor. Several views can share one scroll element,
 * each sticking within its own container. Throws when the scroll element does
 * not contain the container.
 *
 * Resolves once the music font has loaded, since text drawn before then stays
 * as tofu.
 */
export declare function mountScore(container: HTMLElement, source: string | Score, options?: MountOptions): Promise<ScoreView>;
