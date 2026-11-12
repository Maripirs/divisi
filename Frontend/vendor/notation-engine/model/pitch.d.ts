/** Diatonic letter name. */
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export interface Pitch {
    readonly step: Step;
    /** Chromatic alteration in semitones: -1 flat, 0 natural, +1 sharp. */
    readonly alter: number;
    /** Scientific pitch notation octave, so middle C is C4. */
    readonly octave: number;
}
/**
 * The staff position of a pitch, counted in diatonic steps from C0. Notehead
 * placement depends only on this: two notes that differ by an accidental sit
 * on the same line or space. Layout turns it into a y coordinate; nothing else
 * needs to know how it is derived.
 */
export declare function diatonicIndex(pitch: Pitch): number;
/** MIDI note number, where middle C (C4) is 60. */
export declare function toMidi(pitch: Pitch): number;
/** Spell a MIDI number as a pitch, choosing sharps or flats explicitly. */
export declare function fromMidi(midi: number, prefer?: 'sharp' | 'flat'): Pitch;
/**
 * Transpose by whole semitones.
 *
 * Spelling rule: ascending picks sharps, descending picks flats, which is what
 * a musician does by default when nudging a note chromatically and is enough
 * for the one edit op Phase 0 has. It is *not* key-aware. In A-flat major a
 * D-flat nudged up becomes a D-natural here, where an engraver would want
 * D-natural too, but in B major an A-sharp nudged up becomes a B-natural where
 * the correct answer is also B: the rule happens to be right often and wrong
 * quietly. Key-aware respelling belongs with the rest of accidental handling in
 * Phase 1, not bolted onto a spike's single edit op.
 */
export declare function transpose(pitch: Pitch, semitones: number): Pitch;
/**
 * Parse scientific pitch notation: `C4`, `F#5`, `Bb3`. Exists so demo scores
 * and tests read like music instead of like object literals. Not part of any
 * file format, and not a substitute for the MusicXML parser Phase 5 needs.
 */
export declare function parsePitch(text: string): Pitch;
/** Whether two pitches are the same step, alteration and octave: the same
 *  sounding, identically spelled note. A tie only ever connects two notes for
 *  which this is true; layout's stem/notehead placement never needs it, since
 *  everything else keys off `diatonicIndex` or `toMidi` instead. */
export declare function pitchesEqual(a: Pitch, b: Pitch): boolean;
/** Render a pitch back to scientific pitch notation. Mostly for test failures. */
export declare function formatPitch(pitch: Pitch): string;
/**
 * The alteration a key signature imposes on a given letter name.
 *
 * `fifths` is MusicXML's encoding: positive counts sharps, negative counts
 * flats, and both follow the circle of fifths, so 2 means F-sharp and C-sharp.
 * Layout uses this to decide whether a note's accidental is already implied by
 * the key signature and can be left undrawn.
 */
export declare function keyAlterForStep(fifths: number, step: Step): number;
