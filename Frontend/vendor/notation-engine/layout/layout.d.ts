import type { ClefType, Note, NoteId, Score, TimeSignature } from '../model/score.js';
import type { LaidOutScore } from './types.js';
export interface LayoutOptions {
    /** Pixels between two staff lines. The single knob that scales the whole render. */
    readonly staffSpacePx?: number;
    /** Blank margin around the system, pixels. */
    readonly paddingPx?: number;
    /**
     * Maximum pixel width of a system (both paddings and any brace/bracket
     * and part-label header included) before the rest of the measures cast
     * off onto a new system, stacked below. Every staff breaks at the same
     * measures, so no measure ends past it except a single measure too wide
     * to fit even on its own. Omit it and layout keeps Phase 0's original
     * behaviour: one system, forever, however wide the score gets.
     *
     * Casting-off here is greedy (fill a system until the next measure would
     * overflow, then start a new one), not the balanced/optimal algorithm real
     * engraving software uses to even out how full each line looks. Greedy is
     * the naive-but-correct choice consistent with the rest of this file's
     * spacing: it produces a system per line and a ragged right edge, which is
     * exactly the trade real optical justification (Phase 1+) exists to fix.
     */
    readonly systemWidthPx?: number;
}
/** The diatonic index of a clef's middle staff line, for callers outside
 *  layout that need the same middle-line reference `computeBeamGroups` and
 *  `stemDirectionForNotes` take. `src/io` uses it to derive stem direction
 *  and beam grouping for MusicXML `<stem>`/`<beam>` without importing layout's
 *  geometry. */
export declare function middleLineForClef(clef: ClefType): number;
/**
 * Lay a whole score out: every system a horizontal row of every staff's own
 * measures, tightly stacked (M2 Slice 4), cast off into as many systems as
 * `options.systemWidthPx` demands (`planSystems`).
 *
 * Real multi-staff engraving interleaves staves *within* a system rather
 * than laying each staff out as its own independent, self-contained block
 * (M2 Slice 3's own placeholder, which this replaces): every staff's own
 * portion of the *same* set of measures stacks directly below the previous
 * staff's, sharing one barline per measure boundary, and the whole stacked
 * group repeats below for the next system. A single-staff score (every score
 * before this slice, and still the common case) is the one-staff-per-group
 * degenerate case of all of this: no staff to stack against, no barline
 * segment to split (`barlineSpan` returns exactly `staffTopY`/`staffTopY +
 * 4 * ss`, unchanged from before this slice), reproducing the exact same
 * result `layoutScore` always produced.
 *
 * System membership (which measures land in which system) is decided *once*
 * for the whole score, not independently per staff: a shared system only
 * makes sense if every staff agrees on where it starts and ends. Since M6
 * Slice 10 it is decided off the shared column widths (each measure costs
 * its widest staff's width, see `planSystems`), and one justification
 * factor per system is shared by every staff (`systemSpacingScale`), so the
 * padded columns below still add up to `systemWidthPx`. This is also why every staff
 * in a `Score` is required to have the same number of measures (checked
 * below, not silently assumed): a staff with a different measure count would
 * have no coherent claim to be "in system 3" at all. Flagged as a real scope
 * boundary, not an oversight: a future divisi split with genuinely different
 * measure counts per staff is out of this slice's scope.
 *
 * Within one system, every measure column's *width* is also shared across
 * every staff, not decided independently per staff: a single barline spanning
 * the group (`barlineSpan`, above) is only geometrically meaningful if every
 * staff's version of that boundary sits at the same x. Each staff still lays
 * its own notes out at its own natural spacing (`layoutMeasure`, unchanged);
 * the *narrower* staff at a given column (e.g. a bass clef's smaller header,
 * or simply fewer/shorter notes) then has its own trailing space padded out
 * to match the widest staff's natural width for that same column
 * (`columnWidth` below), rather than every staff's notes being re-scaled to
 * force identical column widths. This is a deliberate, simpler choice than a
 * true cross-staff justification pass: it keeps each staff's own optical
 * spacing exactly what `layoutMeasure` would have produced alone, at the
 * cost of not forcing note-for-note x-alignment between two staves whose own
 * content genuinely differs (which nothing in this slice's own acceptance
 * criteria asks for).
 */
export declare function layoutScore(score: Score, options?: LayoutOptions): LaidOutScore;
/**
 * Re-lay-out a single measure in place, the layout half of an incremental edit.
 *
 * Redrawing one measure is only a win if working out *what* to redraw is also
 * cheap. Calling `layoutScore` after every keystroke would put the whole score
 * back on the critical path and leave the engine with OSMD's cost curve, just
 * with a smaller constant.
 *
 * Returns `null` when the edit changed the measure's geometry (its width, or
 * how far it reaches above or below the system) rather than only its contents.
 * That is the honest boundary of a single-measure update: a wider measure moves
 * every measure after it, and a taller one resizes the canvas, so the caller
 * has to fall back to `layoutScore` and a full repaint. Phase 0's one edit op
 * never changes a measure's width, because note spacing depends on duration and
 * an accidental is drawn inside the note's own horizontal cell. A duration
 * edit, which Phase 1 will have, hits this path constantly, and reflowing a
 * system incrementally is the real work behind it.
 *
 * Slice 9's justification does not change this shape. This measure is re-laid
 * out at its system's already-decided `spacingScale` (read off the cached
 * `LaidOutScore.systems` entry, not recomputed), so an edit that leaves this
 * measure's own natural width unchanged (a transpose, say: it can add or
 * remove an accidental, but not this measure's note-to-note advances) still
 * reproduces the exact same width and takes the fast, single-measure path,
 * exactly as before justification existed. An edit that *does* change this
 * measure's natural width (a duration change, not built until a later slice)
 * changes its width even measured with the stale scale, so `widthChanged`
 * still catches it honestly and falls back to a full `layoutScore`, which
 * recomputes fresh, correct scale factors for every system. That fallback is
 * the whole score, not just the one system this measure lives in, the same
 * as it always was: no new "relayout one system" fast path exists yet, so a
 * width-changing edit's cost is unchanged by this slice, not narrowed.
 *
 * `staffIndex` (M2 Slice 3, default 0) says *which staff's* `measureIndex`
 * to re-lay-out, completing the `(staffIndex, measureIndex)` addressing pair
 * `LaidOutMeasure` now carries; every call site from before this slice omits
 * it and keeps editing staff 0, exactly as before.
 */
export declare function relayoutMeasure(score: Score, layout: LaidOutScore, measureIndex: number, options?: LayoutOptions, staffIndex?: number): LaidOutScore | null;
/**
 * A grace note's size relative to a normal note. SMuFL's `engravingDefaults`
 * (and Bravura's metadata) publish no cue or grace scale, so this follows
 * engraving practice: Gould (*Behind Bars*, "Grace notes") puts grace notes
 * at roughly 60-70% of normal size, and MuseScore's default `graceNoteMag` is
 * 0.7; 0.65 sits in that band while keeping a 16th grace's two beams clearly
 * apart at small staff sizes.
 */
export declare const GRACE_SCALE = 0.65;
/**
 * A grace note's stem direction (M6 Slice 8): always up in a single voice,
 * whatever the pitch, the standard grace engraving (it keeps the small note
 * from tangling with the principal's stem and slur); in a multi-voice measure
 * it follows the voice's side like every other stem there.
 */
export declare function graceStemUp(voice: number, multiVoice: boolean): boolean;
/** A run of consecutive beamable notes sharing one beam. Always two or more
 *  members: `computeBeamGroups` never reports a group of one, since a lone
 *  eligible note is indistinguishable from an ordinary unbeamed one.
 *
 *  `notes` holds one note per beam member: for a chord (M6 Slice 2) that is
 *  its anchor only, the note its stem, flag and duration belong to; the
 *  chord's other heads are not listed (they share the anchor's stem). */
export interface BeamGroup {
    readonly notes: readonly Note[];
    /**
     * The one stem direction shared by the whole group, decided once here
     * (by `computeBeamGroups`, via `stemDirectionForNotes`) so every consumer
     * agrees: `layoutBeamGroup`'s own stems and beam, and `layoutNote`'s
     * ink-extent calculation for a beamed member (needed before
     * `layoutBeamGroup` ever runs, since the accidental-collision check walks
     * the measure's notes in order).
     */
    readonly direction: 'up' | 'down';
}
/**
 * Partition a measure's notes into beam groups: runs of consecutive eighth-
 * and-shorter notes that share a beat, per `beatDurationWholes`.
 *
 * A rest breaks a group (rests are never beamed to a neighbour, so a group
 * never has to reason about beaming over one), and so does a quarter note or
 * longer, and so does crossing a beat boundary. None of that makes a group of
 * one: a single eligible note with no beamable neighbour is reported as
 * nothing here and falls through to its ordinary individual flag in
 * `layoutNote`/`layoutStemAndFlag`.
 *
 * Position within the measure is tracked in `durationWholes`, which already
 * folds in dots and tuplet ratios, so a tupleted eighth lands in the same
 * beat math as a plain one without this function needing to know tuplets
 * exist.
 *
 * Chords (M6 Slice 2) are walked as events (`noteEvents`): a chord is one
 * beam member, eligible by its anchor's value, advancing the beat cursor
 * once, and every one of its heads votes in the group's stem direction.
 *
 * `notes` is expected to already be one voice's own notes (M2 Slice 1's
 * `layoutMeasure` calls this once per voice via `notesByVoice`, never on a
 * measure's raw flat array): the beat-position cursor above is a single
 * running total, which a second voice's notes interleaved into the same
 * array would corrupt (their durations would be counted against the first
 * voice's beat position, and vice versa). `voiceOverride`, when given, forces
 * every group's `direction` regardless of pitch (see `voiceStemOverride`);
 * omitted, a lone voice keeps `stemDirectionForNotes`'s ordinary pitch-based
 * rule exactly as before this slice.
 *
 * `middleLine` may instead be a per-note function (M6 Slice 4), for a
 * measure whose clef changes partway: each head is then judged against its
 * own clef's middle line.
 *
 * `excludeIds` (M2 Slice 6) marks notes that must never join an *automatic*
 * group here, because each already belongs to an explicit
 * `Score.CrossStaffBeam` instead (see `layoutMeasure`'s own cross-staff
 * integration). An excluded note still behaves like any other ineligible
 * one for the purposes of this function: it flushes whatever group is open
 * and its own duration still advances `position`, since it still occupies
 * real time in the beat-position tracker; it simply never starts or extends
 * a group of its own.
 *
 * Source beams (M8 Slice 5): when any event of the voice carries a source
 * mark (`BeamMark`, set by import on every note of a part whose file states
 * beams), the marks decide the groups instead of the beat: a run goes from a
 * `'begin'` through `'continue'`s to an `'end'`, and an event marked
 * `'none'` (or unmarked, e.g. inserted by an edit) stays flagged. The
 * eligibility rules above still break a run, so a mark left stale by an edit
 * (a beamed eighth lengthened to a quarter) cannot beam a quarter.
 */
export declare function computeBeamGroups(notes: readonly Note[], time: TimeSignature, middleLine: number | ((note: Note) => number), voiceOverride?: 'up' | 'down', excludeIds?: ReadonlySet<NoteId>): BeamGroup[];
/**
 * The single-voice stem direction rule, shared by a lone note and a beamed
 * group's one uniform direction: whichever side of the middle line has more
 * room wins.
 *
 * A single note (called here with one index) points up when it sits below
 * the middle line, since an up-stem then rises through the emptier half of
 * the staff, and down when it sits on or above the line, for the mirrored
 * reason. A note exactly on the middle line has no "more room" side to
 * prefer; this picks down-stem as the fixed tie-break (a common house
 * convention, not a universal one) so the same note always renders the same
 * way rather than flipping on whatever the caller happened to average it
 * with.
 *
 * A beamed group (called with every member's index) cannot point two ways at
 * once, so real engraving decides by the single member with the strongest
 * preference: whichever note sits farthest from the middle line, since its
 * single-note answer would be the least ambiguous of the group. A tie for
 * farthest between a note above the line and one below it (equally far on
 * both sides) falls back to a majority vote across every member, not just the
 * tied ones; a further tie (equal counts on both sides too, or every member
 * sitting exactly on the line) falls back to the same down-stem convention a
 * single on-the-line note uses.
 *
 * This deliberately does not average positions (Slice 2's original group
 * rule): an average is dominated by a cluster of notes only slightly off the
 * line and can be pulled to the wrong side by one note that is actually far
 * off it, exactly the disagreement this function resolves in the far note's
 * favour instead.
 *
 * `voiceOverride` (M2 Slice 1) short-circuits all of the above: when a
 * measure holds more than one voice, direction is decided by *which voice*,
 * not by pitch at all (see `voiceStemOverride`). Every existing call site
 * that never passes it (ties, slurs, and a single-voice measure's own notes)
 * keeps exactly the pitch-based rule below, unchanged.
 */
export declare function stemDirectionForNotes(diatonicIndices: readonly number[], middleLine: number, voiceOverride?: 'up' | 'down'): 'up' | 'down';
