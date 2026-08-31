"""Shared Piece/PieceVersion helpers.

Factored out of `app/api/routes/library.py` so its access-control checks
and piece/version-creation logic have exactly one implementation, reused
by both the authenticated upload endpoints there and B8's OMR-import
endpoint (`app/api/routes/omr.py`) — rather than the OMR route
reimplementing (and risking drifting from) library.py's rules.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import (
    Annotation,
    AnnotationShare,
    Distribution,
    Group,
    GroupRole,
    Homework,
    OwnerType,
    Piece,
    PieceMarkupMark,
    PieceVersion,
    VersionSource,
    VersionStatus,
)

from app.services.common import get_or_404
from app.services.groups import group_role  # noqa: F401  (re-exported for existing `from app.services.pieces import group_role` call sites; home is now app/services/groups.py)


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
    Storage files (`file_path`/`pdf_file_path`) are deliberately left where
    they are, not deleted — local-disk ones get wiped on the next free-tier
    restart anyway, and the object-storage ones become harmless orphans
    (small, private bucket; a sweep-by-prefix cleanup pass is a Backlog
    item). Nothing else here depends on reclaiming them immediately.
    """
    version_ids = [v.id for v in db.query(PieceVersion.id).filter(PieceVersion.piece_id == piece.id)]
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
    db.query(PieceVersion).filter(PieceVersion.piece_id == piece.id).delete(synchronize_session=False)
    db.query(Homework).filter(Homework.piece_id == piece.id).update(
        {Homework.piece_id: None}, synchronize_session=False
    )
    db.delete(piece)
    db.commit()
