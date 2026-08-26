import AVFoundation

enum PlaybackError: Error {
    case sequencerLoadFailed
    case engineStartFailed
}

/// Wraps `AVAudioEngine` + `AVAudioSequencer` for MIDI playback: load a
/// file, play/pause/seek, and poll the current position. Shaped like
/// `SpotifyNowPlayingService`'s polling API so `DivisiSyncEngine` (M4) can
/// consume it the same way `LyricsSyncEngine` consumes Spotify polling.
///
/// Unlike LyricsPiP (which plays through Spotify and just mixes its own
/// audio in via `.mixWithOthers`), this app generates the sound itself, so
/// the audio session is configured as the sole `.playback` source.
@MainActor
final class DivisiPlaybackService {

    private let engine = AVAudioEngine()
    private let sampler = AVAudioUnitSampler()
    private var sequencer: AVAudioSequencer?
    private var pollTask: Task<Void, Never>?

    private(set) var isLoaded = false

    init() {
        engine.attach(sampler)
        engine.connect(sampler, to: engine.mainMixerNode, format: nil)
        loadDefaultInstrument()
    }

    /// Loads the bundled GM soundfont's Acoustic Grand Piano patch onto the
    /// sampler. Without this, `AVAudioUnitSampler`'s bare default patch is
    /// barely audible — a real instrument sound matters here since this
    /// app's whole point is following along by ear.
    private func loadDefaultInstrument() {
        guard let soundFontURL = Bundle.main.url(forResource: "TimGM6mb", withExtension: "sf2") else { return }
        try? sampler.loadSoundBankInstrument(
            at: soundFontURL,
            program: 0,
            bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB),
            bankLSB: UInt8(kAUSampler_DefaultBankLSB)
        )
    }

    func load(fileURL: URL) throws {
        try configureAudioSession()
        if !engine.isRunning {
            try engine.start()
        }

        let newSequencer = AVAudioSequencer(audioEngine: engine)
        try newSequencer.load(from: fileURL, options: [])
        // Every track needs somewhere to send its notes — point them all at
        // the sampler, since MVP playback is a single GM instrument, not
        // per-voice-part sounds.
        for track in newSequencer.tracks {
            track.destinationAudioUnit = sampler
        }
        newSequencer.prepareToPlay()

        sequencer = newSequencer
        isLoaded = true
    }

    func play() throws {
        guard let sequencer else { return }
        if !engine.isRunning {
            try engine.start()
        }
        try sequencer.start()
    }

    /// `AVAudioSequencer.stop()` leaves the playback position in place, so
    /// a subsequent `play()` resumes rather than restarting — this is the
    /// pause, not a stop-and-reset.
    func pause() {
        sequencer?.stop()
    }

    func seek(toMs ms: Int) {
        sequencer?.currentPositionInSeconds = Double(ms) / 1000.0
    }

    var isPlaying: Bool {
        sequencer?.isPlaying ?? false
    }

    var currentPositionMs: Int {
        guard let sequencer else { return 0 }
        return Int((sequencer.currentPositionInSeconds * 1000).rounded())
    }

    /// Polls on an interval, delivering position + playing state on the
    /// main actor. 100ms is frequent enough for a smoothly-updating
    /// piano-roll (M4) without being wasteful.
    func startPolling(interval: TimeInterval = 0.1, onUpdate: @escaping (Int, Bool) -> Void) -> Task<Void, Never> {
        pollTask?.cancel()
        let task = Task { [weak self] in
            while !Task.isCancelled, let self {
                onUpdate(self.currentPositionMs, self.isPlaying)
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
        pollTask = task
        return task
    }

    private func configureAudioSession() throws {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [])
        try session.setActive(true)
        #endif
    }
}
