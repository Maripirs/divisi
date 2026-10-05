"""Render a score PDF and OCR it with macOS Vision, one JSON line per page.

This is an evidence extractor for scanned PDFs. Review every line against
the PDF before turning it into MusicXML lyrics.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
from pathlib import Path

import pymupdf


def ocr_pdf(pdf: Path, output: Path, *, scale: float = 2) -> int:
    source = Path(__file__).with_name("ocr_score_images.swift")
    with tempfile.TemporaryDirectory(prefix="sfcc-ocr-") as temporary:
        work = Path(temporary)
        binary = work / "ocr-score-images"
        cache = work / "module-cache"
        cache.mkdir()
        env = os.environ | {
            "SWIFT_MODULECACHE_PATH": str(cache),
            "CLANG_MODULE_CACHE_PATH": str(cache),
        }
        subprocess.run(["swiftc", str(source), "-o", str(binary)], check=True, env=env)
        images: list[str] = []
        with pymupdf.open(pdf) as doc:
            for index, page in enumerate(doc):
                image = work / f"page-{index + 1:04d}.png"
                page.get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(image)
                images.append(str(image))
        result = subprocess.run([str(binary), *images], text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f"Vision OCR failed: {result.stderr.strip()}")
        rows = result.stdout.splitlines()
        if len(rows) != len(images):
            raise ValueError(f"OCR returned {len(rows)} pages for {len(images)} PDF pages")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(result.stdout)
        return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=2, help="PDF rendering scale for OCR")
    args = parser.parse_args()
    print(f"OCR saved for {ocr_pdf(args.pdf, args.output, scale=args.scale)} pages")
