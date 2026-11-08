/** The minimal slice of an OSMD `Note` (`GraphicalNote.sourceNote`) that
 * pitch derivation needs. Structural rather than OSMD's own class type so
 * this stays importable (and testable) without loading OSMD, whose module
 * is only ever dynamically imported in the browser. */
export interface OsmdPitchedNote {
	isRest(): boolean;
	halfTone: number;
}

/** OSMD's `Note.halfTone` -> standard MIDI note number, or `null` for a rest.
 *
 * OSMD stores octaves shifted down by `Pitch.OctaveXmlDifference` (3) from
 * MusicXML's own `<octave>`, then computes `halfTone = fundamentalNote +
 * 12 * (octave + 3) + accidental`, i.e. `fundamentalNote + 12 *
 * xmlOctave + accidental`. MIDI numbers middle C (MusicXML C4) as 60, i.e.
 * `12 * (xmlOctave + 1) + pitchClass`, so the two differ by exactly 12.
 * OSMD's own `Pitch.calcFrequency(halfTone)` agrees: it treats halfTone 57
 * as A440, which is MIDI 69.
 *
 * `halfTone` already reflects any `osmd.Sheet.Transpose` (OSMD overwrites
 * it with the transposed pitch at render time), so this is always the
 * pitch as displayed. Divisi doesn't transpose the engraved score at all
 * today, so that's moot in practice, but it keeps a future transpose
 * control from silently sounding the untransposed note. */
export function midiPitchForOsmdNote(note: OsmdPitchedNote): number | null {
	if (note.isRest()) return null;
	const midi = note.halfTone + 12;
	// Defensive: a malformed/unpitched note shouldn't send an out-of-range
	// key to the synth.
	if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;
	return midi;
}
