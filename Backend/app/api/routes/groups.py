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
    GroupJoinIn,
    GroupMemberAdd,
    GroupMemberMergeIn,
    GroupMemberOut,
    GroupMemberRoleUpdate,
    GroupMemberTitleUpdate,
    GroupOut,
    GroupPageSettingOut,
    GroupPageSettingsUpdate,
    GroupRehearsalScheduleUpdate,
    KnownNameOut,
    KnownNameRenameIn,
)
from app.core.config import get_settings
from app.core.join_codes import generate_join_code
from app.core.rate_limit import rate_limit_guest
from app.core.security import hash_password
from app.db.models import Group, GroupMembership, GroupPage, GroupPageSettings, GroupRole, User
from app.db.session import get_db
from app.services.actors import is_group_admin
from app.services.groups import get_group_or_404
from app.services.known_names import list_known_names, rename_known_name
from app.services.pages import require_member_page_access, seed_default_page_settings
from app.services.participants import merge_participant

router = APIRouter(prefix="/groups", tags=["groups"])

_JOIN_CODE_CREATE_ATTEMPTS = 5


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


@router.post("/join", response_model=GroupOut)
def join_group_by_code(
    payload: GroupJoinIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rl: None = Depends(rate_limit_guest),
) -> GroupOut:
    """Self-join by join code for a signed-in account: the path a member
    takes after following a group's join link and then registering or
    logging in. Without it the only way into a group was an admin adding
    you by email, so a fresh account holding a perfectly valid join code
    could see the guest view but never become a member.

    Consistent with `guest.py`'s model, where holding the join code is
    already the guest credential on its own: the code alone authorizes a
    plain `member` membership here too, and it shares the guest routes'
    per-IP rate limit since it's the same code-guessing surface.

    Idempotent: an existing membership comes back unchanged (200, not a
    409), except that a leftover `is_guest` flag is cleared now that the
    account is a real one. Anonymous participants are refused (they join
    through the guest routes, flagged `is_guest`), and so is the public
    demo group (`Settings.demo_join_code`): signed-in visitors browse it
    as guests and must never be silently added to it."""
    if current_user.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Create an account or log in to join a group",
        )
    code = payload.join_code.strip().upper()
    settings = get_settings()
    if settings.demo_join_code and code == settings.demo_join_code.strip().upper():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The demo group can't be joined")
    # Codes are generated uppercase (`app/core/join_codes.py`), so
    # uppercasing the input is all case-insensitivity needs, and it keeps
    # the lookup on the unique index.
    group = db.query(Group).filter(Group.join_code == code).first() if code else None
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join code not found")
    membership = _get_membership(group.id, current_user.id, db)
    if membership is None:
        membership = GroupMembership(group_id=group.id, user_id=current_user.id, role=GroupRole.member)
        db.add(membership)
        db.commit()
    elif membership.is_guest:
        membership.is_guest = False
        db.commit()
    return _group_out(group, membership.role)


@router.put("/{group_id}/guest-settings", response_model=GroupOut)
def update_guest_settings(
    group_id: str,
    payload: GroupGuestSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    """Partial patch of the guest-facing settings covered by B10 — a field
    the client didn't send is left untouched; see `GroupGuestSettingsUpdate`."""
    group = get_group_or_404(group_id, db)
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
    group = get_group_or_404(group_id, db)
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
    group = get_group_or_404(group_id, db)
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
    get_group_or_404(group_id, db)
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
    get_group_or_404(group_id, db)
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
        # B19: applied only when the caller sent it, so an existing PUT
        # payload that omits `min_identity` leaves the page's floor as-is.
        if update.min_identity is not None:
            row.min_identity = update.min_identity
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
    get_group_or_404(group_id, db)
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
        GroupMemberOut(
            user_id=user.id,
            email=user.email,
            name=user.name,
            role=role,
            title=title,
            is_anonymous=user.is_anonymous,
        )
        for user, role, title in rows
    ]


@router.post("/{group_id}/members", response_model=GroupMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    group_id: str,
    payload: GroupMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupMemberOut:
    get_group_or_404(group_id, db)
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
    get_group_or_404(group_id, db)
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
    get_group_or_404(group_id, db)
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
    get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    membership = _get_membership(group_id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member")
    membership.title = payload.title
    db.commit()
    user = db.get(User, user_id)
    assert user is not None
    return GroupMemberOut(user_id=user.id, email=user.email, name=user.name, role=membership.role, title=membership.title)


@router.post("/{group_id}/members/{user_id}/merge", response_model=GroupMemberOut)
def merge_member(
    group_id: str,
    user_id: str,
    payload: GroupMemberMergeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupMemberOut:
    """Admin-only: fold an unverified participant (`user_id`, an anonymous
    guest row) into a real member of this group, e.g. a guest who later
    registered and joined, leaving the roster with two of them. Everything
    the guest did moves via `merge_participant`, then the guest row is
    gone.

    `merge_participant` moves the participant's data across *every* group,
    so this refuses a participant who also belongs to some other group:
    this admin only speaks for this one. The target keeps its own
    membership, ending with the higher of the two roles (merging an
    unverified admin never silently drops admin rights, and since the
    target then holds them, the group can't lose its last admin this way)
    and picking up the guest's title if it had none."""
    get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
    source_membership = _get_membership(group_id, user_id, db)
    if source_membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User is not a member")
    source = db.get(User, user_id)
    assert source is not None
    if not source.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only an unverified participant can be merged into another member",
        )
    if payload.target_user_id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can't merge a member into itself")
    target_membership = _get_membership(group_id, payload.target_user_id, db)
    if target_membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target is not a member of this group")
    target = db.get(User, payload.target_user_id)
    assert target is not None
    if target.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Merge into a member with a real account, not another unverified participant",
        )
    other_groups = (
        db.query(GroupMembership)
        .filter(GroupMembership.user_id == source.id, GroupMembership.group_id != group_id)
        .count()
    )
    if other_groups:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This participant also belongs to another group, so merging here would move "
                "their activity there too. Ask that group's admin, or remove them there first."
            ),
        )

    if source_membership.role == GroupRole.admin:
        target_membership.role = GroupRole.admin
    if not target_membership.title and source_membership.title:
        target_membership.title = source_membership.title
    merge_participant(db, source=source, target=target)
    db.commit()
    db.refresh(target_membership)
    return GroupMemberOut(
        user_id=target.id,
        email=target.email,
        name=target.name,
        role=target_membership.role,
        title=target_membership.title,
        is_anonymous=target.is_anonymous,
    )


@router.get("/{group_id}/known-names", response_model=list[KnownNameOut])
def get_known_names(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KnownNameOut]:
    """Admin-only: every distinct free-text guest name across this group's
    Responsibilities signups and Carpool posts/claims/interests, with a
    usage count, so an admin can spot near-duplicate spellings to fix via
    `rename_known_name` below. Also includes each name's most-recent
    phone/email from Carpool, if any — safe to expose here since this
    whole route already requires admin."""
    get_group_or_404(group_id, db)
    if not is_group_admin(group_id, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return [
        KnownNameOut(name=kn.name, count=kn.count, phone=kn.phone, email=kn.email)
        for kn in list_known_names(group_id, db)
    ]


@router.post("/{group_id}/known-names/rename")
def rename_group_known_name(
    group_id: str,
    payload: KnownNameRenameIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """Admin-only: rewrite one free-text name to another everywhere it
    appears in this group (past signups, past carpool posts/claims/
    interests), a rename-that-merges-history, not a separate suggestion
    layered on top. Never touches `users.name` — real member accounts are
    out of scope."""
    get_group_or_404(group_id, db)
    if not is_group_admin(group_id, current_user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    try:
        renamed_count = rename_known_name(group_id, payload.old_name, payload.new_name, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"renamed_count": renamed_count}
