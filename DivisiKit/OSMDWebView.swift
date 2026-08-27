import SwiftUI
import WebKit

/// Drives the OpenSheetMusicDisplay instance living in `osmd/index.html`
/// (M4) — load a MusicXML score, step its cursor, report score taps, or
/// clear it. Owned by `DivisiSyncEngine`; `OSMDWebView` just wires a live
/// `WKWebView` into it.
///
/// The JS side is the source of truth for "where is the cursor" — see
/// `index.html`'s `divisiSetCursorTimestamp` — so this controller is a thin,
/// mostly-stateless relay rather than mirroring cursor position itself.
@MainActor
final class OSMDController: NSObject, ObservableObject {
    // fileprivate(set), not private(set): OSMDWebView.Coordinator (same
    // file) reports readiness/errors in from the JS message handler.
    @Published fileprivate(set) var isReady = false
    @Published fileprivate(set) var errorText: String?

    fileprivate weak var webView: WKWebView?
    var onSeekTimestamp: ((Double) -> Void)?
    /// Whether the WKWebView has actually finished loading `index.html` —
    /// `SwiftUI` calls `loadScore` from `.onAppear` essentially
    /// synchronously with `makeUIView`, well before the page's `<script>`
    /// tags (and hence `divisiLoadScore`) exist, so a naive
    /// `evaluateJavaScript` call there would silently fail. Any call that
    /// arrives first is queued and flushed once `pageLoaded` flips true.
    fileprivate var pageLoaded = false
    private var pendingXML: String?
    private var currentZoom: Double = 0.85

    func loadScore(xml: String, zoom: Double) {
        isReady = false
        errorText = nil
        currentZoom = zoom
        guard pageLoaded else {
            pendingXML = xml
            return
        }
        run("divisiLoadScore(`\(Self.escape(xml))`, \(zoom))")
    }

    func setZoom(_ zoom: Double) {
        currentZoom = zoom
        guard pageLoaded else { return }
        run("divisiSetZoom(\(zoom))")
    }

    /// Moves the cursor to `wholeNotes` (a position in the score measured in
    /// whole notes from the start — the same unit OSMD's own cursor
    /// iterator reports), regardless of how many parts are currently
    /// rendered.
    func setCursorTimestamp(_ wholeNotes: Double) {
        guard isReady else { return }
        run("divisiSetCursorTimestamp(\(wholeNotes))")
    }

    /// Hides the cursor and drops the ready flag — used for "no file
    /// loaded" / "no notes for this voice part" states so the last score
    /// doesn't linger on screen with a stranded cursor.
    func clear() {
        isReady = false
        pendingXML = nil
        guard pageLoaded else { return }
        run("divisiClear()")
    }

    /// Called by `OSMDWebView.Coordinator` once `index.html` finishes
    /// loading; flushes whatever `loadScore` call arrived too early.
    fileprivate func pageDidLoad() {
        pageLoaded = true
        if let pendingXML {
            self.pendingXML = nil
            loadScore(xml: pendingXML, zoom: currentZoom)
        }
    }

    private func run(_ script: String) {
        webView?.evaluateJavaScript(script) { [weak self] _, error in
            guard let self, let error else { return }
            // WKWebView can't marshal a Promise back across the JS bridge,
            // so calling any `async function` here — like `divisiLoadScore`
            // — always reports this specific error even when the script
            // ran fine and its promise later resolves normally. The
            // authoritative success/failure signal is the "ready"/"error"
            // message posted from JS (see `userContentController`), not
            // this completion handler.
            let nsError = error as NSError
            let isBenignAsyncResult = nsError.domain == WKError.errorDomain
                && nsError.code == WKError.javaScriptResultTypeIsUnsupported.rawValue
            if !isBenignAsyncResult {
                self.errorText = "JS eval failed: \(error)"
            }
        }
    }

    private static func escape(_ xml: String) -> String {
        xml
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "`", with: "\\`")
            .replacingOccurrences(of: "${", with: "\\${")
    }
}

/// SwiftUI wrapper around the `WKWebView` that hosts OpenSheetMusicDisplay.
/// Mirrors the massimobio Swift/WKWebView example's approach of loading a
/// bundled local HTML page with `loadFileURL(_:allowingReadAccessTo:)` so
/// the page's relative `<script src="opensheetmusicdisplay.min.js">` and
/// the JS-message-handler bridge both work fully offline.
struct OSMDWebView: UIViewRepresentable {
    let controller: OSMDController

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "divisi")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.scrollView.isScrollEnabled = true
        webView.navigationDelegate = context.coordinator
        controller.webView = webView

        // No `subdirectory:` — XcodeGen/Xcode's default "Copy Bundle
        // Resources" phase flattens loose files to the bundle root rather
        // than preserving the `Resources/osmd/` folder structure (that only
        // happens for an explicit blue "folder reference"), so this file
        // and `opensheetmusicdisplay.min.js` both land next to each other
        // at the top level — which is also why `index.html`'s relative
        // `<script src="opensheetmusicdisplay.min.js">` still resolves.
        if let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html") {
            let directoryURL = htmlURL.deletingLastPathComponent()
            webView.loadFileURL(htmlURL, allowingReadAccessTo: directoryURL)
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(controller: controller)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let controller: OSMDController

        init(controller: OSMDController) {
            self.controller = controller
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                controller.pageDidLoad()
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            Task { @MainActor in
                switch type {
                case "ready":
                    controller.isReady = true
                    controller.errorText = nil
                case "error":
                    controller.isReady = false
                    controller.errorText = body["message"] as? String ?? "Unknown OSMD error"
                case "seek":
                    guard let wholeNotes = body["wholeNotes"] as? Double else { return }
                    controller.onSeekTimestamp?(wholeNotes)
                default:
                    break
                }
            }
        }
    }
}
