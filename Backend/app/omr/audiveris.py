"""Audiveris subprocess wrapper: batch-mode PDF/image -> MusicXML export.

Audiveris is a Java application, not a Python package, so there's no
"import" path here — this shells out to its CLI, the same pattern as
`app/rendering/synth.py` uses for FluidSynth. Doesn't ship with the app —
see Backend/README.md's OMR section for the local install recipe.
Verified end-to-end on macOS against a real 4-part choral scan (B8):
correctly recovers per-part (SATB) structure and OCR'd lyrics, provided
the per-step timeout is raised (see `audiveris_step_timeout_seconds`) and
Tesseract's `eng.traineddata` is installed — without it, the TEXTS step
runs but silently produces no lyrics at all.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import get_settings
from app.omr._subprocess import log_tail, run_logged


class OmrEngineUnavailable(Exception):
    """The engine's executable isn't installed/on PATH on this machine."""


class OmrEngineError(Exception):
    """The engine ran but failed (bad input, internal error, etc)."""


def run_audiveris(source_path: Path, output_dir: Path) -> Path:
    """Runs Audiveris in batch mode on `source_path` (PDF or image),
    exporting MusicXML into `output_dir`. Returns the path to the
    resulting `.mxl` (compressed MusicXML) file.

    Audiveris natively treats a multi-page PDF as a single "book" and
    exports one `.mxl` for it, which is why it's the preferred engine
    over oemer's page-at-a-time image pipeline (see `pipeline.py`).
    """
    bin_name = get_settings().audiveris_bin
    if shutil.which(bin_name) is None:
        raise OmrEngineUnavailable(f"'{bin_name}' executable not found on PATH")

    output_dir.mkdir(parents=True, exist_ok=True)
    timeout = get_settings().audiveris_step_timeout_seconds
    # Audiveris logs each step (LOAD, BINARY, SCALE, GRID, HEADERS, HEADS,
    # STEMS, TEXTS, ...) as it goes — on a long run that's the only
    # progress signal there is. `run_logged` tees it to the console and to
    # `audiveris.log` in the output dir so there's a record afterwards.
    log_path = output_dir / "audiveris.log"
    code = run_logged(
        [
            bin_name,
            "-batch",
            "-export",
            "-constant",
            f"org.audiveris.omr.Main.sheetStepTimeOut={timeout}",
            "-output",
            str(output_dir),
            str(source_path),
        ],
        log_path,
    )
    if code != 0:
        tail = log_tail(log_path)
        raise OmrEngineError(f"audiveris failed ({code}); see {log_path}\n{tail}".rstrip())

    exported = sorted(output_dir.glob("*.mxl"))
    if not exported:
        raise OmrEngineError("audiveris reported success but produced no .mxl output")
    return exported[0]
