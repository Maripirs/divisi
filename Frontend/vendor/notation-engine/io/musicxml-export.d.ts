import { type Score } from '../model/index.js';
/**
 * Serialize `score` as a MusicXML 4.0 `score-partwise` document.
 *
 * Covers everything the model can currently represent: the emitted parts and
 * their staves, per-staff clefs, initial and mid-score key/time signatures,
 * `tempoBpm` as a metronome direction, notes and rests with
 * `<type>`/`<dot>`/`<time-modification>`, computed `<beam>` and `<stem>`,
 * `<tie>`/`<tied>` and `<slur>` spans, `<staff>` numbers for multi-staff
 * parts, and all five barline shapes. `<divisions>` is one value per part, the
 * LCM of every note's exact duration denominator in that part, so every
 * `<duration>` comes out a whole number.
 *
 * Plus, since M6 Slice 3, every passthrough payload an import kept (see
 * `src/model/passthrough.ts`), written back verbatim at its anchor and in its
 * schema position: the score header before `<part-list>`, a part's or
 * group's extras inside its `<score-part>`/`<part-group>`, a measure's
 * positional elements at their onset in their voice stream, attribute and
 * barline extras merged into the `<attributes>`/`<barline>` written here, and
 * a note's extras slotted between the children written here.
 */
export declare function exportMusicXml(score: Score): string;
