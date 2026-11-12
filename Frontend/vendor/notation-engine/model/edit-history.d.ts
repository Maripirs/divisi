import type { Score } from './score.js';
export interface EditHistoryOptions {
    /** Maximum number of undoable steps kept. Recording past this drops the
     *  oldest snapshot. Default 100. */
    readonly cap?: number;
}
export declare class EditHistory {
    #private;
    constructor(initial: Score, options?: EditHistoryOptions);
    /** The live current score. Edit it only through `record`. */
    get current(): Score;
    /**
     * Snapshot `current`, run `edit` against the live score, and keep the
     * snapshot on the undo stack only if `edit` reports a change. "Reports a
     * change" means it returned something other than `null`, `undefined` or
     * `false` (so `transposeNote` returning measure index `0` still counts).
     * Keeping a snapshot clears the redo stack and, past `cap`, drops the
     * oldest snapshot. Returns whatever `edit` returned, so a caller can still
     * read e.g. the changed measure index from `transposeNote`.
     */
    record<T>(edit: (score: Score) => T): T;
    /** Restore the previous snapshot; returns the new `current`, or `null` if
     *  there is nothing to undo. */
    undo(): Score | null;
    /** Re-apply the last undone snapshot; returns the new `current`, or `null`
     *  if there is nothing to redo. */
    redo(): Score | null;
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** Mark the current state as the saved baseline, so `dirty` reads false
     *  until the score next diverges from it. */
    markSaved(): void;
    /** Whether `current` differs, in musical content, from the last
     *  `markSaved()` baseline (the initial state if `markSaved` was never
     *  called). Compared with `assertScoresEquivalent`, not object identity. */
    get dirty(): boolean;
}
