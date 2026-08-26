import Foundation

/// One of the four SATB voice parts a track can be mapped to.
///
/// Ordered high→low so `allCases` (and `<`, via `CaseIterable`'s index) can
/// drive the mean-pitch fallback ranking in `MIDIParser` directly.
enum VoicePart: String, CaseIterable {
    case soprano, alto, tenor, bass
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

/// The result of parsing one MIDI file: every note and lyric event across
/// all tracks that were successfully mapped to a voice part. Tracks that
/// couldn't be mapped (accompaniment, unnamed extras) are silently dropped —
/// see `MIDIParser`'s voice-part mapping heuristic.
struct ParsedMIDI {
    let notes: [MIDINote]
    let lyrics: [MIDILyricEvent]

    static let empty = ParsedMIDI(notes: [], lyrics: [])
}
