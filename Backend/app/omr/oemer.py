"""oemer wrapper: rasterizes a source file's first page to PNG and runs
the `oemer` CLI on it.

The B1 scaffold's plan.md note assumed this would be a "direct import"
wrapper, on the premise oemer exposes a stable Python API. It doesn't —
its only documented, stable entry point is the CLI — so this shells out
instead, the same call shape as `audiveris.py` and
`app/rendering/synth.py`. Deviation logged in Backend/plan.md.

oemer only processes single images, not multi-page PDFs, so this engine
is a single-page (first page only) fallback for when Audiveris isn't
available — see `pipeline.py` for the chaining logic. Not installed in
this dev sandbox (see Backend/plan.md's B8 human task): the rasterization
step is real and tested, but "oemer correctly transcribes a real scanned
page" is unverified until it's actually installed.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pymupdf

from app.core.config import get_settings
from app.omr.audiveris import OmrEngineError, OmrEngineUnavailable

__all__ = ["OmrEngineError", "OmrEngineUnavailable", "run_oemer"]


def _rasterize_first_page(source_path: Path, output_dir: Path, dpi: int = 300) -> Path:
    """PyMuPDF opens PDFs and common raster image formats alike, so this
    works whether `source_path` is a scanned PDF or a plain image."""
    doc = pymupdf.open(source_path)
    try:
        if doc.page_count == 0:
            raise OmrEngineError("Source file has no pages")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=dpi)
        image_path = output_dir / "page-1.png"
        pix.save(str(image_path))
        return image_path
    finally:
        doc.close()


def run_oemer(source_path: Path, output_dir: Path) -> Path:
    """Runs oemer on `source_path`'s first page, exporting MusicXML into
    `output_dir`. Returns the path to the resulting `.musicxml` file."""
    bin_name = get_settings().oemer_bin
    if shutil.which(bin_name) is None:
        raise OmrEngineUnavailable(f"'{bin_name}' executable not found on PATH")

    output_dir.mkdir(parents=True, exist_ok=True)
    image_path = _rasterize_first_page(source_path, output_dir)
    result = subprocess.run(
        [bin_name, str(image_path), "-o", str(output_dir)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise OmrEngineError(f"oemer failed ({result.returncode}): {result.stderr.strip()}")

    exported = sorted(output_dir.glob("*.musicxml"))
    if not exported:
        raise OmrEngineError("oemer reported success but produced no .musicxml output")
    return exported[0]
