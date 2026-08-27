"""Audiveris subprocess wrapper: batch-mode PDF/image -> MusicXML export.

Audiveris is a Java application, not a Python package, so there's no
"import" path here — this shells out to its CLI, the same pattern as
`app/rendering/synth.py` uses for FluidSynth. Not installed in this dev
sandbox (see Backend/plan.md's B8 human task, install path not yet
decided): the subprocess plumbing below is real, but "Audiveris correctly
transcribes a real scanned score" is unverified until that install
happens and a real test PDF is run through it.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.core.config import get_settings


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
    result = subprocess.run(
        [bin_name, "-batch", "-export", "-output", str(output_dir), str(source_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise OmrEngineError(f"audiveris failed ({result.returncode}): {result.stderr.strip()}")

    exported = sorted(output_dir.glob("*.mxl"))
    if not exported:
        raise OmrEngineError("audiveris reported success but produced no .mxl output")
    return exported[0]
