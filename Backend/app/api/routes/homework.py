"""Homework routes (B9): a group admin's assignments to their members.

Two prefixes on one router: `/groups/{group_id}/homework` (list/create,
group-scoped) and `/homework/{homework_id}` (get/delete, since a single
assignment's URL doesn't need its group in the path once you have the id).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import HomeworkCreate, HomeworkOut
from app.db.models import Group, GroupRole, Homework, User
from app.db.session import get_db
from app.services.pieces import group_role

router = APIRouter(tags=["homework"])


def _get_group_or_404(group_id: str, db: Session) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


def _require_member(group_id: str, user: User, db: Session) -> None:
    if group_role(group_id, user.id, db) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


def _require_admin(group_id: str, user: User, db: Session) -> None:
    if group_role(group_id, user.id, db) != GroupRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


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
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
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
    _get_group_or_404(group_id, db)
    _require_member(group_id, current_user, db)
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
    _require_member(homework.group_id, current_user, db)
    return homework


@router.delete("/homework/{homework_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_homework(
    homework_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    homework = _get_homework_or_404(homework_id, db)
    _require_admin(homework.group_id, current_user, db)
    db.delete(homework)
    db.commit()
