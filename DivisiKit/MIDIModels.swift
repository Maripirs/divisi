import Foundation

/// One of the four SATB voice parts a track can be mapped to.
///
/// Ordered high→low so `allCases` (and `<`, via `CaseIterable`'s index) can
/// drive the mean-pitch fallback ranking in `MIDIParser` directly.
enum VoicePart: String, CaseIterable {
    case soprano, alto, tenor, bass
}

/// How the score view presents the four voice parts relative to whichever
/// one is currently chosen (M4). Independent of what audio plays — playback
/// always plays the full mix regardless of display mode; only what's drawn
/// on screen changes.
enum DisplayMode: String, CaseIterable {
    /// Full SATB score, no part visually emphasized.
    case flat
    /// Full SATB score, with the chosen voice part's noteheads tinted.
    case highlighted
    /// Only the chosen voice part's staff.
    case solo
}

/// A single sung note, already resolved to a voice part and to milliseconds
/// (tempo-map applied — see `MIDIParser`).
struct MIDINote {
    let pitch: UInt8 // MIDI note number, 0-127
    let startMs: Int
    let durationMs: Int
    let voicePart: VoicePart
}

/// A lyric syllable/word, timestamped to when its note starts.
struct MIDILyricEvent {
    let text: String
    let timeMs: Int
    let voicePart: VoicePart
}

/// A MIDI time-signature meta-event's payload: `numerator` beats of
/// `denominator` note value per measure (e.g. 4/4, 6/8).
struct MIDITimeSignature: Equatable {
    let numerator: Int
    let denominator: Int

    /// Common-practice default when a file has no time-signature meta-event
    /// (rare, but not worth failing over) — 4/4 is the overwhelmingly
    /// likely case for the choral repertoire this app targets.
    static let defaultSignature = MIDITimeSignature(numerator: 4, denominator: 4)
}

/// The result of parsing one MIDI file: every note and lyric event across
/// all tracks that were successfully mapped to a voice part. Tracks that
/// couldn't be mapped (accompaniment, unnamed extras) are silently dropped —
/// see `MIDIParser`'s voice-part mapping heuristic.
///
/// `tempoBPM`/`timeSignature`/`keySignatureFifths` are the file's *initial*
/// values only — mid-file tempo/meter/key changes aren't tracked. That's
/// consistent with the M4 rhythm quantizer's fixed-grid-snap approach: both
/// assume a single steady grid for the whole piece, which covers the choral
/// MVP repertoire this app targets but not pieces with meter/tempo changes.
struct ParsedMIDI {
    let notes: [MIDINote]
    let lyrics: [MIDILyricEvent]
    let tempoBPM: Double
    let timeSignature: MIDITimeSignature
    /// Signed count of sharps (positive) or flats (negative) in the initial
    /// key signature, straight from the MIDI key-signature meta-event's
    /// `sf` byte. 0 (C major/A minor) when absent.
    let keySignatureFifths: Int
    /// Regular MIDI track index -> SATB voice part, using the same mapping
    /// that produced `notes`/`lyrics`. Playback uses this to route each
    /// track to a per-part mixer channel for the M4 balance slider.
    let trackVoiceParts: [Int: VoicePart]

    static let empty = ParsedMIDI(notes: [], lyrics: [], tempoBPM: 120, timeSignature: .defaultSignature, keySignatureFifths: 0, trackVoiceParts: [:])
}
