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
from app.api.schemas import WeeklyNoteCreate, WeeklyNoteOut, WeeklyNoteUpdate
from app.db.models import GroupPage, User, WeeklyNote
from app.db.session import get_db
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access

router = APIRouter(tags=["weekly-notes"])


def _get_note_or_404(note_id: str, db: Session) -> WeeklyNote:
    note = db.get(WeeklyNote, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly note not found")
    return note


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
