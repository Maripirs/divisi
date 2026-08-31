"""Homework routes (B9): a group admin's assignments to their members.

Two prefixes on one router: `/groups/{group_id}/homework` (list/create,
group-scoped) and `/homework/{homework_id}` (get/delete, since a single
assignment's URL doesn't need its group in the path once you have the id).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import HomeworkCreate, HomeworkOut, HomeworkUpdate
from app.db.models import GroupPage, Homework, User
from app.db.session import get_db
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access

router = APIRouter(tags=["homework"])


def _get_homework_or_404(homework_id: str, db: Session) -> Homework:
    homework = db.get(Homework, homework_id)
    if homework is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
    return homework


@router.post(
    "/groups/{group_id}/homework", response_model=HomeworkOut, status_code=status.HTTP_201_CREATED
)
def create_homework(
    group_id: str,
    payload: HomeworkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Homework:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    homework = Homework(
        group_id=group_id,
        piece_id=payload.piece_id,
        title=payload.title,
        range=payload.range,
        instructions=payload.instructions,
        due_date=payload.due_date,
        created_by=current_user.id,
    )
    db.add(homework)
    db.commit()
    db.refresh(homework)
    return homework


@router.get("/groups/{group_id}/homework", response_model=list[HomeworkOut])
def list_group_homework(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Homework]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.homework, current_user.id, db)
    return (
        db.query(Homework)
        .filter(Homework.group_id == group_id)
        .order_by(Homework.due_date.asc().nulls_last(), Homework.created_at.asc())
        .all()
    )


@router.get("/homework/{homework_id}", response_model=HomeworkOut)
def get_homework(
    homework_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Homework:
    homework = _get_homework_or_404(homework_id, db)
    require_member(homework.group_id, current_user, db)
    require_member_page_access(homework.group_id, GroupPage.homework, current_user.id, db)
    return homework


@router.put("/homework/{homework_id}", response_model=HomeworkOut)
def update_homework(
    homework_id: str,
    payload: HomeworkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Homework:
    """Admin-only, full replace — same shape as `weekly_notes.py`'s
    `update_weekly_note`."""
    homework = _get_homework_or_404(homework_id, db)
    require_admin(homework.group_id, current_user, db)
    homework.piece_id = payload.piece_id
    homework.title = payload.title
    homework.range = payload.range
    homework.instructions = payload.instructions
    homework.due_date = payload.due_date
    db.commit()
    db.refresh(homework)
    return homework


@router.delete("/homework/{homework_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_homework(
    homework_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    homework = _get_homework_or_404(homework_id, db)
    require_admin(homework.group_id, current_user, db)
    db.delete(homework)
    db.commit()
