import type { Rect } from '../layout/types.js';
import type { NoteId } from '../model/score.js';
/** Narrowest system `systemWidthForContainer` will ask layout for. Below it a
 *  measure or two per system stops being readable; the canvas scales down
 *  instead (see `fitScale`). */
export declare const MIN_SYSTEM_WIDTH_PX = 200;
/** The `systemWidthPx` to lay out at for a container whose content box is
 *  `contentWidthPx` wide, so systems cast off to fit it rather than overflow. */
export declare function systemWidthForContainer(contentWidthPx: number): number;
/** Layout pixels to CSS pixels: 1 unless the layout is wider than the room
 *  available (a container narrower than even one measure), in which case the
 *  score shrinks to fit, keeping its aspect ratio. */
export declare function fitScale(layoutWidthPx: number, availableWidthPx: number): number;
/**
 * The band of the score a window-sized sticky canvas shows, in layout
 * coordinates. `canvasTopPx` is how far down the scrolled content the canvas
 * currently sits (CSS pixels): it tracks the scroll position until the canvas
 * reaches the bottom of the score, where sticky positioning stops it.
 */
export declare function viewportBand(canvasTopPx: number, viewHeightPx: number, layoutWidthPx: number, scale: number): Rect;
/** A pointer position (client coordinates) to layout coordinates, given the
 *  canvas's client rect, the renderer's viewport origin and the CSS scale. */
export declare function clientToLayout(clientX: number, clientY: number, canvasRect: {
    readonly left: number;
    readonly top: number;
}, viewport: {
    readonly x: number;
    readonly y: number;
} | null, scale: number): {
    x: number;
    y: number;
};
/** A layout rect to the container's scroll content (CSS pixels from the top
 *  left of its padding box, scrolled along with the score): the inverse of
 *  `clientToLayout` for a host's absolutely positioned overlays. `origin` is
 *  where layout (0, 0) sits in that content. */
export declare function layoutToContent(rect: Rect, origin: {
    readonly x: number;
    readonly y: number;
}, scale: number): Rect;
/**
 * Where to scroll so `region` (layout coordinates) is in view, or `null` when
 * it already fully is. `contentTopPx` is where the score starts in the scroll
 * content (the container's top padding). Centres the region rather than
 * snapping it to the edge, and leaves a visible region alone: onsets fire
 * several times a second, and restarting a smooth scroll on each one makes the
 * view judder, so in practice this scrolls once per system.
 */
export declare function followScrollTop(region: Rect, scale: number, contentTopPx: number, scrollTop: number, clientHeight: number): number | null;
/**
 * Collects the note ids of onsets that fire in one JS turn and hands them to
 * `flush` together on the next microtask.
 *
 * A chord or simultaneous voices arrive as one `OnsetEvent` per note, fired
 * back to back by one scheduler pass. Moving the cursor per event would flash
 * a one-note cursor for a turn before the next event widened it, an artifact
 * of scheduling order, not of the music.
 */
export declare class OnsetBatcher {
    #private;
    constructor(flush: (noteIds: NoteId[]) => void, schedule?: (callback: () => void) => void);
    push(noteId: NoteId): void;
    /** Drop whatever has not been flushed yet (a stop or seek mid-turn). */
    clear(): void;
}
