import type { OpaqueElement } from './passthrough.js';
/** Where a syllable sits in its word (MusicXML `<syllabic>`): a whole word,
 *  or the first, a middle or the last syllable of a hyphenated one. */
export type Syllabic = 'single' | 'begin' | 'middle' | 'end';
/**
 * An extender (MusicXML `<extend>`): the line after a word's last syllable
 * held through a melisma. `'start'` (on the sung syllable), `'continue'` and
 * `'stop'` are MusicXML's `type`s; `'untyped'` is a bare `<extend/>`, which
 * encoders write on the sung syllable to mean "start". Layout only needs to
 * know that a syllable starts one and, optionally, which note a `'stop'`
 * names as the end (see `Lyric`).
 */
export type LyricExtend = 'start' | 'stop' | 'continue' | 'untyped';
/** One syllable of an elision (see `Lyric.elisions`). */
export interface ElidedSyllable {
    readonly syllabic: Syllabic;
    readonly text: string;
}
/**
 * One verse's syllable on one note. Immutable, so a clone may share it.
 *
 * `text` is `''` for an extend-only lyric (`<lyric><extend type="stop"/>`,
 * which some encoders write on the melisma's later notes): it draws nothing
 * itself but marks where its verse's extender ends.
 */
export interface Lyric {
    /** The verse line (MusicXML `number`), verbatim: `'1'` when unstated.
     *  Ordered by `compareVerses`; verse 1's line sits nearest the staff. */
    readonly verse: string;
    /** `'single'` when unstated, MusicXML's own default. */
    readonly syllabic: Syllabic;
    readonly text: string;
    /**
     * Further syllables sung on the same note after `text` (MusicXML
     * `<elision>`, e.g. "sing_a" in one beat), each with its own syllabic.
     * Drawn joined by an undertie. Empty for the usual single syllable.
     */
    readonly elisions: readonly ElidedSyllable[];
    readonly extend: LyricExtend | null;
    /** The `<lyric>` this was read from (see the file comment), or `null` for
     *  a lyric built in code, which export writes from the fields alone. */
    readonly source: OpaqueElement | null;
}
/** The empty `Note.lyrics`, shared (and frozen) so the common case costs no
 *  allocation per note. */
export declare const NO_LYRICS: readonly Lyric[];
/** What `Note`/`buildScore` accept for a lyric: everything but `text`
 *  optional (verse `'1'`, `'single'`, no elision, extender or source). */
export interface LyricSpec {
    readonly verse?: string;
    readonly syllabic?: Syllabic;
    readonly text: string;
    readonly elisions?: readonly ElidedSyllable[];
    readonly extend?: LyricExtend | null;
    readonly source?: OpaqueElement | null;
}
/** A frozen `Lyric` from a spec, defaults filled in. */
export declare function makeLyric(spec: LyricSpec): Lyric;
/** `specs` as a note's frozen lyric list (the shared empty one when none). A
 *  list this module already froze (a clone sharing a note's `lyrics`) is
 *  returned as-is: it and every lyric in it are immutable. */
export declare function normalizeLyrics(specs: readonly (Lyric | LyricSpec)[] | undefined): readonly Lyric[];
/**
 * Verse order: numeric verses by value (so `'10'` follows `'9'`), before any
 * non-numeric name (MusicXML's `number` is a token, and some encoders write
 * `'verse1'` or `'chorus'`), which sort by string.
 */
export declare function compareVerses(a: string, b: string): number;
/** The text a lyric draws: its syllable, then each elided one, joined by an
 *  undertie (U+203F), the usual typeset elision mark. */
export declare function lyricDisplayText(lyric: Lyric): string;
/** Whether the word continues after this lyric's (last) syllable, i.e. a
 *  hyphen follows it. */
export declare function lyricContinuesWord(lyric: Lyric): boolean;
/** Whether this lyric sings a syllable that starts an extender line. */
export declare function lyricStartsExtender(lyric: Lyric): boolean;
/**
 * The lyrics of one event (a note, or every head of a chord as `noteEvents`
 * groups them): one per verse, the first head's in event order winning when
 * two heads carry the same verse, sorted by verse. What layout draws.
 */
export declare function eventLyrics(event: readonly {
    readonly lyrics: readonly Lyric[];
}[]): readonly Lyric[];
/**
 * `into` plus each lyric of `from` whose verse `into` lacks, for a correction
 * op that folds one chord head into another (`removeChordMember`): a verse
 * both carry keeps `into`'s syllable, the one that was drawn.
 */
export declare function mergeLyrics(into: readonly Lyric[], from: readonly Lyric[]): readonly Lyric[];
