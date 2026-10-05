"""Extract printed lyric lanes by staff and system from a choral PDF.

The geometry result is evidence for review, not an automatic claim that
every word was recognized. A page with an incomplete staff count is
reported as such instead of silently assigning words to wrong voices.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf

VOICES = ("soprano", "alto", "tenor", "bass")
_LETTERS = re.compile(r"[A-Za-zÀ-ÿ]")
_DYNAMICS = {"f", "ff", "fff", "p", "pp", "ppp", "mf", "mp", "sf", "sfz", "fp", "rf", "dim", "cresc"}


def _cluster_lines(ys: list[float]) -> list[tuple[float, float]]:
    lines: list[float] = []
    for y in sorted(ys):
        if not lines or y - lines[-1] > 0.7:
            lines.append(y)
    groups: list[list[float]] = []
    for y in lines:
        if not groups or y - groups[-1][-1] > 10:
            groups.append([y])
        else:
            groups[-1].append(y)
    return [(g[0], g[-1]) for g in groups if 4 <= len(g) <= 6 and 9 <= g[-1] - g[0] <= 25]


def _raster_staff_boxes(page: pymupdf.Page) -> list[tuple[float, float]]:
    # OpenCV is used only for PDFs whose staves were rasterized. The
    # text-layer/vector path works without it.
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("Raster staff detection needs opencv-python-headless") from exc
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), colorspace=pymupdf.csGRAY)
    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width))
    bw = (image < 170).astype("uint8") * 255
    width = max(100, round(pix.width * 0.12))
    horizontal = cv2.morphologyEx(bw, cv2.MORPH_OPEN, np.ones((1, width), np.uint8))
    counts = (horizontal > 0).sum(axis=1)
    ys = np.where(counts > pix.width * 0.085)[0]
    clusters: list[list[int]] = []
    for y in ys:
        if not clusters or y > clusters[-1][-1] + 2:
            clusters.append([int(y)])
        else:
            clusters[-1].append(int(y))
    lines = [float(np.mean(c)) / 2 for c in clusters if max(counts[c]) > pix.width * 0.20]
    return _cluster_lines(lines)


def staff_boxes(page: pymupdf.Page) -> list[tuple[float, float]]:
    vector_lines: list[float] = []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            a, b = item[1:3]
            if abs(a.y - b.y) < 0.5 and abs(a.x - b.x) > page.rect.width * 0.1:
                vector_lines.append(float(a.y))
    boxes = _cluster_lines(vector_lines)
    return boxes or _raster_staff_boxes(page)


def extract_lyric_systems(
    pdf_path: str | Path, *, staves_per_system: int = 4,
    ocr_jsonl: str | Path | None = None,
    staff_overrides: dict[str, list[list[float]]] | None = None,
    system_map: dict[str, list[dict[str, int]]] | None = None,
    lyric_gap_min: float = 4,
    lyric_gap_max: float = 21,
) -> list[dict]:
    """Return one evidence row per page, with SATB lines per complete system.

    OCR input is one JSON object per page from `ocr_score_images.swift`.
    Pages without a complete staff grid return a warning and no systems.
    The caller must review these pages before using any lyric list.
    """
    ocr = None
    if ocr_jsonl is not None:
        ocr = [json.loads(line) for line in Path(ocr_jsonl).read_text().splitlines()]
    result: list[dict] = []
    with pymupdf.open(pdf_path) as doc:
        if ocr is not None and len(ocr) != len(doc):
            raise ValueError("OCR page count differs from PDF page count")
        for page_index, page in enumerate(doc):
            staves = (
                [tuple(pair) for pair in staff_overrides[str(page_index + 1)]]
                if staff_overrides and str(page_index + 1) in staff_overrides
                else staff_boxes(page)
            )
            row = {"page": page_index + 1, "staff_count": len(staves), "systems": []}
            page_map = system_map.get(str(page_index + 1)) if system_map else None
            if page_map is None and (len(staves) == 0 or len(staves) % staves_per_system):
                row["warning"] = "Incomplete staff grid; review this page manually"
                result.append(row)
                continue
            if page_map is None:
                page_map = [
                    {voice: system * staves_per_system + i for i, voice in enumerate(VOICES)}
                    for system in range(len(staves) // staves_per_system)
                ]
            if any(voice not in VOICES or staff < 0 or staff >= len(staves)
                   for mapping in page_map for voice, staff in mapping.items()):
                raise ValueError(f"Invalid staff index or voice on page {page_index + 1}")
            by_staff: dict[int, list[tuple[float, str]]] = {i: [] for i in range(len(staves))}
            if ocr is None:
                words = [(x0, y0, word) for x0, y0, _x1, _y1, word, *_ in page.get_text("words")]
            else:
                words = [
                    (page.rect.width * item["x"], page.rect.height * (1 - item["y"] - item["height"]), item["text"])
                    for item in ocr[page_index]["lines"]
                ]
            for x0, y0, word in words:
                if not _LETTERS.search(word) or word.lower() in _DYNAMICS:
                    continue
                matches = [(i, y0 - bottom) for i, (_top, bottom) in enumerate(staves)
                           if lyric_gap_min < y0 - bottom < lyric_gap_max]
                if matches:
                    staff, _distance = min(matches, key=lambda pair: pair[1])
                    by_staff[staff].append((x0, word))
            for system, mapping in enumerate(page_map):
                voices = {}
                for voice in VOICES:
                    staff = mapping.get(voice)
                    voices[voice] = " ".join(word for _x, word in sorted(by_staff[staff])) if staff is not None else ""
                row["systems"].append({"index": system + 1, "voices": voices})
            result.append(row)
    return result
