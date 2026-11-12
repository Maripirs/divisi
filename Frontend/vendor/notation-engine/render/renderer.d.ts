import type { LaidOutScore, Rect } from '../layout/types.js';
import type { NoteId } from '../model/score.js';
export interface CanvasRendererOptions {
    /** Font family the SMuFL font is registered under. */
    readonly fontFamily?: string;
    /** Font family a `text` op (M2 Slice 5's part-name labels) draws with.
     *  Ordinary text, not a music glyph, so it uses a normal text font rather
     *  than `fontFamily`'s SMuFL one. */
    readonly labelFontFamily?: string;
    /** Ink colour for staff, glyphs and stems. */
    readonly foreground?: string;
    /**
     * Colour painted over a region before redrawing it. `null` uses
     * `clearRect` instead, for a canvas layered over something else.
     */
    readonly background?: string | null;
    /** Ink colour for the ops belonging to the selected note. */
    readonly selection?: string;
    /**
     * Ink colour for the ops belonging to a note currently under the playback
     * cursor (M4 Slice 2). Deliberately distinct from `selection`'s orange/rust
     * so a live editor selection and an in-progress playback highlight never
     * read as the same thing on screen.
     */
    readonly playbackCursor?: string;
    /**
     * Translucent fill painted over the whole region of every measure in the
     * current measure range (M5 Slice 4). A background tint, not an ink
     * colour, and deliberately a pale blue distinct from both `selection` and
     * `playbackCursor`: see `#paintMeasureRangeTint`'s own comment on why.
     */
    readonly measureRange?: string;
    /**
     * Fill colour for a seam marker strip (M5 Slice 6, see `setSeamMarkers`).
     * Translucent so the barline it sits on still shows through, and a red
     * distinct from every other highlight colour here, since a seam is a
     * host annotation, not an editing state.
     */
    readonly seamMarker?: string;
}
/** One measure boundary to mark (M5 Slice 6). See `regionForMeasureBoundary`
 *  for exactly which boundary `boundaryIndex` names. */
export interface SeamMarker {
    readonly staffIndex: number;
    readonly boundaryIndex: number;
}
/** A contiguous run of measures on one staff (M5 Slice 4), inclusive at both
 *  ends. `from`/`to` are staff-local measure indices (`LaidOutMeasure.index`)
 *  and may be passed in either order; `CanvasRenderer.setMeasureRange`
 *  normalizes them so `from <= to`. */
export interface MeasureRange {
    readonly staffIndex: number;
    readonly from: number;
    readonly to: number;
}
export declare class CanvasRenderer {
    #private;
    /**
     * Measure indices painted by the most recent draw call, in the order they
     * were painted.
     *
     * This exists for testing, not for the host app. "Only the touched measure
     * redraws" is the claim Phase 0 has to substantiate, and a wall-clock number
     * cannot substantiate it: a fast redraw might still be repainting everything
     * on a small score. This makes the claim a property that can be asserted in
     * CI on any machine.
     */
    lastRedrawnMeasures: number[];
    /** Regions cleared and repainted by the most recent draw call. */
    lastRedrawnRegions: Rect[];
    constructor(ctx: CanvasRenderingContext2D, layout: LaidOutScore, options?: CanvasRendererOptions);
    get layout(): LaidOutScore;
    /**
     * Swap in a new layout without redrawing.
     *
     * After an edit the caller re-lays-out the score, installs the new layout,
     * then redraws only the measures the edit reported. Splitting "install" from
     * "draw" is what makes that possible; a `render(layout)` API would force a
     * full repaint on every layout change, which is exactly OSMD's shape.
     */
    setLayout(layout: LaidOutScore): void;
    get selectedNoteId(): NoteId | null;
    /**
     * Change the selection, returning the `(staffIndex, index)` pairs whose
     * appearance changed so the caller can redraw exactly those. Selection is a
     * render-time concern, not a model one: nothing about the music changes
     * when a user clicks a note.
     *
     * Fixed in M4 Slice 1: this used to return bare measure indices, and a
     * caller feeding that straight into `redrawMeasures` (which defaults
     * `staffIndex` to 0) would repaint staff 0's same-numbered measure instead
     * of the staff the selection actually changed on, since each staff numbers
     * its own measures from 0 (see `LaidOutMeasure.staffIndex`'s own doc
     * comment). That was silent as long as every score had one staff; on a
     * multi-staff one it left the true change unpainted and vandalised an
     * unrelated measure's pixels instead. Returning the pair the note actually
     * lives on removes the ambiguity at the source rather than trusting every
     * caller to know which staff a note came from.
     */
    setSelection(noteId: NoteId | null): {
        staffIndex: number;
        index: number;
    }[];
    /**
     * Change the playback cursor to `noteIds`, returning the `(staffIndex,
     * index)` pairs whose appearance changed so the caller can redraw exactly
     * those. Mirrors `setSelection` above, but over a *set* of ids rather than
     * one: a chord or a simultaneous multi-voice onset (see `OnsetEvent`'s own
     * doc comment in `src/playback/timeline.ts`, one event per note, never one
     * event for several) highlights several notes across possibly several
     * staves at the same instant, so a single nullable id cannot represent it.
     *
     * Like `setSelection`, this does not try to be clever about only returning
     * notes whose highlight state actually changed: it unions "measure of
     * every old id" with "measure of every new id", deduplicated by
     * `(staffIndex, index)`. A note present in both the old and new set still
     * has its measure returned, which is harmless (that measure repaints to
     * the same appearance it already had) and keeps this method's logic a
     * straight mirror of `setSelection`'s rather than a second, subtly
     * different diff algorithm.
     */
    setPlaybackCursor(noteIds: readonly NoteId[]): {
        staffIndex: number;
        index: number;
    }[];
    get measureRange(): MeasureRange | null;
    /**
     * Change the measure range (M5 Slice 4), returning the `(staffIndex,
     * index)` pairs whose membership changed so the caller can redraw exactly
     * those. `null` clears the range. `from`/`to` may arrive in either order
     * (a drag leftwards from its anchor produces `from > to`) and are
     * normalized here, so callers never have to.
     *
     * Same diff-and-return shape as `setSelection` and `setPlaybackCursor`
     * above, with one deliberate difference: this returns *only* the
     * symmetric difference of the old and new member sets, not their union.
     * Those two can afford the union because they touch a handful of
     * measures at most; a range can span a whole staff, and growing a
     * twenty-measure range by one bar should repaint one measure, not
     * twenty-one. A measure that stays in the range keeps its tint, so
     * repainting it would be pure waste. Pairs are deduplicated by
     * `staffIndex:index` and limited to measures that actually exist in the
     * current layout, so an out-of-bounds `to` never yields a pair
     * `redrawMeasure` would silently ignore anyway. Setting the same range
     * again returns `[]`.
     */
    setMeasureRange(range: MeasureRange | null): {
        staffIndex: number;
        index: number;
    }[];
    get staffColors(): ReadonlyMap<number, string>;
    /**
     * Paint every measure of a staff in its own ink colour (M8 Slice 3), e.g.
     * a muted voice part dimmed to grey, or `null` to put every staff back in
     * `foreground`. Keys are `staffIndex`; a staff left out keeps `foreground`.
     *
     * All of a measure's ops take the colour, staff lines and barlines
     * included, so a dimmed part reads as one faded band rather than faded
     * notes on full-strength lines. Selection and the playback cursor still
     * win over it per note, as they win over `foreground`. `partDecorations`
     * (braces, brackets, part names) belong to no single staff and keep
     * `foreground`; a barline shared down into the next staff belongs to the
     * upper staff's measure and takes that staff's colour.
     *
     * Like `setMeasureRange`, this does not paint: it returns the
     * `(staffIndex, index)` pairs of every measure on a staff whose colour
     * changed, for the caller to redraw (or call `drawAll`). No relayout is
     * involved, and the colours persist across `setLayout`.
     */
    setStaffColors(colors: ReadonlyMap<number, string> | null): {
        staffIndex: number;
        index: number;
    }[];
    get viewport(): Rect | null;
    /**
     * Limit painting to the part of the layout the host actually shows (M6
     * Slice 11), or `null` (the default) to paint the whole layout at its own
     * coordinates, as before this existed.
     *
     * A canvas big enough for a whole real score does not work: the largest
     * real score tried lays out about 79,000 CSS px tall, past the ~32k
     * device-pixel ceiling browsers allow a canvas, so the backing store had
     * to drop well below 1x density, and compositing it cost 33-65ms per
     * selection click. With a viewport the host can size its canvas to the
     * visible window instead: the renderer translates every draw by
     * `-viewport.x, -viewport.y` (on top of whatever transform the host
     * already set, e.g. its pixel-ratio scale), `drawAll` paints only the
     * measures intersecting the window, and
     * `redrawMeasure`/`redrawMeasures` skip a measure outside it entirely,
     * since none of its pixels exist on the canvas. A skipped measure needs
     * no bookkeeping: the host repaints with `drawAll` whenever it moves the
     * viewport, which picks up the measure's current ops and state then.
     *
     * Like `setLayout`, this does not paint: the host moves the viewport and
     * then calls `drawAll`. Draws are not clipped to the window here, because
     * the canvas edge already clips a measure that is only partly visible.
     */
    setViewport(viewport: Rect | null): void;
    get seamMarkers(): readonly SeamMarker[];
    /**
     * Replace the seam marker list (M5 Slice 6): a thin vertical strip at each
     * listed measure boundary, laid over the score. `[]` clears them. Takes
     * effect on the next `drawAll()`, the same way `partDecorations` only ever
     * paint there; unlike `setSelection`/`setMeasureRange` there are no
     * affected measures to return, because a strip reaches outside every
     * measure's region (into the margin at a system start or the final
     * barline), so no set of `redrawMeasure` calls could fully erase a removed
     * one. Seams are set rarely (once per loaded scan mapping, say), so a full
     * repaint is the honest cost.
     *
     * Markers are render state only, like the selection: never part of the
     * model, never persisted, never exported. Boundaries that do not exist in
     * the current layout are kept in the list but simply not drawn, and every
     * `setLayout` re-resolves the list against the new geometry, so markers
     * follow a rescale or a re-cast without the host calling this again.
     *
     * Like `partDecorations`, strips live outside every measure's own `ops`
     * and `region`, so a marker never inflates a region. Unlike
     * `partDecorations`, a strip does overlap measure regions (it straddles
     * the barline it marks), so `redrawMeasure`/`redrawMeasures` must not just
     * leave markers alone: after repainting a measure they repaint the part of
     * every strip that falls inside that measure's region, clipped to it. The
     * part outside is never cleared, so it never needs repainting either.
     */
    setSeamMarkers(boundaries: readonly SeamMarker[]): void;
    /** Repaint the whole score (or, with a viewport, all of it that is
     *  visible). The baseline the region-scoped path is measured against. */
    drawAll(): void;
    /**
     * Repaint one measure and nothing else.
     *
     * Clearing the measure's region wipes its staff lines, barline and (for
     * measure 0) its clef and signatures along with its notes, and drawing its
     * ops puts all of them back, because layout assigns every one of those to
     * the measure that owns the pixels. Neighbouring measures are untouched
     * because regions never overlap horizontally.
     *
     * `staffIndex` (M2 Slice 3, default 0) completes the `(staffIndex, index)`
     * pair `LaidOutMeasure` now carries, so a multi-staff layout redraws
     * exactly one staff's one measure, leaving every other staff's own
     * measures (which may well reuse the same `index`, since each staff
     * numbers its own measures from 0) untouched. Every call site from before
     * this slice omits it and keeps redrawing staff 0, exactly as before.
     */
    redrawMeasure(index: number, staffIndex?: number): void;
    /** Repaint several measures of one staff, e.g. when moving a selection
     *  between them. See `redrawMeasure`'s own comment on `staffIndex`. */
    redrawMeasures(indices: readonly number[], staffIndex?: number): void;
}
