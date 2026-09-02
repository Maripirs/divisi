"""Shared helpers for the library route submodules."""

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.models import (
    GroupRole,
    OwnerType,
    Piece,
    PieceVersion,
    User,
)
from app.services.common import get_or_404
from app.services.pieces import (
    get_piece_or_404,
    group_role,
    require_piece_access,
)
from app.storage.files import save_file

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


def _save_upload(file: UploadFile | None, data: bytes) -> str | None:
    if file is None:
        return None
    suffix = "".join(("." + file.filename.rsplit(".", 1)[-1]) if file.filename and "." in file.filename else "")
    return save_file(data, suffix=suffix)
