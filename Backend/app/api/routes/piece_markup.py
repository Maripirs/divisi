"""Freehand pen strokes + stamps drawn on a piece's PDF pages.

Personal-only: every mark is scoped to its creator (`user_id`), same as
private notation an actual musician would pencil into their own copy of the
music — nobody else's marks show up here, and there's no share/unshare like
`Annotation` (B5) has. A group-published layer (an admin publishes their
markup for the whole group, members opt in to see it) is a planned
fast-follow — see Backend/plan.md's B15 note — deliberately not built this
pass.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import MarkupMarkCreate, MarkupMarkOut
from app.db.models import GroupMembership, OwnerType, Piece, PieceMarkupMark, User
from app.db.session import get_db

router = APIRouter(prefix="/piece-markup", tags=["piece-markup"])


def _get_piece_or_404(piece_id: str, db: Session) -> Piece:
    piece = db.get(Piece, piece_id)
    if piece is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found")
    return piece


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
    piece = _get_piece_or_404(payload.piece_id, db)
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
    )
    db.add(mark)
    db.commit()
    db.refresh(mark)
    return mark


@router.get("", response_model=list[MarkupMarkOut])
def list_marks(
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MarkupMarkOut]:
    """The caller's own marks on a piece, every page — the Frontend filters
    to the page currently in view itself, same as it already loads a whole
    piece's `Annotation`s in one call."""
    _get_piece_or_404(piece_id, db)
    marks = (
        db.query(PieceMarkupMark)
        .filter(PieceMarkupMark.piece_id == piece_id, PieceMarkupMark.user_id == current_user.id)
        .order_by(PieceMarkupMark.created_at)
        .all()
    )
    return marks


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
