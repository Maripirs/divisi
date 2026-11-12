import type { Pitch } from './pitch.js';
import { type DynamicKind, type DynamicMark, type Placement, type Wedge, type WedgeKind } from './directions.js';
import { type Lyric, type LyricSpec } from './lyrics.js';
import { type MeasurePassthrough, type OpaqueElement } from './passthrough.js';
/** Note values the engine draws, breve (double whole, M8 Slice 5) down to
 *  64th. Named as MusicXML's `<type>` is. */
export type NoteValue = 'breve' | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';
/** Duration of each note value as a fraction of a whole note. */
export declare const NOTE_VALUE_WHOLES: Readonly<Record<NoteValue, number>>;
/** Every `NoteValue`, longest first. */
export declare const NOTE_VALUES: readonly NoteValue[];
/** A written duration: a note value plus augmentation dots (no tuplet). */
export interface SpelledDuration {
    readonly value: NoteValue;
    readonly dots: 0 | 1 | 2;
}
/** `value` with `dots`, in wholes (no tuplet): the same arithmetic as
 *  `Note.durationWholes`. */
export declare function spelledWholes(value: NoteValue, dots: 0 | 1 | 2): number;
/**
 * The single note value (plus dots) that lasts exactly `wholes`, or `null`
 * when none does (e.g. 5/8, or anything longer than a double-dotted whole).
 * `dotCandidates` are tried in order, fewest dots first by default, so a
 * plain value wins over an equal dotted spelling (there is none, but the
 * order is also the preference the importer wants). Matching is within 1e-6,
 * far below any real duration and far above float noise.
 *
 * Pure and model-level (M6 Slice 7) so both the importer's "no `<type>`"
 * fallback and `Score.restToNote` (a whole-measure rest becoming a note of
 * the measure's length) answer "which note value is this long" the same way.
 */
export declare function noteValueForWholes(wholes: number, dotCandidates?: readonly (0 | 1 | 2)[]): SpelledDuration | null;
/**
 * Spell `wholes` of silence starting `onset` wholes into a measure as a run
 * of undotted rest values (M6 Slice 7: the padding `Score.setDuration`
 * writes when a note gets shorter, or the remainder of a rest it partly
 * consumed). Each step takes the longest value that fits what is left *and*
 * starts on a multiple of its own length, the usual rule for rests (a rest
 * does not straddle a beat of its own size), so an eighth note shortened from
 * a half on beat 1 is followed by an eighth rest then a quarter rest, not a
 * quarter rest across the off-beat. An onset off the 64th grid (after a
 * tuplet) relaxes the alignment and simply takes the longest value that fits.
 * Dotted rests are never written: the aligned plain run is what an engraver
 * writes in simple time, and it is always correct, if not always the
 * shortest spelling in compound time.
 *
 * Returns `null` when `wholes` cannot be spelled at all (a remainder below a
 * 64th, i.e. a tuplet fraction), and `[]` for zero.
 */
export declare function restValuesFor(onset: number, wholes: number): NoteValue[] | null;
/**
 * A tuplet ratio: `actualNotes` notes are written to fill the time normally
 * taken by `normalNotes` notes of the same value. A triplet is 3-in-the-
 * time-of-2 (`{ actualNotes: 3, normalNotes: 2 }`); a quintuplet would be
 * `{ actualNotes: 5, normalNotes: 4 }`. Modelling it as a ratio rather than a
 * `'triplet'` enum means any other ratio is already representable by the same
 * field; this slice only ever constructs `TRIPLET`, and rendering the bracket
 * and number over a tuplet group is left to whichever later slice needs it.
 */
export interface TupletRatio {
    readonly actualNotes: number;
    readonly normalNotes: number;
}
/** The one tuplet ratio this slice implements: 3 notes in the time of 2. */
export declare const TRIPLET: TupletRatio;
/** Opaque, stable identifier for a note. Hit-testing and edits address notes by id. */
export type NoteId = string;
/**
 * The shapes a barline can draw. `normal` is a single thin line (every
 * boundary's default); `double` is two thin lines close together, marking a
 * section boundary with no repeat or ending implied; `final` is thin-then-
 * thick, the score's own closing barline; `repeatStart`/`repeatEnd` are a
 * thick line plus two dots, opening or closing a repeated section (see
 * `Measure.startBarline`/`endBarline` for which measure owns which end of the
 * boundary, and why they are two separate fields rather than one).
 *
 * The model states the repeat structure and nothing more: how many times a
 * `repeatEnd` sends the music back is `Measure.repeatTimes`, and 1st/2nd
 * endings are `Measure.endingStart`/`endingEnd` (M6 Slice 12). Turning that
 * into a play order is playback's job (M6 Slice 14).
 */
export type BarlineType = 'normal' | 'double' | 'final' | 'repeatStart' | 'repeatEnd';
/**
 * Where a volta (a 1st/2nd ending bracket, MusicXML `<ending type="start">`)
 * opens: on the first measure it covers (`Measure.endingStart`). `numbers` are
 * the passes it is played on (`[1]`, `[1, 2]`), ascending; `text` is the
 * label the source printed in the bracket (`"1."`, `"1.-3."`), or `null` to
 * label it from `numbers`. `attrs` are the source element's other attributes
 * (`default-y`, `print-object`, `end-length`, ...), which the model does not
 * interpret but export writes back.
 */
export interface EndingStart {
    readonly numbers: readonly number[];
    readonly text: string | null;
    readonly attrs: Readonly<Record<string, string>>;
}
/**
 * Where a volta closes: on the last measure it covers (`Measure.endingEnd`),
 * which may be the measure that opened it. `'stop'` draws a closing hook
 * down to the staff (an ending followed by a jump back); `'discontinue'`
 * leaves the bracket open (the last ending, which the music runs on from).
 * The numbers it closes are the open `EndingStart`'s. `attrs` as there.
 */
export interface EndingEnd {
    readonly kind: 'stop' | 'discontinue';
    readonly attrs: Readonly<Record<string, string>>;
}
/**
 * One volta as a span of measure indices (`Score.endings`): it covers
 * `first..last` inclusive, opened by `start` and closed by `end`.
 */
export interface EndingSpan {
    readonly first: number;
    readonly last: number;
    readonly start: EndingStart;
    readonly end: EndingEnd;
}
/**
 * The clefs this engine draws. `treble` and `bass` are the ordinary G and F
 * clefs. `treble8` is the "octave treble" (vocal tenor) clef: notated on
 * exactly the same lines and spaces as plain `treble` (only the small "8"
 * beneath the glyph differs), but *sounding* an octave lower than written.
 * This engine has no sounding-pitch/playback concept yet (that is M3's
 * job), so nothing here ever needs to shift a `treble8` note's pitch down an
 * octave; `treble8` and `treble` share every position table in `layout.ts`
 * and differ only in which clef glyph gets drawn.
 *
 * `alto` and `tenor` (M6 Slice 4) are the two C clefs choral and orchestral
 * music still uses: the same `cClef` glyph, centred on the line it names as
 * middle C, the third line for alto (viola) and the fourth for tenor (older
 * choral tenor parts alternate bass and tenor clef). The other C-clef lines
 * (soprano C1, mezzo-soprano C2, baritone C5) are obsolete in this repertoire
 * and stay unmodelled; the importer reads them as treble with a fallback.
 */
export type ClefType = 'treble' | 'bass' | 'treble8' | 'alto' | 'tenor';
/**
 * A clef change *inside* a measure (M6 Slice 4): from `onset` (wholes from the
 * measure's start, always > 0; a change at the downbeat is `Measure.clef`)
 * the staff reads in `clef`, until the next change. Engraving draws it as a
 * smaller clef right before the note at that onset, or before the barline
 * when it sits at the measure's very end (the usual spelling of a change
 * that takes effect at the next downbeat). Immutable, so a clone may share
 * one; an edit replaces `Measure.clefChanges` wholesale.
 */
export interface ClefChange {
    readonly onset: number;
    readonly clef: ClefType;
}
/** The empty `Measure.clefChanges`, shared (and frozen) so the common case
 *  costs no allocation per measure. */
export declare const NO_CLEF_CHANGES: readonly ClefChange[];
/**
 * An articulation mark on a note (M6 Slice 5), named as MusicXML's
 * `<articulations>` children are. `'strong-accent'` is the marcato (the
 * vertical wedge); `'detached-legato'` is the combined tenuto-over-staccato
 * mark (one Bravura glyph, and both meanings in playback). Other MusicXML
 * articulation kinds (`breath-mark`, `caesura`, `spiccato`, `stress`, ...)
 * are not modelled: import keeps them as passthrough.
 */
export type Articulation = 'staccato' | 'staccatissimo' | 'accent' | 'strong-accent' | 'tenuto' | 'detached-legato';
/** Every `Articulation`, in the order layout stacks them outward from the
 *  notehead (Gould, *Behind Bars*: the "short" marks staccato/tenuto sit
 *  nearest, accents outside them). Also the canonical order equivalence and
 *  export use, so a set of marks has one spelling. */
export declare const ARTICULATIONS: readonly Articulation[];
/**
 * A fermata (MusicXML `<fermata type="upright|inverted">`, normal shape
 * only). `'upright'` is the usual arch-over-dot drawn above the staff;
 * `'inverted'` is the same mark flipped, drawn below the staff (the way a
 * lower voice's fermata is engraved, and how OMR reports one read there).
 * Angled/square/other shapes are not modelled and stay passthrough.
 */
export type Fermata = 'upright' | 'inverted';
/**
 * What makes a note a grace note (M6 Slice 8; MusicXML `<grace>`): an
 * ornamental note drawn small before the note it decorates (its *principal*),
 * taking no measure time of its own. `slash` is the acciaccatura (a stroke
 * through stem and flag, played as short as possible); without it the note
 * is an appoggiatura (played on the beat, taking a real share of the
 * principal).
 *
 * `stealTimePrevious`/`stealTimeFollowing` are MusicXML's percentage
 * attributes (how much of the previous/following note's time the grace
 * takes); `null` when unstated. Playback honours `stealTimeFollowing`; both
 * are kept so a round trip writes them back. `makeTime` (MusicXML
 * `make-time`, time the grace adds rather than steals) is held in wholes so
 * it survives export's `<divisions>` rescaling; nothing interprets it.
 * Immutable, so a clone may share it.
 */
export interface GraceNote {
    readonly slash: boolean;
    readonly stealTimePrevious: number | null;
    readonly stealTimeFollowing: number | null;
    readonly makeTime: number | null;
}
/** A plain grace note (no slash, no steal/make time), for literals. */
export declare const APPOGGIATURA: GraceNote;
/** A slashed grace note (acciaccatura), for literals. */
export declare const ACCIACCATURA: GraceNote;
/**
 * A note's place in a primary (eighth-level) beam as its source wrote it (M8
 * Slice 5; MusicXML `<beam number="1">`): `'begin'`, `'continue'` or `'end'`
 * of a beamed run, or `'none'` for a note the source left unbeamed. Import
 * sets one on every note of a part whose file states any `<beam>` at all, so
 * a flagged eighth in a part that beams elsewhere stays flagged; a part (or a
 * score built in code) with none keeps `null` everywhere, and layout falls
 * back to beaming by beat (`computeBeamGroups`). Only the primary level is
 * held: secondary beams always follow the note values.
 */
export type BeamMark = 'begin' | 'continue' | 'end' | 'none';
/** The empty `Note.articulations`, shared (and frozen) so the common case
 *  costs no allocation per note. */
export declare const NO_ARTICULATIONS: readonly Articulation[];
export interface NoteSpec {
    /** `null` means a rest. Rests are notes with no pitch rather than a separate type,
     *  because every other property (duration, voice, position in the measure, being
     *  selectable and editable) is shared, and splitting them doubles the layout code. */
    readonly pitch: Pitch | null;
    readonly value: NoteValue;
    /** 1-based, matching MusicXML. Phase 0 only ever lays out voice 1. */
    readonly voice?: number;
    /** Augmentation dots. Each dot adds half of what the previous one added: one
     *  dot multiplies the base duration by 1.5, two dots by 1.75. Every
     *  engraving convention the engine targets stops at two, so this is not an
     *  open-ended count. */
    readonly dots?: 0 | 1 | 2;
    /** Tuplet ratio, e.g. `TRIPLET`. `undefined` means the note is not part of one. */
    readonly tuplet?: TupletRatio;
    /**
     * Id of the *next* note this one is tied to: the two sound as one
     * continuous note of the same pitch, drawn as a curve from this notehead to
     * that one, rather than as a fresh attack. `null`/`undefined` means this
     * note starts no tie.
     *
     * A direction had to be picked (source -> target, not a symmetric pair or a
     * bare boolean) because layout has to know *which* note a tie's curve
     * reaches, not just that a tie exists; a monophonic score only ever has one
     * candidate to point at today, but a boolean flag would still leave that
     * relationship for some other structure to reconstruct later, e.g. once
     * slurs or an editor need to walk a tie from either end.
     *
     * This field is the low-level form, for a caller that already knows the
     * target note's id (e.g. copying an existing note whose id is already
     * assigned). `buildScore`'s compact literal syntax instead uses
     * `MeasureSpec`'s `extra.tiedToNext`, which it resolves to an id itself
     * once the whole score exists (see `buildScore`): a tie's target commonly
     * lives in a measure not yet built when the source note is created.
     */
    readonly tiedToId?: NoteId | null;
    /**
     * Marks a whole-measure rest (MusicXML `<rest measure="yes"/>`): a rest
     * that fills its measure whatever the time signature, drawn as the whole
     * rest glyph centred in the measure (the standard engraving, so a 3/4 or
     * 6/8 bar of silence still shows the semibreve rest, never a dotted half).
     * The number is the duration it fills, in wholes, i.e. the capacity of the
     * time signature in force at its measure (`measureCapacityWholes`).
     *
     * Stored as a number rather than a bare flag because a `Note` does not
     * know which measure it is in, yet `durationWholes` (summed by validation,
     * playback timing and layout spacing alike) has to report the right
     * length without every one of those sites learning a special case. The
     * cost is that the number is a snapshot: whoever creates the rest (the
     * importer) computes it from `Score.timeAt`, and nothing re-derives it if
     * the time signature later changes. No edit op changes a time signature
     * yet; the one that does will have to refresh this.
     *
     * Only meaningful on a rest (`pitch: null`); `Note`'s constructor throws
     * otherwise. `value` is still set (to `'whole'` by the importer) because
     * glyph lookup, beaming and export all key off it, but `durationWholes`
     * ignores `value`/`dots`/`tuplet` when this is set.
     */
    readonly measureRestWholes?: number | null;
    /**
     * Marks this note as a further head of a chord (M6 Slice 2): it sounds at
     * the same onset as the most recent earlier note *of the same voice* in its
     * measure (the chord's "anchor", which itself has this `false`), and is
     * drawn on that anchor's stem. The MusicXML shape exactly: a chord is
     * consecutive `<note>`s where every one after the first carries `<chord/>`.
     *
     * Why a marker on separate `Note`s rather than one `Note` holding
     * `pitches[]`: every head keeps its own id, so hit-testing, selection,
     * `transposeNote`, ties (each head ties to its own target) and the playback
     * cursor keep working per head with no change (plan.md's M6 "Chord model"
     * decision). The price is that anything walking a voice's timeline must
     * count a chord once, not once per head: `noteEvents` does the grouping in
     * one place, and `measureDurationWholes`/`validateMeasure` skip members.
     *
     * A member's own `value`/`dots`/`tuplet` only choose its notehead glyph;
     * the chord's duration, stem, flag and beaming all come from the anchor.
     * Only valid on a pitched note whose measure already holds an earlier
     * pitched note in the same voice (`Score.appendNote` throws otherwise).
     */
    readonly chordWithPrevious?: boolean;
    /**
     * Articulation marks on this note (M6 Slice 5), in any order, without
     * duplicates (the constructor normalizes both away into `ARTICULATIONS`
     * order). Valid on a rest too (MusicXML allows it), though only a fermata
     * is usual there.
     *
     * Chords: a mark belongs to the head it was written on (MusicXML puts it
     * on one `<note>` of the chord, usually the first, but OMR and other
     * encoders vary), and stays there so a round trip keeps it where it was.
     * Everything that *interprets* marks reads the chord's union instead
     * (`eventArticulations`): layout draws each mark once per chord, at the
     * stem-opposite end, and playback shortens every head of a staccato chord.
     */
    readonly articulations?: readonly Articulation[];
    /** A fermata over (or under) this note or rest; see `Fermata`. As with
     *  `articulations`, it sits on the head it was written on, and layout and
     *  playback read the chord's union (`eventFermata`). */
    readonly fermata?: Fermata | null;
    /**
     * An arpeggio sign (M8 Slice 5; MusicXML `<arpeggiate>`): the chord is
     * rolled, drawn as a wavy line left of it. MusicXML writes it on every
     * head of the chord (sometimes only on one), so layout reads the chord's
     * union (`eventArpeggiate`). An arrowhead `direction` is not modelled.
     */
    readonly arpeggiate?: boolean;
    /** The source's primary beam for this note; see `BeamMark`. Read off the
     *  chord's anchor (`eventBeam`), as every other duration-level property. */
    readonly beam?: BeamMark | null;
    /**
     * Makes this a grace note (M6 Slice 8; see `GraceNote`). A grace note sits
     * in `measure.notes` like any note, right before its principal: the next
     * non-grace event of its own voice in the same measure (`graceRuns`). A
     * run of grace notes with nothing after them in their voice (OMR writes a
     * grace for the next measure's downbeat at the end of this one) has no
     * principal in the measure; playback gives it the voice's first event in
     * the next measure.
     *
     * Why inline rather than a list on the principal: every grace keeps its
     * own id and its own entry in the one notes array, so hit-testing,
     * selection, `transposeNote`, slurs, ties, undo (`clone`) and passthrough
     * keep working per head with no new storage, exactly the argument that
     * settled the chord model. The price is again paid in one place: a grace
     * note is *not an event*. `durationWholes` is 0, `noteEvents` leaves it
     * out, and `validateMeasure` skips it, so every walk that counts time
     * (validation, onsets, beaming, playback, export's cursor, the correction
     * ops' event logic) sees exactly the measure it saw before; only the code
     * that draws, plays or writes a grace asks for it (`graceRuns`).
     *
     * Only valid on a pitched note that is not a chord member, a measure rest
     * or a tuplet (the constructor throws): grace chords and grace rests are
     * not modelled (rare in the choral repertoire this targets; import keeps
     * them as passthrough).
     */
    readonly grace?: GraceNote | null;
    /**
     * The lyric syllables sung on this note, at most one per verse (M6 Slice
     * 9; see `lyrics.ts`). Normally on a chord's anchor; a lyric a source
     * wrote on another head stays on that head, and layout draws the event's
     * union (`eventLyrics`), as for articulations.
     */
    readonly lyrics?: readonly (Lyric | LyricSpec)[];
    /** See `Note.passthrough`. */
    readonly passthrough?: readonly OpaqueElement[];
}
export declare class Note {
    readonly id: NoteId;
    pitch: Pitch | null;
    value: NoteValue;
    voice: number;
    dots: 0 | 1 | 2;
    tuplet: TupletRatio | null;
    /** See `NoteSpec.tiedToId`. Mutable so `Score.setTie` can wire, change or
     *  clear it after construction; kept in sync with `Score`'s reverse index
     *  only when changed through `Score.setTie` (or `Score.appendNote`'s own
     *  spec-time wiring), never by assigning this field directly. */
    tiedToId: NoteId | null;
    /** See `NoteSpec.measureRestWholes`. `null` for every ordinary note or rest. */
    readonly measureRestWholes: number | null;
    /** See `NoteSpec.chordWithPrevious`. `false` for a chord's anchor and for
     *  every ordinary note or rest. */
    readonly chordWithPrevious: boolean;
    /** See `NoteSpec.articulations`. Always in `ARTICULATIONS` order with no
     *  duplicates; replaced wholesale (never mutated), so a clone may share it. */
    articulations: readonly Articulation[];
    /** See `NoteSpec.fermata`. `null` for none. */
    fermata: Fermata | null;
    /** See `NoteSpec.arpeggiate`. */
    arpeggiate: boolean;
    /** See `NoteSpec.beam`. `null` when the source said nothing about beams. */
    beam: BeamMark | null;
    /** See `NoteSpec.grace`. `null` for every ordinary note or rest. */
    readonly grace: GraceNote | null;
    /** See `NoteSpec.lyrics`. Frozen, replaced wholesale (never mutated), so a
     *  clone may share it. */
    lyrics: readonly Lyric[];
    /**
     * Unmodelled children of this note's `<note>` (M6 Slice 3, see
     * `passthrough.ts`), in source order: a `<lyric>` the model cannot hold
     * (M6 Slice 9: `<humming>`, `<laughing>`), `<notehead>`, `<cue>`, a
     * `<notations>` cut down to the children the model does not own, a
     * `<tie>`/`<tied>`/`<slur>` end that never found its partner, ... Export
     * slots each back into its schema position. It belongs to this note alone,
     * so edits that keep the note (a transpose) keep it, and a chord member
     * carries its own. Replaced wholesale, never mutated: the array and every
     * element are immutable, which is what lets `Score.clone` share them.
     */
    passthrough: readonly OpaqueElement[];
    constructor(id: NoteId, spec: NoteSpec);
    /** Whether this is a grace note; see `NoteSpec.grace`. */
    get isGrace(): boolean;
    /** Whether this is a whole-measure rest; see `NoteSpec.measureRestWholes`. */
    get isMeasureRest(): boolean;
    get isRest(): boolean;
    /** Whether this note starts a tie into a following note. */
    get isTied(): boolean;
    /**
     * Duration as a fraction of a whole note, dots and tuplet ratio both folded
     * in. Layout uses it for note spacing (so a dotted or tupleted note gets
     * proportionally more or less room without spacing needing to know why);
     * `measureDurationWholes` sums it to check a measure against its time
     * signature's capacity.
     */
    get durationWholes(): number;
}
/** `marks` deduplicated and in `ARTICULATIONS` order; the shared empty array
 *  when there are none. */
export declare function normalizeArticulations(marks: readonly Articulation[] | undefined): readonly Articulation[];
/**
 * The articulations of one event (a single note or rest, or every head of a
 * chord as `noteEvents` groups them): the union over its heads, in
 * `ARTICULATIONS` order. What layout draws once per chord and what playback
 * applies to every head, whichever head a mark was written on (see
 * `NoteSpec.articulations`).
 */
export declare function eventArticulations(event: readonly Note[]): readonly Articulation[];
/** Whether any head of one event carries an arpeggio (M8 Slice 5; see
 *  `NoteSpec.arpeggiate`). */
export declare function eventArpeggiate(event: readonly Note[]): boolean;
/** One event's source beam mark (M8 Slice 5; see `BeamMark`): the anchor's,
 *  or a member's when only a member's says where a beam runs. */
export declare function eventBeam(event: readonly Note[]): BeamMark | null;
/** One event's fermata (see `eventArticulations`): the first head's that has
 *  one, upright winning if heads disagree (a chord has one fermata). */
export declare function eventFermata(event: readonly Note[]): Fermata | null;
export declare class Measure {
    /**
     * Position within its own staff, 0-based. Kept in sync by `Score`/`Staff`.
     *
     * Before M2 Slice 3 this was a single score-wide flat address (every score
     * had exactly one implicit staff, so "position in the score" and "position
     * in the staff" were the same number). Now a measure is addressed by this
     * *together with* `staffIndex`: `layout.ts`'s `LaidOutMeasure`,
     * `relayoutMeasure` and `CanvasRenderer.redrawMeasure` all take the pair,
     * not this field alone. A single-staff score (every score before this
     * slice, and still the common case) is the `staffIndex`-always-0
     * degenerate case, with this field's own meaning unchanged.
     */
    index: number;
    /** Which staff (`Score.staves`) this measure belongs to. See `index`'s own
     *  comment on the `(staffIndex, index)` addressing pair this slice
     *  introduces. */
    readonly staffIndex: number;
    /**
     * The printed measure number (M8 Slice 2), MusicXML's `<measure number>`
     * verbatim: a string, since it need not be numeric ("12a", "X1"), and a
     * pickup is often "0". `undefined` when the source gave none, or for a
     * measure built in code; export then writes `index + 1`. Set on every
     * staff of the part, like the barline fields. Nothing renumbers it: an
     * edit that adds or removes measures leaves the others' numbers as read.
     */
    number?: string;
    readonly notes: Note[];
    /**
     * A key signature change taking effect starting at this measure.
     * `undefined` means "no change here": the key in force is whatever the
     * nearest earlier measure with an explicit value set, or the score's
     * initial `keyFifths` if none ever did. Callers should not walk that chain
     * themselves; `Score.keyFifthsAt` does it once, in one place.
     */
    keyFifths?: number;
    /** Same idea as `keyFifths`, for a time signature change. See `Score.timeAt`. */
    time?: TimeSignature;
    /**
     * A clef change taking effect starting at this measure (M5 Slice 5), the
     * same shape as `keyFifths`/`time`: `undefined` means "same clef as the
     * previous measure", or, for measure 0, the staff's own `Staff.clef`.
     * `Staff.clef` stays the staff's *initial* clef; an explicit value here on
     * measure 0 is an override of it, not a replacement, so `Staff.clef` never
     * has to be rewritten by an edit. Read through `Score.clefAt`, never this
     * field directly: every clef-dependent position (notehead lines, ledgers,
     * key signature octaves) needs the clef actually in force, and the
     * walk-back that answers that lives in one place.
     */
    clef?: ClefType;
    /**
     * Clef changes inside this measure (M6 Slice 4; see `ClefChange`), sorted
     * by onset, each onset > 0. Per staff like `clef`, and kept separate from
     * it rather than folding `clef` in as an onset-0 entry, so every existing
     * reader of the downbeat clef (`clefAt`, `setClefRange`, the system
     * header) keeps its one-field shape. The last change's clef carries into
     * the following measures through `Score.clefAt`'s walk-back, exactly as a
     * `clef` set here would. Read through `Score.clefAtOnset`, never directly,
     * for "which clef is this note in". Replaced wholesale, never mutated.
     */
    clefChanges: readonly ClefChange[];
    /**
     * Dynamic marks drawn on this measure's staff (M6 Slice 6; see
     * `DynamicMark`), sorted by onset. A hairpin spans measures, so it lives
     * on the score instead (`Score.wedges`). Replaced wholesale, never
     * mutated, like `clefChanges`.
     */
    dynamics: readonly DynamicMark[];
    /**
     * The barline at the boundary *after* this measure: `'normal'`, `'double'`,
     * `'final'` or `'repeatEnd'`. `'repeatStart'` is deliberately not a valid
     * value here; see `startBarline` for why that one belongs to the measure it
     * opens instead. `undefined` means "no explicit choice": `Score.endBarlineAt`
     * resolves that to `'normal'`, except for the score's true last measure,
     * which resolves to `'final'` instead so every score still ends with a
     * final barline with no annotation required (this is exactly what
     * `ctx.isLast` hardcoded before `BarlineType` existed). Read through
     * `Score.endBarlineAt`, never this field directly: a `repeatStart` on the
     * *next* measure also overrides whatever this field says, and that walk
     * lives in one place, the same discipline `keyFifthsAt`/`timeAt` already
     * follow for key/time changes.
     */
    endBarline?: BarlineType;
    /**
     * A repeat-start barline (thick line, then two dots) at the *start* of
     * this measure, opening a repeated section. The only barline type
     * conventionally attached to the start of a measure rather than the end
     * (mirroring MusicXML's `<barline location="left">` vs `"right">`), which
     * is why it gets its own field instead of living in `endBarline`: a plain
     * union field for "the barline here" would have to pick one measure to
     * belong to, and `endBarline`'s owner (the measure just before the
     * boundary) is wrong for a mark that engraving convention reads as
     * belonging to what comes *after* it.
     *
     * Despite living on this measure's own model, the ink is still drawn by
     * whichever measure's `layoutMeasure` call lays out *this* measure (i.e.
     * this one, at its own start), not by the previous measure: that keeps the
     * "a measure's ops are everything a repaint of it needs to put back"
     * invariant intact without a second draw pass or a lookahead into a
     * neighbour's ops. The previous measure still needs a one-field lookahead
     * of its own, into *this* field, to know to skip drawing its own default
     * end barline at the same boundary; see `Score.endBarlineAt`.
     */
    startBarline?: 'repeatStart';
    /**
     * How many times the section a `repeatEnd` closes is played in all
     * (MusicXML `<repeat times>`), when the source stated it; `undefined`
     * means the usual 2. Only meaningful beside `endBarline: 'repeatEnd'`.
     */
    repeatTimes?: number;
    /**
     * A volta opening at the start of this measure (M6 Slice 12; see
     * `EndingStart`). An ending spans every measure from here to the next
     * measure with an `endingEnd`, inclusive; import only sets the pair, never
     * a start with no end or an end with no start (that `<ending>` stays
     * `barlinePassthrough`). Set on every staff of the part, like the barline
     * fields, though only the part's first staff is read on export.
     */
    endingStart?: EndingStart;
    /** The volta closing at the end of this measure; see `endingStart`. */
    endingEnd?: EndingEnd;
    /**
     * `<measure>` children the model does not hold, each anchored at the onset
     * and voice stream it was read at (M6 Slice 3; see `MeasurePassthrough`).
     * Held by the staff the stream belongs to. Replaced wholesale, never
     * mutated, like `Note.passthrough`.
     */
    passthrough: readonly MeasurePassthrough[];
    /**
     * Children of this measure's `<attributes>` the model does not own
     * (`<staff-details>`, `<transpose>`, `<measure-style>`, ...), which export
     * merges, in schema order, into the `<attributes>` it writes for the
     * measure (writing one just for them if the model has nothing to state).
     * Kept on the part's first staff, the one export reads a part's
     * attributes from. An `<attributes>` with nothing owned in it at all is
     * positional `passthrough` instead, so a mid-measure one stays mid-measure.
     */
    attributesPassthrough: readonly OpaqueElement[];
    /**
     * `<barline>` elements, minus whatever the model read out of them into
     * `startBarline`/`endBarline` (`bar-style`, and `repeat` when the model
     * holds the repeat) and `endingStart`/`endingEnd` (a well-formed
     * `<ending>`), each still carrying its `location`: an unpaired `<ending>`, a
     * `<fermata>`, a `bar-style` the model has no shape for (`dashed`,
     * `heavy`, ...). Export merges each into the barline it writes at that
     * location, or writes it alone. Kept on the part's first staff, like
     * `attributesPassthrough`.
     */
    barlinePassthrough: readonly OpaqueElement[];
    constructor(index: number, staffIndex: number);
}
/**
 * One staff (a five-line stave): its own clef and its own sequence of
 * `Measure`s. A `Part` (below) groups one or more staves belonging to the
 * same instrument or voice (e.g. a piano's two staves, or one SATB voice's
 * single staff).
 *
 * Introduced whole by M2 Slice 3: before it, `Score` had exactly one
 * implicit staff (a fixed, always-treble `clef` field, and `measures` as one
 * flat array), which is now `staves[0]`, created by `Score`'s own
 * constructor so every score before this slice, and the still-common
 * single-staff case, needs no code change to keep working. Multiple staves
 * rendering together as one *visually joined* system (staves stacked
 * tightly, sharing barlines) is M2 Slice 4's job ("Multi-staff system
 * layout"), not this one: `layout.ts`'s `layoutScore` lays each staff out
 * independently and merely stacks the results, a deliberately naive
 * placeholder (see its own comment) that exists only so this slice's
 * `(staffIndex, measureIndex)` addressing has something real, multi-staff,
 * to prove region-scoped redraw against.
 */
export declare class Staff {
    readonly index: number;
    clef: ClefType;
    readonly measures: Measure[];
    constructor(index: number, clef?: ClefType);
}
/**
 * A group of one or more staves belonging to the same instrument or voice
 * part, e.g. one SATB voice's single staff or a piano's two staves.
 *
 * Only the grouping itself is modelled here. The brace/bracket glyph and
 * vertical span a real score draws at a system's start for a multi-staff
 * part, plus the part-name label, is M2 Slice 5's own scope ("Part grouping
 * + braces/brackets"); nothing here draws either one yet. This slice needs
 * `Part` to exist as a real, constructible grouping so `Score` can express
 * "these staves belong together" at all, which is the foundation Slice 5
 * draws on, not a rendering feature in its own right yet.
 */
export interface Part {
    readonly name?: string;
    readonly staffIndices: readonly number[];
    /**
     * Unowned children of the `<score-part>` this part came from
     * (`<score-instrument>`, `<midi-instrument>`, `<part-abbreviation>`, ...),
     * or, for a part that records a bracket/brace group, of its `<part-group
     * type="start">` (`<group-name>`, `<group-barline>`, ...). M6 Slice 3;
     * export merges them back in schema order.
     */
    readonly passthrough?: readonly OpaqueElement[];
}
export interface TimeSignature {
    readonly beats: number;
    readonly beatType: number;
}
/**
 * A measure's notes' total duration, as a fraction of a whole note.
 *
 * Deliberately does *not* merge a tied pair into one duration. A tie is a
 * sounding/perceptual construct: the two notes are heard as one continuous
 * note, but each is still a written note occupying its own measure's own
 * capacity, exactly as MusicXML (this model's spiritual reference) counts it:
 * `<tie>` is a separate, playback-facing element layered on top of two
 * ordinarily-durationed `<note>`s, not a way to make one of them free. A
 * quarter note tied to a quarter note across a barline still costs a quarter
 * of each measure's capacity, the same as if there were no tie at all; only
 * layout and playback treat the pair as one continuous sound. Getting this
 * backwards (subtracting a tied note's duration from its own measure, on the
 * theory that "it's really one long note") would let an under-full measure
 * validate as full, which is exactly the bug this function exists to catch.
 */
export declare function measureDurationWholes(measure: Measure): number;
/**
 * A measure's notes grouped into *events* (M6 Slice 2): one entry per onset
 * in one voice, i.e. a plain note or rest alone, or a chord's anchor followed
 * by its members (`Note.chordWithPrevious`) in their `measure.notes` order.
 * Events come out in their anchors' order of appearance, so one voice's
 * events are in time order and two interleaved voices stay interleaved
 * exactly as `notes` had them; a caller wanting one voice filters by
 * `event[0].voice`.
 *
 * The single place chord membership is resolved, so every duration walk
 * (layout's onsets and beaming, playback's timeline, export) counts a chord
 * once by walking events and advancing by `event[0].durationWholes`, rather
 * than each re-implementing "skip members, but remember which anchor they
 * belong to". A member joins the most recent earlier event *of its own
 * voice*, which is what lets a literal or an import interleave two voices'
 * notes freely; one with no such event (only reachable by bypassing
 * `Score.appendNote`'s check) starts an event of its own rather than being
 * lost.
 *
 * Grace notes (M6 Slice 8) are left out entirely: they take no time, so they
 * are not events, and every caller here walks time. The few that draw, play
 * or write graces ask `graceRuns` for them.
 */
export declare function noteEvents(notes: readonly Note[]): Note[][];
/**
 * One run of consecutive grace notes in one voice (M6 Slice 8): the graces in
 * `measure.notes` order, and the principal they ornament, the anchor of the
 * voice's next event in the measure, or `null` when the run ends its voice
 * (see `NoteSpec.grace`). A run is never empty.
 */
export interface GraceRun {
    readonly voice: number;
    readonly notes: readonly Note[];
    readonly principal: Note | null;
}
/**
 * A measure's grace notes grouped into runs, per voice, in the order each
 * run's first grace appears. A run ends at the voice's next event anchor (its
 * principal); a chord member of a voice never ends one (it cannot sit between
 * a grace and its principal, since members follow their anchor). The single
 * place "which note does this grace belong to" is answered, the way
 * `noteEvents` is for chords.
 */
export declare function graceRuns(notes: readonly Note[]): GraceRun[];
/** How much duration a time signature's measure holds, as a fraction of a whole note. */
export declare function measureCapacityWholes(time: TimeSignature): number;
export interface MeasureValidation {
    /** True iff every voice present in the measure independently fills the
     *  time signature's capacity; see `perVoice` and this function's own
     *  comment for why "every voice independently" is the right rule, not
     *  "the sum across voices". */
    readonly valid: boolean;
    /** The measure's actual total *summed across every voice sharing it*, as a
     *  fraction of a whole note. Kept for backward compatibility and because
     *  it is a real, useful number in its own right (e.g. a total-ink-width
     *  estimate that wants "how much duration is in this measure" regardless
     *  of how many voices it took to fill it) - it is deliberately *not* what
     *  `valid` is computed from any more; see `perVoice`. */
    readonly actualWholes: number;
    /** What the time signature says the measure should hold, i.e. what *each*
     *  voice present should individually sum to. */
    readonly expectedWholes: number;
    /** One entry per distinct `Note.voice` present in the measure, each
     *  reporting that voice's own total against `expectedWholes`. A measure
     *  with no notes at all has no voices present, hence an empty array here,
     *  which in turn makes `valid` false against any nonzero-capacity time
     *  signature (there is no voice that filled it) - consistent with this
     *  function's pre-existing behaviour of flagging an empty measure as
     *  invalid, just now reached through the per-voice rule instead of a
     *  vacuously-zero sum. */
    readonly perVoice: readonly {
        readonly voice: number;
        readonly actualWholes: number;
        readonly valid: boolean;
    }[];
}
/**
 * Check that a measure's notes fill its time signature's capacity, one voice
 * at a time.
 *
 * Deliberately just reports: an under- or over-full measure is a modelling
 * error the caller (an importer, an edit op, a hand-built test fixture) needs
 * to know about, not something layout should silently pad or truncate to fix.
 *
 * `time` is taken as a plain parameter, not read off `measure` itself, because
 * a measure only ever *changes* a time signature (`Measure.time`); the one
 * actually in force at a given measure is `Score.timeAt(measure.index)`, which
 * a caller in a score with any mid-score time changes needs to pass here
 * rather than the score's single initial `time`.
 *
 * A single voice filling a measure is the easy case: its own notes' durations
 * simply have to sum to the time signature's capacity, which is exactly what
 * `measureDurationWholes` computes when there is only one voice to sum.
 * Two or more voices sharing a measure is not "the sum of every voice's notes
 * fills the measure once" (that formula makes a fully-valid two-voice 4/4
 * measure, each voice independently a full bar of its own, sum to *2* wholes
 * and incorrectly fail); it is "*each* voice independently fills the measure
 * on its own timeline", the same way a real two-voice staff has voice 1's
 * quarter notes and voice 2's quarter notes each separately accounting for
 * all four beats, not jointly accounting for four beats between them. This
 * function therefore groups the measure's notes by `note.voice`, checks each
 * group's own sum against `expectedWholes` independently (`perVoice`), and
 * only calls the whole measure `valid` when every one of those groups passes.
 * `actualWholes` (the old, single total) is kept for backward compatibility
 * and its own documented uses, but is no longer what `valid` is computed
 * from once more than one voice is present.
 */
export declare function validateMeasure(measure: Measure, time: TimeSignature): MeasureValidation;
export interface ScoreOptions {
    /** MusicXML `fifths`: positive counts sharps, negative flats. */
    readonly keyFifths?: number;
    readonly time?: TimeSignature;
    /** Clef of `Score`'s own first staff (`staves[0]`), created by the
     *  constructor. Defaults to `'treble'`, matching every score built before
     *  M2 Slice 3. Add further staves (with their own clefs) via
     *  `appendStaff`. */
    readonly clef?: ClefType;
    /** Score-wide tempo in quarter-note beats per minute (the MIDI/MusicXML
     *  convention, independent of the prevailing time signature's beat unit).
     *  Defaults to 120. Like `keyFifths`/`time`, this is a single score-wide
     *  starting value with no per-measure change tracked yet: a future phase
     *  would add a mid-score tempo change following the same `keyFifthsAt`-style
     *  walk-back accessor, if that's ever needed. */
    readonly tempoBpm?: number;
}
/**
 * A phrase mark spanning a run of notes: everything from `startNoteId` to
 * `endNoteId`, inclusive, in score order. Unlike a tie, a slur is a pure
 * notation marking with no sounding/duration meaning, so it needs no field on
 * `Note` at all; it only needs its two ends, since layout can always walk
 * `Score.notesInOrder()` between them to find what it spans. That is also why
 * this is not modelled as a per-note flag the way `Note.tiedToId` is: a
 * per-note field only ever names its *own* neighbour, and a slur's two ends
 * are typically many notes apart.
 */
export interface Slur {
    readonly startNoteId: NoteId;
    readonly endNoteId: NoteId;
}
/**
 * An explicit beam grouping notes across exactly two staves (e.g. a piano
 * passage crossing hands): a treble-clef note and a bass-clef note, each
 * already correctly notated in its own staff's own Measure, sharing one
 * visual beam. Unlike ordinary same-staff beaming (`computeBeamGroups` in
 * layout.ts, fully automatic from onset/beat position), this can never be
 * inferred: two different Measure objects in two different Staffs have no
 * shared onset timeline for layout to detect automatically, so a composer
 * or importer has to state the grouping explicitly, the same reason a Slur
 * needs to be stated rather than inferred.
 *
 * `staffIndices` (ascending, e.g. `[0, 1]`) is computed once by
 * `addCrossStaffBeam` and cached here rather than re-derived by every
 * reader, mirroring `BeamGroup.direction` (M2 Slice 4's own refactor, see
 * layout.ts) being decided once rather than recomputed by each consumer.
 */
export interface CrossStaffBeam {
    readonly noteIds: readonly NoteId[];
    readonly staffIndices: readonly [number, number];
}
/**
 * One measure, addressed the way layout and the renderer address it: by its
 * staff and its staff-local index. What the M6 Slice 7 correction ops return
 * (a list of them, deduplicated, in staff then measure order) so a caller can
 * re-lay-out and repaint exactly what an edit touched: usually the edited
 * note's own measure, plus a tie partner's or slur end's measure across a
 * barline.
 */
export interface MeasureRef {
    readonly staffIndex: number;
    readonly measureIndex: number;
}
export declare class Score {
    #private;
    /**
     * Every staff in the score (M2 Slice 3). The constructor always creates
     * `staves[0]`, so a single-staff score (every score before this slice, and
     * still the common case) never has to think about this array at all;
     * `appendStaff` adds more.
     */
    readonly staves: Staff[];
    /**
     * Every part in the score, each grouping one or more `staves` indices. The
     * constructor creates one default part holding just `staves[0]`, mirroring
     * `staves` itself: a single-staff, single-part score (every score before
     * this slice) needs no code change to keep that shape. See `Part`'s own
     * comment for what this does and does not do yet.
     */
    readonly parts: Part[];
    /** `staves[0]`'s own clef, kept as a convenience accessor so code (and any
     *  external reader) written against "the score's clef" from before M2
     *  Slice 3 still resolves to something sensible; a genuinely multi-staff
     *  score should read `staves[i].clef` directly instead. Either way this
     *  is only the *initial* clef: since M5 Slice 5 a measure can change it
     *  mid-staff, so "the clef at measure N" is `clefAt`'s question. */
    get clef(): ClefType;
    /** The key in force before any measure states its own change; equivalent to
     *  a change "at measure -1". Read this directly only when literally asking
     *  about the score's starting point; `keyFifthsAt` is what answers "what
     *  key is measure N actually in", which is what layout and validation need. */
    keyFifths: number;
    /** Same idea as `keyFifths`, for the time signature. See `timeAt`. */
    time: TimeSignature;
    /** Score-wide tempo in quarter-note beats per minute. See `ScoreOptions
     *  .tempoBpm`: like `keyFifths`/`time` this is a single starting value with
     *  no mid-score change tracked yet, so playback (`src/playback`) reads this
     *  field directly rather than through a walk-back accessor. */
    tempoBpm: number;
    /**
     * `staves[0]`'s own measures, kept as a convenience accessor for the same
     * reason `clef` is: every score built before M2 Slice 3 (and `buildScore`'s
     * own compact literal, still single-staff-only) reads/writes this directly,
     * and it stays the exact degenerate case of `staves[0].measures` for a
     * single-staff score. A genuinely multi-staff caller reads `staves[i]
     * .measures` instead.
     */
    get measures(): Measure[];
    /** Every slur in the score, in the order `addSlur` was called. Layout reads
     *  this directly (not through some per-measure index) since a slur's own
     *  measure range has to be worked out fresh from its two note ids anyway,
     *  the same reason a tie's crossing-a-barline case reads `Note.tiedToId`
     *  and `tiedFromNote` rather than a precomputed span.
     *
     * A slur's two ends are validated against `notesInOrder(staffIndex)`
     * (that method's own comment explains the per-staff parameter): both ends
     * must land on the same staff, and `addSlur` resolves and passes that
     * staff's index in itself, so a slur can anchor on any single staff, not
     * just `staves[0]`. A slur straddling *two different* staves is still
     * rejected (`addSlur` throws), since a slur's curve is drawn within one
     * staff's own band and there is no single cross-staff "score order" for
     * two ends on different staves to be checked against in the first place. */
    readonly slurs: Slur[];
    /** Every cross-staff beam in the score (M2 Slice 6), in the order
     *  `addCrossStaffBeam` was called. See `CrossStaffBeam`'s own comment for
     *  what this does and does not model. */
    readonly crossStaffBeams: CrossStaffBeam[];
    /**
     * Every crescendo/diminuendo hairpin (M6 Slice 6; see `Wedge`), in the
     * order they were added. A score-level list like `slurs`, since a hairpin
     * spans measures; layout and playback find the ones crossing a measure by
     * scanning it, which is cheap at the hundreds a real score has. Entries are
     * immutable: an edit replaces one.
     */
    readonly wedges: Wedge[];
    /**
     * The score header the model does not hold (M6 Slice 3): every
     * `<score-partwise>` child before `<part-list>` (`<work>`,
     * `<movement-title>`, `<identification>`, `<defaults>`, `<credit>`), in
     * source order, written back ahead of the part list.
     */
    headerPassthrough: readonly OpaqueElement[];
    constructor(options?: ScoreOptions);
    /** Add a new staff (default clef `'treble'`) and return it. The score's
     *  constructor always creates `staves[0]`; this is how a score grows a
     *  second or later staff, e.g. a piano's two staves or an additional SATB
     *  voice. Does not add the new staff to any `Part`: a caller wanting a
     *  multi-staff part (a piano's brace, a choir's bracket) still has to add
     *  or edit a `Part` itself, since a bare `appendStaff` call has no way to
     *  guess whether the new staff joins an existing part or starts its own. */
    appendStaff(clef?: ClefType): Staff;
    /** Add a new `Part` grouping `staffIndices`, returning it. See `Part`'s own
     *  comment: this only records the grouping, it draws no brace/bracket
     *  (Slice 5's job). */
    addPart(staffIndices: readonly number[], name?: string, passthrough?: readonly OpaqueElement[]): Part;
    /** Append a measure to a staff (`staves[0]` by default, preserving every
     *  single-staff call site from before M2 Slice 3 unchanged) and return it. */
    appendMeasure(staffIndex?: number): Measure;
    /**
     * The key signature in force at `measureIndex`: that measure's own
     * `keyFifths` if it set one, otherwise the nearest earlier measure's,
     * otherwise the score's initial `keyFifths`. Every reader that needs "the
     * key right now" (layout's key-aware accidental suppression, the courtesy
     * key signature at a change) calls this rather than walking `measures`
     * itself, so the walk-back rule lives in exactly one place.
     *
     * `staffIndex` (M2 Slice 3, default 0) walks back through *that staff's
     * own* measures: every score before this slice only ever had staff 0, so
     * the default reproduces the exact old single-argument behaviour.
     */
    keyFifthsAt(measureIndex: number, staffIndex?: number): number;
    /** Same walk-back as `keyFifthsAt`, for the time signature in force at
     *  `measureIndex` (of `staffIndex`, default 0). Layout uses this for beat
     *  grouping and the courtesy time signature at a change; `validateMeasure`
     *  uses it to check a measure against the capacity that actually applies to
     *  it, not the score's initial one, once a measure has changed it. */
    timeAt(measureIndex: number, staffIndex?: number): TimeSignature;
    /**
     * The clef in force at `measureIndex` of `staffIndex` (M5 Slice 5): that
     * measure's own `clef` if it set one, otherwise the nearest earlier
     * measure's, otherwise the staff's own initial `Staff.clef`. The same
     * walk-back `keyFifthsAt`/`timeAt` already do, with the per-staff fallback
     * in place of a score-wide one, since a clef has always been per staff
     * (M2 Slice 3). Argument order matches those siblings (measure first,
     * staff defaulting to 0) rather than the plan's `(staffIndex,
     * measureIndex)` sketch, so every walk-back accessor reads the same way.
     */
    clefAt(measureIndex: number, staffIndex?: number): ClefType;
    /**
     * The clef in force at `onsetWholes` (wholes from the start) inside
     * `measureIndex` (M6 Slice 4): the last `Measure.clefChanges` entry at or
     * before that onset, else the downbeat clef `clefAt` resolves. A change is
     * in force *at* its own onset, so the note it sits before reads it. Onsets
     * are compared with a tolerance far below any real duration, for the same
     * float-summation reason layout buckets its column onsets.
     */
    clefAtOnset(measureIndex: number, onsetWholes: number, staffIndex?: number): ClefType;
    /** The clef in force at the end of `measureIndex` (M6 Slice 4): its last
     *  mid-measure change, else its downbeat clef. What the next measure
     *  inherits when it states no clef of its own. */
    clefAtEnd(measureIndex: number, staffIndex?: number): ClefType;
    /**
     * The barline actually drawn at the boundary after `measureIndex`.
     *
     * Unlike `keyFifthsAt`/`timeAt`, a barline never *inherits* forward from an
     * earlier measure: each boundary is decided fresh from just the two
     * measures touching it. Two rules apply, in order. First, if the
     * *following* measure opens with `startBarline: 'repeatStart'`, that wins
     * regardless of what this measure's own `endBarline` says: a repeat start
     * is conventionally attached to the measure it opens (see
     * `Measure.startBarline`'s own comment), and the two fields could
     * otherwise disagree about who draws a boundary that only ever has one
     * physical barline. Second, an unset `endBarline` resolves to `'normal'`,
     * except at the score's true last measure, where it resolves to `'final'`
     * instead, preserving the behaviour `ctx.isLast` hardcoded before
     * `BarlineType` existed: every score still ends with a final barline with
     * no explicit annotation required, but a score that *does* annotate its
     * last measure (e.g. `endBarline: 'double'`) is honoured over the
     * automatic default.
     *
     * `staffIndex` (M2 Slice 3, default 0) resolves the boundary within *that
     * staff's own* measures, the same additive default every other staff-aware
     * method here uses.
     */
    endBarlineAt(measureIndex: number, staffIndex?: number): BarlineType;
    /**
     * The score's voltas in order, read off the top staff (every staff carries
     * the same fields): each `endingStart` paired with the next `endingEnd` at
     * or after it. A start with no end (import never leaves one) is skipped.
     * Shared by the volta brackets (layout) and the play order (playback).
     */
    endings(): EndingSpan[];
    /** Append a note (or rest) to a measure, returning it so callers can keep its id. */
    appendNote(measure: Measure, spec: NoteSpec): Note;
    findNote(id: NoteId): Note | undefined;
    measureOfNote(id: NoteId): Measure | undefined;
    /**
     * Every note in the score, flattened in playback order (measure order, then
     * position within a measure). Layout's slur pass uses this to walk the run
     * of notes a slur spans, and `addSlur` uses it to check that a slur's start
     * genuinely comes before its end; a tie never needed this because its
     * target is always a single note named directly, never "whatever comes
     * between two others."
     *
     * Takes a `staffIndex` (M2 Slice 3, default 0) because multiple staves each
     * have their own independent note sequence: there is no single flat "score
     * order" spanning every staff at once (a question M3's own scoping notes
     * flag again for playback, unanswered for the same reason here), only one
     * order *per staff*. Defaulting to 0 reproduces this method's original
     * pre-Slice-3 no-argument behaviour for every existing caller that never
     * needed anything but `staves[0]`.
     *
     * This used to be a real bug, not just a documented scope cut: reading
     * `this.measures` (`staves[0]` alone) unconditionally meant `addSlur`'s
     * order check on any staff other than 0 always compared two `-1` indices
     * from `Array.indexOf` finding nothing, which always satisfied
     * `startIndex >= endIndex` and made `addSlur` throw "must come before" for
     * every non-staff-0 slur regardless of the actual notes involved. The
     * `staffIndex` parameter is the fix: `addSlur` now resolves the slur's
     * actual staff and passes it through here instead of always reading
     * staff 0.
     */
    notesInOrder(staffIndex?: number): readonly Note[];
    /**
     * Add a slur (phrase mark) spanning every note from `startNoteId` to
     * `endNoteId`, inclusive, in score order.
     *
     * Unlike `setTie`, there is no pitch-equality constraint: a slur marks a
     * phrase, not a sounding continuation, so any two notes at any two pitches
     * qualify. Both ends must already be notes (not rests: a slur has to
     * anchor its curve to an actual notehead), both ends must live on the
     * *same* staff (a slur's curve is drawn within one staff's own band; see
     * `notesInOrder`'s own comment on why there is no single cross-staff
     * "score order" to check a straddling slur against in the first place),
     * and `startNoteId` must come before `endNoteId` in that staff's own
     * `notesInOrder()`, since layout walks forward from one to the other to
     * find what the slur spans; a backwards or same-note span would have
     * nothing to walk.
     */
    addSlur(startNoteId: NoteId, endNoteId: NoteId): Slur;
    /**
     * Add a dynamic mark (M6 Slice 6) at `onset` wholes into measure
     * `measureIndex` of staff `staffIndex`, keeping `Measure.dynamics` sorted.
     * For a score built in code; import reads marks with their source attached
     * (`DynamicMark.source`) and sets the list directly. `voice` defaults to
     * the measure's first voice, the stream export writes the mark in.
     */
    addDynamic(staffIndex: number, measureIndex: number, spec: {
        readonly kind: DynamicKind;
        readonly onset?: number;
        readonly placement?: Placement;
        readonly voice?: number;
    }): DynamicMark;
    /**
     * Add a crescendo/diminuendo hairpin (M6 Slice 6) on staff `staffIndex`
     * from `start` to `stop`, each a measure index plus an onset in wholes
     * from that measure's downbeat (default 0; a stop "at the barline" is the
     * measure's own length). Throws for a missing staff or measure, or a stop
     * before its start. For a score built in code, like `addDynamic`.
     */
    addWedge(spec: {
        readonly kind: WedgeKind;
        readonly staffIndex?: number;
        readonly placement?: Placement;
        readonly start: {
            readonly measureIndex: number;
            readonly onset?: number;
        };
        readonly stop: {
            readonly measureIndex: number;
            readonly onset?: number;
        };
    }): Wedge;
    /**
     * Add an explicit cross-staff beam (M2 Slice 6) linking `noteIds`, each
     * already a note in its own staff's own Measure. See `CrossStaffBeam`'s own
     * comment for what this does and does not model.
     *
     * Validated tightly since nothing later can sensibly render a malformed
     * group: every id must be a real, pitched note (a rest has no stem to
     * extend across the gap) whose own duration is beam-eligible (eighth note
     * or shorter, the same threshold `layout.ts`'s FLAG_GLYPHS keys on, checked
     * here via NOTE_VALUE_WHOLES so this file does not need to import anything
     * from layout.ts to know it); every note must land in the exact same
     * measure column (the same Measure.index) across staves, since this slice
     * does not attempt to coordinate x-position across a measure *and* a staff
     * boundary at once (documented scope cut, see layout.ts); the notes'
     * owning measures must span exactly two distinct, adjacent staffIndices
     * (this slice only ever splits one shared gap, the same scope barlineSpan
     * itself already narrowed to "spanning the full staff-group height" rather
     * than an arbitrary non-adjacent pair); and each staff side needs at least
     * two of its own notes, since layoutBeamGroup's ordinary machinery draws a
     * real beam segment only for two or more members. A cross-staff beam with
     * only one note on one side would need real engraving's "beamlet stub
     * toward the gap" convention for that side, which this slice does not
     * build (documented scope cut).
     */
    addCrossStaffBeam(noteIds: readonly NoteId[]): CrossStaffBeam;
    /** The CrossStaffBeam containing `id`, if any. Layout uses this once per
     *  note it lays out, exactly like `tiedFromNote`. */
    crossStaffBeamContaining(id: NoteId): CrossStaffBeam | undefined;
    /**
     * Wire, change or clear a tie starting at `sourceId`.
     *
     * `targetId: null` unties `sourceId` from whatever it pointed at. A
     * non-null target must already be a note in this score (both notes must
     * exist for the pitch check below to run), which is exactly the
     * chicken-and-egg problem `buildScore`'s `extra.tiedToNext` sugar exists to
     * route around: a literal that reads top-to-bottom names a tie's source
     * before its target is ever built, so `buildScore` calls this only in a
     * second pass, once every note has an id.
     */
    setTie(sourceId: NoteId, targetId: NoteId | null): void;
    /**
     * The note (if any) whose tie lands on `id`, i.e. `id`'s note is the
     * *receiving* end of a tie started elsewhere. Layout uses this to draw the
     * incoming half of a tie crossing into a measure from an earlier one,
     * without scanning every note in the score to find who ties into it.
     */
    tiedFromNote(id: NoteId): Note | undefined;
    /**
     * The one edit op Phase 0 implements: move a note by whole semitones.
     *
     * Returns the index of the measure that changed (within *its own staff*;
     * see `Measure.index`'s own comment), or `null` if nothing did (unknown id,
     * the note is a rest, or `semitones` is 0). That return value is the contract the
     * incremental redraw hangs off: the caller re-lays-out and repaints exactly
     * the measures an edit reports, and no others.
     *
     * Scope cut (M2 Slice 3): still returns a bare measure index, not a
     * `{staffIndex, measureIndex}` pair, even though `relayoutMeasure`/
     * `CanvasRenderer.redrawMeasure` now both need the pair to fully address a
     * measure. Every existing caller only ever edits staff 0, where the bare
     * index is already the whole answer; a caller editing a non-zero staff can
     * recover its `staffIndex` from `measureOfNote(id)?.staffIndex` (new this
     * slice) before calling `transposeNote`, so widening this return type is
     * not needed to make multi-staff edits addressable, only to make them
     * marginally more convenient. Left as its own follow-up rather than done
     * here, since it would touch every existing call site for no behaviour
     * change on the staff-0 case they all still are.
     */
    transposeNote(id: NoteId, semitones: number): number | null;
    /**
     * Change the clef of measures `from..to` (inclusive, either order) of
     * `staffIndex` to `clef` (M5 Slice 5, the second real edit op after
     * `transposeNote`).
     *
     * The range is made uniform: `from` gets an explicit `clef`, and any
     * explicit clef already set inside `from + 1..to` is cleared, so the whole
     * range reads `clef` through `clefAt`'s walk-back. The clef that was in
     * force at `to + 1` *before* the edit is captured first and, if that
     * measure exists, pinned there explicitly, so the change is scoped to the
     * range rather than leaking forward through the walk-back into every later
     * measure. A range running to the staff's end has no `to + 1` and simply
     * keeps the new clef to the end.
     *
     * Returns the `{ from, to }` measure range (normalized) that was changed,
     * or `null` if nothing did: an unknown staff, an out-of-range index, or a
     * range already entirely in `clef`. The `null` is what lets
     * `EditHistory.record` skip recording a no-op, the same signal
     * `transposeNote` gives. Unlike `transposeNote`, a caller cannot repaint
     * just the returned measures: a clef change moves every notehead in the
     * range and changes widths (a courtesy clef glyph at the change), so the
     * caller should re-run a full `layoutScore`.
     *
     * Mid-measure clef changes (M6 Slice 4) inside the range are cleared too
     * (the range is made uniform), so a range holding one is never a no-op.
     * The restore at `to + 1` reads `clefAt`, which already accounts for a
     * change the range's last measure ended in, so the music after the range
     * keeps the clef it had.
     */
    setClefRange(staffIndex: number, from: number, to: number, clef: ClefType): {
        from: number;
        to: number;
    } | null;
    /**
     * Turn a note into a rest of the same written duration (an editor's
     * "delete": nothing after it shifts). Returns `null` for an unknown id or a rest.
     *
     * On a chord head with other heads beside it this removes that head from
     * the chord instead (`removeChordMember`'s rules): deleting one misread
     * head of a divisi third should leave the other note, not silence the
     * whole chord.
     *
     * What goes with the pitch: any tie into or out of the note (the partner's
     * `tiedToId` too), its articulations (a staccato rest means nothing), and
     * its own passthrough payload (M6 Slice 3's promise: deleting a note drops
     * exactly its own payload, including any unmatched `<tie>`/`<tied>`/
     * `<slur>` ends), and its lyrics (M6 Slice 9: a rest is not sung; the
     * syllables go rather than jump to a neighbouring note, since which note
     * should take them is a judgement no op can make, and undo restores them).
     * On a chord head with siblings the lyrics move to the remaining anchor
     * instead (`removeChordMember`). A fermata stays: a fermata over a rest is
     * ordinary notation, and dropping it would lose a real hold. A slur that
     * starts or ends on the note moves to the nearest pitched event inside the
     * slur (same voice preferred), so a phrase mark survives deleting a stray
     * note at its end; a slur with nothing left inside to land on is dropped.
     * A cross-staff beam loses the note (a rest has no stem), and is dropped
     * when a side is left with fewer than two notes.
     *
     * A grace note (M6 Slice 8) is removed outright instead: a grace rest is
     * not a thing, and since a grace takes no time nothing shifts either way.
     * Its ties, slurs (re-anchored as above) and payload go with it. This is
     * the only op that changes a grace note's existence; no op inserts one.
     */
    noteToRest(id: NoteId): readonly MeasureRef[] | null;
    /**
     * Turn a rest into a note at `pitch`, keeping its duration (the inverse of
     * `noteToRest`, and the fix for an OMR "rest" that was really a note).
     * Returns `null` for an unknown id or a pitched note.
     *
     * A whole-measure rest (`Note.isMeasureRest`) becomes a note lasting the
     * whole measure, which needs a single note value (plus dots) of exactly
     * the measure's length: 4/4 and 2/2 give a whole note, 3/4 and 6/8 a dotted
     * half, 7/8 a double-dotted half. A measure no single note value fills
     * (5/4, 5/8, ...) is refused (`null`): writing tied notes is the user's
     * call, not something to guess. The rest's fermata and articulations stay
     * on the note; its passthrough payload (typically a `<rest>`'s
     * display-step/octave, meaningless on a note) is dropped, as `noteToRest`
     * drops the note's.
     */
    restToNote(id: NoteId, pitch: Pitch): readonly MeasureRef[] | null;
    /**
     * Rewrite a pitched note at `pitch`, keeping its duration, marks and id
     * (an editor's note input over an existing note, and the direct fix for a
     * misread pitch, where `transposeNote` would need the interval worked out
     * first). Returns `null` for an unknown id, a rest (that is `restToNote`'s
     * job), an unchanged pitch, or a chord head moving onto a pitch another
     * head of its chord already has (`addChordMember`'s unison rule).
     *
     * A tie only joins two notes of the same pitch, so any tie into or out of
     * the note is cleared at both ends (as `noteToRest` does), with any stray
     * passthrough `<tie>`/`<tied>` markup on the note itself, so export cannot
     * write half a tie to a partner that no longer matches. Slurs, lyrics,
     * articulations and beams stay. Allowed on a grace note, like
     * `transposeNote`: a grace has a pitch like any other note.
     */
    setPitch(id: NoteId, pitch: Pitch): readonly MeasureRef[] | null;
    /**
     * Change the written value (and dots) of a note's whole event: a single
     * note or rest, or every head of a chord (a chord has one duration).
     * Returns `null` when refused or when the value is unchanged.
     *
     * Measure capacity is never broken and the next measure never shifts:
     *
     *  - Shorter: the freed time is padded with rests right after the event
     *    (`restValuesFor`: undotted values, each aligned to its own length),
     *    so everything later in the voice keeps its onset.
     *  - Longer: the extra time is taken from the rests that directly follow
     *    in the same voice, consuming whole rests and re-spelling any
     *    leftover as rests (OMR often reads one note's worth of time as a
     *    note plus a spurious rest, so this is the friendly answer rather than
     *    a flat refusal). If every following event is a rest and they still do
     *    not cover it, an under-full voice's own slack before the barline may
     *    make up the difference. A pitched note in the way, or a total that
     *    would pass the time signature's capacity, refuses the edit: pushing
     *    the following notes later is a re-barring decision this op will not
     *    make silently. Consumed rests go with their fermatas and payloads.
     *  - Tuplets are refused for now (the event's anchor has a `tuplet`, or a
     *    rest it would consume does): changing one member's value breaks the
     *    run's ratio arithmetic, and an editor for tuplets is its own job.
     *    Since no tupleted note is ever changed, the passthrough `<tuplet>`
     *    brackets Slice 3 keeps for a run stay valid; any stray `<tuplet>` on
     *    a changed (non-tuplet) head is stripped so export cannot write a
     *    bracket for a run that no longer exists.
     *
     * A whole-measure rest is a valid target: it becomes an ordinary rest of
     * `value` plus padding (how a misread measure rest is cut down to a beat).
     * Ties into and out of the event stay (the pitch is unchanged, so they are
     * still valid). A head that becomes longer than an eighth leaves any
     * cross-staff beam (it has no beam to join). Chord members' own
     * `value`/`dots` follow the anchor, since they choose the head glyph.
     *
     * Refused on a grace note (M6 Slice 8): it takes no measure time, so
     * there is no capacity to keep and no event to resize; its written value
     * only picks a flag, and changing that is not a correction this op makes.
     * Consuming a rest that has grace notes before it leaves them in place,
     * where they attach to the voice's next event (`graceRuns`).
     */
    setDuration(id: NoteId, value: NoteValue, dots?: 0 | 1 | 2): readonly MeasureRef[] | null;
    /**
     * Add a head at `pitch` to the event `id` belongs to: a chord member
     * (`chordWithPrevious`) with the anchor's value, dots, tuplet and voice,
     * placed after the event's last head so `noteEvents` joins it there.
     * Returns `null` for an unknown id, a rest (a rest has no stem to share),
     * or a pitch the event already has (a unison head is not a correction
     * anyone needs, and layout draws one over the other). Use `findNote` on
     * the event afterwards to reach the new head; its id is fresh. Refused on
     * a grace note (M6 Slice 8): grace chords are not modelled.
     */
    addChordMember(id: NoteId, pitch: Pitch): readonly MeasureRef[] | null;
    /**
     * Remove one head from a chord. Returns `null` for an unknown id, a rest,
     * or a note that is its event's only head (that is `noteToRest`'s job:
     * removing the last head would leave no event at all and shift the
     * voice).
     *
     * Removing the anchor (the first head, the one without
     * `chordWithPrevious`) promotes the next head to anchor, in the removed
     * anchor's place in `measure.notes`. Without that, the remaining heads
     * would be left as members joined to nothing (an earlier prototype hit
     * exactly that). The promoted
     * head keeps its id, pitch, ties and payload, and takes the chord's
     * value/dots/tuplet and any passthrough `<tuplet>` bracket the old anchor
     * carried (export writes a run's brackets on its anchors). The removed
     * head's articulations and fermata move to the remaining anchor (they
     * belong to the chord, whichever head they were written on), and so do its
     * lyrics (M6 Slice 9; a verse the anchor already sings keeps the anchor's
     * syllable, see `mergeLyrics`), its ties are
     * cleared at both ends, its own payload is dropped, and a slur or
     * cross-staff beam anchored on it moves to the remaining anchor.
     */
    removeChordMember(id: NoteId): readonly MeasureRef[] | null;
    /**
     * Tie `sourceId` to `targetId`, or untie it (`targetId: null`), as an
     * undoable correction (so a tie lost at a page join can be re-added).
     * Stricter than the low-level `setTie`, which import and `buildScore` use
     * to wire ties they already resolved: the target must be a head of the
     * *next event in the source's voice* (later in the same measure, or the
     * voice's first event in the next measure of the staff) with the same
     * pitch, and no other note may already tie into it. `tieTargetFor` finds
     * that head. Returns `null` when refused or when nothing changes.
     *
     * Passthrough tie markup is kept consistent with the model: the model's
     * tie is what export writes, so a stray unmatched `<tie>`/`<tied>` start
     * on the source and stop on the target (OMR's half of a tie whose partner
     * was on the other page) are stripped when linking, or export would write
     * each end twice. Untying strips the source's stray start too, so "untie"
     * also removes a dangling OMR tie start the model never linked (and is
     * not a no-op when that is all there is).
     *
     * Refused on a grace note (M6 Slice 8): a grace is not an event, so it has
     * no "next event" to tie into, and no event's next is a grace either.
     */
    editTie(sourceId: NoteId, targetId: NoteId | null): readonly MeasureRef[] | null;
    /**
     * The head `editTie(sourceId, ...)` would accept as a target: the head of
     * the same pitch in the next event of the source's voice (see `editTie`),
     * or `null` if there is none (a rest, a different pitch, no next event).
     */
    tieTargetFor(sourceId: NoteId): NoteId | null;
    /**
     * A deep, **id-preserving** copy of this score.
     *
     * "Id-preserving": every cloned `Note` keeps its exact `id`, and the private
     * `#nextNoteId` counter is carried over verbatim, so the clone keeps minting
     * fresh, non-colliding ids from where the source left off. This is what lets
     * `EditHistory` compare a before/after snapshot note-for-note (via
     * `assertScoresEquivalent`, which still ignores id *values*) and lets a
     * restored snapshot be addressed by the same ids a caller already holds.
     *
     * "Deep": no mutable node is shared with the source. Every `Staff`,
     * `Measure`, `Note`, `Pitch`, `TupletRatio`, `Part`, `Slur` and
     * `CrossStaffBeam` is a fresh object, and every array is fresh, so mutating
     * anything in the clone (a note's pitch, a measure's barline, a staff's
     * clef, a part's staff list, a `tiedToId`) cannot reach back into the
     * source, or vice versa. Passthrough payloads (M6 Slice 3) are the one
     * thing shared, and only because they are immutable: an edit replaces a
     * payload list, it never mutates one.
     *
     * The three private indexes (`#measureOfNote`, `#tieSourceOfTarget`,
     * `#crossStaffBeamOfNote`) are rebuilt against the freshly created objects
     * rather than copied, since they hold references into the node graph. Ties
     * are reproduced by assigning `Note.tiedToId` directly and rebuilding
     * `#tieSourceOfTarget` from those values: routing through `setTie` would
     * re-run `#linkTie`'s pitch-equality validation, which can spuriously reject
     * a tie chain while it is only half-rebuilt.
     */
    clone(): Score;
}
/** One measure written as `[pitchName | null, value, extra?]` triples; `null` is
 *  a rest. `extra` carries dots, a tuplet ratio, a tie and/or a voice for the
 *  notes that need them, so a plain literal can stay a 2-tuple. `tiedToNext:
 *  true` marks this note as tied into the *next* note in the same voice,
 *  wherever it ends up (the same measure, or a later one across a barline);
 *  see `buildScore` for how that gets resolved to an actual note id.
 *  `voice` (1-based, matching MusicXML and `Note.voice`'s own default of 1)
 *  is omitted for every ordinary single-voice literal; a two-voice measure
 *  (M2 Slice 1) sets it explicitly on the notes that share the measure with
 *  another voice's notes, in whatever order the literal happens to write
 *  them in (layout groups by voice itself; a compact literal never needs to
 *  interleave two voices' notes token-for-token to read naturally).
 *
 *  A chord (M6 Slice 2) is written as an array of pitch names in the pitch
 *  slot, e.g. `[['C4', 'E4', 'G4'], 'quarter']`: it becomes one `Note` per
 *  name, the first the anchor and the rest `chordWithPrevious` members, all
 *  sharing `value` and `extra`. `tiedToNext` on a chord ties *each* head to
 *  the head of the same pitch in the voice's next event (see `buildScore`).
 *  Every head is its own entry in `measure.notes`, so a `SlurSpec`'s note
 *  index counts heads, not events. */
export type MeasureSpec = readonly (readonly [
    pitch: string | readonly string[] | null,
    value: NoteValue,
    extra?: {
        dots?: 0 | 1 | 2;
        tuplet?: TupletRatio;
        tiedToNext?: boolean;
        voice?: number;
        /** M6 Slice 5; on a chord, set on the anchor only (see `NoteSpec.articulations`). */
        articulations?: readonly Articulation[];
        /** M6 Slice 5; on a chord, set on the anchor only. */
        fermata?: Fermata;
        /** M8 Slice 5; on a chord, set on the anchor only. */
        arpeggiate?: boolean;
        /** M8 Slice 5: the source beam mark (see `BeamMark`); anchor only. */
        beam?: BeamMark;
        /** M6 Slice 8: a grace note before the voice's next event (see
         *  `NoteSpec.grace`), e.g. `['D5', 'eighth', { grace: ACCIACCATURA }]`. */
        grace?: GraceNote;
        /** M6 Slice 9; on a chord, set on the anchor only. */
        lyrics?: readonly LyricSpec[];
    }
])[];
/**
 * A measure literal that also changes the key and/or time signature starting
 * at this measure, for `buildScore`'s `measures` array wherever a plain
 * `MeasureSpec` (a bare array) needs a key or time change alongside it.
 *
 * A separate wrapper object rather than a third element tacked onto
 * `MeasureSpec` itself: a key or time change is a property of the *measure*,
 * not of any one note in it, so bolting it onto the per-note tuple the way
 * `tiedToNext` fits a single note would not have a sensible home there.
 * `buildScore` tells the two apart with `isMeasureBuildSpec`, since a bare
 * `MeasureSpec` is always an array and this is always a plain object.
 */
export interface MeasureBuildSpec {
    readonly notes: MeasureSpec;
    /** See `Measure.keyFifths`. Omit to keep whatever key was in force before this measure. */
    readonly keyFifths?: number;
    /** See `Measure.time`. Omit to keep whatever time signature was in force before this measure. */
    readonly time?: TimeSignature;
    /** See `Measure.clef` (M5 Slice 5). Omit to keep whatever clef was in force before this measure. */
    readonly clef?: ClefType;
    /** See `Measure.clefChanges` (M6 Slice 4): clef changes inside the measure, by onset in wholes. */
    readonly clefChanges?: readonly ClefChange[];
    /** See `Measure.endBarline`. Omit for the default (`'normal'`, or `'final'` at the score's last measure). */
    readonly endBarline?: BarlineType;
    /** See `Measure.startBarline`. Omit for no repeat-start mark at this measure's own start. */
    readonly startBarline?: 'repeatStart';
    /** See `Measure.dynamics` (M6 Slice 6): dynamic marks by onset in wholes (default 0). */
    readonly dynamics?: readonly {
        readonly kind: DynamicKind;
        readonly onset?: number;
        readonly placement?: Placement;
    }[];
}
/**
 * One slur, addressed by the position of its two end notes rather than by an
 * id (a slur literal is built before any note has one). Each position is
 * `[measureIndex, noteIndex]`, both 0-based into the `measures` array passed
 * to `buildScore` alongside this spec.
 *
 * A per-note `extra` flag (the way `tiedToNext` works) does not fit a slur the
 * way it fits a tie: a tie only ever names its *own* next note, but a slur's
 * other end can be arbitrarily far away and is not naturally a property of
 * either endpoint alone. Addressing by position keeps `MeasureSpec`'s compact
 * per-note literal untouched, and reads almost as directly as an id would
 * once the measures above it are visible to count from.
 */
export interface SlurSpec {
    readonly start: readonly [measureIndex: number, noteIndex: number];
    readonly end: readonly [measureIndex: number, noteIndex: number];
}
/**
 * One hairpin (M6 Slice 6) for `buildScore`: `start`/`stop` are `[measureIndex,
 * onsetWholes]` into the `measures` array, the shape `Score.addWedge` takes.
 */
export interface WedgeSpec {
    readonly kind: WedgeKind;
    readonly start: readonly [measureIndex: number, onset: number];
    readonly stop: readonly [measureIndex: number, onset: number];
    readonly placement?: Placement;
}
/**
 * Build a score from a compact literal, so demo scores and test fixtures read
 * like music rather than like constructor calls. Phase 0 has no importer, so
 * every score in this repo is written by hand and this is how. Phase 5's
 * MusicXML import replaces it as the real entry point, not this.
 */
export declare function buildScore(measures: readonly (MeasureSpec | MeasureBuildSpec)[], options?: ScoreOptions, slurs?: readonly SlurSpec[], wedges?: readonly WedgeSpec[]): Score;
