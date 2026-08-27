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
    Group,
    GroupMembership,
    GroupRole,
    OwnerType,
    Piece,
    PieceVersion,
    VersionSource,
    VersionStatus,
)


def group_role(group_id: str, user_id: str, db: Session) -> GroupRole | None:
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user_id)
        .first()
    )
    return membership.role if membership else None


def get_piece_or_404(piece_id: str, db: Session) -> Piece:
    piece = db.get(Piece, piece_id)
    if piece is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found")
    return piece


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
    *, title: str, owner_type: OwnerType, owner_id: str, created_by: str, file_path: str, db: Session
) -> tuple[Piece, PieceVersion]:
    piece = Piece(title=title, owner_type=owner_type, owner_id=owner_id)
    db.add(piece)
    db.flush()
    version = PieceVersion(
        piece_id=piece.id,
        created_by=created_by,
        source=VersionSource.original,
        status=VersionStatus.draft,
        file_path=file_path,
    )
    db.add(version)
    db.commit()
    db.refresh(piece)
    db.refresh(version)
    return piece, version


def add_version(
    *, piece: Piece, created_by: str, file_path: str, source: VersionSource, db: Session
) -> PieceVersion:
    version = PieceVersion(
        piece_id=piece.id,
        created_by=created_by,
        source=source,
        status=VersionStatus.draft,
        file_path=file_path,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version
