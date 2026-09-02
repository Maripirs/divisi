"""Piece Rehearsal Notes routes (B16): a group admin's durable, group-wide
rehearsal reminders pinned to a piece's Rehearsal Notes section.

Two prefixes on one router: `/groups/{group_id}/pieces/{piece_id}/rehearsal-notes`
(list/create, scoped to a piece) and `/piece-rehearsal-notes/{note_id}`
(edit/delete, since a single note's URL doesn't need its group or piece in
the path once you have the id).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    PieceRehearsalNoteCreate,
    PieceRehearsalNoteOut,
    PieceRehearsalNoteUpdate,
)
from app.db.models import GroupPage, OwnerType, PieceRehearsalNote, User
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access
from app.services.pieces import get_piece_or_404

router = APIRouter(tags=["piece-rehearsal-notes"])


def _get_note_or_404(note_id: str, db: Session) -> PieceRehearsalNote:
    return get_or_404(db, PieceRehearsalNote, note_id, "Piece rehearsal note not found")


def _require_group_piece(group_id: str, piece_id: str, db: Session) -> None:
    """Confirm the group and piece exist and that the piece is this
    group's own group-owned piece. A rehearsal note only ever hangs off a
    piece the group controls, so anything else is a 404."""
    get_group_or_404(group_id, db)
    piece = get_piece_or_404(piece_id, db)
    if not (piece.owner_type == OwnerType.group and piece.owner_id == group_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found in this group"
        )


@router.post(
    "/groups/{group_id}/pieces/{piece_id}/rehearsal-notes",
    response_model=PieceRehearsalNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_piece_rehearsal_note(
    group_id: str,
    piece_id: str,
    payload: PieceRehearsalNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceRehearsalNote:
    _require_group_piece(group_id, piece_id, db)
    require_admin(group_id, current_user, db)
    note = PieceRehearsalNote(
        group_id=group_id,
        piece_id=piece_id,
        kind=payload.kind.value,
        title=payload.title,
        body=payload.body,
        page_number=payload.page_number,
        measure_label=payload.measure_label,
        part_scope=payload.part_scope,
        created_by=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get(
    "/groups/{group_id}/pieces/{piece_id}/rehearsal-notes",
    response_model=list[PieceRehearsalNoteOut],
)
def list_piece_rehearsal_notes(
    group_id: str,
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PieceRehearsalNote]:
    _require_group_piece(group_id, piece_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.weekly_notes, current_user.id, db)
    return (
        db.query(PieceRehearsalNote)
        .filter(PieceRehearsalNote.piece_id == piece_id)
        .order_by(PieceRehearsalNote.created_at.asc())
        .all()
    )


@router.put("/piece-rehearsal-notes/{note_id}", response_model=PieceRehearsalNoteOut)
def update_piece_rehearsal_note(
    note_id: str,
    payload: PieceRehearsalNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceRehearsalNote:
    """Admin-only, full replace, same shape as `weekly_notes.py`'s
    `update_weekly_note`."""
    note = _get_note_or_404(note_id, db)
    require_admin(note.group_id, current_user, db)
    note.kind = payload.kind.value
    note.title = payload.title
    note.body = payload.body
    note.page_number = payload.page_number
    note.measure_label = payload.measure_label
    note.part_scope = payload.part_scope
    db.commit()
    db.refresh(note)
    return note


@router.delete("/piece-rehearsal-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_piece_rehearsal_note(
    note_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    note = _get_note_or_404(note_id, db)
    require_admin(note.group_id, current_user, db)
    db.delete(note)
    db.commit()
