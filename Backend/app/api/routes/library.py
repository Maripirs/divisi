"""Library routes: pieces, versions, review, distribution.

A `Piece` is owned either by an individual user or by a group. New versions
start as `draft`; a member submits a draft for review, and only the review
authority for that piece (the group's admin, or the individual owner) can
approve or reject it. Only an `approved` version can be pushed (distributed)
to a group's members, and draft/rejected versions are never pushed — see the
domain model in Backend/plan.md.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    DistributionOut,
    LibraryEntryOut,
    PieceDefaultTempoUpdate,
    PieceDetailsUpdate,
    PieceOut,
    PieceUploadOut,
    PieceVersionOut,
    RenderManifestOut,
)
from app.api.schemas.library import LibraryEntryOmrJobOut
from app.db.models import (
    Distribution,
    GroupMembership,
    GroupRole,
    OmrJob,
    OwnerType,
    Piece,
    PieceVersion,
    User,
    VersionSource,
    VersionStatus,
)
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest
from app.storage.files import resolve_existing_source_path
from app.services.common import get_or_404
from app.services.pieces import (
    add_version,
    create_piece_with_version,
    delete_piece,
    get_piece_or_404,
    group_role,
    require_piece_access,
    resolve_new_piece_owner_id,
)
from app.storage.files import save_file

router = APIRouter(prefix="/library", tags=["library"])


def _source_path_or_404(file_path: str, what: str):
    """Resolve a stored file to a local path, 404ing (not 500ing) when the
    bytes are missing — an object-storage miss, or a legacy local upload
    lost to a free-tier disk wipe. See `storage/files.py`."""
    try:
        return resolve_existing_source_path(file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{what} is missing from storage — it may need to be re-uploaded",
        ) from exc


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "library stub — see B3-B5 in plan.md"}


# `_get_piece_or_404`, `_group_role`, `_require_piece_access`: moved to
# app/services/pieces.py so B8's OMR-import endpoint can share the exact
# same access-control rules instead of reimplementing them.
_get_piece_or_404 = get_piece_or_404
_group_role = group_role


def _get_version_or_404(version_id: str, db: Session) -> PieceVersion:
    return get_or_404(db, PieceVersion, version_id, "Version not found")


def _require_piece_access(piece: Piece, user: User, db: Session) -> None:
    require_piece_access(piece, user.id, db)


def _require_review_authority(piece: Piece, user: User, db: Session) -> None:
    """Can this user approve/reject versions of this piece?"""
    if piece.owner_type == OwnerType.user:
        if piece.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can review this piece")
    else:
        if _group_role(piece.owner_id, user.id, db) != GroupRole.admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


@router.patch("/pieces/{piece_id}", response_model=PieceOut)
def update_piece_details(
    piece_id: str,
    payload: PieceDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Piece:
    """Same review authority as approve/reject/default-tempo — editing a
    piece's title, composer, reference recording link, or default tempo
    isn't a review decision either, but it's the same "who's allowed to
    make calls about this piece" boundary."""
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    piece.title = title
    piece.composer = payload.composer.strip() if payload.composer and payload.composer.strip() else None
    piece.youtube_url = payload.youtube_url.strip() if payload.youtube_url and payload.youtube_url.strip() else None
    piece.default_tempo_bpm = payload.default_tempo_bpm
    db.commit()
    db.refresh(piece)
    return piece


@router.delete("/pieces/{piece_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_piece_route(
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """F5 edit panel: delete a track entirely. Same review-authority
    boundary as editing its details — see `delete_piece`'s own doc comment
    for what actually gets cleaned up."""
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)
    delete_piece(piece, db)


@router.put("/pieces/{piece_id}/default-tempo", response_model=PieceOut)
def update_default_tempo(
    piece_id: str,
    payload: PieceDefaultTempoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Piece:
    """Same review authority as approve/reject (group admin, or the owner
    for a personal piece) — the starting tempo the player resets to isn't
    a review decision, but it's the same "who's allowed to make calls
    about this piece" boundary."""
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)
    piece.default_tempo_bpm = payload.default_tempo_bpm
    db.commit()
    db.refresh(piece)
    return piece


def _save_upload(file: UploadFile | None, data: bytes) -> str | None:
    if file is None:
        return None
    suffix = "".join(("." + file.filename.rsplit(".", 1)[-1]) if file.filename and "." in file.filename else "")
    return save_file(data, suffix=suffix)


@router.post("/pieces", response_model=PieceUploadOut, status_code=status.HTTP_201_CREATED)
async def upload_piece(
    title: str = Form(...),
    owner_type: OwnerType = Form(...),
    group_id: str | None = Form(None),
    composer: str | None = Form(None),
    youtube_url: str | None = Form(None),
    default_tempo_bpm: int | None = Form(None),
    file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceUploadOut:
    if file is None and pdf_file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a music file, a PDF, or both"
        )
    owner_id = resolve_new_piece_owner_id(owner_type, group_id, current_user.id, db)

    file_path = _save_upload(file, await file.read()) if file is not None else None
    pdf_file_path = _save_upload(pdf_file, await pdf_file.read()) if pdf_file is not None else None

    piece, version = create_piece_with_version(
        title=title,
        owner_type=owner_type,
        owner_id=owner_id,
        created_by=current_user.id,
        file_path=file_path,
        pdf_file_path=pdf_file_path,
        file_name=file.filename if file is not None else None,
        pdf_file_name=pdf_file.filename if pdf_file is not None else None,
        composer=composer,
        youtube_url=youtube_url,
        default_tempo_bpm=default_tempo_bpm,
        db=db,
    )
    return PieceUploadOut(piece=piece, version=version)


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


def _omr_fields(piece_id: str, db: Session) -> dict:
    """`latest_omr_job` + `pending_generated_version_id` for one piece —
    the Tracks tab's "Generate music from PDF" state. Kept out of the main
    query since most tracks never use it; two cheap indexed lookups."""
    job = (
        db.query(OmrJob)
        .filter(OmrJob.piece_id == piece_id)
        .order_by(OmrJob.created_at.desc())
        .first()
    )
    pending = (
        db.query(PieceVersion)
        .filter(
            PieceVersion.piece_id == piece_id,
            PieceVersion.status == VersionStatus.draft,
            PieceVersion.source == VersionSource.modification,
        )
        .order_by(PieceVersion.created_at.desc())
        .first()
    )
    return {
        "latest_omr_job": LibraryEntryOmrJobOut.model_validate(job) if job is not None else None,
        "pending_generated_version_id": pending.id if pending is not None else None,
    }


@router.get("/pieces", response_model=list[LibraryEntryOut])
def list_my_library(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[LibraryEntryOut]:
    entries: list[LibraryEntryOut] = []

    owned_pieces = (
        db.query(Piece)
        .filter(Piece.owner_type == OwnerType.user, Piece.owner_id == current_user.id)
        .all()
    )
    for piece in owned_pieces:
        latest = (
            db.query(PieceVersion)
            .filter(PieceVersion.piece_id == piece.id)
            .order_by(PieceVersion.created_at.desc())
            .first()
        )
        if latest is None:
            continue
        entries.append(
            LibraryEntryOut(
                piece_id=piece.id,
                title=piece.title,
                owner_type=piece.owner_type,
                owner_id=piece.owner_id,
                version_id=latest.id,
                version_status=latest.status,
                version_source=latest.source,
                version_created_at=latest.created_at,
                default_tempo_bpm=piece.default_tempo_bpm,
                composer=piece.composer,
                youtube_url=piece.youtube_url,
                has_music=latest.file_path is not None,
                has_pdf=latest.pdf_file_path is not None,
                music_file_name=latest.file_name,
                pdf_file_name=latest.pdf_file_name,
                **_omr_fields(piece.id, db),
            )
        )

    my_group_ids = [
        row[0]
        for row in db.query(GroupMembership.group_id).filter(GroupMembership.user_id == current_user.id).all()
    ]
    if my_group_ids:
        distributed_rows = (
            db.query(Distribution, PieceVersion, Piece)
            .join(PieceVersion, Distribution.piece_version_id == PieceVersion.id)
            .join(Piece, PieceVersion.piece_id == Piece.id)
            .filter(Distribution.group_id.in_(my_group_ids))
            .order_by(Distribution.distributed_at.desc())
            .all()
        )
        seen_piece_ids: set[str] = set()
        for _distribution, version, piece in distributed_rows:
            if piece.id in seen_piece_ids:
                continue
            seen_piece_ids.add(piece.id)
            entries.append(
                LibraryEntryOut(
                    piece_id=piece.id,
                    title=piece.title,
                    owner_type=piece.owner_type,
                    owner_id=piece.owner_id,
                    version_id=version.id,
                    version_status=version.status,
                    version_source=version.source,
                    version_created_at=version.created_at,
                    default_tempo_bpm=piece.default_tempo_bpm,
                    composer=piece.composer,
                    youtube_url=piece.youtube_url,
                    has_music=version.file_path is not None,
                    has_pdf=version.pdf_file_path is not None,
                    music_file_name=version.file_name,
                    pdf_file_name=version.pdf_file_name,
                    **_omr_fields(piece.id, db),
                )
            )

    return entries


@router.get("/versions/{version_id}/file")
def get_version_file(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """F5: raw music-file bytes (MIDI/MusicXML) for a version. Same access
    gate as the manifest route; 404s cleanly when this version has no
    music file (PDF-only)."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)
    if version.file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no music file")
    return FileResponse(_source_path_or_404(version.file_path, "This version's music file"))


@router.get("/versions/{version_id}/pdf")
def get_version_pdf(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Raw PDF bytes for a version. Same access gate as the manifest route;
    404s cleanly when this version has no PDF."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)
    if version.pdf_file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no PDF")
    return FileResponse(_source_path_or_404(version.pdf_file_path, "This version's PDF"))


@router.get("/versions/{version_id}/manifest", response_model=RenderManifestOut)
def get_version_manifest(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RenderManifestOut:
    """B7: stems + MusicXML + tempo metadata for this version, rendering
    (and caching) it on first request. Authenticated-member access only for
    now — B6's guest join-code path will call `render_manifest`/
    `render_file_path` directly, scoped to that group's actual
    distributions, once it exists."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    source_path = _source_path_or_404(version.file_path, "This version's music file")
    try:
        manifest = render_manifest(version_id, source_path)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    base = f"/library/versions/{version_id}/renders"
    return RenderManifestOut(
        piece_version_id=manifest["piece_version_id"],
        stems={name: f"{base}/{filename}" for name, filename in manifest["stems"].items()},
        musicxml_url=f"{base}/{manifest['musicxml']}",
        tempo_bpm=manifest["tempo_bpm"],
        time_signature=manifest["time_signature"],
        key_signature_fifths=manifest["key_signature_fifths"],
        ms_per_whole_note=manifest["ms_per_whole_note"],
        duration_ms=manifest["duration_ms"],
    )


@router.get("/versions/{version_id}/renders/{filename}")
def get_version_render_file(
    filename: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Serves one file (a stem WAV or the MusicXML) named by the manifest
    above. Same access gate as the manifest endpoint."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)

    try:
        path = render_file_path(version_id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
