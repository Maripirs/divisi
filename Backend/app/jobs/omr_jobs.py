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
from app.db.models import OmrJob, OmrJobStatus, PieceVersion, VersionSource
from app.omr.pipeline import run_omr
from app.services.pieces import add_version, get_piece_or_404
from app.storage.files import load_file, save_file


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

        # Job started against an existing track ("Generate music from PDF"
        # on the Tracks tab): land the derived MIDI as a *draft* version on
        # that piece automatically. No submit/approve/distribute — OMR
        # output is rough, so an admin reviews it before it goes live.
        if job.piece_id is not None:
            try:
                _import_draft_version(job, db)
            except Exception as exc:  # noqa: BLE001 — a post-processing failure must land the job as `failed`, not leave a stuck `done`
                db.rollback()
                job.status = OmrJobStatus.failed
                job.error_message = str(exc) or exc.__class__.__name__
                db.commit()
    finally:
        db.close()


def _import_draft_version(job: OmrJob, db) -> None:
    """Turn a finished job's derived MIDI into a draft `PieceVersion` on
    `job.piece_id`. Deliberately does NOT reuse `POST /omr/jobs/{id}/import`
    (`app/api/routes/omr.py`): that path never carries the piece's current
    PDF forward, so an OMR'd draft would lose its readable score. Here the
    latest version's PDF is passed through so the draft has both."""
    piece = get_piece_or_404(job.piece_id, db)

    # Own copy of the result MIDI, not a pointer at `result_midi_path` — a
    # version's file must outlive the job (same reasoning as `import_job_result`).
    suffix = Path(job.result_midi_path).suffix
    midi_path = save_file(load_file(job.result_midi_path), suffix=suffix)

    latest = (
        db.query(PieceVersion)
        .filter(PieceVersion.piece_id == piece.id)
        .order_by(PieceVersion.created_at.desc())
        .first()
    )
    add_version(
        piece=piece,
        created_by=job.user_id,
        file_path=midi_path,
        source=VersionSource.modification,
        db=db,
        pdf_file_path=latest.pdf_file_path if latest is not None else None,
        pdf_file_name=latest.pdf_file_name if latest is not None else None,
    )
