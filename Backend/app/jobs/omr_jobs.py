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

import pymupdf

from app.core.config import get_settings
from app.db import session as db_session
from app.db.models import OmrJob, OmrJobStatus, PieceVersion, VersionSource
from app.omr.paged import run_omr_paged
from app.omr.pipeline import OmrEngineUnavailable, run_omr
from app.services.pieces import add_version, get_piece_or_404
from app.storage.files import load_file, save_file


def _page_count(path: Path) -> int:
    """Page count of a PDF (or 1 for a plain image / an unreadable file),
    to decide whether the paged pipeline is worth it."""
    try:
        with pymupdf.open(path) as doc:
            return doc.page_count
    except Exception:  # noqa: BLE001 - a non-PDF or garbage input is just "one page"
        return 1


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
        storage_dir = Path(settings.storage_dir)
        source_path = storage_dir / job.source_file_path
        output_dir = _job_output_dir(job_id)

        # A multi-page PDF is transcribed page-by-page and re-merged so one
        # bad page doesn't sink the whole book export (Audiveris's
        # all-or-nothing default). A single page, or an Audiveris that
        # isn't installed, falls back to the B8 single-run pipeline.
        use_paged = settings.omr_paged_multipage and _page_count(source_path) > 1
        try:
            if use_paged:
                try:
                    musicxml_path, midi_path, report = run_omr_paged(source_path, output_dir)
                except OmrEngineUnavailable:
                    musicxml_path, midi_path = run_omr(source_path, output_dir)
                    report = None
            else:
                musicxml_path, midi_path = run_omr(source_path, output_dir)
                report = None
        except Exception as exc:  # noqa: BLE001 — any engine/parse failure must land the job as `failed`, never leave it stuck `running`
            job.status = OmrJobStatus.failed
            job.error_message = str(exc) or exc.__class__.__name__
            db.commit()
            return

        job.status = OmrJobStatus.done
        job.result_musicxml_path = str(musicxml_path.relative_to(storage_dir))
        job.result_midi_path = str(midi_path.relative_to(storage_dir))
        if report is not None:
            job.paged = True
            job.needs_review = report.needs_review
            job.paged_report_path = str(
                (output_dir / "paged-report.json").relative_to(storage_dir)
            )
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
