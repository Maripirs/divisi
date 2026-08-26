import Foundation

/// Ties `DivisiPlaybackService`'s playback position to the OSMD cursor
/// (`OSMDController`) and the current lyric, for one loaded file + voice
/// part (M4). Shaped like LyricsPiP's `LyricsSyncEngine`: poll position →
/// derive current → push to the view.
@MainActor
final class DivisiSyncEngine: ObservableObject {

    enum State: Equatable {
        case noFileLoaded
        case ready
        /// The file parsed fine, but the chosen voice part has no notes in
        /// it (e.g. picked "Bass" on a 3-part file) — distinct from a real
        /// error so the UI can suggest picking a different part.
        case noNotesForVoicePart
        case error(String)
    }

    @Published private(set) var state: State = .noFileLoaded
    @Published private(set) var positionMs = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var currentLyric: String?

    let osmd = OSMDController()

    private let playback: DivisiPlaybackService
    private let converter = MusicXMLConverter()
    private var noteStartMs: [Int] = []
    private var lyrics: [MIDILyricEvent] = []
    private var lastCursorIndex = -1
    private var pollTask: Task<Void, Never>?

    init(playback: DivisiPlaybackService) {
        self.playback = playback
    }

    /// Loads a MIDI file into playback and its chosen voice part into the
    /// score view. Resets all sync state, including the "which cursor step
    /// are we on" tracking, since a new score means the old index is
    /// meaningless.
    func load(parsed: ParsedMIDI, voicePart: VoicePart, fileURL: URL) {
        pollTask?.cancel()
        lastCursorIndex = -1
        noteStartMs = []
        lyrics = []
        currentLyric = nil

        do {
            try playback.load(fileURL: fileURL)
            let result = try converter.convert(parsed, voicePart: voicePart)
            noteStartMs = result.noteStartMs
            lyrics = parsed.lyrics
                .filter { $0.voicePart == voicePart }
                .sorted { $0.timeMs < $1.timeMs }
            osmd.loadScore(xml: result.xml)
            state = .ready
            startPolling()
        } catch MusicXMLConverterError.noNotesForVoicePart {
            osmd.clear()
            state = .noNotesForVoicePart
        } catch {
            osmd.clear()
            state = .error("\(error)")
        }
    }

    func play() throws {
        try playback.play()
    }

    func pause() {
        playback.pause()
    }

    /// Seeks playback and updates the cursor/lyric immediately, rather than
    /// waiting for the next poll tick — keeps a scrubbed seek feeling
    /// instant instead of laggy-by-up-to-100ms.
    func seek(toMs ms: Int) {
        playback.seek(toMs: ms)
        updateCursor(forPositionMs: ms)
    }

    private func startPolling() {
        pollTask = playback.startPolling { [weak self] positionMs, isPlaying in
            guard let self else { return }
            self.positionMs = positionMs
            self.isPlaying = isPlaying
            self.updateCursor(forPositionMs: positionMs)
        }
    }

    private func updateCursor(forPositionMs ms: Int) {
        currentLyric = Self.lyricText(atOrBefore: ms, in: lyrics)
        guard !noteStartMs.isEmpty else { return }
        let index = Self.noteIndex(atOrBefore: ms, in: noteStartMs)
        guard index != lastCursorIndex else { return }
        lastCursorIndex = index
        osmd.setCursorIndex(index)
    }

    /// Last index whose start time has already passed, clamped to the
    /// first note — i.e. which note/rest `ms` currently falls within.
    /// `noteStartMs` is sorted (it's built in document order off
    /// already-sorted notes in `MusicXMLConverter`), so this is a binary
    /// search rather than a linear scan.
    private static func noteIndex(atOrBefore ms: Int, in noteStartMs: [Int]) -> Int {
        var low = 0
        var high = noteStartMs.count - 1
        var result = 0
        while low <= high {
            let mid = (low + high) / 2
            if noteStartMs[mid] <= ms {
                result = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return result
    }

    private static func lyricText(atOrBefore ms: Int, in lyrics: [MIDILyricEvent]) -> String? {
        lyrics.last { $0.timeMs <= ms }?.text
    }
}
