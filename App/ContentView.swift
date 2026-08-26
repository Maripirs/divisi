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

            PlaybackSmokeTestView()
                .padding(.top, 24)
        }
        .padding()
    }
}

/// Temporary M3 smoke test: plays a bundled fixture through
/// `DivisiPlaybackService` so playback can actually be heard on a
/// simulator/device before the real import/voice-part/roll UI exists.
/// Replaced by the real shell in M5.
private struct PlaybackSmokeTestView: View {
    @State private var service = DivisiPlaybackService()
    @State private var positionMs = 0
    @State private var isPlaying = false
    @State private var errorText: String?
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 8) {
            Text(String(format: "%.1fs", Double(positionMs) / 1000))
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)

            Button(isPlaying ? "Pause" : "▶ Play (M3 smoke test)") {
                toggle()
            }
            .buttonStyle(.bordered)

            if let errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .onDisappear { pollTask?.cancel() }
    }

    private func toggle() {
        do {
            if !service.isLoaded {
                guard let url = Bundle.main.url(forResource: "requiem-satb-plain", withExtension: "mid") else {
                    errorText = "Bundled fixture not found"
                    return
                }
                try service.load(fileURL: url)
                pollTask = service.startPolling { positionMs = $0; isPlaying = $1 }
            }
            if service.isPlaying {
                service.pause()
            } else {
                try service.play()
            }
        } catch {
            errorText = "\(error)"
        }
    }
}

#Preview {
    ContentView()
}
