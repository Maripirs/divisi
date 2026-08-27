import AudioToolbox
import Foundation

enum MIDIParserError: Error {
    case sequenceCreationFailed(OSStatus)
    case fileLoadFailed(OSStatus)
    case trackEnumerationFailed(OSStatus)
}

/// Parses a Standard MIDI File into notes + lyric events, resolved to a
/// voice part.
///
/// Uses AudioToolbox's `MusicSequence`/`MusicEventIterator` C API rather
/// than the newer `AVAudioSequencer`/`AVMusicTrack.enumerateEvents`: the
/// modern `AVMIDIMetaEvent` only exposes `.type`, not the event's raw
/// bytes, so there's no supported way to read lyric or track-name text back
/// through it. `MusicEventIterator` exposes the full `MIDIMetaEvent` struct
/// (type + raw data), which is what that extraction actually needs. Both
/// APIs sit on the same underlying engine — this is still AVFoundation's
/// own MIDI parsing, one layer down.
final class MIDIParser {

    private static let metaEventTypeTrackName: UInt8 = 0x03
    private static let metaEventTypeLyric: UInt8 = 0x05
    private static let metaEventTypeTimeSignature: UInt8 = 0x58
    private static let metaEventTypeKeySignature: UInt8 = 0x59

    private struct RawTrack {
        let name: String?
        let notes: [(beat: MusicTimeStamp, durationBeats: Double, pitch: UInt8)]
        let lyrics: [(beat: MusicTimeStamp, text: String)]
        let keySignatureFifths: Int?
    }

    func parse(fileURL: URL) throws -> ParsedMIDI {
        var sequence: MusicSequence?
        var status = NewMusicSequence(&sequence)
        guard status == noErr, let sequence else {
            throw MIDIParserError.sequenceCreationFailed(status)
        }
        defer { DisposeMusicSequence(sequence) }

        // Real-world choir exports show up as either SMF format 1 (one
        // track per voice — what our fixtures use, and the common case for
        // a DAW/notation-software export) or format 0 (everything flattened
        // into a single track, voices distinguished only by MIDI channel).
        // Loading a format-1 file with `.smf_ChannelsToTracks` would merge
        // same-channel tracks together and destroy the voice split; loading
        // a format-0 file with `.smf_PreserveTracks` leaves every voice
        // stuck in one track. Pick the flag the file's own header asks for.
        let loadFlags: MusicSequenceLoadFlags = Self.isFormatZero(fileURL) ? .smf_ChannelsToTracks : .smf_PreserveTracks
        status = MusicSequenceFileLoad(sequence, fileURL as CFURL, .midiType, loadFlags)
        guard status == noErr else {
            throw MIDIParserError.fileLoadFailed(status)
        }

        var trackCount: UInt32 = 0
        status = MusicSequenceGetTrackCount(sequence, &trackCount)
        guard status == noErr else {
            throw MIDIParserError.trackEnumerationFailed(status)
        }

        var rawTracks: [RawTrack] = []
        for i in 0..<trackCount {
            var track: MusicTrack?
            guard MusicSequenceGetIndTrack(sequence, i, &track) == noErr, let track else { continue }
            rawTracks.append(readTrack(track))
        }

        let assignments = Self.assignVoiceParts(rawTracks.map { (name: $0.name, pitches: $0.notes.map { Double($0.pitch) }) })

        var notes: [MIDINote] = []
        var lyrics: [MIDILyricEvent] = []
        for (index, raw) in rawTracks.enumerated() {
            guard let voicePart = assignments[index] else { continue }
            for note in raw.notes {
                let startMs = secondsToMs(secondsForBeats(sequence, note.beat))
                // Recompute the end from the tempo map too, rather than
                // assuming a constant tempo across the note's duration — a
                // tempo change mid-note would otherwise skew durationMs.
                let endMs = secondsToMs(secondsForBeats(sequence, note.beat + note.durationBeats))
                notes.append(MIDINote(pitch: note.pitch, startMs: startMs, durationMs: max(0, endMs - startMs), voicePart: voicePart))
            }
            for lyric in raw.lyrics {
                lyrics.append(MIDILyricEvent(text: lyric.text, timeMs: secondsToMs(secondsForBeats(sequence, lyric.beat)), voicePart: voicePart))
            }
        }

        notes.sort { $0.startMs < $1.startMs }
        lyrics.sort { $0.timeMs < $1.timeMs }

        // Key signature: first occurrence wins, in track order — mid-file
        // changes aren't tracked, see `ParsedMIDI`'s doc comment.
        let keySignatureFifths = rawTracks.compactMap(\.keySignatureFifths).first ?? 0
        let (tempoBPM, timeSignature) = Self.readTempoTrack(sequence)

        return ParsedMIDI(
            notes: notes,
            lyrics: lyrics,
            tempoBPM: tempoBPM,
            timeSignature: timeSignature,
            keySignatureFifths: keySignatureFifths,
            trackVoiceParts: assignments
        )
    }

    /// Tempo (0x51) and time-signature (0x58) meta-events don't come back
    /// through a regular track's `MusicEventIterator`, even when the source
    /// SMF interleaved them into a voice track rather than a dedicated
    /// conductor track (real-world files do this) — `MusicSequenceFileLoad`
    /// pulls both into its own dedicated tempo track instead. Verified
    /// against a real notation-software export where both meta types were
    /// silently missing from every regular track but present here.
    private static func readTempoTrack(_ sequence: MusicSequence) -> (bpm: Double, timeSignature: MIDITimeSignature) {
        var tempoTrack: MusicTrack?
        guard MusicSequenceGetTempoTrack(sequence, &tempoTrack) == noErr, let tempoTrack else {
            return (120, .defaultSignature)
        }
        var iterator: MusicEventIterator?
        guard NewMusicEventIterator(tempoTrack, &iterator) == noErr, let iterator else {
            return (120, .defaultSignature)
        }
        defer { DisposeMusicEventIterator(iterator) }

        var bpm: Double?
        var timeSignature: MIDITimeSignature?
        var hasEvent: DarwinBoolean = false
        MusicEventIteratorHasCurrentEvent(iterator, &hasEvent)
        while hasEvent.boolValue, bpm == nil || timeSignature == nil {
            var timeStamp: MusicTimeStamp = 0
            var eventType: MusicEventType = 0
            var eventData: UnsafeRawPointer?
            var eventDataSize: UInt32 = 0
            let status = MusicEventIteratorGetEventInfo(iterator, &timeStamp, &eventType, &eventData, &eventDataSize)
            if status == noErr, let eventData {
                if eventType == kMusicEventType_ExtendedTempo, bpm == nil {
                    let tempo = eventData.assumingMemoryBound(to: ExtendedTempoEvent.self).pointee
                    if tempo.bpm > 0 { bpm = tempo.bpm }
                } else if eventType == kMusicEventType_Meta, timeSignature == nil {
                    let meta = eventData.assumingMemoryBound(to: MIDIMetaEvent.self).pointee
                    if meta.metaEventType == Self.metaEventTypeTimeSignature, meta.dataLength >= 2 {
                        let dataOffset = MemoryLayout<MIDIMetaEvent>.offset(of: \.data)!
                        let bytes = [UInt8](UnsafeRawBufferPointer(start: UnsafeRawPointer(eventData).advanced(by: dataOffset), count: Int(meta.dataLength)))
                        timeSignature = MIDITimeSignature(numerator: Int(bytes[0]), denominator: 1 << Int(bytes[1]))
                    }
                }
            }
            MusicEventIteratorNextEvent(iterator)
            MusicEventIteratorHasCurrentEvent(iterator, &hasEvent)
        }
        return (bpm ?? 120, timeSignature ?? .defaultSignature)
    }

    // MARK: - Track reading

    private func readTrack(_ track: MusicTrack) -> RawTrack {
        var name: String?
        var notes: [(beat: MusicTimeStamp, durationBeats: Double, pitch: UInt8)] = []
        var lyrics: [(beat: MusicTimeStamp, text: String)] = []
        var keySignatureFifths: Int?

        var iterator: MusicEventIterator?
        guard NewMusicEventIterator(track, &iterator) == noErr, let iterator else {
            return RawTrack(name: nil, notes: [], lyrics: [], keySignatureFifths: nil)
        }
        defer { DisposeMusicEventIterator(iterator) }

        var hasEvent: DarwinBoolean = false
        MusicEventIteratorHasCurrentEvent(iterator, &hasEvent)
        while hasEvent.boolValue {
            var timeStamp: MusicTimeStamp = 0
            var eventType: MusicEventType = 0
            var eventData: UnsafeRawPointer?
            var eventDataSize: UInt32 = 0
            let status = MusicEventIteratorGetEventInfo(iterator, &timeStamp, &eventType, &eventData, &eventDataSize)
            if status == noErr, let eventData {
                switch eventType {
                case kMusicEventType_MIDINoteMessage:
                    let note = eventData.assumingMemoryBound(to: MIDINoteMessage.self).pointee
                    notes.append((beat: timeStamp, durationBeats: Double(note.duration), pitch: note.note))
                case kMusicEventType_Meta:
                    let meta = eventData.assumingMemoryBound(to: MIDIMetaEvent.self).pointee
                    let dataOffset = MemoryLayout<MIDIMetaEvent>.offset(of: \.data)!
                    let bytes = [UInt8](UnsafeRawBufferPointer(start: UnsafeRawPointer(eventData).advanced(by: dataOffset), count: Int(meta.dataLength)))
                    switch meta.metaEventType {
                    case Self.metaEventTypeTrackName:
                        name = String(bytes: bytes, encoding: .utf8)
                    case Self.metaEventTypeLyric:
                        if let text = String(bytes: bytes, encoding: .utf8) {
                            lyrics.append((beat: timeStamp, text: text))
                        }
                    case Self.metaEventTypeKeySignature where bytes.count >= 1:
                        // Signed byte: sharps if positive, flats if negative.
                        keySignatureFifths = Int(Int8(bitPattern: bytes[0]))
                    default:
                        break
                    }
                default:
                    break
                }
            }
            MusicEventIteratorNextEvent(iterator)
            MusicEventIteratorHasCurrentEvent(iterator, &hasEvent)
        }

        return RawTrack(name: name, notes: notes, lyrics: lyrics, keySignatureFifths: keySignatureFifths)
    }

    // MARK: - Format detection

    /// Reads the raw MThd header (fixed 14-byte chunk: "MThd" + 4-byte
    /// length + 2-byte format + 2-byte track count + 2-byte division) to
    /// get the SMF format field. This is the one place this parser reads
    /// raw file bytes directly — a fixed-offset fixed-size field, not the
    /// variable-length event stream `MusicSequence` already handles.
    /// Defaults to "not format 0" on any read/parse failure so a malformed
    /// header doesn't change behavior here — `MusicSequenceFileLoad` will
    /// surface the real error.
    private static func isFormatZero(_ fileURL: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return false }
        defer { try? handle.close() }
        guard let data = try? handle.read(upToCount: 10), data.count == 10 else { return false }
        let header = [UInt8](data)
        guard header.prefix(4).elementsEqual("MThd".utf8) else { return false }
        let format = UInt16(header[8]) << 8 | UInt16(header[9])
        return format == 0
    }

    // MARK: - Voice-part mapping

    /// Full-word aliases per part, matched as a *prefix* of the (trimmed,
    /// lowercased) track name — covers real-world split-part naming like
    /// "Soprano 1", "Soprano II", "Altos", "Tenor 2", "Sop.", "Alt".
    private static let wordAliases: [VoicePart: [String]] = [
        .soprano: ["soprano", "sop"],
        .alto: ["alto", "alt"],
        .tenor: ["tenor", "ten"],
        .bass: ["bass", "bs"],
    ]

    /// Single-letter shorthand per part ("S", "S1", "S 2", "S.", "T II",
    /// "B2") — matched only when the *entire* name reduces to the code plus
    /// punctuation/numbering, since a bare letter as a prefix elsewhere
    /// would false-positive too easily (e.g. "Strings").
    private static let shortCodes: [Character: VoicePart] = ["s": .soprano, "a": .alto, "t": .tenor, "b": .bass]

    private static func matchVoicePart(forTrackName rawName: String) -> VoicePart? {
        let name = rawName.trimmingCharacters(in: .whitespaces).lowercased()
        guard !name.isEmpty else { return nil }

        if let part = wordAliases.first(where: { alias in alias.value.contains(where: name.hasPrefix) })?.key {
            return part
        }

        guard let code = name.first else { return nil }
        let rest = name.dropFirst()
        guard rest.allSatisfy({ ".0123456789ivx ".contains($0) }) else { return nil }
        return shortCodes[code]
    }

    /// Maps track index -> voice part. Tracks that can't be confidently
    /// mapped (accompaniment, unnamed extras, an ambiguous leftover count)
    /// are simply absent from the result — see the human spot-check task
    /// in the M2 plan for validating this against real files.
    private static func assignVoiceParts(_ tracks: [(name: String?, pitches: [Double])]) -> [Int: VoicePart] {
        var assignments: [Int: VoicePart] = [:]
        var assignedParts: Set<VoicePart> = []

        // Pass 1: track-name meta-events. Multiple tracks can map to the
        // same part on purpose — divisi splits ("Soprano 1"/"Soprano 2")
        // both belong in the same voice-part bucket.
        for (index, track) in tracks.enumerated() {
            guard let name = track.name, let part = matchVoicePart(forTrackName: name) else { continue }
            assignments[index] = part
            assignedParts.insert(part)
        }

        // Pass 2: mean-pitch fallback (high→low) for whatever voice parts
        // are still unassigned, drawn only from tracks that have notes and
        // weren't already name-matched to a different part.
        let remainingParts = VoicePart.allCases.filter { !assignedParts.contains($0) }
        guard !remainingParts.isEmpty else { return assignments }

        let candidates = tracks.indices.filter { assignments[$0] == nil && !tracks[$0].pitches.isEmpty }
        guard candidates.count == remainingParts.count else {
            // More or fewer note-bearing candidate tracks than remaining
            // voice parts — too ambiguous to guess at safely.
            return assignments
        }

        let ranked = candidates.sorted { meanPitch(tracks[$0].pitches) > meanPitch(tracks[$1].pitches) }
        for (part, index) in zip(remainingParts, ranked) {
            assignments[index] = part
        }
        return assignments
    }

    private static func meanPitch(_ pitches: [Double]) -> Double {
        pitches.reduce(0, +) / Double(pitches.count)
    }

    // MARK: - Time conversion

    private func secondsForBeats(_ sequence: MusicSequence, _ beats: MusicTimeStamp) -> Double {
        var seconds: Float64 = 0
        MusicSequenceGetSecondsForBeats(sequence, beats, &seconds)
        return seconds
    }

    private func secondsToMs(_ seconds: Double) -> Int {
        Int((seconds * 1000).rounded())
    }
}
