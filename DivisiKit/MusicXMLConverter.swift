import Foundation

enum MusicXMLConverterError: Error {
    case noNotesForVoicePart
}

/// Converts one voice part's notes from `ParsedMIDI` into a MusicXML
/// document that OpenSheetMusicDisplay can render (M4).
///
/// MIDI only carries millisecond timing, not a written rhythm, so this
/// quantizes every note's start/duration onto a fixed sixteenth-note grid
/// derived from the file's initial tempo — the "fixed grid snap" approach
/// (see `plan.md` M4). That's a real simplification: genuinely free/
/// expressive timing, or a file with tempo/meter changes mid-piece (see
/// `ParsedMIDI`'s doc comment), can come out misnotated. It covers the
/// steady-tempo choral repertoire this app targets.
///
/// Pitch spelling (sharps vs. flats) is a flat lookup table picked by the
/// sign of the key signature's fifths count, not a real harmonic-spelling
/// algorithm — so a chromatic accidental (e.g. a raised leading tone in a
/// minor key) can come out enharmonically "wrong" even though the pitch
/// itself is correct. Good enough to read from, not concert-hall-accurate.
struct MusicXMLConverter {

    /// One grid unit = a sixteenth note = one MusicXML `<divisions>` tick
    /// (divisions is fixed at 4 per quarter note below, so a unit count
    /// *is* a MusicXML duration value directly — no rescaling needed).
    private static let unitsPerWholeNote = 16
    private static let divisionsPerQuarter = 4

    struct Result {
        let xml: String
        /// Parallel to the `<note>` elements in `xml`, in document order
        /// (rests are `<note>` elements too, per the MusicXML spec) — the ms
        /// timestamp each one starts sounding at. This is exactly the
        /// sequence `DivisiSyncEngine` will drive an OSMD cursor step
        /// against: on each poll tick, find how far into this array
        /// `currentPositionMs` has advanced.
        let noteStartMs: [Int]
    }

    func convert(_ parsed: ParsedMIDI, voicePart: VoicePart) throws -> Result {
        let partNotes = parsed.notes.filter { $0.voicePart == voicePart }
        let notes = partNotes.sorted { $0.startMs < $1.startMs }
        guard !notes.isEmpty else { throw MusicXMLConverterError.noNotesForVoicePart }

        let unitMs = 60_000.0 / parsed.tempoBPM / (Double(Self.divisionsPerQuarter))
        let unitsPerMeasure = parsed.timeSignature.numerator * (Self.unitsPerWholeNote / parsed.timeSignature.denominator)

        let timeline = Self.buildTimeline(notes: notes, unitMs: unitMs, unitsPerMeasure: unitsPerMeasure)
        let measureUnitSpans = Self.splitAtMeasureBoundaries(timeline, unitsPerMeasure: unitsPerMeasure)
        let useFlats = parsed.keySignatureFifths < 0

        var body = ""
        var noteStartMs: [Int] = []
        var unitCursor = 0
        for (measureIndex, measureEvents) in measureUnitSpans.enumerated() {
            body += "    <measure number=\"\(measureIndex + 1)\">\n"
            if measureIndex == 0 {
                body += Self.attributesXML(timeSignature: parsed.timeSignature, keySignatureFifths: parsed.keySignatureFifths, voicePart: voicePart)
            }
            for piece in measureEvents {
                let chunks = Self.decompose(units: piece.durationUnits)
                for (chunkIndex, chunk) in chunks.enumerated() {
                    // A chunk needs a tie to its neighbor whenever there's a
                    // sounding note on both sides of the split — either
                    // because `decompose` broke one piece into several
                    // notated fragments, or because this piece itself is a
                    // measure-boundary fragment of a longer original note.
                    let isNote = piece.pitch != nil
                    let tieStop = isNote && (chunkIndex > 0 || piece.continuesFromPrevious)
                    let tieStart = isNote && (chunkIndex < chunks.count - 1 || piece.continuesToNext)
                    body += Self.noteXML(pitch: piece.pitch, chunk: chunk, useFlats: useFlats, tieStart: tieStart, tieStop: tieStop)
                    noteStartMs.append(Int((Double(unitCursor) * unitMs).rounded()))
                    unitCursor += chunk.units
                }
            }
            body += "    </measure>\n"
        }

        let partName = voicePart.rawValue.capitalized
        let xml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
        <score-partwise version="4.0">
          <part-list>
            <score-part id="P1">
              <part-name>\(partName)</part-name>
            </score-part>
          </part-list>
          <part id="P1">
        \(body)  </part>
        </score-partwise>
        """
        return Result(xml: xml, noteStartMs: noteStartMs)
    }

    // MARK: - Grid quantization

    private struct GridEvent {
        let startUnit: Int
        let durationUnits: Int
        let pitch: UInt8? // nil = rest
    }

    /// Snaps each note to the nearest grid unit, then fills every gap
    /// between notes (including before the first one) with a rest so the
    /// whole part is a contiguous, gap-free timeline — MusicXML has no
    /// concept of silent/undefined time within a measure. Also pads a final
    /// trailing rest so the last measure comes out full: a file's closing
    /// beats of silence are rarely a real MIDI event (nothing follows to
    /// end them against), so without this the last measure would fall
    /// short of `unitsPerMeasure` and mis-justify in notation software.
    private static func buildTimeline(notes: [MIDINote], unitMs: Double, unitsPerMeasure: Int) -> [GridEvent] {
        var quantized: [(startUnit: Int, endUnit: Int, pitch: UInt8)] = []
        var cursor = 0
        for note in notes.sorted(by: { $0.startMs < $1.startMs }) {
            var startUnit = Int((Double(note.startMs) / unitMs).rounded())
            var endUnit = Int((Double(note.startMs + note.durationMs) / unitMs).rounded())
            // Rounding two adjacent notes onto the same grid unit (or a tiny
            // negative gap) can make them overlap — resolve by clamping to
            // wherever the previous note actually finished.
            startUnit = max(startUnit, cursor)
            endUnit = max(endUnit, startUnit + 1)
            quantized.append((startUnit, endUnit, note.pitch))
            cursor = endUnit
        }

        var timeline: [GridEvent] = []
        var unitCursor = 0
        for note in quantized {
            if note.startUnit > unitCursor {
                timeline.append(GridEvent(startUnit: unitCursor, durationUnits: note.startUnit - unitCursor, pitch: nil))
            }
            timeline.append(GridEvent(startUnit: note.startUnit, durationUnits: note.endUnit - note.startUnit, pitch: note.pitch))
            unitCursor = note.endUnit
        }

        let remainder = unitCursor % unitsPerMeasure
        if remainder != 0 {
            timeline.append(GridEvent(startUnit: unitCursor, durationUnits: unitsPerMeasure - remainder, pitch: nil))
        }
        return timeline
    }

    /// One measure-local fragment of a `GridEvent`, after splitting at
    /// barlines. `continuesFromPrevious`/`continuesToNext` mark whether this
    /// fragment is tied to a sibling fragment of the *same original event*
    /// on either side (always `false` for rests — tying rests is
    /// meaningless).
    private struct MeasurePiece {
        let durationUnits: Int
        let pitch: UInt8?
        let continuesFromPrevious: Bool
        let continuesToNext: Bool
    }

    /// Splits any event that straddles a measure boundary into two (or
    /// more) pieces at that boundary, and groups the result by measure —
    /// MusicXML can't represent a single `<note>` crossing a barline, only
    /// two tied notes either side of it.
    private static func splitAtMeasureBoundaries(_ timeline: [GridEvent], unitsPerMeasure: Int) -> [[MeasurePiece]] {
        var measures: [[MeasurePiece]] = [[]]
        var measureStart = 0

        for event in timeline {
            // How many barline-crossing pieces this event will produce, given
            // where the measure boundary currently sits — computed up front
            // (without touching `measureStart`/`measures`) so each piece
            // emitted below can know whether a later piece of the same event
            // follows, for tie continuation.
            let totalPieces = Self.pieceCount(start: event.startUnit, duration: event.durationUnits, measureStart: measureStart, unitsPerMeasure: unitsPerMeasure)
            let isNote = event.pitch != nil

            var remainingStart = event.startUnit
            var remainingDuration = event.durationUnits
            var pieceIndex = 0
            while remainingDuration > 0 {
                let measureEnd = measureStart + unitsPerMeasure
                let roomInMeasure = measureEnd - remainingStart
                let pieceDuration = min(remainingDuration, roomInMeasure)
                measures[measures.count - 1].append(MeasurePiece(
                    durationUnits: pieceDuration,
                    pitch: event.pitch,
                    continuesFromPrevious: isNote && pieceIndex > 0,
                    continuesToNext: isNote && pieceIndex < totalPieces - 1
                ))
                remainingStart += pieceDuration
                remainingDuration -= pieceDuration
                pieceIndex += 1
                if remainingStart >= measureEnd {
                    measureStart = measureEnd
                    measures.append([])
                }
            }
        }
        if measures.last?.isEmpty == true { measures.removeLast() }
        return measures
    }

    /// Dry-run of the splitting loop above that only counts how many
    /// barline-crossing pieces `duration` units starting at `start` would
    /// produce — used as a look-ahead so tie-continuation flags can be set
    /// in a single real pass.
    private static func pieceCount(start: Int, duration: Int, measureStart: Int, unitsPerMeasure: Int) -> Int {
        var remainingStart = start
        var remainingDuration = duration
        var boundary = measureStart
        var count = 0
        while remainingDuration > 0 {
            let measureEnd = boundary + unitsPerMeasure
            let pieceDuration = min(remainingDuration, measureEnd - remainingStart)
            remainingStart += pieceDuration
            remainingDuration -= pieceDuration
            count += 1
            if remainingStart >= measureEnd { boundary = measureEnd }
        }
        return count
    }

    // MARK: - Rhythm decomposition

    private struct Chunk {
        let units: Int
        let type: String
        let dots: Int
    }

    /// Table of every plain/dotted note value expressible on a sixteenth-
    /// note grid within one whole note, largest first, so the greedy
    /// decomposition below prefers the fewest/simplest tied fragments.
    private static let valueTable: [(units: Int, type: String, dots: Int)] = [
        (16, "whole", 0), (12, "half", 1), (8, "half", 0), (6, "quarter", 1),
        (4, "quarter", 0), (3, "eighth", 1), (2, "eighth", 0), (1, "16th", 0),
    ]

    /// Greedily breaks a unit count into standard note values, largest
    /// first. Always terminates (the table includes 1) and never produces
    /// a remainder, though an odd unit count (e.g. 5 = quarter + 16th) ties
    /// across the split rather than picking a beat-aware grouping — a known
    /// simplification, see this file's top-level doc comment.
    private static func decompose(units: Int) -> [Chunk] {
        var remaining = units
        var chunks: [Chunk] = []
        while remaining > 0 {
            guard let value = valueTable.first(where: { $0.units <= remaining }) else { break }
            chunks.append(Chunk(units: value.units, type: value.type, dots: value.dots))
            remaining -= value.units
        }
        return chunks
    }

    // MARK: - XML emission

    private static func attributesXML(timeSignature: MIDITimeSignature, keySignatureFifths: Int, voicePart: VoicePart) -> String {
        let (clefSign, clefLine, clefOctaveChange): (String, Int, Int?)
        switch voicePart {
        case .soprano, .alto: (clefSign, clefLine, clefOctaveChange) = ("G", 2, nil)
        case .tenor: (clefSign, clefLine, clefOctaveChange) = ("G", 2, -1) // vocal tenor clef
        case .bass: (clefSign, clefLine, clefOctaveChange) = ("F", 4, nil)
        }
        let octaveChangeXML = clefOctaveChange.map { "\n        <clef-octave-change>\($0)</clef-octave-change>" } ?? ""
        return """
              <attributes>
                <divisions>\(divisionsPerQuarter)</divisions>
                <key>
                  <fifths>\(keySignatureFifths)</fifths>
                </key>
                <time>
                  <beats>\(timeSignature.numerator)</beats>
                  <beat-type>\(timeSignature.denominator)</beat-type>
                </time>
                <clef>
                  <sign>\(clefSign)</sign>
                  <line>\(clefLine)</line>\(octaveChangeXML)
                </clef>
              </attributes>

        """
    }

    /// Sharp/flat spelling per pitch class (index 0 = C), selected by the
    /// key signature's sign — see this file's top-level doc comment on the
    /// limits of this approach.
    private static let sharpSteps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"]
    private static let sharpAlters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
    private static let flatSteps = ["C", "D", "D", "E", "E", "F", "G", "G", "A", "A", "B", "B"]
    private static let flatAlters = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0]

    private static func noteXML(pitch: UInt8?, chunk: Chunk, useFlats: Bool, tieStart: Bool, tieStop: Bool) -> String {
        let dotsXML = String(repeating: "\n          <dot/>", count: chunk.dots)
        let pitchOrRestXML: String
        if let pitch {
            let pitchClass = Int(pitch) % 12
            let octave = Int(pitch) / 12 - 1
            let steps = useFlats ? flatSteps : sharpSteps
            let alters = useFlats ? flatAlters : sharpAlters
            let step = steps[pitchClass]
            let alter = alters[pitchClass]
            let alterXML = alter != 0 ? "\n          <alter>\(alter)</alter>" : ""
            pitchOrRestXML = """
                  <pitch>
                    <step>\(step)</step>\(alterXML)
                    <octave>\(octave)</octave>
                  </pitch>
            """
        } else {
            pitchOrRestXML = "      <rest/>"
        }

        // MusicXML needs both: <tie> is the playback-level tie, <notations>
        // <tied> is what actually draws the tie curve.
        var tieXML = ""
        var tiedNotationsXML = ""
        if tieStop {
            tieXML += "\n        <tie type=\"stop\"/>"
            tiedNotationsXML += "\n            <tied type=\"stop\"/>"
        }
        if tieStart {
            tieXML += "\n        <tie type=\"start\"/>"
            tiedNotationsXML += "\n            <tied type=\"start\"/>"
        }
        let notationsXML = tiedNotationsXML.isEmpty ? "" : "\n          <notations>\(tiedNotationsXML)\n          </notations>"

        return """
              <note>
        \(pitchOrRestXML)
                <duration>\(chunk.units)</duration>\(tieXML)
                <type>\(chunk.type)</type>\(dotsXML)\(notationsXML)
              </note>

        """
    }
}
