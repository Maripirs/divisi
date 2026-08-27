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
        /// How many milliseconds of real time correspond to one whole note
        /// at this file's tempo. OSMD's cursor iterator reports its position
        /// as a timestamp in whole notes (`cursor.iterator.currentTimeStamp`),
        /// so `DivisiSyncEngine` converts `currentPositionMs / msPerWholeNote`
        /// to drive it — a continuous mapping, not a per-note lookup table,
        /// so it works the same whether one part or all four are on screen
        /// (a discrete "note index" doesn't: a multi-part score's cursor
        /// advances through the union of all parts' event timestamps, not
        /// any single part's own note count).
        let msPerWholeNote: Double
    }

    struct MultiPartResult {
        let xml: String
        /// Same meaning as `Result.msPerWholeNote` — one tempo covers the
        /// whole (single-tempo) file, so it's shared across all four parts.
        let msPerWholeNote: Double
    }

    func convert(_ parsed: ParsedMIDI, voicePart: VoicePart) throws -> Result {
        let notes = Self.notes(parsed, voicePart: voicePart)
        guard !notes.isEmpty else { throw MusicXMLConverterError.noNotesForVoicePart }

        let unitMs = Self.unitMs(tempoBPM: parsed.tempoBPM)
        let unitsPerMeasure = Self.unitsPerMeasure(timeSignature: parsed.timeSignature)
        let measureUnitSpans = Self.measures(notes: notes, unitMs: unitMs, unitsPerMeasure: unitsPerMeasure)
        let useFlats = parsed.keySignatureFifths < 0
        let attributesXML = Self.attributesXML(timeSignature: parsed.timeSignature, keySignatureFifths: parsed.keySignatureFifths, voicePart: voicePart)

        let body = Self.bodyXML(measureUnitSpans: measureUnitSpans, useFlats: useFlats, firstMeasureAttributesXML: attributesXML)
        let xml = Self.scoreXML(parts: [(id: "P1", name: voicePart.rawValue.capitalized, body: body)])
        return Result(xml: xml, msPerWholeNote: unitMs * Double(Self.unitsPerWholeNote))
    }

    /// Notehead color applied to `highlightedPart`'s notes in
    /// `convertAllParts` — a standard MusicXML `color` attribute, which OSMD
    /// renders natively (see `noteXML`), rather than a WebView-side CSS/JS
    /// hack. iOS system blue; not user-configurable yet.
    static let highlightColor = "#3478F6"

    /// Converts all four voice parts into one multi-part score, one `<part>`
    /// per voice in SATB order, all padded to the same shared measure count
    /// so barlines line up vertically across staves — needed for the flat
    /// and highlighted display modes (M4), where every part is visible at
    /// once. A part with no notes at all in the file still gets its full
    /// share of rest-only measures rather than being omitted, so every mode
    /// shows a consistent SATB grid regardless of which parts a given file
    /// actually uses. When `highlightedPart` is non-nil, that part's
    /// noteheads are tinted `highlightColor` (the "highlighted" display
    /// mode); nil renders every part in the default color (the "flat" mode).
    func convertAllParts(_ parsed: ParsedMIDI, highlightedPart: VoicePart? = nil) throws -> MultiPartResult {
        let unitMs = Self.unitMs(tempoBPM: parsed.tempoBPM)
        let unitsPerMeasure = Self.unitsPerMeasure(timeSignature: parsed.timeSignature)
        let useFlats = parsed.keySignatureFifths < 0

        var measureUnitSpansByPart: [VoicePart: [[MeasurePiece]]] = [:]
        for voicePart in VoicePart.allCases {
            let notes = Self.notes(parsed, voicePart: voicePart)
            measureUnitSpansByPart[voicePart] = Self.measures(notes: notes, unitMs: unitMs, unitsPerMeasure: unitsPerMeasure)
        }

        let sharedMeasureCount = max(1, measureUnitSpansByPart.values.map(\.count).max() ?? 1)
        let restMeasure: [MeasurePiece] = [MeasurePiece(durationUnits: unitsPerMeasure, pitch: nil, continuesFromPrevious: false, continuesToNext: false)]
        for voicePart in VoicePart.allCases {
            while measureUnitSpansByPart[voicePart]!.count < sharedMeasureCount {
                measureUnitSpansByPart[voicePart]!.append(restMeasure)
            }
        }

        var parts: [(id: String, name: String, body: String)] = []
        for (index, voicePart) in VoicePart.allCases.enumerated() {
            let attributesXML = Self.attributesXML(timeSignature: parsed.timeSignature, keySignatureFifths: parsed.keySignatureFifths, voicePart: voicePart)
            let color = voicePart == highlightedPart ? Self.highlightColor : nil
            let body = Self.bodyXML(measureUnitSpans: measureUnitSpansByPart[voicePart]!, useFlats: useFlats, firstMeasureAttributesXML: attributesXML, color: color)
            parts.append((id: "P\(index + 1)", name: voicePart.rawValue.capitalized, body: body))
        }

        return MultiPartResult(xml: Self.scoreXML(parts: parts), msPerWholeNote: unitMs * Double(Self.unitsPerWholeNote))
    }

    private static func notes(_ parsed: ParsedMIDI, voicePart: VoicePart) -> [MIDINote] {
        parsed.notes.filter { $0.voicePart == voicePart }.sorted { $0.startMs < $1.startMs }
    }

    private static func unitMs(tempoBPM: Double) -> Double {
        60_000.0 / tempoBPM / Double(divisionsPerQuarter)
    }

    private static func unitsPerMeasure(timeSignature: MIDITimeSignature) -> Int {
        timeSignature.numerator * (unitsPerWholeNote / timeSignature.denominator)
    }

    private static func measures(notes: [MIDINote], unitMs: Double, unitsPerMeasure: Int) -> [[MeasurePiece]] {
        let timeline = buildTimeline(notes: notes, unitMs: unitMs, unitsPerMeasure: unitsPerMeasure)
        return splitAtMeasureBoundaries(timeline, unitsPerMeasure: unitsPerMeasure)
    }

    /// Emits one part's `<measure>` elements, shared between the
    /// single-part and multi-part conversions. `color`, when given, tints
    /// this part's noteheads (rests are left uncolored — there's no
    /// notehead to tint) for the "highlighted" display mode.
    private static func bodyXML(measureUnitSpans: [[MeasurePiece]], useFlats: Bool, firstMeasureAttributesXML: String, color: String? = nil) -> String {
        var body = ""
        for (measureIndex, measureEvents) in measureUnitSpans.enumerated() {
            body += "    <measure number=\"\(measureIndex + 1)\">\n"
            if measureIndex == 0 {
                body += firstMeasureAttributesXML
            }
            for piece in measureEvents {
                let chunks = decompose(units: piece.durationUnits)
                for (chunkIndex, chunk) in chunks.enumerated() {
                    // A chunk needs a tie to its neighbor whenever there's a
                    // sounding note on both sides of the split — either
                    // because `decompose` broke one piece into several
                    // notated fragments, or because this piece itself is a
                    // measure-boundary fragment of a longer original note.
                    let isNote = piece.pitch != nil
                    let tieStop = isNote && (chunkIndex > 0 || piece.continuesFromPrevious)
                    let tieStart = isNote && (chunkIndex < chunks.count - 1 || piece.continuesToNext)
                    body += noteXML(pitch: piece.pitch, chunk: chunk, useFlats: useFlats, tieStart: tieStart, tieStop: tieStop, color: isNote ? color : nil)
                }
            }
            body += "    </measure>\n"
        }
        return body
    }

    private static func scoreXML(parts: [(id: String, name: String, body: String)]) -> String {
        let scorePartsXML = parts.map { part in
            "    <score-part id=\"\(part.id)\">\n      <part-name>\(part.name)</part-name>\n    </score-part>\n"
        }.joined()
        let partsXML = parts.map { part in
            "  <part id=\"\(part.id)\">\n\(part.body)  </part>\n"
        }.joined()
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
        <score-partwise version="4.0">
          <part-list>
        \(scorePartsXML)  </part-list>
        \(partsXML)</score-partwise>
        """
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

    private static func noteXML(pitch: UInt8?, chunk: Chunk, useFlats: Bool, tieStart: Bool, tieStop: Bool, color: String? = nil) -> String {
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
        // `color` is a standard MusicXML attribute (present on <note> and
        // several other elements) that OSMD honors directly when rendering
        // — no custom CSS/JS needed for the "highlighted" display mode's
        // notehead tinting.
        let colorAttrXML = color.map { " color=\"\($0)\"" } ?? ""

        return """
              <note\(colorAttrXML)>
        \(pitchOrRestXML)
                <duration>\(chunk.units)</duration>\(tieXML)
                <type>\(chunk.type)</type>\(dotsXML)\(notationsXML)
              </note>

        """
    }
}
