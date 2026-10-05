"""Recover the six-staff systems in the three-movement Brahms PDF.

Pages 1, 11, and 18 open movements and have two systems; all others have
three. The scan hides one piano staff line on four pages, so the missing
box is inferred from a complete page with the same layout.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pymupdf

from recover_scan_staffs import hough_boxes


OPENINGS = {1, 11, 18}


def recover_missing(observed: list[tuple[float, float]], reference: list[tuple[float, float]]) -> tuple[list[list[float]], list[int]]:
    expected = len(reference)
    if len(observed) == expected:
        return [[float(a), float(b)] for a, b in observed], []
    if len(observed) != expected - 1:
        raise ValueError(f"Expected {expected - 1} or {expected} staff boxes, got {len(observed)}")
    ref = np.array([top for top, _ in reference])
    obs = np.array([top for top, _ in observed])
    candidates = []
    for missing in range(expected):
        kept = np.delete(ref, missing)
        slope, shift = np.polyfit(kept, obs, 1)
        error = float(np.sqrt(np.mean((obs - (slope * kept + shift)) ** 2)))
        candidates.append((error, missing, slope, shift))
    error, missing, slope, shift = min(candidates)
    if error > 12:
        raise ValueError(f"Staff recovery residual {error:.1f} points")
    result = [[float(a), float(b)] for a, b in observed]
    result.insert(missing, [float(slope * reference[missing][0] + shift),
                            float(slope * reference[missing][1] + shift)])
    return result, [missing]


def build(pdf: Path) -> tuple[dict[str, list[list[float]]], dict[str, list[int]]]:
    with pymupdf.open(pdf) as doc:
        references = {2: hough_boxes(doc[10]), 3: hough_boxes(doc[4])}
        if len(references[2]) != 12 or len(references[3]) != 18:
            raise ValueError("Reference pages no longer have complete staff grids")
        boxes, inferred = {}, {}
        for page, image in enumerate(doc, 1):
            count = 2 if page in OPENINGS else 3
            try:
                rows, missing = recover_missing(hough_boxes(image), references[count])
            except ValueError as exc:
                raise ValueError(f"Page {page}: {exc}") from exc
            boxes[str(page)] = rows
            if missing:
                inferred[str(page)] = missing
        return boxes, inferred


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    boxes, inferred = build(args.pdf)
    args.output.write_text(json.dumps(boxes, indent=2) + "\n")
    print(f"Recovered {len(boxes)} pages; inferred staff indices: {inferred}")
