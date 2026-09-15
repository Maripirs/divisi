"""Weekly Notes routes: a group admin's dated bulletin entries — a history
feed members scroll back through, not a single running note.

Same two-prefix shape as `homework.py`: `/groups/{group_id}/weekly-notes`
(list/create, group-scoped) and `/weekly-notes/{note_id}` (edit/delete,
since a single note's URL doesn't need its group in the path once you have
the id).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    PieceRehearsalNoteOut,
    WeeklyNoteCreate,
    WeeklyNoteOut,
    WeeklyNotePromoteRequest,
    WeeklyNoteUpdate,
)
from app.db.models import GroupPage, OwnerType, PieceRehearsalNote, User, WeeklyNote
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access
from app.services.pieces import get_piece_or_404

router = APIRouter(tags=["weekly-notes"])


def _get_note_or_404(note_id: str, db: Session) -> WeeklyNote:
    return get_or_404(db, WeeklyNote, note_id, "Weekly note not found")


@router.post(
    "/groups/{group_id}/weekly-notes", response_model=WeeklyNoteOut, status_code=status.HTTP_201_CREATED
)
def create_weekly_note(
    group_id: str,
    payload: WeeklyNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WeeklyNote:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    note = WeeklyNote(
        group_id=group_id,
        title=payload.title,
        body=payload.body,
        note_date=payload.note_date,
        created_by=current_user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/groups/{group_id}/weekly-notes", response_model=list[WeeklyNoteOut])
def list_group_weekly_notes(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WeeklyNote]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.weekly_notes, current_user.id, db)
    return (
        db.query(WeeklyNote)
        .filter(WeeklyNote.group_id == group_id)
        .order_by(WeeklyNote.note_date.desc(), WeeklyNote.created_at.desc())
        .all()
    )


@router.put("/weekly-notes/{note_id}", response_model=WeeklyNoteOut)
def update_weekly_note(
    note_id: str,
    payload: WeeklyNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WeeklyNote:
    """Admin-only, full replace — same shape as `groups.py`'s
    `update_description`."""
    note = _get_note_or_404(note_id, db)
    require_admin(note.group_id, current_user, db)
    note.title = payload.title
    note.body = payload.body
    note.note_date = payload.note_date
    db.commit()
    db.refresh(note)
    return note


@router.delete("/weekly-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_note(
    note_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    note = _get_note_or_404(note_id, db)
    require_admin(note.group_id, current_user, db)
    db.delete(note)
    db.commit()


@router.post(
    "/weekly-notes/{note_id}/promote",
    response_model=PieceRehearsalNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def promote_weekly_note(
    note_id: str,
    payload: WeeklyNotePromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceRehearsalNote:
    """Backlog: turn a dated bulletin entry into a durable
    `PieceRehearsalNote` pinned to a piece — the note outlives the week it
    was posted in, same reasoning `PieceRehearsalNote`'s own docstring gives.
    The source weekly note is left untouched (still shows in its own feed);
    only a new rehearsal note is created, carrying `source_weekly_note_id`.

    Admin-only, same authority check `piece_rehearsal_notes.py`'s own create
    route uses. `payload.piece_id` not being this group's own group-owned
    piece 404s exactly like `create_piece_rehearsal_note` does for the same
    case (`_require_group_piece`) — mirrored here rather than imported since
    it also needs `note.group_id`, not a path param."""
    note = _get_note_or_404(note_id, db)
    require_admin(note.group_id, current_user, db)

    piece = get_piece_or_404(payload.piece_id, db)
    if not (piece.owner_type == OwnerType.group and piece.owner_id == note.group_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found in this group"
        )

    rehearsal_note = PieceRehearsalNote(
        group_id=note.group_id,
        piece_id=payload.piece_id,
        kind=payload.kind.value,
        title=payload.title if payload.title is not None else note.title,
        body=payload.body if payload.body is not None else note.body,
        page_number=payload.page_number,
        measure_label=payload.measure_label,
        part_scope=payload.part_scope,
        created_by=current_user.id,
        source_weekly_note_id=note.id,
    )
    db.add(rehearsal_note)
    db.commit()
    db.refresh(rehearsal_note)
    return rehearsal_note
