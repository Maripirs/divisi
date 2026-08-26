import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "pianokeys")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor)
            Text("Divisi")
                .font(.title2.weight(.semibold))
            Text("Choir practice, one part at a time.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            FollowAlongSmokeTestView()
                .padding(.top, 24)
        }
        .padding()
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
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 8) {
            Picker("Voice part", selection: $voicePart) {
                ForEach(VoicePart.allCases, id: \.self) { part in
                    Text(part.rawValue.capitalized).tag(part)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: voicePart) { _, _ in loadFixture() }

            OSMDWebView(controller: engine.osmd)
                .frame(height: 220)
                .overlay {
                    if engine.state != .ready {
                        Color(white: 0.97)
                        Text(stateDescription)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

            if let lyric = engine.currentLyric {
                Text(lyric)
                    .font(.headline)
            }

            Text(String(format: "%.1fs", Double(engine.positionMs) / 1000))
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)

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
        guard let url = Bundle.main.url(forResource: "requiem-satb-plain", withExtension: "mid") else {
            errorText = "Bundled fixture not found"
            return
        }
        do {
            let parsed = try MIDIParser().parse(fileURL: url)
            engine.load(parsed: parsed, voicePart: voicePart, fileURL: url)
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
