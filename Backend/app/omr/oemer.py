"""oemer wrapper: rasterizes a source file's first page to PNG and runs
the `oemer` CLI on it.

The B1 scaffold's plan.md note assumed this would be a "direct import"
wrapper, on the premise oemer exposes a stable Python API. It doesn't —
its only documented, stable entry point is the CLI — so this shells out
instead, the same call shape as `audiveris.py` and
`app/rendering/synth.py`. Deviation logged in Backend/plan.md.

oemer only processes single images, not multi-page PDFs, so this engine
is a single-page (first page only) fallback for when Audiveris isn't
available — see `pipeline.py` for the chaining logic. Doesn't ship with
the app — see Backend/README.md's OMR section for the local install
recipe and known macOS-only gotchas (a `pip install oemer` dependency
issue, a CoreML/onnxruntime crash, an OpenCV shape-mismatch bug in
oemer's own code). Verified end-to-end on macOS (B8), but its output is
structurally weaker than Audiveris's: it flattens every staff into one
part (SATB notes come out stacked as chords in a single `Piano` part,
not four separate parts) and has no OCR step at all, so lyrics are never
captured. Confirms the engine priority in `pipeline.py` — this is a
last-resort fallback, not a substitute for Audiveris on real choral
scores.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pymupdf

from app.core.config import get_settings
from app.omr._subprocess import log_tail, run_logged
from app.omr.audiveris import OmrEngineError, OmrEngineUnavailable

__all__ = ["OmrEngineError", "OmrEngineUnavailable", "run_oemer"]


def _rasterize_first_page(source_path: Path, output_dir: Path, dpi: int | None = None) -> Path:
    """PyMuPDF opens PDFs and common raster image formats alike, so this
    works whether `source_path` is a scanned PDF or a plain image."""
    if dpi is None:
        dpi = get_settings().oemer_dpi
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
    # oemer logs its stages (staffline extraction, symbol prediction,
    # note/rest grouping, MusicXML build) as it runs — the only progress
    # signal on a multi-minute CPU inference. `run_logged` tees it to the
    # console and to `oemer.log` in the output dir.
    log_path = output_dir / "oemer.log"
    code = run_logged([bin_name, str(image_path), "-o", str(output_dir)], log_path)
    if code != 0:
        tail = log_tail(log_path)
        raise OmrEngineError(f"oemer failed ({code}); see {log_path}\n{tail}".rstrip())

    exported = sorted(output_dir.glob("*.musicxml"))
    if not exported:
        raise OmrEngineError("oemer reported success but produced no .musicxml output")
    return exported[0]
