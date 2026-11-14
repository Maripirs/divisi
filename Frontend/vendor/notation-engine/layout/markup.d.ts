import type { NoteId } from '../model/score.js';
import { type GlyphName } from '../render/glyph-metrics.js';
import type { DrawOp, LaidOutScore, Rect } from './types.js';
/**
 * Where a mark hangs: on a note (it follows the note through edits and is
 * dropped when the note is deleted), or on a measure of a staff, at its
 * start, its end, or (no `position`) its middle.
 */
export type MarkupAnchor = {
    readonly noteId: NoteId;
} | {
    readonly staffIndex: number;
    readonly measureIndex: number;
    readonly position?: 'start' | 'end';
};
/**
 * Where a mark sits relative to its anchor:
 * - `'after'` (the default, a breath mark's place): just above the staff's
 *   top line, horizontally midway between the anchored note and the next
 *   event (or the barline, after the measure's last note). Raised to clear a
 *   high note it would touch. A caesura crosses the top line instead, as
 *   engraved.
 * - `'above'`/`'below'`: centred over or under the note (or the measure),
 *   clear of all of that measure's ink on that side.
 */
export type MarkupPlacement = 'after' | 'above' | 'below';
/**
 * One personal mark (M9 markup layer). Plain data, so a host can save the
 * list as JSON and hand it back later. Draws `glyph` when it names a glyph
 * the engine bundles (see `MARKUP_GLYPHS` for the marks meant for this),
 * else `text`; a mark with neither is skipped.
 */
export interface Markup {
    /** The host's own id, unique within the list; `markupAt` reports it. */
    readonly id: string;
    readonly anchor: MarkupAnchor;
    /** A SMuFL glyph name, e.g. `'breathMarkComma'`. */
    readonly glyph?: GlyphName;
    /** Short text, drawn in italics, when there is no `glyph`. */
    readonly text?: string;
    readonly placement?: MarkupPlacement;
    /** Any CSS colour. Omitted uses `ScoreColors.markup`. */
    readonly color?: string;
}
/** The bundled glyphs meant for marking up a score: breath marks and caesuras. */
export declare const MARKUP_GLYPHS: readonly ["breathMarkComma", "breathMarkTick", "breathMarkSalzedo", "caesura", "caesuraShort"];
/** A mark resolved against a layout: what to draw, and the area it covers. */
export interface LaidOutMarkup {
    readonly id: string;
    /** The measure that owns the mark: a scoped redraw of it repaints the mark. */
    readonly staffIndex: number;
    readonly measureIndex: number;
    readonly ops: readonly DrawOp[];
    /** Every pixel the mark paints, kept inside its measure's horizontal band. */
    readonly bounds: Rect;
    readonly color?: string;
}
/**
 * Resolve `marks` against `layout` (M9 markup layer). A mark whose note or
 * measure is not in the layout (a note an edit deleted, a measure of another
 * score) is skipped silently, as is one with nothing to draw. Order follows
 * `marks`.
 */
export declare function layoutMarkup(layout: LaidOutScore, marks: readonly Markup[]): LaidOutMarkup[];
