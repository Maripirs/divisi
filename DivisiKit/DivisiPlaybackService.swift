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
    private var partSamplers: [VoicePart: AVAudioUnitSampler] = [:]
    private var partMixers: [VoicePart: AVAudioMixerNode] = [:]
    private let backingSampler = AVAudioUnitSampler()
    private let backingMixer = AVAudioMixerNode()
    private var sequencer: AVAudioSequencer?
    private var pollTask: Task<Void, Never>?

    private(set) var isLoaded = false
    private var isGraphBuilt = false
    private var selectedBalancePart: VoicePart = .soprano
    private var balance: Double = 0

    init() {}

    private func buildAudioGraphIfNeeded() {
        guard !isGraphBuilt else { return }
        for part in VoicePart.allCases {
            let sampler = AVAudioUnitSampler()
            let mixer = AVAudioMixerNode()
            partSamplers[part] = sampler
            partMixers[part] = mixer
            engine.attach(sampler)
            engine.attach(mixer)
            engine.connect(sampler, to: mixer, format: nil)
            engine.connect(mixer, to: engine.mainMixerNode, format: nil)
        }

        engine.attach(backingSampler)
        engine.attach(backingMixer)
        engine.connect(backingSampler, to: backingMixer, format: nil)
        engine.connect(backingMixer, to: engine.mainMixerNode, format: nil)

        loadDefaultInstruments()
        applyBalance()
        isGraphBuilt = true
    }

    /// Loads the bundled GM soundfont's Acoustic Grand Piano patch onto
    /// every sampler. Without this, `AVAudioUnitSampler`'s bare default
    /// patch is barely audible — a real instrument sound matters here since
    /// this app's whole point is following along by ear.
    private func loadDefaultInstruments() {
        guard let soundFontURL = Bundle.main.url(forResource: "TimGM6mb", withExtension: "sf2") else { return }
        for sampler in Array(partSamplers.values) + [backingSampler] {
            try? sampler.loadSoundBankInstrument(
                at: soundFontURL,
                program: 0,
                bankMSB: UInt8(kAUSampler_DefaultMelodicBankMSB),
                bankLSB: UInt8(kAUSampler_DefaultBankLSB)
            )
        }
    }

    func load(fileURL: URL, trackVoiceParts: [Int: VoicePart] = [:]) throws {
        try configureAudioSession()
        buildAudioGraphIfNeeded()
        if !engine.isRunning {
            try engine.start()
        }

        let newSequencer = AVAudioSequencer(audioEngine: engine)
        let loadOptions: AVMusicSequenceLoadOptions = Self.isFormatZero(fileURL) ? .smf_ChannelsToTracks : []
        try newSequencer.load(from: fileURL, options: loadOptions)
        // Route any track the parser mapped to SATB into that part's own
        // sampler/mixer channel. Unmapped tracks still play through the
        // backing channel so accompaniment or extras remain audible but
        // don't get folded into the selected-part balance.
        for (index, track) in newSequencer.tracks.enumerated() {
            if let part = trackVoiceParts[index], let sampler = partSamplers[part] {
                track.destinationAudioUnit = sampler
            } else {
                track.destinationAudioUnit = backingSampler
            }
        }
        newSequencer.prepareToPlay()

        sequencer = newSequencer
        isLoaded = true
        applyBalance()
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

    func setVoicePartBalance(selectedPart: VoicePart, balance: Double) {
        selectedBalancePart = selectedPart
        self.balance = min(1, max(-1, balance))
        applyBalance()
    }

    private func applyBalance() {
        let selectedVolume = Float(1.0 + max(balance, 0.0) * 0.75 - max(-balance, 0.0) * 0.6)
        let restVolume = Float(1.0 - max(balance, 0.0) * 0.35 + max(-balance, 0.0) * 0.35)
        for part in VoicePart.allCases {
            partMixers[part]?.outputVolume = part == selectedBalancePart ? selectedVolume : restVolume
        }
        backingMixer.outputVolume = restVolume
    }

    /// Mirrors `MIDIParser`'s SMF format check so both parser and playback
    /// ask Core MIDI for the same regular-track layout.
    private static func isFormatZero(_ fileURL: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return false }
        defer { try? handle.close() }
        guard let data = try? handle.read(upToCount: 10), data.count == 10 else { return false }
        let header = [UInt8](data)
        guard header.prefix(4).elementsEqual("MThd".utf8) else { return false }
        let format = UInt16(header[8]) << 8 | UInt16(header[9])
        return format == 0
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
