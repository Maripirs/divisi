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
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
