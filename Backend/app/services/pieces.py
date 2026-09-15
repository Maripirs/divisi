"""Shared Piece/PieceVersion helpers.

Factored out of `app/api/routes/library.py` so its access-control checks
and piece/version-creation logic have exactly one implementation, reused
by both the authenticated upload endpoints there and B8's OMR-import
endpoint (`app/api/routes/omr.py`) — rather than the OMR route
reimplementing (and risking drifting from) library.py's rules.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import (
    Annotation,
    AnnotationShare,
    Distribution,
    Group,
    GroupRole,
    Homework,
    OmrJob,
    OwnerType,
    Piece,
    PieceMarkupMark,
    PieceVersion,
    VersionSource,
    VersionStatus,
)

from app.rendering.pipeline import discard_render_cache
from app.services.common import get_or_404
from app.services.groups import group_role  # noqa: F401  (re-exported for existing `from app.services.pieces import group_role` call sites; home is now app/services/groups.py)
from app.storage.files import delete_file, load_file, save_file


def get_piece_or_404(piece_id: str, db: Session) -> Piece:
    return get_or_404(db, Piece, piece_id, "Piece not found")


def require_piece_access(piece: Piece, user_id: str, db: Session) -> None:
    """Can this user work on (view / add a version to) this piece?"""
    if piece.owner_type == OwnerType.user:
        if piece.owner_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the owner of this piece")
    else:
        if group_role(piece.owner_id, user_id, db) is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this piece's group")


def resolve_new_piece_owner_id(
    owner_type: OwnerType, group_id: str | None, user_id: str, db: Session
) -> str:
    """Validates + resolves the `owner_id` for a brand-new `Piece`: the
    calling user for an individual piece, or a group they admin for a
    group-owned one. Shared by `upload_piece` and the OMR-import
    endpoint's "create a new piece" path."""
    if owner_type == OwnerType.group:
        if not group_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="group_id is required for a group-owned piece"
            )
        if db.get(Group, group_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
        if group_role(group_id, user_id, db) != GroupRole.admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
        return group_id
    return user_id


def create_piece_with_version(
    *,
    title: str,
    owner_type: OwnerType,
    owner_id: str,
    created_by: str,
    file_path: str | None,
    db: Session,
    composer: str | None = None,
    youtube_url: str | None = None,
    default_tempo_bpm: int | None = None,
    presentation: str | None = None,
    pdf_file_path: str | None = None,
    file_name: str | None = None,
    pdf_file_name: str | None = None,
) -> tuple[Piece, PieceVersion]:
    piece = Piece(
        title=title,
        owner_type=owner_type,
        owner_id=owner_id,
        composer=composer,
        youtube_url=youtube_url,
        default_tempo_bpm=default_tempo_bpm,
        presentation=presentation,
    )
    db.add(piece)
    db.flush()
    version = PieceVersion(
        piece_id=piece.id,
        created_by=created_by,
        source=VersionSource.original,
        status=VersionStatus.draft,
        file_path=file_path,
        pdf_file_path=pdf_file_path,
        file_name=file_name,
        pdf_file_name=pdf_file_name,
    )
    db.add(version)
    db.commit()
    db.refresh(piece)
    db.refresh(version)
    return piece, version


def add_version(
    *,
    piece: Piece,
    created_by: str,
    file_path: str | None,
    source: VersionSource,
    db: Session,
    pdf_file_path: str | None = None,
    file_name: str | None = None,
    pdf_file_name: str | None = None,
) -> PieceVersion:
    version = PieceVersion(
        piece_id=piece.id,
        created_by=created_by,
        source=source,
        status=VersionStatus.draft,
        file_path=file_path,
        pdf_file_path=pdf_file_path,
        file_name=file_name,
        pdf_file_name=pdf_file_name,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def working_draft(piece_id: str, db: Session) -> PieceVersion | None:
    """The single open *working draft* on a piece, if any: a `draft`
    `PieceVersion` with `source == modification`. This is what
    generate-from-PDF auto-imports into and what the in-app editor opens
    and saves back (B17 / F16). "At most one open" is enforced by the two
    writers — `get_or_create_working_draft` reuses this one instead of
    making another, and `_import_draft_version` rejects it before adding a
    fresh one — so if more than one exists (legacy rows) the newest wins.

    Widened from B8's `pending_generated_version_id`, which returned just
    the id and is now a thin wrapper over this."""
    return (
        db.query(PieceVersion)
        .filter(
            PieceVersion.piece_id == piece_id,
            PieceVersion.status == VersionStatus.draft,
            PieceVersion.source == VersionSource.modification,
        )
        .order_by(PieceVersion.created_at.desc())
        .first()
    )


def pending_generated_version_id(piece_id: str, db: Session) -> str | None:
    """Id of the piece's open working draft, if any. Thin wrapper over
    `working_draft` kept for `library._omr_fields` and `omr.list_jobs`,
    which only need the id for "a draft is waiting" state."""
    wd = working_draft(piece_id, db)
    return wd.id if wd is not None else None


def live_version(piece: Piece, db: Session) -> PieceVersion | None:
    """The version the app currently treats as *the* piece: a group
    piece's most recently distributed version, or (personal piece, or a
    group piece nothing has been distributed for yet) its newest
    non-rejected version. This is what `get_or_create_working_draft`
    clones on first edit; it is never mutated in place."""
    if piece.owner_type == OwnerType.group:
        distributed = (
            db.query(PieceVersion)
            .join(Distribution, Distribution.piece_version_id == PieceVersion.id)
            .filter(
                PieceVersion.piece_id == piece.id,
                Distribution.group_id == piece.owner_id,
            )
            .order_by(Distribution.distributed_at.desc())
            .first()
        )
        if distributed is not None:
            return distributed
    return (
        db.query(PieceVersion)
        .filter(
            PieceVersion.piece_id == piece.id,
            PieceVersion.status != VersionStatus.rejected,
        )
        .order_by(PieceVersion.created_at.desc())
        .first()
    )


def _content_copy(stored_path: str | None) -> str | None:
    """Independent copy of a stored file's bytes under a fresh key, so a
    working draft's files outlive whatever the live version does with
    its own. Returns None if the source has no bytes (a slot that was
    never filled, or bytes lost to a free-tier disk wipe)."""
    if not stored_path:
        return None
    try:
        return save_file(load_file(stored_path), suffix=Path(stored_path).suffix)
    except FileNotFoundError:
        return None


def get_or_create_working_draft(piece: Piece, user, db: Session) -> PieceVersion:
    """Return the piece's open working draft, creating one first (by
    content-copying the live version's music + PDF) if there isn't one.
    Idempotent: a second call returns the same version. The caller gates
    this behind review authority."""
    existing = working_draft(piece.id, db)
    if existing is not None:
        return existing

    live = live_version(piece, db)
    return add_version(
        piece=piece,
        created_by=user.id,
        file_path=_content_copy(live.file_path) if live is not None else None,
        pdf_file_path=_content_copy(live.pdf_file_path) if live is not None else None,
        file_name=live.file_name if live is not None else None,
        pdf_file_name=live.pdf_file_name if live is not None else None,
        source=VersionSource.modification,
        db=db,
    )


def replace_version_file(version: PieceVersion, data: bytes, file_name: str | None, db: Session) -> PieceVersion:
    """Overwrite a `draft` version's music file in place (a working-draft
    save) — no new row. Drops any stale rendered output cached under the
    version id. The caller checks status and authority."""
    version.file_path = save_file(
        data, suffix=Path(file_name).suffix if file_name else ""
    )
    if file_name:
        version.file_name = file_name
    db.commit()
    db.refresh(version)
    discard_render_cache(version.id)
    return version


def publish_version(version: PieceVersion, user, db: Session) -> PieceVersion:
    """Take a working draft all the way live in one step: submit -> approve
    -> (group piece) distribute. No new state machine — it just walks the
    same `VersionStatus` values and writes the same `Distribution` row the
    individual endpoints do, without the per-endpoint "creator only"
    submit check (the caller has already required review authority, and a
    working draft's creator is often not whoever publishes it — it may be
    the OMR runner). A personal piece stops after `approved`."""
    if not (version.status == VersionStatus.draft and version.source == VersionSource.modification):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an open working draft can be published",
        )
    version.status = VersionStatus.approved
    version.reviewed_by = user.id
    version.reviewed_at = datetime.now(timezone.utc)
    version.seams_resolved_ack = True

    piece = get_piece_or_404(version.piece_id, db)
    if piece.owner_type == OwnerType.group:
        already = (
            db.query(Distribution)
            .filter(
                Distribution.piece_version_id == version.id,
                Distribution.group_id == piece.owner_id,
            )
            .first()
        )
        if already is None:
            db.add(Distribution(piece_version_id=version.id, group_id=piece.owner_id))

    db.commit()
    db.refresh(version)
    return version


def delete_piece(piece: Piece, db: Session) -> None:
    """F5 edit panel: delete a track entirely, not just one of its files —
    a harder, less-reversible action than anything else in this module, so
    the route calling this gates it behind `_require_review_authority`
    (group admin, or the owner for a personal piece), same as
    approve/reject/default-tempo.

    No `ondelete="CASCADE"` on any of these FKs (this codebase keeps DB
    constraints minimal, per `models.py`'s own comments) — so every child
    row needs an explicit delete here, ordered leaves-first so nothing
    trips its own FK on the way out. `Homework.piece_id` is the one
    exception: nullable by design ("an assignment can exist before a piece
    is picked" — see `Homework`'s doc comment), so a homework entry
    survives its piece being deleted, just pointing at nothing again.
    Storage files (`file_path`/`pdf_file_path`) are reclaimed via
    `delete_file` for every version being removed, best-effort — see its
    own doc comment for why a storage-cleanup failure never blocks this.
    """
    versions = db.query(PieceVersion).filter(PieceVersion.piece_id == piece.id).all()
    version_ids = [v.id for v in versions]
    annotation_ids = [a.id for a in db.query(Annotation.id).filter(Annotation.piece_id == piece.id)]

    if annotation_ids:
        db.query(AnnotationShare).filter(AnnotationShare.annotation_id.in_(annotation_ids)).delete(
            synchronize_session=False
        )
    db.query(Annotation).filter(Annotation.piece_id == piece.id).delete(synchronize_session=False)
    db.query(PieceMarkupMark).filter(PieceMarkupMark.piece_id == piece.id).delete(synchronize_session=False)
    if version_ids:
        db.query(Distribution).filter(Distribution.piece_version_id.in_(version_ids)).delete(
            synchronize_session=False
        )
    for version in versions:
        delete_file(version.file_path)
        delete_file(version.pdf_file_path)
    db.query(PieceVersion).filter(PieceVersion.piece_id == piece.id).delete(synchronize_session=False)
    # "Generate music from PDF" jobs tagged with this piece — their derived
    # result may already have been imported as a version (deleted just
    # above) or not yet; either way the job row FK's `pieces.id`, so it
    # goes before the piece does.
    db.query(OmrJob).filter(OmrJob.piece_id == piece.id).delete(synchronize_session=False)
    db.query(Homework).filter(Homework.piece_id == piece.id).update(
        {Homework.piece_id: None}, synchronize_session=False
    )
    db.delete(piece)
    db.commit()
