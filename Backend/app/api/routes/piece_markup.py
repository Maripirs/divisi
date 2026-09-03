"""Freehand pen strokes, stamps, and text drawn on a piece's PDF pages.

Two layers live in this one table, told apart by `scope`:

* `personal`: the caller's own marks. Only they list, edit, or delete them.
* `group`: the shared layer on a group-owned piece. Any member of the owning
  group can read it; any admin of that group can add / move / edit / delete
  any mark in it, regardless of who first drew it. `user_id` is the creator
  / last editor, kept for audit only.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import MarkupMarkCreate, MarkupMarkOut, MarkupMarkUpdate
from app.db.models import GroupMembership, GroupRole, OwnerType, Piece, PieceMarkupMark, User
from app.db.session import get_db
from app.services.pieces import get_piece_or_404

router = APIRouter(prefix="/piece-markup", tags=["piece-markup"])


def _can_access_piece(piece: Piece, user: User, db: Session) -> bool:
    """Same access gate as `Annotation` (B5) — owner, or member of the
    owning group. Kept as its own local copy rather than a shared import:
    matches this codebase's existing convention of small, self-contained
    route modules (see `annotations.py`'s identical helper)."""
    if piece.owner_type == OwnerType.user:
        return piece.owner_id == user.id
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == piece.owner_id, GroupMembership.user_id == user.id)
        .first()
    )
    return membership is not None


def _is_owning_group_admin(piece: Piece, user: User, db: Session) -> bool:
    """True when `piece` is group-owned and `user` is an admin of that
    group. Gate for writing the `group` markup layer. Mirrors
    `services.groups.require_admin`'s role lookup, kept local to match this
    module's self-contained style."""
    if piece.owner_type != OwnerType.group:
        return False
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == piece.owner_id, GroupMembership.user_id == user.id)
        .first()
    )
    return membership is not None and membership.role == GroupRole.admin


@router.post("", response_model=MarkupMarkOut, status_code=status.HTTP_201_CREATED)
def create_mark(
    payload: MarkupMarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MarkupMarkOut:
    piece = get_piece_or_404(payload.piece_id, db)
    if not _can_access_piece(piece, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this piece")
    if payload.scope == "group" and not _is_owning_group_admin(piece, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin of the owning group can edit the group markup layer",
        )
    mark = PieceMarkupMark(
        user_id=current_user.id,
        piece_id=piece.id,
        scope=payload.scope,
        page_number=payload.page_number,
        kind=payload.kind,
        color=payload.color,
        width=payload.width,
        points=payload.points,
        stamp_type=payload.stamp_type,
        x=payload.x,
        y=payload.y,
        text=payload.text,
        time_ms=payload.time_ms,
    )
    db.add(mark)
    db.commit()
    db.refresh(mark)
    return mark


@router.get("", response_model=list[MarkupMarkOut])
def list_marks(
    piece_id: str,
    scope: Literal["personal", "group"] = "personal",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MarkupMarkOut]:
    """Marks on a piece, every page — the Frontend filters to the page
    currently in view itself. `personal` (the default) returns only the
    caller's own personal marks; `group` returns the shared group layer for
    a group-owned piece (any member may read it), or `[]` for a personal
    piece."""
    piece = get_piece_or_404(piece_id, db)
    if not _can_access_piece(piece, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this piece")

    query = db.query(PieceMarkupMark).filter(PieceMarkupMark.piece_id == piece_id)
    if scope == "group":
        if piece.owner_type != OwnerType.group:
            return []
        query = query.filter(PieceMarkupMark.scope == "group")
    else:
        query = query.filter(
            PieceMarkupMark.user_id == current_user.id,
            PieceMarkupMark.scope == "personal",
        )
    marks = query.order_by(PieceMarkupMark.created_at).all()
    return marks


def _mark_or_404(mark_id: str, db: Session) -> PieceMarkupMark:
    mark = db.get(PieceMarkupMark, mark_id)
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mark not found")
    return mark


def _require_edit_access(mark: PieceMarkupMark, user: User, db: Session) -> None:
    """A `personal` mark is creator-only. A `group` mark is editable by any
    admin of the owning group (not just whoever drew it)."""
    if mark.scope == "group":
        piece = db.get(Piece, mark.piece_id)
        if piece is None or not _is_owning_group_admin(piece, user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin of the owning group can edit the group markup layer",
            )
        return
    if mark.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can do this")


@router.patch("/{mark_id}", response_model=MarkupMarkOut)
def update_mark(
    mark_id: str,
    payload: MarkupMarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MarkupMarkOut:
    """Edits movable marks in place. A `personal` mark stays creator-only, so
    tapping another singer's text never rewrites it; a `group` mark is
    co-editable by any admin of the owning group."""
    mark = _mark_or_404(mark_id, db)
    _require_edit_access(mark, current_user, db)

    updates = payload.model_dump(exclude_unset=True)
    if "text" in updates and mark.kind == "text":
        text = updates["text"]
        if text is None or not text.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Text cannot be empty")
    for field, value in updates.items():
        setattr(mark, field, value)
    if mark.scope == "group":
        # `user_id` on a group mark is audit-only: record who last touched it.
        mark.user_id = current_user.id
    db.commit()
    db.refresh(mark)
    return mark


@router.delete("/{mark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mark(
    mark_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Covers both "erase this stroke" and "undo" — the Frontend just calls
    this on whichever mark id it wants gone (the one under the eraser, or
    the most recently created one for undo); no separate undo endpoint."""
    mark = _mark_or_404(mark_id, db)
    _require_edit_access(mark, current_user, db)
    db.delete(mark)
    db.commit()
