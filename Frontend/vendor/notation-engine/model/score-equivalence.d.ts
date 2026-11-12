import type { Score } from './score.js';
/**
 * Throw unless `actual` and `expected` represent the same music. See this
 * file's header for exactly what "the same music" includes and excludes.
 */
export declare function assertScoresEquivalent(actual: Score, expected: Score): void;
