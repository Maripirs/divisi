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
    Group,
    GroupPage,
    GroupRole,
    ResponsibilityDate,
    ResponsibilityRole,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    User,
)
from app.db.session import get_db
from app.services.pages import require_member_page_access
from app.services.pieces import group_role
from app.services.responsibilities import role_coverage

router = APIRouter(tags=["responsibilities"])


def _get_group_or_404(group_id: str, db: Session) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


def _require_member(group_id: str, user: User, db: Session) -> None:
    if group_role(group_id, user.id, db) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


def _is_admin(group_id: str, user: User, db: Session) -> bool:
    return group_role(group_id, user.id, db) == GroupRole.admin


def _require_admin(group_id: str, user: User, db: Session) -> None:
    if not _is_admin(group_id, user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


def _get_schedule_or_404(schedule_id: str, db: Session) -> ResponsibilitySchedule:
    schedule = db.get(ResponsibilitySchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return schedule


def _get_role_or_404(role_id: str, db: Session) -> ResponsibilityRole:
    role = db.get(ResponsibilityRole, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


def _get_date_or_404(date_id: str, db: Session) -> ResponsibilityDate:
    date = db.get(ResponsibilityDate, date_id)
    if date is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Date not found")
    return date


def _get_signup_or_404(signup_id: str, db: Session) -> ResponsibilitySignup:
    signup = db.get(ResponsibilitySignup, signup_id)
    if signup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signup not found")
    return signup


def _roles_for_schedule(schedule_id: str, db: Session) -> list[ResponsibilityRole]:
    return (
        db.query(ResponsibilityRole)
        .filter(ResponsibilityRole.schedule_id == schedule_id)
        .order_by(ResponsibilityRole.created_at.asc())
        .all()
    )


def _schedule_out(schedule: ResponsibilitySchedule, db: Session) -> ResponsibilityScheduleOut:
    return ResponsibilityScheduleOut(
        id=schedule.id,
        group_id=schedule.group_id,
        name=schedule.name,
        created_by=schedule.created_by,
        created_at=schedule.created_at,
        roles=[ResponsibilityRoleOut.model_validate(r) for r in _roles_for_schedule(schedule.id, db)],
    )


def _date_out(date: ResponsibilityDate, schedule: ResponsibilitySchedule, db: Session) -> ResponsibilityDateOut:
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
                signups=[
                    ResponsibilitySignupOut(id=s.id, user_id=u.id, name=u.name, email=u.email, created_at=s.created_at)
                    for s, u in signups
                ],
            )
        )
    return ResponsibilityDateOut(
        id=date.id,
        schedule_id=schedule.id,
        schedule_name=schedule.name,
        date=date.date,
        notes=date.notes,
        locked=date.locked,
        canceled=date.canceled,
        roles=role_outs,
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
    _get_group_or_404(group_id, db)
    _require_admin(group_id, current_user, db)
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
    _get_group_or_404(group_id, db)
    _require_member(group_id, current_user, db)
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
    _require_admin(schedule.group_id, current_user, db)
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
    lock/cancel) — a schedule with the wrong name/roles entirely is more
    likely a setup mistake to undo than something worth keeping around.
    No FK cascade at the DB level (see `models.py`), so this cleans up its
    dates' signups, then the dates, then the roles, before the schedule
    itself, in that order."""
    schedule = _get_schedule_or_404(schedule_id, db)
    _require_admin(schedule.group_id, current_user, db)
    dates = db.query(ResponsibilityDate).filter(ResponsibilityDate.schedule_id == schedule_id).all()
    date_ids = [d.id for d in dates]
    if date_ids:
        db.query(ResponsibilitySignup).filter(ResponsibilitySignup.date_id.in_(date_ids)).delete(
            synchronize_session=False
        )
        db.query(ResponsibilityDate).filter(ResponsibilityDate.id.in_(date_ids)).delete(synchronize_session=False)
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
    _require_admin(schedule.group_id, current_user, db)
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
    _require_admin(schedule.group_id, current_user, db)
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
    _require_admin(schedule.group_id, current_user, db)
    db.query(ResponsibilitySignup).filter(ResponsibilitySignup.role_id == role_id).delete(synchronize_session=False)
    db.delete(role)
    db.commit()


@router.post(
    "/responsibilities/schedules/{schedule_id}/dates",
    response_model=ResponsibilityDateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_date(
    schedule_id: str,
    payload: ResponsibilityDateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResponsibilityDateOut:
    schedule = _get_schedule_or_404(schedule_id, db)
    _require_admin(schedule.group_id, current_user, db)
    date = ResponsibilityDate(schedule_id=schedule_id, date=payload.date, notes=payload.notes)
    db.add(date)
    db.commit()
    db.refresh(date)
    return _date_out(date, schedule, db)


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
    schedule = _get_schedule_or_404(date.schedule_id, db)
    _require_admin(schedule.group_id, current_user, db)
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
    return _date_out(date, schedule, db)


@router.get("/groups/{group_id}/responsibilities/dates", response_model=list[ResponsibilityDateOut])
def list_group_dates(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ResponsibilityDateOut]:
    _get_group_or_404(group_id, db)
    _require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.responsibilities, current_user.id, db)
    rows = (
        db.query(ResponsibilityDate, ResponsibilitySchedule)
        .join(ResponsibilitySchedule, ResponsibilityDate.schedule_id == ResponsibilitySchedule.id)
        .filter(ResponsibilitySchedule.group_id == group_id)
        .order_by(ResponsibilityDate.date.asc())
        .all()
    )
    return [_date_out(date, schedule, db) for date, schedule in rows]


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
    """No `user_id` in the body means "sign myself up" (blocked once the
    date is locked or canceled); an explicit `user_id` for someone else is
    an admin assignment, which bypasses the lock — matching B13's "admin can
    assign/remove any member's signup regardless of lock state"."""
    date = _get_date_or_404(date_id, db)
    schedule = _get_schedule_or_404(date.schedule_id, db)
    group_id = schedule.group_id
    _require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.responsibilities, current_user.id, db)
    role = _get_role_or_404(payload.role_id, db)
    if role.schedule_id != schedule.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found for this date's schedule")

    is_admin = _is_admin(group_id, current_user, db)
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
    return ResponsibilitySignupOut(id=signup.id, user_id=user.id, name=user.name, email=user.email, created_at=signup.created_at)


@router.delete("/responsibilities/signups/{signup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_signup(
    signup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    signup = _get_signup_or_404(signup_id, db)
    date = _get_date_or_404(signup.date_id, db)
    schedule = _get_schedule_or_404(date.schedule_id, db)
    group_id = schedule.group_id
    is_admin = _is_admin(group_id, current_user, db)
    if signup.user_id != current_user.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only remove your own signup")
    if not is_admin and date.locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This date is locked")
    db.delete(signup)
    db.commit()
