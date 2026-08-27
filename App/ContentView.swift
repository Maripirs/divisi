import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "pianokeys")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
                Text("Divisi")
                    .font(.headline)
                Spacer()
            }

            FollowAlongSmokeTestView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// Temporary M4 smoke test: parses a bundled fixture, converts it to
/// MusicXML, and drives `DivisiSyncEngine` + `OSMDWebView` so the moving
/// cursor can actually be seen/heard together on a simulator/device before
/// the real import/voice-part-picker shell exists. Replaced by the real
/// shell in M5 (mirrors the M3 `PlaybackSmokeTestView` it supersedes).
private struct FollowAlongSmokeTestView: View {
    @StateObject private var engine = DivisiSyncEngine(playback: DivisiPlaybackService())
    @State private var voicePart: VoicePart = .soprano
    @State private var displayMode: DisplayMode = .highlighted
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 8) {
            Picker("Voice part", selection: $voicePart) {
                ForEach(VoicePart.allCases, id: \.self) { part in
                    Text(part.rawValue.capitalized).tag(part)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: voicePart) { _, newValue in engine.setVoicePart(newValue) }

            Picker("Display mode", selection: $displayMode) {
                ForEach(DisplayMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue.capitalized).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: displayMode) { _, newValue in engine.setDisplayMode(newValue) }

            OSMDWebView(controller: engine.osmd)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .layoutPriority(1)
                .overlay {
                    if engine.state != .ready {
                        Color(white: 0.97)
                        Text(stateDescription)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

            HStack(spacing: 12) {
                Button {
                    engine.adjustScoreZoom(by: -0.1)
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Zoom out")

                Slider(
                    value: Binding(
                        get: { engine.scoreZoom },
                        set: { engine.setScoreZoom($0) }
                    ),
                    in: 0.45...1.8
                )

                Button {
                    engine.adjustScoreZoom(by: 0.1)
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Zoom in")
            }
            .disabled(engine.state != .ready)

            if let lyric = engine.currentLyric {
                Text(lyric)
                    .font(.headline)
            }

            Text(String(format: "%.1fs", Double(engine.positionMs) / 1000))
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)

            VStack(spacing: 4) {
                Slider(
                    value: Binding(
                        get: { engine.voicePartBalance },
                        set: { engine.setVoicePartBalance($0) }
                    ),
                    in: -1...1
                )
                HStack {
                    Text("Quieter")
                    Spacer()
                    Text("Even")
                    Spacer()
                    Text("Louder")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            .disabled(engine.state != .ready)

            Button(engine.isPlaying ? "Pause" : "▶ Play (M4 smoke test)") {
                toggle()
            }
            .buttonStyle(.bordered)
            .disabled(engine.state != .ready)

            if let errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .onAppear { loadFixture() }
    }

    private var stateDescription: String {
        switch engine.state {
        case .noFileLoaded: return "Loading…"
        case .ready: return ""
        case .noNotesForVoicePart: return "No notes for \(voicePart.rawValue) in this file"
        case .error(let message): return message
        }
    }

    private func loadFixture() {
        guard let url = Bundle.main.url(forResource: "Mozart_Lacrymosa_from_Requiem_SATB_with_piano", withExtension: "mid") else {
            errorText = "Bundled Lacrymosa fixture not found"
            return
        }
        do {
            let parsed = try MIDIParser().parse(fileURL: url)
            engine.loadFile(parsed: parsed, voicePart: voicePart, displayMode: displayMode, fileURL: url)
        } catch {
            errorText = "\(error)"
        }
    }

    private func toggle() {
        do {
            if engine.isPlaying {
                engine.pause()
            } else {
                try engine.play()
            }
        } catch {
            errorText = "\(error)"
        }
    }
}

#Preview {
    ContentView()
}
