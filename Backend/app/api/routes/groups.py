"""Group routes: create groups, manage membership, role enforcement.

A group's creator becomes its first admin. Only admins can add/remove
members; a group is never left without at least one admin.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    GroupCreate,
    GroupDescriptionUpdate,
    GroupGuestSettingsUpdate,
    GroupMemberAdd,
    GroupMemberOut,
    GroupMemberRoleUpdate,
    GroupMemberTitleUpdate,
    GroupOut,
    GroupPageSettingOut,
    GroupPageSettingsUpdate,
    GroupRehearsalScheduleUpdate,
)
from app.core.join_codes import generate_join_code
from app.core.security import hash_password
from app.db.models import Group, GroupMembership, GroupPage, GroupPageSettings, GroupRole, User
from app.db.session import get_db
from app.services.pages import require_member_page_access, seed_default_page_settings

router = APIRouter(prefix="/groups", tags=["groups"])

_JOIN_CODE_CREATE_ATTEMPTS = 5


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


def _remaining_admins_excluding(group_id: str, user_id: str, db: Session) -> int:
    """How many admins this group would have left if `user_id` stopped
    being one — shared by `remove_member` (leaving/being removed) and
    `update_member_role` (being demoted), so a group can never end up with
    zero admins either way."""
    return (
        db.query(GroupMembership)
        .filter(
            GroupMembership.group_id == group_id,
            GroupMembership.role == GroupRole.admin,
            GroupMembership.user_id != user_id,
        )
        .count()
    )


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    # join_code is generated here (not a column default) so a collision —
    # astronomically unlikely at 8 chars over a 32-symbol alphabet, but not
    # impossible — can just retry against the unique constraint instead of
    # failing the request.
    guest_password_hash = hash_password(payload.guest_password) if payload.guest_password else None
    for attempt in range(_JOIN_CODE_CREATE_ATTEMPTS):
        group = Group(
            name=payload.name,
            join_code=generate_join_code(),
            guest_password_hash=guest_password_hash,
        )
        db.add(group)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            if attempt == _JOIN_CODE_CREATE_ATTEMPTS - 1:
                raise
    db.add(GroupMembership(group_id=group.id, user_id=current_user.id, role=GroupRole.admin))
    # B12: seed all 5 pages' settings up front so every group has a full
    # set of rows from creation, matching today's pre-B12 behavior — no
    # separate "does this group have settings yet" branch anywhere else.
    seed_default_page_settings(group.id, db)
    db.commit()
    db.refresh(group)
    return _group_out(group, GroupRole.admin)


def _group_out(group: Group, role: GroupRole) -> GroupOut:
    return GroupOut(
        id=group.id,
        name=group.name,
        join_code=group.join_code,
        role=role,
        has_guest_password=group.guest_password_hash is not None,
        description=group.description,
        rehearsal_weekday=group.rehearsal_weekday,
        rehearsal_time=group.rehearsal_time,
    )


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
    return [_group_out(group, role) for group, role in rows]


@router.put("/{group_id}/guest-settings", response_model=GroupOut)
def update_guest_settings(
    group_id: str,
    payload: GroupGuestSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    """Partial patch of the guest-facing settings covered by B10 — a field
    the client didn't send is left untouched; see `GroupGuestSettingsUpdate`."""
    group = _get_group_or_404(group_id, db)
    membership = _require_admin(group_id, current_user, db)
    fields_sent = payload.model_fields_set
    if "guest_password" in fields_sent:
        group.guest_password_hash = hash_password(payload.guest_password) if payload.guest_password else None
    db.commit()
    db.refresh(group)
    return _group_out(group, membership.role)


@router.put("/{group_id}/description", response_model=GroupOut)
def update_description(
    group_id: str,
    payload: GroupDescriptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    """Admin-only, full replace — the free-text blurb shown on the group's
    Info/About page to every member (and to guests, since it carries no
    more sensitivity than the group name itself)."""
    group = _get_group_or_404(group_id, db)
    membership = _require_admin(group_id, current_user, db)
    group.description = payload.description
    db.commit()
    db.refresh(group)
    return _group_out(group, membership.role)


_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


@router.put("/{group_id}/rehearsal-schedule", response_model=GroupOut)
def update_rehearsal_schedule(
    group_id: str,
    payload: GroupRehearsalScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    """Admin-only, full replace — a regular weekly rehearsal slot (e.g.
    "Wednesdays at 7pm") the Responsibilities "Add a date" form can offer
    as a one-click "Next rehearsal" fill. Both fields are set or cleared
    together: `weekday`+`time` both present sets it, both `None` clears
    it, anything else (one set, one not) is a 400 — a weekday with no time
    (or vice versa) isn't a schedule anyone could compute "next" from."""
    group = _get_group_or_404(group_id, db)
    membership = _require_admin(group_id, current_user, db)

    if (payload.rehearsal_weekday is None) != (payload.rehearsal_time is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="rehearsal_weekday and rehearsal_time must be set or cleared together",
        )
    if payload.rehearsal_weekday is not None and not (0 <= payload.rehearsal_weekday <= 6):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rehearsal_weekday must be 0-6 (Monday-Sunday)")
    if payload.rehearsal_time is not None and not _TIME_RE.match(payload.rehearsal_time):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rehearsal_time must be \"HH:MM\" (24h)")

    group.rehearsal_weekday = payload.rehearsal_weekday
    group.rehearsal_time = payload.rehearsal_time
    db.commit()
    db.refresh(group)
    return _group_out(group, membership.role)


@router.get("/{group_id}/page-settings", response_model=list[GroupPageSettingOut])
def get_page_settings(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupPageSettings]:
    """B12: admin-only view of all 5 pages' `enabled`/`audience` settings."""
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    return (
        db.query(GroupPageSettings)
        .filter(GroupPageSettings.group_id == group_id)
        .order_by(GroupPageSettings.page)
        .all()
    )


@router.put("/{group_id}/page-settings", response_model=list[GroupPageSettingOut])
def update_page_settings(
    group_id: str,
    payload: GroupPageSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupPageSettings]:
    """B12: admin-only update of one or more pages' `enabled`/`audience` —
    every group already has all 5 rows (seeded at creation / backfilled),
    so this always updates existing rows rather than creating them."""
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    rows_by_page = {
        row.page: row
        for row in db.query(GroupPageSettings).filter(GroupPageSettings.group_id == group_id).all()
    }
    for update in payload.pages:
        row = rows_by_page.get(update.page)
        if row is None:
            # Defensive only — every group should already have this row;
            # create it rather than silently dropping the admin's change.
            row = GroupPageSettings(group_id=group_id, page=update.page)
            db.add(row)
            rows_by_page[update.page] = row
        row.enabled = update.enabled
        row.audience = update.audience
    db.commit()
    return (
        db.query(GroupPageSettings)
        .filter(GroupPageSettings.group_id == group_id)
        .order_by(GroupPageSettings.page)
        .all()
    )


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
def list_members(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupMemberOut]:
    _get_group_or_404(group_id, db)
    if _get_membership(group_id, current_user.id, db) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
    require_member_page_access(group_id, GroupPage.members, current_user.id, db)
    rows = (
        db.query(User, GroupMembership.role, GroupMembership.title)
        .join(GroupMembership, GroupMembership.user_id == User.id)
        .filter(GroupMembership.group_id == group_id)
        .all()
    )
    return [
        GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=role, title=title)
        for user, role, title in rows
    ]


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
    if membership.role == GroupRole.admin and _remaining_admins_excluding(group_id, user_id, db) == 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove the last admin")
    db.delete(membership)
    db.commit()


@router.put("/{group_id}/members/{user_id}/role", response_model=GroupMemberOut)
def update_member_role(
    group_id: str,
    user_id: str,
    payload: GroupMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupMemberOut:
    """Admin-only. Demoting the last admin is blocked the same way removing
    them is (`_remaining_admins_excluding`) — promoting has no such risk,
    so that direction is always allowed."""
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    membership = _get_membership(group_id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member")
    if (
        membership.role == GroupRole.admin
        and payload.role == GroupRole.member
        and _remaining_admins_excluding(group_id, user_id, db) == 0
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot demote the last admin")
    membership.role = payload.role
    db.commit()
    user = db.get(User, user_id)
    assert user is not None
    return GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=membership.role, title=membership.title)


@router.put("/{group_id}/members/{user_id}/title", response_model=GroupMemberOut)
def update_member_title(
    group_id: str,
    user_id: str,
    payload: GroupMemberTitleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupMemberOut:
    """Admin-only, full replace — free-text context shown next to this
    member on the Members page (e.g. "Soprano 2 — Section leader")."""
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    membership = _get_membership(group_id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member")
    membership.title = payload.title
    db.commit()
    user = db.get(User, user_id)
    assert user is not None
    return GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=membership.role, title=membership.title)
