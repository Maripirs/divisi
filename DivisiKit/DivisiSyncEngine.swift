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
    @Published private(set) var voicePartBalance: Double = 0
    @Published private(set) var scoreZoom: Double = 0.85

    let osmd = OSMDController()

    private let playback: DivisiPlaybackService
    private let converter = MusicXMLConverter()
    private var parsed: ParsedMIDI?
    private var voicePart: VoicePart = .soprano
    private var displayMode: DisplayMode = .solo
    private var msPerWholeNote: Double = 0
    private var lyrics: [MIDILyricEvent] = []
    private var pollTask: Task<Void, Never>?

    init(playback: DivisiPlaybackService) {
        self.playback = playback
        osmd.onSeekTimestamp = { [weak self] wholeNotes in
            guard let self, self.msPerWholeNote > 0 else { return }
            self.seek(toMs: Int((wholeNotes * self.msPerWholeNote).rounded()))
        }
    }

    /// Loads a new MIDI file into playback and its chosen voice part/display
    /// mode into the score view. Starts audio from position 0 — call this
    /// once per file, not on every voice-part/display-mode change (use
    /// `setVoicePart` / `setDisplayMode` for those).
    func loadFile(parsed: ParsedMIDI, voicePart: VoicePart, displayMode: DisplayMode, fileURL: URL) {
        pollTask?.cancel()
        self.parsed = parsed
        self.voicePart = voicePart
        self.displayMode = displayMode

        do {
            try playback.load(fileURL: fileURL, trackVoiceParts: parsed.trackVoiceParts)
            playback.setVoicePartBalance(selectedPart: voicePart, balance: voicePartBalance)
            render()
            startPolling()
        } catch {
            osmd.clear()
            state = .error("\(error)")
        }
    }

    /// Changes which voice part the score view follows/highlights.
    /// Re-converts and re-renders the score only — playback (and its
    /// position) is never touched, since the audio always plays the full
    /// mix regardless of which part is being displayed.
    func setVoicePart(_ voicePart: VoicePart) {
        self.voicePart = voicePart
        playback.setVoicePartBalance(selectedPart: voicePart, balance: voicePartBalance)
        render()
    }

    /// Changes how the four voice parts are drawn relative to the chosen
    /// one (flat/highlighted/solo — see `DisplayMode`). Display-only, same
    /// as `setVoicePart`: never touches playback.
    func setDisplayMode(_ displayMode: DisplayMode) {
        self.displayMode = displayMode
        render()
    }

    func setScoreZoom(_ zoom: Double) {
        scoreZoom = min(1.8, max(0.45, zoom))
        osmd.setZoom(scoreZoom)
    }

    func adjustScoreZoom(by delta: Double) {
        setScoreZoom(scoreZoom + delta)
    }

    /// Re-renders the score for the current `voicePart`/`displayMode` and
    /// re-syncs the cursor to wherever playback currently is — needed
    /// because both setters above can be called mid-playback. Solo mode
    /// renders just the chosen part (and can report `.noNotesForVoicePart`);
    /// flat/highlighted render the full SATB score (see `convertAllParts` —
    /// a part with no notes still gets rest measures, so those modes always
    /// have something to show).
    private func render() {
        guard let parsed else { return }
        lyrics = parsed.lyrics
            .filter { $0.voicePart == voicePart }
            .sorted { $0.timeMs < $1.timeMs }
        currentLyric = nil

        do {
            switch displayMode {
            case .solo:
                let result = try converter.convert(parsed, voicePart: voicePart)
                msPerWholeNote = result.msPerWholeNote
                osmd.loadScore(xml: result.xml, zoom: scoreZoom)
            case .flat, .highlighted:
                let result = try converter.convertAllParts(parsed, highlightedPart: displayMode == .highlighted ? voicePart : nil)
                msPerWholeNote = result.msPerWholeNote
                osmd.loadScore(xml: result.xml, zoom: scoreZoom)
            }
            state = .ready
            updateCursor(forPositionMs: playback.currentPositionMs)
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

    func setVoicePartBalance(_ balance: Double) {
        voicePartBalance = min(1, max(-1, balance))
        playback.setVoicePartBalance(selectedPart: voicePart, balance: voicePartBalance)
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
        guard msPerWholeNote > 0 else { return }
        osmd.setCursorTimestamp(Double(ms) / msPerWholeNote)
    }

    private static func lyricText(atOrBefore ms: Int, in lyrics: [MIDILyricEvent]) -> String? {
        lyrics.last { $0.timeMs <= ms }?.text
    }
}
