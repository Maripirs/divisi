"""Freehand pen strokes, stamps, and text drawn on a piece's PDF pages.

Every mark keeps its creator (`user_id`). The caller can list just their own
marks, or all marks on a group-owned piece they can access; deletion remains
owner-only.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import MarkupMarkCreate, MarkupMarkOut, MarkupMarkUpdate
from app.db.models import GroupMembership, OwnerType, Piece, PieceMarkupMark, User
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


@router.post("", response_model=MarkupMarkOut, status_code=status.HTTP_201_CREATED)
def create_mark(
    payload: MarkupMarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MarkupMarkOut:
    piece = get_piece_or_404(payload.piece_id, db)
    if not _can_access_piece(piece, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this piece")
    mark = PieceMarkupMark(
        user_id=current_user.id,
        piece_id=piece.id,
        page_number=payload.page_number,
        kind=payload.kind,
        color=payload.color,
        width=payload.width,
        points=payload.points,
        stamp_type=payload.stamp_type,
        x=payload.x,
        y=payload.y,
        text=payload.text,
    )
    db.add(mark)
    db.commit()
    db.refresh(mark)
    return mark


@router.get("", response_model=list[MarkupMarkOut])
def list_marks(
    piece_id: str,
    scope: Literal["mine", "group"] = "mine",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MarkupMarkOut]:
    """Marks on a piece, every page — the Frontend filters to the page
    currently in view itself. `mine` returns only the caller's marks; `group`
    returns all marks on a group-owned piece the caller can access."""
    piece = get_piece_or_404(piece_id, db)
    if not _can_access_piece(piece, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this piece")

    query = db.query(PieceMarkupMark).filter(PieceMarkupMark.piece_id == piece_id)
    if scope != "group" or piece.owner_type != OwnerType.group:
        query = query.filter(PieceMarkupMark.user_id == current_user.id)
    marks = query.order_by(PieceMarkupMark.created_at).all()
    return marks


@router.patch("/{mark_id}", response_model=MarkupMarkOut)
def update_mark(
    mark_id: str,
    payload: MarkupMarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MarkupMarkOut:
    """Edits movable marks in place. Ownership stays strict even in the group
    visibility view, so tapping another singer's text never rewrites it."""
    mark = db.get(PieceMarkupMark, mark_id)
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mark not found")
    if mark.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can do this")

    updates = payload.model_dump(exclude_unset=True)
    if "text" in updates and mark.kind == "text":
        text = updates["text"]
        if text is None or not text.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Text cannot be empty")
    for field, value in updates.items():
        setattr(mark, field, value)
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
    mark = db.get(PieceMarkupMark, mark_id)
    if mark is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mark not found")
    if mark.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can do this")
    db.delete(mark)
    db.commit()
