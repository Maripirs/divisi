import { type DynamicKind, type Note, type NoteId, type Pitch, type Score } from '../model/index.js';
/**
 * One sounding attack: a pitch starting at `startSeconds` and lasting
 * `durationSeconds`. A rest produces no `OnsetEvent` at all (it only advances
 * the cursor that gives the *next* note its `startSeconds`), and a tied-into
 * note (see `Score.tiedFromNote`) produces no event of its own either: its
 * duration is folded into the event of the note that tied into it, exactly
 * because a tie means "one continuous sound", not two. `pitch` is therefore
 * never `null` here, unlike `Note.pitch`.
 *
 * Deliberately just these four fields, matching the plan's own acceptance
 * criteria: no `staffIndex`/`voice` is carried, since nothing downstream of
 * this slice (a Web Audio scheduler, a later slice's job) needs to know which
 * staff or voice produced an onset, only when it sounds and for how long.
 */
export interface OnsetEvent {
    readonly noteId: NoteId;
    readonly pitch: Pitch;
    readonly startSeconds: number;
    readonly durationSeconds: number;
    /**
     * Loudness relative to an ordinary note (M6 Slice 5): present only when
     * it differs from 1, i.e. for an accented attack (`ACCENT_VELOCITY`,
     * `MARCATO_VELOCITY`) and, since M6 Slice 6, for a note under a dynamic or
     * hairpin (`DYNAMIC_LEVELS`, multiplied with the accent). `playOnsetEvent`
     * scales its peak gain by it; the synth has no other notion of velocity,
     * so this is the whole of it.
     */
    readonly velocity?: number;
    /**
     * Which played measure this attack falls in (M6 Slice 14): an index into
     * `measurePlayOrder(score)`, telling the passes of a repeated note apart.
     * Present only when the score's play order differs from its written order
     * (it has a repeat that is taken), so a score without repeats keeps the
     * exact events it had before.
     */
    readonly playIndex?: number;
}
/**
 * How articulations and fermatas change playback (M6 Slice 5). Deliberately
 * a few fixed factors, not a performance model:
 *
 *  - A staccato note sounds for `STACCATO_FRACTION` of its written length, a
 *    staccatissimo for `STACCATISSIMO_FRACTION`, a detached-legato (tenuto
 *    plus staccato) for `DETACHED_LEGATO_FRACTION`; the rest of its time is
 *    silence, so the next onset is unchanged. A tenuto plays its full length,
 *    which is what every unmarked note already does in this synth (no gap
 *    between notes), so it changes nothing.
 *  - An accent multiplies the attack's `velocity` by `ACCENT_VELOCITY`, a
 *    marcato by `MARCATO_VELOCITY`.
 *  - A fermata stretches the span its note or rest occupies by
 *    `FERMATA_FACTOR`, for the *whole score*, not just its own voice: every
 *    voice on every staff sounding during that span is held with it, and
 *    everything after it starts later by the added time. Overlapping fermata
 *    spans (the usual case: every part has one on the same chord) are merged
 *    first so they stretch once, not once per voice.
 *
 * A mark on a chord applies to every head (`eventArticulations`/
 * `eventFermata`). Within a tie chain, each tied segment uses its own
 * event's marks, so a staccato on the last note of a tie shortens only that
 * segment's share.
 */
export declare const STACCATO_FRACTION = 0.5;
export declare const STACCATISSIMO_FRACTION = 0.25;
export declare const DETACHED_LEGATO_FRACTION = 0.75;
export declare const ACCENT_VELOCITY = 1.3;
export declare const MARCATO_VELOCITY = 1.5;
export declare const FERMATA_FACTOR = 2;
/**
 * How dynamics and hairpins change playback (M6 Slice 6): a loudness level
 * per staff, multiplied into each attack's `velocity` (with any accent's).
 * Deliberately simple and fixed:
 *
 *  - A plain dynamic sets the staff's level from `DYNAMIC_LEVELS` (pp 0.35,
 *    p 0.5, mp 0.62, mf 0.75, f 0.88, ff 1.0, ...), held until the staff's
 *    next dynamic. Music before a staff's first dynamic keeps level 1, the
 *    synth's own full level, so a score without dynamics sounds as before.
 *  - An accent dynamic (sf, sfz, sffz, fz, rf, rfz) is a momentary level for
 *    the attacks at its onset only (`DYNAMIC_ACCENTS`), after which the held
 *    level resumes. The combinations play both: fp/sfp/sfpp/sfzp attack at
 *    the first level and then hold the second.
 *  - `pf` (più forte) holds one ladder step above the level in force; `n`
 *    (niente) holds `NIENTE_LEVEL`.
 *  - A hairpin interpolates the held level linearly in written time from the
 *    level in force at its start to its target: the staff's next plain
 *    dynamic at or after its stop and before any later hairpin starts, else
 *    one ladder step up (crescendo) or down (diminuendo) from the start
 *    level. Past the stop the target is held until the next dynamic.
 *
 * Levels are per staff (all its voices), with no carry-over between staves.
 */
export declare const DYNAMIC_LEVELS: Readonly<Partial<Record<DynamicKind, number>>>;
/** Accent and combination dynamics: the attack level at their own onset,
 *  and the level held after (`undefined`: the previous level resumes). */
export declare const DYNAMIC_ACCENTS: Readonly<Partial<Record<DynamicKind, {
    attack: number;
    hold?: DynamicKind;
}>>>;
export declare const NIENTE_LEVEL = 0.05;
/**
 * How grace notes play (M6 Slice 8). Every grace plays *on the beat*,
 * stealing its time from the start of its principal (the classical rule, and
 * the one MusicXML's `steal-time-following` describes), so nothing before the
 * principal moves and the principal starts late by the run's total:
 *
 *  - A lone grace without a slash (an appoggiatura) takes half its
 *    principal (`APPOGGIATURA_FRACTION`), two thirds before a dotted
 *    principal (`DOTTED_APPOGGIATURA_FRACTION`), the C. P. E. Bach / Türk
 *    rule every engraving guide repeats.
 *  - Anything else (an acciaccatura, or a run of two or more graces, which
 *    is played quick whatever its slashes) gives each grace
 *    `ACCIACCATURA_WHOLES` (a 32nd), shrunk so the run never takes more than
 *    `GRACE_RUN_MAX_FRACTION` of the principal.
 *  - A grace stating `steal-time-following` takes that percentage of its
 *    principal instead. `steal-time-previous` and `make-time` are kept for
 *    the round trip but not played (a grace before the beat would shorten a
 *    note in another measure).
 *  - Whatever the rules add up to, a run takes at most
 *    `GRACE_TOTAL_MAX_FRACTION` of its principal (scaled down evenly), so the
 *    principal is always heard.
 *
 * A run with no principal in its measure (OMR writes a grace for the next
 * downbeat at the end of the bar) ornaments its voice's first event in the
 * next measure. A grace never opens a tie chain; graces play at the
 * principal's dynamic level, without its articulations.
 */
export declare const APPOGGIATURA_FRACTION: number;
export declare const DOTTED_APPOGGIATURA_FRACTION: number;
export declare const ACCIACCATURA_WHOLES: number;
export declare const GRACE_RUN_MAX_FRACTION: number;
export declare const GRACE_TOTAL_MAX_FRACTION: number;
/** Each grace's played length in written wholes, for a run before a
 *  principal lasting `principalWholes` (see `APPOGGIATURA_FRACTION`). */
export declare function graceLengthsWholes(graces: readonly Note[], principal: Note): number[];
/**
 * Every distinct `Note.voice` value present across `staff`'s own measures, in
 * first-seen order. A staff's voices are not assumed to be `1`/`2`: nothing
 * stops a single staff carrying 3 or more (see `computePlaybackTimeline`'s
 * own comment), so this scans rather than hardcoding a fixed set. A plain
 * `Set` is used purely for its `add`-is-a-no-op-on-a-duplicate behaviour;
 * like every other `Set`/`Map`/array in this file, its iteration order is
 * insertion order, so "first-seen order" falls out for free rather than
 * needing a second pass to sort.
 */
/**
 * How long each measure index lasts, in whole notes.
 *
 * A measure lasts as long as its longest voice on any staff (so a pickup or
 * an under-full measure is not padded to the time signature), falling back to
 * the time signature's capacity when no staff has any notes there. Measure
 * starts (these lengths laid end to end in play order) are shared by every
 * staff and voice, which is what keeps a voice
 * that is silent for several measures (has no notes at all there, not even
 * rests) from drifting: it re-anchors to the right bar line each measure
 * instead of resuming from wherever its own last note left off.
 */
export declare function measureLengthsWholes(score: Score): number[];
/**
 * Walk `score`'s notes in true playback order and produce a flat list of
 * onset events: when each pitched note starts sounding and for how long, in
 * real seconds at `score.tempoBpm`.
 *
 * This is deliberately *not* built on `Score.notesInOrder()`: that method
 * flattens one staff's measures into a single array with every voice's notes
 * interleaved in append order (see its own doc comment), which answers "what
 * order do these two notes appear in the model" (what a slur's span needs),
 * not "when does each one sound" (what this function needs). A two-voice
 * measure's `measure.notes` holds voice 1's notes in order, then voice 2's,
 * not interleaved by onset (`createTwoVoiceShowcaseScore` in
 * `src/demo-score.ts` is exactly this shape), so onset order can only be
 * recovered by walking one `(staffIndex, voice)` pair at a time, each with
 * its own timeline.
 *
 * Each `(staffIndex, voice)` pair present in the score gets its own
 * independent pass: a running `cursorWholes` counts that voice's own elapsed
 * duration alone, starting at 0 and advanced by every note or rest's own
 * `durationWholes` as it is passed, whether or not that note produces an
 * event. Converting the cursor through `durationToSeconds` at the moment a
 * note is reached is what gives it its `startSeconds`; since every voice's
 * (and every staff's) cursor starts at the same 0, two voices that both open
 * on the downbeat land their first event's `startSeconds` at the same value
 * automatically, with no separate cross-voice synchronization step needed
 * (`layoutScore` in `src/layout/layout.ts` already guarantees every staff has
 * the same measure count, so this walk never has to reconcile a ragged
 * staff against another).
 *
 * A rest advances `cursorWholes` but produces no event. A pitched note that
 * `score.tiedFromNote(note.id)` reports as a tie's receiving end is a
 * continuation, not a new attack: its `durationSeconds` is folded onto the
 * event still open from the tie's source note (working for a chain of 3 or
 * more tied notes, not just a pair, since the open event stays open across
 * every consecutive continuation) rather than starting a fresh event. A note
 * that is not a continuation always starts a fresh event; if it is itself
 * `isTied` (ties forward), that fresh event is left open so the very next
 * note, if it continues the tie, extends it, otherwise it is already a
 * closed, complete event.
 *
 * Chords (M6 Slice 2) are walked as events (`noteEvents`): every head of a
 * chord gets its own `OnsetEvent` at the same `startSeconds`, all lasting the
 * anchor's duration, and the cursor advances once per chord. A tied chord
 * keeps one open event per head, each extended only by its own head's tie
 * target.
 *
 * Articulations and fermatas (M6 Slice 5) shape the result as described at
 * `STACCATO_FRACTION`: positions are first computed in written wholes, then
 * passed through the fermata warp, then turned into seconds.
 *
 * Repeats and voltas (M6 Slice 14) are unfolded: the measures play in
 * `measurePlayOrder` order, laid end to end, so a repeated note has one event
 * per pass (same `noteId`, later `startSeconds`, and `playIndex` telling them
 * apart). A jump breaks every tie chain: a note tied over the jump ends at its
 * own length, and its target, reached later, starts a fresh event. Fermatas,
 * dynamics, hairpins and graces left at a bar's end apply per pass, in played
 * order.
 *
 * The returned array's order falls out of construction (staves in
 * `score.staves` order, each staff's voices in first-seen order, each
 * voice's notes in measure-then-position order) rather than from an explicit
 * sort: every loop here is over a plain array or a `Set`, both insertion-
 * ordered in JS, so the result is deterministic without needing a
 * `startSeconds` sort of its own. Callers should still key any ordering
 * assumption of their own off each event's own `startSeconds`, not off array
 * position: cross-`(staffIndex, voice)` interleaving is not itself
 * meaningful, only each event's own timing is.
 */
export declare function computePlaybackTimeline(score: Score): OnsetEvent[];
/**
 * Where playback should start to play from `noteId` (M6 Slice 15): the
 * `startSeconds` of its earliest event, so a note inside a repeat starts at
 * its first pass, not a later one. Hand the result to `PlaybackEngine.seek`.
 * `undefined` when the note has no event of its own: a rest, or a note only
 * reached as a tie's continuation (it sounds inside its source's event; on a
 * later pass entered by a jump it can strike afresh, and that is then what
 * this returns).
 */
export declare function firstOnsetSeconds(events: readonly OnsetEvent[], noteId: NoteId): number | undefined;
