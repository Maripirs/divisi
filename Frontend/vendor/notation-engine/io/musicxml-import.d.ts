import { Score } from '../model/index.js';
/**
 * What an import kept without modelling and what it lost, for a caller that
 * wants to know (a corpus regression test, a "this file had N things the
 * editor cannot show" banner).
 *
 * `passthrough` maps an element name to how many times it was kept as an
 * opaque passthrough payload (M6 Slice 3): shown by nothing, but written back
 * on export. The unit is "the topmost element kept", except that a
 * `<direction>` is tallied by its `<direction-type>` children (`dynamics`,
 * `wedge`, `words`, ...) plus its `<sound>`, a `<notations>` by its children
 * (`articulations`, `fermata`, ...), an `<attributes>` with nothing modelled
 * in it by its children (`staff-details`, ...), and a grace `<note>` once,
 * as `grace`: those are the units later slices promote, so each promotion
 * shows up as one name leaving this tally. A `<direction>`'s placement
 * metadata (`<offset>`, `<staff>`, `<voice>`) is not tallied; it belongs to
 * whatever it places.
 *
 * `dropped` counts what is genuinely lost, by the same unit. Since Slice 3
 * that is only: a `<chord/>` note with no pitched note to join (`chord`), the
 * `<unpitched>` of a percussion note (kept as a rest), sub-elements of the
 * modelled `<key>`/`<time>`/`<clef>` the model has no field for (`mode`,
 * `cancel`, `interchangeable`, ...), a `<clef>` overridden by a later one for
 * the same staff at the same onset (`clef`: never in force), and a
 * `<part-group>` spanning fewer than two staves (the model records a group as
 * a multi-staff `Part`).
 *
 * Neither tally counts what the engine regenerates from the model rather than
 * reads (`<stem>`, `<beam>`, `<accidental>`, `<backup>`; see `NOTE_OWNED`), or
 * a restatement the model normalizes away (a second `<divisions>`, several
 * `<attributes>` in one measure merged into one); the corpus round-trip test
 * lists those normalizations.
 *
 * `fallbacks` lists, in document order, every place the importer kept
 * something but had to guess (an unmappable duration read as a quarter, an
 * unrecognized clef read as treble), with where it happened.
 */
export interface ImportDiagnostics {
    readonly dropped: Map<string, number>;
    readonly passthrough: Map<string, number>;
    readonly fallbacks: ImportFallback[];
}
export interface ImportFallback {
    readonly kind: 'note-value' | 'clef';
    /** The `<part id>` and the `<measure number>` attribute, verbatim, so a
     *  report points at the source file rather than at model indices. */
    readonly partId: string;
    readonly measureNumber: string;
    readonly detail: string;
}
export interface ImportOptions {
    /** Collect drops and fallbacks here instead of `console.warn`ing them. */
    readonly diagnostics?: ImportDiagnostics;
}
/** An empty `ImportDiagnostics`, ready to pass to `importMusicXml`. */
export declare function createImportDiagnostics(): ImportDiagnostics;
/**
 * Parse a MusicXML `score-partwise` document into a `Score`.
 *
 * Throws if `xml` is not well-formed, or if its root element is not
 * `<score-partwise>` (a `<score-timewise>` document has to be converted to
 * partwise first; nothing here does that conversion).
 */
export declare function importMusicXml(xml: string, options?: ImportOptions): Score;
