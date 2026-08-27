"""OMR routes: upload a scanned sheet-music PDF, get a job id back,
poll it for MusicXML/MIDI output. See B8 in Backend/plan.md.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import OmrJobOut
from app.core.config import get_settings
from app.db.models import OmrJob, OmrJobStatus, User
from app.db.session import get_db
from app.jobs.omr_jobs import run_omr_job
from app.storage.files import save_file

router = APIRouter(prefix="/omr", tags=["omr"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "omr stub — see B8 in plan.md"}


def _job_out(job: OmrJob) -> OmrJobOut:
    base = f"/omr/jobs/{job.id}/result"
    return OmrJobOut(
        id=job.id,
        status=job.status,
        error_message=job.error_message,
        musicxml_url=f"{base}/musicxml" if job.result_musicxml_path else None,
        midi_url=f"{base}/midi" if job.result_midi_path else None,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _get_own_job_or_404(job_id: str, current_user: User, db: Session) -> OmrJob:
    job = db.get(OmrJob, job_id)
    # 404 (not 403) for someone else's job id too — a job id shouldn't let
    # a caller confirm it even exists, same non-disclosure stance as B6's
    # guest routes take on unknown-vs-not-yours.
    if job is None or job.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/jobs", response_model=OmrJobOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrJobOut:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    suffix = "".join(("." + file.filename.rsplit(".", 1)[-1]) if file.filename and "." in file.filename else "")
    file_path = save_file(data, suffix=suffix)

    job = OmrJob(user_id=current_user.id, status=OmrJobStatus.pending, source_file_path=file_path)
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(run_omr_job, job.id)
    return _job_out(job)


@router.get("/jobs/{job_id}", response_model=OmrJobOut)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrJobOut:
    job = _get_own_job_or_404(job_id, current_user, db)
    return _job_out(job)


@router.get("/jobs/{job_id}/result/{kind}")
def get_job_result(
    job_id: str,
    kind: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    job = _get_own_job_or_404(job_id, current_user, db)
    result_path = {"musicxml": job.result_musicxml_path, "midi": job.result_midi_path}.get(kind)
    if result_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not available")
    return FileResponse(Path(get_settings().storage_dir) / result_path)
