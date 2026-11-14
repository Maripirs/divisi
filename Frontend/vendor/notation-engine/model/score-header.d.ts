import type { Score } from './score.js';
/** What a score's title block says. A field is absent when the score has no
 *  such text. */
export interface ScoreHeader {
    readonly title?: string;
    readonly subtitle?: string;
    readonly composer?: string;
    readonly lyricist?: string;
}
/**
 * The score's title block, derived from its MusicXML header:
 *
 * - `title`: `<work><work-title>`, else `<movement-title>`.
 * - `subtitle`: `<movement-title>` when a work title is the title.
 * - `composer`: `<identification><creator type="composer">`.
 * - `lyricist`: a `<creator>` of type `lyricist` or `poet`.
 *
 * A field the elements above do not give falls back to a `<credit>` whose
 * `<credit-type>` names it (`title`, `subtitle`, `composer`, `lyricist`),
 * which is where many editors put the printed page's text. Whitespace runs
 * are collapsed and empty text counts as absent.
 */
export declare function scoreHeader(score: Score): ScoreHeader;
/**
 * Set title block fields by editing the score's MusicXML header, so they are
 * drawn by layout and written by export. Only the fields present in `fields`
 * change; an empty string removes one. `title` is the `<work-title>`,
 * `subtitle` the `<movement-title>`, `composer` and `lyricist` are
 * `<creator>`s in `<identification>`. A `<credit>` of a changed field's type
 * is dropped, so the printed text and the metadata cannot disagree.
 */
export declare function setScoreHeader(score: Score, fields: ScoreHeader): void;
