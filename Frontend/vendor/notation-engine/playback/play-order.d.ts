import type { Score } from '../model/index.js';
/**
 * One measure as it is played (M6 Slice 14): which measure index sounds, and
 * on which pass of its repeated section (1 for the first time through, and
 * for any measure outside a repeat).
 */
export interface PlayedMeasure {
    readonly measureIndex: number;
    readonly pass: number;
}
/**
 * The order `score`'s measures are played in, with repeats and voltas
 * unfolded. The rules, read off the top staff (every staff carries the same
 * barline and ending fields):
 *
 *  - A section opens at the score start, at a `repeatStart`, or right after a
 *    section closes (a `repeatEnd` taken for the last time, or an ending
 *    played on a later pass that runs on instead of jumping back). A
 *    `repeatEnd` jumps back to the open section's start while that section
 *    has been played fewer than `repeatTimes` (default 2) times; so it
 *    returns to the nearest `repeatStart` after the last completed repeat, or
 *    to the score start when there is none.
 *  - On pass k, a measure inside an ending whose numbers lack k is skipped,
 *    the whole ending with it (including any `repeatEnd` it holds).
 *  - Nested repeats are not modelled: a `repeatStart` always opens a new
 *    section, so an outer repeat returns only to the latest start inside it.
 *    The walk still ends (every jump advances the pass, and a capped number
 *    of measures is played whatever the input).
 *
 * The `repeatEnd` is read off `Measure.endBarline` directly, not through
 * `Score.endBarlineAt`: at a back-to-back `:||:` boundary the drawn barline
 * is the next measure's `repeatStart`, but this measure still closes its
 * section. A score with no repeats plays every measure once, in order.
 */
export declare function measurePlayOrder(score: Score): PlayedMeasure[];
