"""Responsibilities routes (B13): recurring-duty signup sheets, scoped down
to one-off dates only (see `Backend/plan.md`'s B13 for what was deferred).

Four path shapes on one router, same "combine related resources on one
router, split by path prefix" convention `homework.py` uses:
`/groups/{group_id}/responsibilities/schedules` and `.../dates` (group-scoped
list/create), `/responsibilities/schedules/{id}`, `/responsibilities/roles/
{id}`, `/responsibilities/dates/{id}` (single-resource get/edit, since once
you have an id you don't need the group in the path), and
`/responsibilities/dates/{id}/signups` / `/responsibilities/signups/{id}`
for the member-facing signup/removal actions.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import (
    ResponsibilityDateCreate,
    ResponsibilityDateOut,
    ResponsibilityDateScheduleAttach,
    ResponsibilityDateScheduleGroupOut,
    ResponsibilityDateUpdate,
    ResponsibilityRoleCoverageOut,
    ResponsibilityRoleCreate,
    ResponsibilityRoleOut,
    ResponsibilityRoleUpdate,
    ResponsibilityScheduleCreate,
    ResponsibilityScheduleOut,
    ResponsibilityScheduleUpdate,
    ResponsibilitySignupCreate,
    ResponsibilitySignupOut,
)
from app.db.models import (
    GroupPage,
    GroupRole,
    ResponsibilityDate,
    ResponsibilityDateSchedule,
    ResponsibilityRole,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    User,
)
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, group_role, require_admin, require_member
from app.services.pages import require_member_page_access
from app.services.responsibilities import role_coverage

router = APIRouter(tags=["responsibilities"])


def _is_admin(group_id: str, user: User, db: Session) -> bool:
    """Non-raising variant of `require_admin` — a couple of read routes here
    tailor their response to whether the caller is an admin rather than
    gating on it."""
    return group_role(group_id, user.id, db) == GroupRole.admin


def _get_schedule_or_404(schedule_id: str, db: Session) -> ResponsibilitySchedule:
    return get_or_404(db, ResponsibilitySchedule, schedule_id, "Schedule not found")


def _get_role_or_404(role_id: str, db: Session) -> ResponsibilityRole:
    return get_or_404(db, ResponsibilityRole, role_id, "Role not found")


def _get_date_or_404(date_id: str, db: Session) -> ResponsibilityDate:
    return get_or_404(db, ResponsibilityDate, date_id, "Date not found")


def _get_signup_or_404(signup_id: str, db: Session) -> ResponsibilitySignup:
    return get_or_404(db, ResponsibilitySignup, signup_id, "Signup not found")


def _roles_for_schedule(schedule_id: str, db: Session) -> list[ResponsibilityRole]:
    return (
        db.query(ResponsibilityRole)
        .filter(ResponsibilityRole.schedule_id == schedule_id)
        .order_by(ResponsibilityRole.created_at.asc())
        .all()
    )


def _schedules_for_date(date_id: str, db: Session) -> list[ResponsibilitySchedule]:
    """Every role set attached to a date, in attach order (`created_at` on
    the join row), which is the order the role-set groups are shown under
    the date."""
    return (
        db.query(ResponsibilitySchedule)
        .join(
            ResponsibilityDateSchedule,
            ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
        )
        .filter(ResponsibilityDateSchedule.date_id == date_id)
        .order_by(ResponsibilityDateSchedule.created_at.asc())
        .all()
    )


def _group_id_for_date(date: ResponsibilityDate, db: Session) -> str:
    """The owning group of a date, resolved through any one of its attached
    role sets (they all belong to the same group). A date always keeps at
    least one attachment (see `detach_schedule`), so no attachment means the
    date is effectively gone, treated as a 404 the same way a missing id
    would be."""
    schedule = (
        db.query(ResponsibilitySchedule)
        .join(
            ResponsibilityDateSchedule,
            ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
        )
        .filter(ResponsibilityDateSchedule.date_id == date.id)
        .order_by(ResponsibilityDateSchedule.created_at.asc())
        .first()
    )
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Date not found")
    return schedule.group_id


def _schedule_out(schedule: ResponsibilitySchedule, db: Session) -> ResponsibilityScheduleOut:
    return ResponsibilityScheduleOut(
        id=schedule.id,
        group_id=schedule.group_id,
        name=schedule.name,
        created_by=schedule.created_by,
        created_at=schedule.created_at,
        roles=[ResponsibilityRoleOut.model_validate(r) for r in _roles_for_schedule(schedule.id, db)],
    )


def _signup_out(signup: ResponsibilitySignup, user: User | None) -> ResponsibilitySignupOut:
    """A signup either belongs to a real member (`user` set) or is an
    admin-assigned name with no account at all (`user` `None`, display name
    comes from `signup.guest_name` instead) — see `ResponsibilitySignup`'s
    own docstring for why those two are mutually exclusive."""
    if user is not None:
        return ResponsibilitySignupOut(id=signup.id, user_id=user.id, name=user.name, email=user.email, created_at=signup.created_at)
    return ResponsibilitySignupOut(
        id=signup.id, user_id=None, name=signup.guest_name or "Unnamed", email=None, created_at=signup.created_at
    )


def _date_out(date: ResponsibilityDate, db: Session) -> ResponsibilityDateOut:
    """One date with its coverage rolled up across every attached role set:
    one `ResponsibilityDateScheduleGroupOut` per role set, in attach order,
    each carrying that role set's per-role coverage exactly as the old
    single-schedule view did."""
    schedule_groups: list[ResponsibilityDateScheduleGroupOut] = []
    for schedule in _schedules_for_date(date.id, db):
        role_outs: list[ResponsibilityRoleCoverageOut] = []
        for role in _roles_for_schedule(schedule.id, db):
            active_count, coverage_status, signups = role_coverage(date.id, role, db)
            role_outs.append(
                ResponsibilityRoleCoverageOut(
                    role_id=role.id,
                    role_name=role.name,
                    needed_count=role.needed_count,
                    active_count=active_count,
                    status=coverage_status,
                    signups=[_signup_out(s, u) for s, u in signups],
                )
            )
        schedule_groups.append(
            ResponsibilityDateScheduleGroupOut(
                schedule_id=schedule.id,
                schedule_name=schedule.name,
                roles=role_outs,
            )
        )
    return ResponsibilityDateOut(
        id=date.id,
        date=date.date,
        notes=date.notes,
        locked=date.locked,
        canceled=date.canceled,
        schedules=schedule_groups,
    )


@router.post(
    "/groups/{group_id}/responsibilities/schedules",
    response_model=ResponsibilityScheduleOut,
    status_code=status.HTTP_201_CREATED,
)
def create_schedule(
    group_id: str,
    payload: ResponsibilityScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityScheduleOut:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    schedule = ResponsibilitySchedule(group_id=group_id, name=payload.name, created_by=current_user.id)
    db.add(schedule)
    db.flush()
    for role_payload in payload.roles:
        db.add(
            ResponsibilityRole(
                schedule_id=schedule.id, name=role_payload.name, needed_count=role_payload.needed_count
            )
        )
    db.commit()
    db.refresh(schedule)
    return _schedule_out(schedule, db)


@router.get("/groups/{group_id}/responsibilities/schedules", response_model=list[ResponsibilityScheduleOut])
def list_schedules(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ResponsibilityScheduleOut]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.responsibilities, current_user.id, db)
    schedules = (
        db.query(ResponsibilitySchedule)
        .filter(ResponsibilitySchedule.group_id == group_id)
        .order_by(ResponsibilitySchedule.created_at.asc())
        .all()
    )
    return [_schedule_out(s, db) for s in schedules]


@router.patch("/responsibilities/schedules/{schedule_id}", response_model=ResponsibilityScheduleOut)
def update_schedule(
    schedule_id: str,
    payload: ResponsibilityScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityScheduleOut:
    schedule = _get_schedule_or_404(schedule_id, db)
    require_admin(schedule.group_id, current_user, db)
    if "name" in payload.model_fields_set and payload.name is not None:
        schedule.name = payload.name
    db.commit()
    db.refresh(schedule)
    return _schedule_out(schedule, db)


@router.delete("/responsibilities/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Admin-only, and a real delete (not a status flip like a date's
    lock/cancel): a schedule with the wrong name/roles entirely is more
    likely a setup mistake to undo than something worth keeping around.
    No FK cascade at the DB level (see `models.py`), so this walks every
    date this role set is attached to: if it's that date's only attachment
    the date goes too (its signups first, then the date); otherwise the
    date survives under its other role sets and only this role set's roles'
    signups on it are cleared, plus the join row. Then any remaining join
    rows for this schedule, its roles, and finally the schedule itself."""
    schedule = _get_schedule_or_404(schedule_id, db)
    require_admin(schedule.group_id, current_user, db)
    role_ids = [r.id for r in _roles_for_schedule(schedule_id, db)]
    links = (
        db.query(ResponsibilityDateSchedule)
        .filter(ResponsibilityDateSchedule.schedule_id == schedule_id)
        .all()
    )
    for link in links:
        other_attachments = (
            db.query(ResponsibilityDateSchedule)
            .filter(
                ResponsibilityDateSchedule.date_id == link.date_id,
                ResponsibilityDateSchedule.schedule_id != schedule_id,
            )
            .count()
        )
        if other_attachments == 0:
            db.query(ResponsibilitySignup).filter(
                ResponsibilitySignup.date_id == link.date_id
            ).delete(synchronize_session=False)
            db.query(ResponsibilityDateSchedule).filter(
                ResponsibilityDateSchedule.date_id == link.date_id
            ).delete(synchronize_session=False)
            db.query(ResponsibilityDate).filter(ResponsibilityDate.id == link.date_id).delete(
                synchronize_session=False
            )
        else:
            if role_ids:
                db.query(ResponsibilitySignup).filter(
                    ResponsibilitySignup.date_id == link.date_id,
                    ResponsibilitySignup.role_id.in_(role_ids),
                ).delete(synchronize_session=False)
            db.query(ResponsibilityDateSchedule).filter(
                ResponsibilityDateSchedule.id == link.id
            ).delete(synchronize_session=False)
    db.query(ResponsibilityDateSchedule).filter(
        ResponsibilityDateSchedule.schedule_id == schedule_id
    ).delete(synchronize_session=False)
    db.query(ResponsibilityRole).filter(ResponsibilityRole.schedule_id == schedule_id).delete(
        synchronize_session=False
    )
    db.delete(schedule)
    db.commit()


@router.post(
    "/responsibilities/schedules/{schedule_id}/roles",
    response_model=ResponsibilityRoleOut,
    status_code=status.HTTP_201_CREATED,
)
def add_role(
    schedule_id: str,
    payload: ResponsibilityRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityRole:
    schedule = _get_schedule_or_404(schedule_id, db)
    require_admin(schedule.group_id, current_user, db)
    role = ResponsibilityRole(schedule_id=schedule_id, name=payload.name, needed_count=payload.needed_count)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.patch("/responsibilities/roles/{role_id}", response_model=ResponsibilityRoleOut)
def update_role(
    role_id: str,
    payload: ResponsibilityRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityRole:
    role = _get_role_or_404(role_id, db)
    schedule = _get_schedule_or_404(role.schedule_id, db)
    require_admin(schedule.group_id, current_user, db)
    fields_sent = payload.model_fields_set
    if "name" in fields_sent and payload.name is not None:
        role.name = payload.name
    if "needed_count" in fields_sent and payload.needed_count is not None:
        role.needed_count = payload.needed_count
    db.commit()
    db.refresh(role)
    return role


@router.delete("/responsibilities/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    role = _get_role_or_404(role_id, db)
    schedule = _get_schedule_or_404(role.schedule_id, db)
    require_admin(schedule.group_id, current_user, db)
    db.query(ResponsibilitySignup).filter(ResponsibilitySignup.role_id == role_id).delete(synchronize_session=False)
    db.delete(role)
    db.commit()


@router.post(
    "/groups/{group_id}/responsibilities/dates",
    response_model=ResponsibilityDateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_date(
    group_id: str,
    payload: ResponsibilityDateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityDateOut:
    """A date is created against a group, not a single role set: `schedule_ids`
    attaches it to one or more role sets at once, and its coverage view is
    rolled up across all of them. At least one role set is required, and
    every id must name a role set in this group."""
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    if not payload.schedule_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Pick at least one role set"
        )
    schedule_ids: list[str] = []
    for sid in payload.schedule_ids:
        if sid in schedule_ids:
            continue  # de-dupe repeated ids in the request
        schedule = _get_schedule_or_404(sid, db)
        if schedule.group_id != group_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Role set not found for this group"
            )
        schedule_ids.append(sid)
    date = ResponsibilityDate(date=payload.date, notes=payload.notes)
    db.add(date)
    db.flush()
    for sid in schedule_ids:
        db.add(ResponsibilityDateSchedule(date_id=date.id, schedule_id=sid))
    db.commit()
    db.refresh(date)
    return _date_out(date, db)


@router.post("/responsibilities/dates/{date_id}/schedules", response_model=ResponsibilityDateOut)
def attach_schedule(
    date_id: str,
    payload: ResponsibilityDateScheduleAttach,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityDateOut:
    """Add another role set to an existing date (admin-only). The date's
    coverage view then gains that role set's group of roles. 409 if it's
    already attached."""
    date = _get_date_or_404(date_id, db)
    group_id = _group_id_for_date(date, db)
    require_admin(group_id, current_user, db)
    schedule = _get_schedule_or_404(payload.schedule_id, db)
    if schedule.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role set not found for this group"
        )
    already = (
        db.query(ResponsibilityDateSchedule)
        .filter(
            ResponsibilityDateSchedule.date_id == date_id,
            ResponsibilityDateSchedule.schedule_id == payload.schedule_id,
        )
        .first()
    )
    if already is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That role set is already on this date"
        )
    db.add(ResponsibilityDateSchedule(date_id=date_id, schedule_id=payload.schedule_id))
    db.commit()
    db.refresh(date)
    return _date_out(date, db)


@router.delete(
    "/responsibilities/dates/{date_id}/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def detach_schedule(
    date_id: str,
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove one role set from a date (admin-only). Deletes that role set's
    roles' signups on this date first (no FK cascade at the DB level), then
    the join row. A date must keep at least one role set, so detaching the
    last one is a 409 (delete the date instead)."""
    date = _get_date_or_404(date_id, db)
    group_id = _group_id_for_date(date, db)
    require_admin(group_id, current_user, db)
    link = (
        db.query(ResponsibilityDateSchedule)
        .filter(
            ResponsibilityDateSchedule.date_id == date_id,
            ResponsibilityDateSchedule.schedule_id == schedule_id,
        )
        .first()
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="That role set is not on this date"
        )
    attached_count = (
        db.query(ResponsibilityDateSchedule)
        .filter(ResponsibilityDateSchedule.date_id == date_id)
        .count()
    )
    if attached_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A date must keep at least one role set"
        )
    role_ids = [r.id for r in _roles_for_schedule(schedule_id, db)]
    if role_ids:
        db.query(ResponsibilitySignup).filter(
            ResponsibilitySignup.date_id == date_id,
            ResponsibilitySignup.role_id.in_(role_ids),
        ).delete(synchronize_session=False)
    db.delete(link)
    db.commit()


@router.patch("/responsibilities/dates/{date_id}", response_model=ResponsibilityDateOut)
def update_date(
    date_id: str,
    payload: ResponsibilityDateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityDateOut:
    """Covers edit/lock/cancel in one partial-patch endpoint — a locked or
    canceled date is just a field flip, not a different resource."""
    date = _get_date_or_404(date_id, db)
    group_id = _group_id_for_date(date, db)
    require_admin(group_id, current_user, db)
    fields_sent = payload.model_fields_set
    if "date" in fields_sent and payload.date is not None:
        date.date = payload.date
    if "notes" in fields_sent and payload.notes is not None:
        date.notes = payload.notes
    if "locked" in fields_sent and payload.locked is not None:
        date.locked = payload.locked
    if "canceled" in fields_sent and payload.canceled is not None:
        date.canceled = payload.canceled
    db.commit()
    db.refresh(date)
    return _date_out(date, db)


@router.delete("/responsibilities/dates/{date_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_date(
    date_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Admin-only, a real delete — distinct from `canceled` (a status flip
    that keeps the date and its signup history around). Cleans up its
    signups first (no FK cascade at the DB level, same as schedule/role
    deletion above)."""
    date = _get_date_or_404(date_id, db)
    group_id = _group_id_for_date(date, db)
    require_admin(group_id, current_user, db)
    db.query(ResponsibilitySignup).filter(ResponsibilitySignup.date_id == date_id).delete(synchronize_session=False)
    db.query(ResponsibilityDateSchedule).filter(ResponsibilityDateSchedule.date_id == date_id).delete(
        synchronize_session=False
    )
    db.delete(date)
    db.commit()


@router.get("/groups/{group_id}/responsibilities/dates", response_model=list[ResponsibilityDateOut])
def list_group_dates(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ResponsibilityDateOut]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.responsibilities, current_user.id, db)
    dates = (
        db.query(ResponsibilityDate)
        .join(ResponsibilityDateSchedule, ResponsibilityDateSchedule.date_id == ResponsibilityDate.id)
        .join(
            ResponsibilitySchedule,
            ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
        )
        .filter(ResponsibilitySchedule.group_id == group_id)
        .order_by(ResponsibilityDate.date.asc())
        .distinct()
        .all()
    )
    # `distinct()` collapses the fan-out from a date attached to several
    # role sets, so it appears once, with its role sets grouped inside
    # `_date_out`.
    return [_date_out(date, db) for date in dates]


@router.post(
    "/responsibilities/dates/{date_id}/signups",
    response_model=ResponsibilitySignupOut,
    status_code=status.HTTP_201_CREATED,
)
def create_signup(
    date_id: str,
    payload: ResponsibilitySignupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilitySignupOut:
    """No `user_id`/`name` in the body means "sign myself up" (blocked once
    the date is locked or canceled); an explicit `user_id` for someone else,
    or a `name` with no `user_id` for someone with no account at all, is an
    admin assignment, which bypasses the lock — matching B13's "admin can
    assign/remove any member's signup regardless of lock state"."""
    date = _get_date_or_404(date_id, db)
    group_id = _group_id_for_date(date, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.responsibilities, current_user.id, db)
    role = _get_role_or_404(payload.role_id, db)
    attached_schedule_ids = {s.id for s in _schedules_for_date(date.id, db)}
    if role.schedule_id not in attached_schedule_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role not found for this date's schedule(s)"
        )

    is_admin = _is_admin(group_id, current_user, db)
    guest_name = (payload.name or "").strip() or None

    if guest_name is not None:
        # Admin-only: a volunteer with no Divisi account at all — see
        # `ResponsibilitySignup`'s own docstring for why this and `user_id`
        # are mutually exclusive.
        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to assign a name")
        if payload.user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a member or a name, not both")
        signup = ResponsibilitySignup(date_id=date_id, role_id=role.id, user_id=None, guest_name=guest_name)
        db.add(signup)
        db.commit()
        db.refresh(signup)
        return _signup_out(signup, None)

    target_user_id = payload.user_id or current_user.id
    if target_user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to sign up another member"
        )
    if target_user_id != current_user.id and group_role(group_id, target_user_id, db) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That user is not a member of this group")
    if not is_admin and (date.locked or date.canceled):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This date is locked or canceled")

    signup = ResponsibilitySignup(date_id=date_id, role_id=role.id, user_id=target_user_id)
    db.add(signup)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Already signed up for this role on this date"
        ) from exc
    db.refresh(signup)
    user = db.get(User, target_user_id)
    assert user is not None
    return _signup_out(signup, user)


@router.delete("/responsibilities/signups/{signup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_signup(
    signup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    signup = _get_signup_or_404(signup_id, db)
    date = _get_date_or_404(signup.date_id, db)
    group_id = _group_id_for_date(date, db)
    is_admin = _is_admin(group_id, current_user, db)
    if signup.user_id != current_user.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only remove your own signup")
    if not is_admin and date.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This date is locked")
    db.delete(signup)
    db.commit()
