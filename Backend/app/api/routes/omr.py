"""OMR routes: upload a scanned sheet-music PDF, get a job id back,
poll it for MusicXML/MIDI output. See B8 in Backend/plan.md.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    OmrImportOut,
    OmrImportRequest,
    OmrJobListItemOut,
    OmrJobOut,
    OmrPageRerunOut,
)
from app.core.config import get_settings
from app.db.models import OmrJob, OmrJobStatus, OwnerType, Piece, User, VersionSource
from app.db.session import get_db
from app.jobs.omr_jobs import _job_output_dir, run_omr_job
from app.omr.paged import _PAGE_XML_NAME, _page_len, rerun_page
from app.omr.pipeline import OmrEngineUnavailable
from app.services.pieces import (
    add_version,
    create_piece_with_version,
    get_piece_or_404,
    pending_generated_version_id,
    require_piece_access,
    resolve_new_piece_owner_id,
)

# How many of the caller's most recent jobs `GET /omr/jobs` returns. The
# header alert only cares about still-running jobs and ones that finished
# recently enough to still be worth a nudge; a caller with more than this
# many jobs in total has plenty of older, already-dealt-with ones we can
# safely leave out.
_JOB_LIST_LIMIT = 20
from app.storage.files import load_file, save_file

router = APIRouter(prefix="/omr", tags=["omr"])


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "omr stub — see B8 in plan.md"}


def _job_out(job: OmrJob) -> OmrJobOut:
    base = f"/omr/jobs/{job.id}/result"
    return OmrJobOut(
        id=job.id,
        piece_id=job.piece_id,
        status=job.status,
        error_message=job.error_message,
        musicxml_url=f"{base}/musicxml" if job.result_musicxml_path else None,
        midi_url=f"{base}/midi" if job.result_midi_path else None,
        paged=job.paged,
        needs_review=job.needs_review,
        report_url=f"/omr/jobs/{job.id}/paged-report" if job.paged_report_path else None,
        pages_done=job.pages_done,
        pages_total=job.pages_total,
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
    piece_id: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrJobOut:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    # Optional: attach the job to an existing piece. `run_omr_job` then
    # auto-imports the finished result as a *draft* version on that piece
    # (see app/jobs/omr_jobs.py) — the Tracks tab's "Generate music from
    # PDF" button. Gate it behind the same access check as any other
    # add-a-version path so a caller can't target a piece they can't edit.
    if piece_id is not None:
        require_piece_access(get_piece_or_404(piece_id, db), current_user.id, db)

    suffix = "".join(("." + file.filename.rsplit(".", 1)[-1]) if file.filename and "." in file.filename else "")
    file_path = save_file(data, suffix=suffix)

    job = OmrJob(
        user_id=current_user.id,
        piece_id=piece_id,
        status=OmrJobStatus.pending,
        source_file_path=file_path,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(run_omr_job, job.id)
    return _job_out(job)


@router.get("/jobs", response_model=list[OmrJobListItemOut])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OmrJobListItemOut]:
    """The caller's own OMR jobs, newest first — feeds the header alert
    that tells an admin a "Generate music from PDF" job they kicked off
    has finished (or failed). Jobs are already `user_id`-scoped, so "a
    piece *you* had generating" needs no group-role check here: if you
    started the job, it's yours to hear about.

    Left-joins `Piece` so a job whose piece was deleted still lists
    (with null title/group), rather than vanishing."""
    rows = (
        db.query(OmrJob, Piece)
        .outerjoin(Piece, Piece.id == OmrJob.piece_id)
        .filter(OmrJob.user_id == current_user.id)
        .order_by(OmrJob.created_at.desc())
        .limit(_JOB_LIST_LIMIT)
        .all()
    )
    out: list[OmrJobListItemOut] = []
    for job, piece in rows:
        group_id = piece.owner_id if piece is not None and piece.owner_type == OwnerType.group else None
        out.append(
            OmrJobListItemOut(
                id=job.id,
                status=job.status,
                error_message=job.error_message,
                piece_id=job.piece_id,
                piece_title=piece.title if piece is not None else None,
                group_id=group_id,
                pending_generated_version_id=(
                    pending_generated_version_id(job.piece_id, db) if job.piece_id is not None else None
                ),
                needs_review=job.needs_review,
                pages_done=job.pages_done,
                pages_total=job.pages_total,
                created_at=job.created_at,
                updated_at=job.updated_at,
            )
        )
    return out


@router.get("/jobs/{job_id}", response_model=OmrJobOut)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrJobOut:
    job = _get_own_job_or_404(job_id, current_user, db)
    return _job_out(job)


@router.post("/jobs/{job_id}/import", response_model=OmrImportOut, status_code=status.HTTP_201_CREATED)
def import_job_result(
    job_id: str,
    payload: OmrImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrImportOut:
    """Turns a finished OMR job into a library entry — either a brand-new
    piece or a new version of an existing one, mirroring `/library/pieces`
    and `/library/pieces/{id}/versions`' two upload shapes, and reusing
    their exact access-control/creation logic via `app/services/pieces.py`
    so this route can't drift from the library's own rules.

    Deliberately imports the job's derived `.mid`, not its `.musicxml`:
    a `PieceVersion`'s manifest endpoint (B7) only knows how to render a
    MIDI source, so this is what lets an OMR'd piece flow through the same
    stem/notation pipeline as any other version instead of needing a
    separate MusicXML playback path (see app/omr/pipeline.py).
    """
    job = _get_own_job_or_404(job_id, current_user, db)
    if job.status != OmrJobStatus.done or job.result_midi_path is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job has no result to import yet")

    wants_new_piece = payload.title is not None
    wants_existing_piece = payload.piece_id is not None
    if wants_new_piece == wants_existing_piece:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide exactly one of piece_id (add a version) or title (create a new piece)",
        )

    # Copy the job's result into its own stored file rather than pointing
    # the new version straight at `result_midi_path` — a `PieceVersion`'s
    # file should be independently owned, not tied to an OMR job's
    # lifetime (e.g. a future job-cleanup pass must not be able to orphan
    # a distributed piece).
    suffix = Path(job.result_midi_path).suffix
    file_path = save_file(load_file(job.result_midi_path), suffix=suffix)

    if wants_existing_piece:
        piece = get_piece_or_404(payload.piece_id, db)
        require_piece_access(piece, current_user.id, db)
        version = add_version(
            piece=piece,
            created_by=current_user.id,
            file_path=file_path,
            source=VersionSource.modification,
            db=db,
        )
        return OmrImportOut(piece=piece, version=version, created_new_piece=False)

    if payload.owner_type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_type is required when creating a new piece")
    owner_id = resolve_new_piece_owner_id(payload.owner_type, payload.group_id, current_user.id, db)
    piece, version = create_piece_with_version(
        title=payload.title,
        owner_type=payload.owner_type,
        owner_id=owner_id,
        created_by=current_user.id,
        file_path=file_path,
        db=db,
    )
    return OmrImportOut(piece=piece, version=version, created_new_piece=True)


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
    path = Path(get_settings().storage_dir) / result_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result file is missing from storage")
    return FileResponse(path)


def _load_paged_report(job: OmrJob) -> dict:
    """The stored `paged-report.json` for a paged job, or 404."""
    if job.paged_report_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job has no paged report")
    path = Path(get_settings().storage_dir) / job.paged_report_path
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report file is missing from storage")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/jobs/{job_id}/paged-report")
def get_paged_report(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """B16: the segment / unresolved-boundary / per-page breakdown of a
    paged run. Each segment's on-disk `musicxml`/`midi` path is rewritten
    to a `…/segments/{index}/{kind}` download URL so the caller never
    sees a storage path."""
    job = _get_own_job_or_404(job_id, current_user, db)
    report = _load_paged_report(job)
    for seg in report.get("segments", []):
        idx = seg.get("index")
        seg["musicxml_url"] = f"/omr/jobs/{job_id}/segments/{idx}/musicxml" if seg.get("musicxml") else None
        seg["midi_url"] = f"/omr/jobs/{job_id}/segments/{idx}/midi" if seg.get("midi") else None
        seg.pop("musicxml", None)
        seg.pop("midi", None)
    return report


@router.get("/jobs/{job_id}/segments/{index}/{kind}")
def get_segment_file(
    job_id: str,
    index: int,
    kind: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """B16: download one segment's MusicXML or MIDI from a paged run."""
    if kind not in ("musicxml", "midi"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown result kind")
    job = _get_own_job_or_404(job_id, current_user, db)
    report = _load_paged_report(job)

    rel = next(
        (seg.get(kind) for seg in report.get("segments", []) if seg.get("index") == index),
        None,
    )
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment result not available")

    # Report paths are relative to the job's output dir. Resolve and make
    # sure a crafted `..` can't walk out of it.
    job_dir = _job_output_dir(job_id).resolve()
    target = (job_dir / rel).resolve()
    if not target.is_relative_to(job_dir) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segment file not available")
    return FileResponse(target)


def _require_paged_job(job_id: str, current_user: User, db: Session) -> OmrJob:
    job = _get_own_job_or_404(job_id, current_user, db)
    if not job.paged or job.paged_report_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a paged job")
    return job


@router.post("/jobs/{job_id}/pages/{page_no}/rerun", response_model=OmrPageRerunOut)
def rerun_job_page(
    job_id: str,
    page_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OmrPageRerunOut:
    """B17 / F16: re-transcribe one page of a finished paged run, reusing
    the one-page PDF still on disk, then rebuild the paged report,
    provisional merge, and `needs_review`. Returns the re-run page's own
    normalized MusicXML (via `page_musicxml_url`) for the editor to splice
    into the working model — this does NOT touch the imported draft.

    404 for a non-paged job or a page outside the run's range."""
    job = _require_paged_job(job_id, current_user, db)
    report_data = _load_paged_report(job)
    total = report_data.get("total") or 0
    if page_no < 1 or page_no > total:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page out of range")

    try:
        new_pr, report = rerun_page(_job_output_dir(job_id), page_no)
    except OmrEngineUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The OMR engine is not available on this server",
        ) from exc
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This page's source is no longer on disk — re-run the whole generation",
        ) from exc

    job.needs_review = report.needs_review
    db.commit()

    measure_count = 0
    if new_pr.ok and new_pr.musicxml_path is not None:
        try:
            measure_count = _page_len(new_pr.musicxml_path)
        except Exception:  # noqa: BLE001 - a measure count is a nicety, not worth 500ing over
            measure_count = 0

    return OmrPageRerunOut(
        ok=new_pr.ok,
        still_failed=not new_pr.ok,
        measure_count=measure_count,
        page_musicxml_url=(
            f"/omr/jobs/{job_id}/pages/{page_no}/musicxml" if new_pr.ok else None
        ),
    )


@router.get("/jobs/{job_id}/pages/{page_no}/musicxml")
def get_page_musicxml(
    job_id: str,
    page_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """B17: one page's own normalized MusicXML from a paged run — what
    `rerun_job_page` points `page_musicxml_url` at, for F16 to splice."""
    job = _require_paged_job(job_id, current_user, db)
    job_dir = _job_output_dir(job_id).resolve()
    target = (job_dir / "pages" / f"p{page_no:02d}" / _PAGE_XML_NAME).resolve()
    if not target.is_relative_to(job_dir) or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page MusicXML not available")
    return FileResponse(target)
