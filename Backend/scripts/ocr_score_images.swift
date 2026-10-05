import Foundation
import AppKit
import Vision
import ImageIO

// One JSON line per image, preserving the input order. Coordinates are
// Apple's normalized image coordinates, with the origin at bottom left.
for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fputs("Could not open image: \(path)\n", stderr)
        exit(1)
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    do {
        try VNImageRequestHandler(cgImage: image).perform([request])
        let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let box = observation.boundingBox
            return ["text": candidate.string, "x": box.minX, "y": box.minY,
                    "width": box.width, "height": box.height,
                    "confidence": candidate.confidence]
        }
        let data = try JSONSerialization.data(withJSONObject: ["path": path, "lines": lines])
        print(String(data: data, encoding: .utf8)!)
    } catch {
        fputs("OCR failed for \(path): \(error)\n", stderr)
        exit(1)
    }
}
