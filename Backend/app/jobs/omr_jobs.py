"""Background-task-based OMR job runner (not a real queue yet — see
Backend/plan.md backlog: "Real job queue (Celery/RQ) if background-task
processing proves too slow/blocking").

FastAPI's `BackgroundTasks` runs this in the same process after the
response is sent, so it needs its own DB session rather than the
request-scoped one `get_db` hands to route handlers. Looked up via the
`app.db.session` module (not `from ... import SessionLocal`) so tests can
monkeypatch `app.db.session.SessionLocal` to the test engine and have
that take effect here too.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings
from app.db import session as db_session
from app.db.models import OmrJob, OmrJobStatus
from app.omr.pipeline import run_omr


def _job_output_dir(job_id: str) -> Path:
    return Path(get_settings().storage_dir) / "omr_jobs" / job_id


def run_omr_job(job_id: str) -> None:
    db = db_session.SessionLocal()
    try:
        job = db.get(OmrJob, job_id)
        if job is None:
            return

        job.status = OmrJobStatus.running
        db.commit()

        settings = get_settings()
        source_path = Path(settings.storage_dir) / job.source_file_path
        output_dir = _job_output_dir(job_id)

        try:
            musicxml_path, midi_path = run_omr(source_path, output_dir)
        except Exception as exc:  # noqa: BLE001 — any engine/parse failure must land the job as `failed`, never leave it stuck `running`
            job.status = OmrJobStatus.failed
            job.error_message = str(exc) or exc.__class__.__name__
            db.commit()
            return

        job.status = OmrJobStatus.done
        job.result_musicxml_path = str(musicxml_path.relative_to(Path(settings.storage_dir)))
        job.result_midi_path = str(midi_path.relative_to(Path(settings.storage_dir)))
        db.commit()
    finally:
        db.close()
