import { type NoteId, type Score } from '../model/index.js';
/**
 * Written-time lookups in both directions (M8 Slice 2), for a host that owns
 * audio: it drives `CanvasRenderer.setPlaybackCursor(index.notesSoundingAt(
 * clock))` from its own whole-note clock, and maps a clicked note to a seek
 * time with `onsetWholes`.
 *
 * Positions are in whole notes (a quarter is 0.25) from the start of the
 * score, along the *written* score: each measure once, in order, repeats not
 * unfolded, fermatas not stretched, tempo not applied. Measures are laid end
 * to end at the lengths `computePlaybackTimeline` uses (the longest voice on
 * any staff, so a pickup is not padded to a full bar), which keeps a score
 * without repeats or fermatas in step with its timeline.
 */
export interface OnsetIndex {
    /**
     * The ids of every note sounding at `wholes`: a note sounds over the
     * half-open span [onset, onset + duration), so at a shared boundary the
     * next note sounds and the previous one does not. Every head of a chord
     * is listed; rests and grace notes (which take no written time) never are.
     * A tied-into note sounds over its own written span, so a cursor moves on
     * to it. In score order (staff, then measure, then `measure.notes`).
     */
    notesSoundingAt(wholes: number): NoteId[];
    /**
     * Where `noteId` starts, in whole notes from the score start; a rest has
     * one too. A grace note gets its principal's onset (where playback starts
     * it), or its voice's end in the measure when it trails one. `undefined`
     * for an id the score does not hold.
     */
    onsetWholes(noteId: NoteId): number | undefined;
}
/**
 * Build an `OnsetIndex` for `score` as it is now. It is a snapshot: rebuild
 * it after an edit that changes durations. `notesSoundingAt` scans every
 * note, which is cheap enough to call once per animation frame.
 */
export declare function createOnsetIndex(score: Score): OnsetIndex;
