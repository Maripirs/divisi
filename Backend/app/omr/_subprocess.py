"""Run an OMR engine subprocess while teeing its output to a log file.

The engines (Audiveris, oemer) log each step as they go — on a long run
that's the only progress signal there is. `run_logged` streams their
combined stdout/stderr to this process's console *and* writes it to a
`<engine>.log` file in the output directory, so there's a persistent
record afterwards (a per-page `pages/pNN/audiveris.log` is the trail for
diagnosing which page crashed a paged run — see `app/omr/paged.py`).

Ported from the standalone `omr-local` tool, which proved the pattern.
B8's original wrappers used `subprocess.run(capture_output=True)` and put
`stderr` straight into the error message; here `log_tail()` reads the end
of the log file for the same purpose.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_ERROR_TAIL_BYTES = 2000


def run_logged(cmd: list[str], log_path: Path) -> int:
    """Run `cmd`, teeing combined stdout/stderr to both this process's
    console and `log_path`. Returns the child's exit code."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w", encoding="utf-8") as log:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            log.write(line)
            log.flush()
        return proc.wait()


def log_tail(log_path: Path, limit: int = _ERROR_TAIL_BYTES) -> str:
    """The last `limit` bytes of `log_path`, for putting into an engine
    error message. Empty string if the file is missing/unreadable."""
    try:
        data = log_path.read_bytes()
    except OSError:
        return ""
    tail = data[-limit:].decode("utf-8", errors="replace").strip()
    if len(data) > limit:
        tail = "…" + tail
    return tail
