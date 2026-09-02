"""Library routes: version lifecycle, review, and distribution."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    DistributionOut,
    PieceVersionOut,
    VersionPublishRequest,
    WorkingDraftOut,
)
from app.db.models import (
    Distribution,
    GroupRole,
    OwnerType,
    PieceVersion,
    User,
    VersionSource,
    VersionStatus,
)
from app.db.session import get_db
from app.services.pieces import (
    add_version,
    get_or_create_working_draft,
    publish_version,
    replace_version_file as svc_replace_version_file,
    working_draft,
)

from ._common import (
    _get_piece_or_404,
    _get_version_or_404,
    _group_role,
    _require_piece_access,
    _require_review_authority,
    _save_upload,
)

router = APIRouter()


@router.post(
    "/pieces/{piece_id}/versions", response_model=PieceVersionOut, status_code=status.HTTP_201_CREATED
)
async def upload_version(
    piece_id: str,
    file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    # F5 edit panel: explicit "Remove" for a slot that isn't being replaced
    # with a new file this call — distinct from just omitting `file`/
    # `pdf_file`, which means "leave it exactly as-is" (see the
    # carry-forward below). Ignored if the matching file *is* given —
    # uploading a new music file while also asking to remove it makes no
    # sense, and the new file wins.
    remove_file: bool = Form(False),
    remove_pdf_file: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    piece = _get_piece_or_404(piece_id, db)
    _require_piece_access(piece, current_user, db)

    file_path = _save_upload(file, await file.read()) if file is not None else None
    pdf_file_path = _save_upload(pdf_file, await pdf_file.read()) if pdf_file is not None else None
    file_name = file.filename if file is not None else None
    pdf_file_name = pdf_file.filename if pdf_file is not None else None

    # A version only replaces the file slot(s) actually given here — carry
    # the other slot (path and display filename alike) forward from the
    # piece's latest version rather than silently dropping it (e.g.
    # replacing just the music file must not erase an already-uploaded
    # PDF, and vice versa) — *unless* that slot's own `remove_*` flag asked
    # for it to be cleared instead.
    if (file is None and not remove_file) or (pdf_file is None and not remove_pdf_file):
        latest = (
            db.query(PieceVersion)
            .filter(PieceVersion.piece_id == piece.id)
            .order_by(PieceVersion.created_at.desc())
            .first()
        )
        if latest is not None:
            if file is None and not remove_file:
                file_path = latest.file_path
                file_name = latest.file_name
            if pdf_file is None and not remove_pdf_file:
                pdf_file_path = latest.pdf_file_path
                pdf_file_name = latest.pdf_file_name

    if file_path is None and pdf_file_path is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A piece needs at least a music file or a PDF — remove the only one it has by replacing it instead",
        )

    version = add_version(
        piece=piece,
        created_by=current_user.id,
        file_path=file_path,
        pdf_file_path=pdf_file_path,
        file_name=file_name,
        pdf_file_name=pdf_file_name,
        source=VersionSource.modification,
        db=db,
    )
    return version


@router.post("/versions/{version_id}/submit", response_model=PieceVersionOut)
def submit_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    version = _get_version_or_404(version_id, db)
    if version.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator can submit this version")
    if version.status != VersionStatus.draft:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version is not in draft status")
    version.status = VersionStatus.submitted
    db.commit()
    db.refresh(version)
    return version


@router.post("/versions/{version_id}/approve", response_model=PieceVersionOut)
def approve_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_review_authority(piece, current_user, db)
    if version.status != VersionStatus.submitted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version is not pending review")
    version.status = VersionStatus.approved
    version.reviewed_by = current_user.id
    version.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    return version


@router.post("/versions/{version_id}/reject", response_model=PieceVersionOut)
def reject_version(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_review_authority(piece, current_user, db)
    # `submitted` -> the normal "reject this review". `draft` -> discard a
    # version that was never submitted for review at all; the only such
    # versions are the drafts the OMR "Generate music from PDF" runner
    # auto-creates, and the Tracks tab's "Discard" button on them.
    if version.status not in (VersionStatus.draft, VersionStatus.submitted):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version is not pending review")
    version.status = VersionStatus.rejected
    version.reviewed_by = current_user.id
    version.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    return version


@router.post(
    "/pieces/{piece_id}/versions/{version_id}/distribute",
    response_model=DistributionOut,
    status_code=status.HTTP_201_CREATED,
)
def distribute_version(
    piece_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DistributionOut:
    piece = _get_piece_or_404(piece_id, db)
    version = _get_version_or_404(version_id, db)
    if version.piece_id != piece.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    if piece.owner_type != OwnerType.group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only group-owned pieces can be distributed")
    if _group_role(piece.owner_id, current_user.id, db) != GroupRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    if version.status != VersionStatus.approved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only an approved version can be distributed")

    existing = (
        db.query(Distribution)
        .filter(Distribution.piece_version_id == version.id, Distribution.group_id == piece.owner_id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already distributed to this group")

    distribution = Distribution(piece_version_id=version.id, group_id=piece.owner_id)
    db.add(distribution)
    db.commit()
    db.refresh(distribution)
    return distribution


@router.post("/pieces/{piece_id}/working-draft", response_model=WorkingDraftOut)
def get_working_draft(
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkingDraftOut:
    """B17 / F16: the piece's single open working draft, created on first
    call by content-copying the live version's music + PDF. Idempotent —
    a second call returns the same draft. Review authority only (this is
    the "start editing the track" gate)."""
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)
    forked = working_draft(piece_id, db) is None
    version = get_or_create_working_draft(piece, current_user, db)
    return WorkingDraftOut(version=PieceVersionOut.model_validate(version), forked_from_live=forked)


@router.put("/versions/{version_id}/file", response_model=PieceVersionOut)
async def replace_version_file(
    version_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    """B17 / F16: overwrite a `draft` version's music file in place (an
    editor save) — no new version row per save. Allowed for the draft's
    creator or the piece's review authority; refuses a non-draft."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    if version.created_by != current_user.id:
        _require_review_authority(piece, current_user, db)
    if version.status != VersionStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only a draft version's file can be replaced in place"
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    return svc_replace_version_file(version, data, file.filename, db)


@router.post("/versions/{version_id}/publish", response_model=PieceVersionOut)
def publish_version_route(
    version_id: str,
    payload: VersionPublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    """B17 / F16: take a working draft live in one step — submit -> approve
    -> (group piece) distribute. Review authority only. `seams_resolved`
    must be true (F16's editor gates the button on every OMR seam being
    marked resolved; the Backend records the ack and trusts it). A
    non-working-draft, or an already-published one, is a 409."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_review_authority(piece, current_user, db)
    if not payload.seams_resolved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Every seam must be marked resolved before publishing",
        )
    return publish_version(version, current_user, db)
