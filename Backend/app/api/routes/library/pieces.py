"""Library routes: piece CRUD and the caller's library listing."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    LibraryEntryOut,
    PieceDefaultTempoUpdate,
    PieceDetailsUpdate,
    PieceOut,
    PieceUploadOut,
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
from app.services.pieces import (
    create_piece_with_version,
    delete_piece,
    resolve_new_piece_owner_id,
)

from ._common import _get_piece_or_404, _require_review_authority, _save_upload

router = APIRouter()


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "library stub — see B3-B5 in plan.md"}


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
    piece.presentation = payload.presentation
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


@router.post("/pieces", response_model=PieceUploadOut, status_code=status.HTTP_201_CREATED)
async def upload_piece(
    title: str = Form(...),
    owner_type: OwnerType = Form(...),
    group_id: str | None = Form(None),
    composer: str | None = Form(None),
    youtube_url: str | None = Form(None),
    default_tempo_bpm: int | None = Form(None),
    presentation: str | None = Form(None),
    file: UploadFile | None = File(None),
    pdf_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceUploadOut:
    if file is None and pdf_file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a music file, a PDF, or both"
        )
    if presentation not in (None, "", "score_reference", "play_along"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid presentation value"
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
        presentation=presentation or None,
        db=db,
    )
    return PieceUploadOut(piece=piece, version=version)


def _latest_versions_by_piece(piece_ids: list[str], db: Session) -> dict[str, PieceVersion]:
    """The newest `PieceVersion` per piece id, in one query instead of one
    query per piece. Rows come back grouped by `piece_id` and sorted
    newest-first within each group, so the first row seen for a given
    `piece_id` while iterating is guaranteed to be its newest."""
    if not piece_ids:
        return {}
    versions = (
        db.query(PieceVersion)
        .filter(PieceVersion.piece_id.in_(piece_ids))
        .order_by(PieceVersion.piece_id, PieceVersion.created_at.desc())
        .all()
    )
    latest: dict[str, PieceVersion] = {}
    for v in versions:
        latest.setdefault(v.piece_id, v)
    return latest


def _omr_fields_batch(piece_ids: list[str], db: Session) -> dict[str, dict]:
    """Batched form of the old per-piece `_omr_fields`: same two lookups
    (latest OmrJob, pending working-draft version id), done once across all
    piece ids instead of once per piece."""
    if not piece_ids:
        return {}
    jobs = (
        db.query(OmrJob)
        .filter(OmrJob.piece_id.in_(piece_ids))
        .order_by(OmrJob.piece_id, OmrJob.created_at.desc())
        .all()
    )
    latest_job_by_piece: dict[str, OmrJob] = {}
    for job in jobs:
        latest_job_by_piece.setdefault(job.piece_id, job)

    drafts = (
        db.query(PieceVersion)
        .filter(
            PieceVersion.piece_id.in_(piece_ids),
            PieceVersion.status == VersionStatus.draft,
            # `original`-source alongside `modification`: an unpublished
            # first version (a brand-new Tracks-tab upload, never yet
            # submitted) is a "pending draft" too — see
            # `app.services.pieces.working_draft`'s own doc comment for
            # why `source == original` unambiguously means that.
            PieceVersion.source.in_([VersionSource.modification, VersionSource.original]),
        )
        .order_by(PieceVersion.piece_id, PieceVersion.created_at.desc())
        .all()
    )
    pending_by_piece: dict[str, str] = {}
    for d in drafts:
        pending_by_piece.setdefault(d.piece_id, d.id)

    return {
        piece_id: {
            "latest_omr_job": (
                LibraryEntryOmrJobOut.model_validate(latest_job_by_piece[piece_id])
                if piece_id in latest_job_by_piece
                else None
            ),
            "pending_generated_version_id": pending_by_piece.get(piece_id),
        }
        for piece_id in piece_ids
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
    latest_versions_by_piece = _latest_versions_by_piece([p.id for p in owned_pieces], db)

    my_group_ids = [
        row[0]
        for row in db.query(GroupMembership.group_id).filter(GroupMembership.user_id == current_user.id).all()
    ]
    distributed_rows = (
        db.query(Distribution, PieceVersion, Piece)
        .join(PieceVersion, Distribution.piece_version_id == PieceVersion.id)
        .join(Piece, PieceVersion.piece_id == Piece.id)
        .filter(Distribution.group_id.in_(my_group_ids))
        .order_by(Distribution.distributed_at.desc())
        .all()
        if my_group_ids
        else []
    )

    # A group-owned piece with zero `Distribution` rows at all is otherwise
    # invisible to everyone, full stop — including the admin who just
    # uploaded it, until they submit/approve/distribute it. This is what
    # makes a just-uploaded Tracks-tab piece (whose only version is a
    # `draft`/`source=original` row, see `working_draft`'s own doc comment)
    # show up for the admin who owns it, e.g. so its `/review` link stays
    # reachable while ambiguous parts are still unresolved. Scoped to
    # groups this user actually admins — a plain member has no business
    # seeing a track before it's been shared with the group.
    admin_group_ids = {
        row[0]
        for row in db.query(GroupMembership.group_id)
        .filter(GroupMembership.user_id == current_user.id, GroupMembership.role == GroupRole.admin)
        .all()
    }
    undistributed_admin_pieces: list[Piece] = []
    if admin_group_ids:
        distributed_piece_ids = {
            row[0]
            for row in db.query(PieceVersion.piece_id)
            .join(Distribution, Distribution.piece_version_id == PieceVersion.id)
            .distinct()
            .all()
        }
        undistributed_admin_pieces = (
            db.query(Piece)
            .filter(Piece.owner_type == OwnerType.group, Piece.owner_id.in_(admin_group_ids))
            .filter(~Piece.id.in_(distributed_piece_ids))
            .all()
        )

    all_piece_ids = (
        {p.id for p in owned_pieces}
        | {piece.id for _d, _v, piece in distributed_rows}
        | {p.id for p in undistributed_admin_pieces}
    )
    omr_fields_by_piece = _omr_fields_batch(list(all_piece_ids), db)
    latest_versions_by_undistributed_piece = _latest_versions_by_piece(
        [p.id for p in undistributed_admin_pieces], db
    )

    for piece in owned_pieces:
        latest = latest_versions_by_piece.get(piece.id)
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
                presentation=piece.presentation,
                has_music=latest.file_path is not None,
                has_pdf=latest.pdf_file_path is not None,
                music_file_name=latest.file_name,
                pdf_file_name=latest.pdf_file_name,
                **omr_fields_by_piece[piece.id],
            )
        )

    if my_group_ids:
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
                    presentation=piece.presentation,
                    has_music=version.file_path is not None,
                    has_pdf=version.pdf_file_path is not None,
                    music_file_name=version.file_name,
                    pdf_file_name=version.pdf_file_name,
                    **omr_fields_by_piece[piece.id],
                )
            )

    for piece in undistributed_admin_pieces:
        latest = latest_versions_by_undistributed_piece.get(piece.id)
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
                presentation=piece.presentation,
                has_music=latest.file_path is not None,
                has_pdf=latest.pdf_file_path is not None,
                music_file_name=latest.file_name,
                pdf_file_name=latest.pdf_file_name,
                **omr_fields_by_piece[piece.id],
            )
        )

    return entries
