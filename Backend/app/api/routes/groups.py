"""Group routes: create groups, manage membership, role enforcement.

A group's creator becomes its first admin. Only admins can add/remove
members; a group is never left without at least one admin.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import GroupCreate, GroupMemberAdd, GroupMemberOut, GroupOut
from app.db.models import Group, GroupMembership, GroupRole, User
from app.db.session import get_db

router = APIRouter(prefix="/groups", tags=["groups"])


def _get_group_or_404(group_id: str, db: Session) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


def _get_membership(group_id: str, user_id: str, db: Session) -> GroupMembership | None:
    return (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user_id)
        .first()
    )


def _require_admin(group_id: str, current_user: User, db: Session) -> GroupMembership:
    membership = _get_membership(group_id, current_user.id, db)
    if membership is None or membership.role != GroupRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return membership


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    group = Group(name=payload.name)
    db.add(group)
    db.flush()
    db.add(GroupMembership(group_id=group.id, user_id=current_user.id, role=GroupRole.admin))
    db.commit()
    db.refresh(group)
    return GroupOut(id=group.id, name=group.name, role=GroupRole.admin)


@router.get("", response_model=list[GroupOut])
def list_my_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupOut]:
    rows = (
        db.query(Group, GroupMembership.role)
        .join(GroupMembership, GroupMembership.group_id == Group.id)
        .filter(GroupMembership.user_id == current_user.id)
        .all()
    )
    return [GroupOut(id=group.id, name=group.name, role=role) for group, role in rows]


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
def list_members(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupMemberOut]:
    _get_group_or_404(group_id, db)
    if _get_membership(group_id, current_user.id, db) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
    rows = (
        db.query(User, GroupMembership.role)
        .join(GroupMembership, GroupMembership.user_id == User.id)
        .filter(GroupMembership.group_id == group_id)
        .all()
    )
    return [GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=role) for user, role in rows]


@router.post("/{group_id}/members", response_model=GroupMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    group_id: str,
    payload: GroupMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupMemberOut:
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user with that email")
    if _get_membership(group_id, user.id, db) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")
    db.add(GroupMembership(group_id=group_id, user_id=user.id, role=payload.role))
    db.commit()
    return GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=payload.role)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    group_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    membership = _get_membership(group_id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member")
    if membership.role == GroupRole.admin:
        remaining_admins = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.group_id == group_id,
                GroupMembership.role == GroupRole.admin,
                GroupMembership.user_id != user_id,
            )
            .count()
        )
        if remaining_admins == 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove the last admin")
    db.delete(membership)
    db.commit()
