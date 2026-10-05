"""Recover a scanned score's staff boxes using long, slightly slanted lines.

Use the generated JSON as a reviewed ``--staff-overrides`` input for
``extract_lyric_lanes.py``. A reference page with a complete staff grid
supplies the expected vertical layout when the scan hides a line.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import pymupdf

from app.lyrics.staff_pdf import _cluster_lines


def hough_boxes(page: pymupdf.Page) -> list[tuple[float, float]]:
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), colorspace=pymupdf.csGRAY)
    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width))
    dark = (image < 180).astype(np.uint8) * 255
    lines = cv2.HoughLinesP(
        dark, 1, np.pi / 1800, threshold=80,
        minLineLength=int(pix.width * 0.4), maxLineGap=20,
    )
    if lines is None:
        return []
    candidates = sorted(
        ((y1 + y2) / 4, int(x2 - x1))
        for x1, y1, x2, y2 in lines.reshape(-1, 4)
        if abs(y2 - y1) / (abs(x2 - x1) + 1) < 0.04
    )
    clusters: list[list[tuple[float, int]]] = []
    for y, length in candidates:
        if clusters and y - clusters[-1][-1][0] < 2.4:
            clusters[-1].append((y, length))
        else:
            clusters.append([(y, length)])
    ys = [sum(y * length for y, length in cluster) / sum(length for _, length in cluster)
          for cluster in clusters]
    return _cluster_lines(ys)


def fill_from_reference(
    observed: list[tuple[float, float]], reference: list[tuple[float, float]],
    staves_per_system: int,
) -> tuple[list[list[float]], list[int]]:
    expected = len(reference)
    if len(observed) == expected:
        return [[float(a), float(b)] for a, b in observed], []
    if len(observed) < expected - 3:
        raise ValueError(f"Only {len(observed)} of {expected} staff boxes detected")
    # Match each observed staff to the nearest reference position, allowing
    # for the small page-to-page vertical drift in a bound scan.
    ref_tops = [a for a, _ in reference]
    offsets = [a - min(ref_tops, key=lambda r: abs(a - r)) for a, _ in observed]
    shift = float(np.median(offsets))
    assigned: dict[int, tuple[float, float]] = {}
    for box in observed:
        index = min(range(expected), key=lambda i: abs(box[0] - ref_tops[i] - shift))
        if abs(box[0] - ref_tops[index] - shift) > 18 or index in assigned:
            raise ValueError(f"Cannot assign staff at {box[0]:.1f} to reference")
        assigned[index] = box
    missing = [i for i in range(expected) if i not in assigned]
    recovered: list[list[float]] = []
    for i, (top, bottom) in enumerate(reference):
        if i in assigned:
            recovered.append([float(assigned[i][0]), float(assigned[i][1])])
        else:
            system = i // staves_per_system
            deltas = [assigned[j][0] - reference[j][0] for j in assigned
                      if j // staves_per_system == system]
            local_shift = float(np.median(deltas)) if deltas else shift
            recovered.append([top + local_shift, bottom + local_shift])
    return recovered, missing


def recover(
    pdf: Path, reference_page: int, staves_per_system: int, systems_per_page: int,
) -> tuple[dict[str, list[list[float]]], dict[str, list[int]]]:
    with pymupdf.open(pdf) as doc:
        reference = hough_boxes(doc[reference_page - 1])
        expected = staves_per_system * systems_per_page
        if len(reference) != expected:
            raise ValueError(f"Reference page has {len(reference)} staves, expected {expected}")
        overrides, missing_by_page = {}, {}
        for i, page in enumerate(doc, 1):
            observed = hough_boxes(page)
            if i < reference_page and len(observed) == staves_per_system:
                boxes = [[float(a), float(b)] for a, b in observed]
                missing = []
            else:
                boxes, missing = fill_from_reference(observed, reference, staves_per_system)
            overrides[str(i)] = boxes
            if missing:
                missing_by_page[str(i)] = missing
        return overrides, missing_by_page


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--reference-page", type=int, required=True)
    parser.add_argument("--staves-per-system", type=int, required=True)
    parser.add_argument("--systems-per-page", type=int, required=True)
    args = parser.parse_args()
    boxes, gaps = recover(args.pdf, args.reference_page, args.staves_per_system, args.systems_per_page)
    args.output.write_text(json.dumps(boxes, indent=2) + "\n")
    print(f"Recovered {len(boxes)} pages; manually review inferred staff indices: {gaps}")
