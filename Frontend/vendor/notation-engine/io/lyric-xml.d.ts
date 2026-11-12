import { type Lyric, type OpaqueElement } from '../model/index.js';
/** One `<lyric>` as a `Lyric` (see the importer's `readLyrics` for the forms
 *  promoted), or `null` when its content is not a form the model holds. */
export declare function readLyric(el: OpaqueElement): Lyric | null;
/**
 * The `<lyric>` export writes for `lyric`: its `source` verbatim when that
 * still reads as the lyric (always, until an op edits lyrics), else one
 * regenerated from the fields, keeping the source's attributes (with
 * `number` restated) and trailing children (`<end-line>`, ...) so an edited
 * syllable keeps its placement and formatting.
 */
export declare function lyricElement(lyric: Lyric): OpaqueElement;
