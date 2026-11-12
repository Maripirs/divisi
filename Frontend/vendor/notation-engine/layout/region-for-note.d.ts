import type { NoteId } from '../model/score.js';
import type { LaidOutScore, Rect } from './types.js';
/**
 * Resolve a note to the region a host should scroll into view to see it:
 * its owning measure's `region`. Returns `null` if `noteId` is not present
 * anywhere in `layout` (e.g. a stale id from a previous, differently-shaped
 * score).
 *
 * `LaidOutMeasure.region`'s own two invariants (contains every pixel the
 * measure's ops touch, never overlaps a neighbouring measure) are what make
 * it a correct answer here, not just a convenient one: scrolling it fully
 * into view is guaranteed to bring the note itself into view too.
 *
 * This is a lookup primitive only, not a scrolling implementation. Per the
 * framework-agnostic principle (the same one that keeps pointer-coordinate
 * translation in the demo's own `pointerdown` handler rather than the
 * engine, see `demo/main.ts`), a host decides what "scroll into view" means
 * for its own container: a plain DOM `scrollIntoView`, a canvas-relative
 * `scrollTo`, or, per plan.md's M4 intro, syncing a separate PDF pane.
 */
export declare function regionForNote(layout: LaidOutScore, noteId: NoteId): Rect | null;
