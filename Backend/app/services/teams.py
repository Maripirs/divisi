"""Shared Team/TeamRole/TeamSignup serialization, used by both the
member/admin routes (`app/api/routes/teams.py`) and the guest read route
(`app/api/routes/guest.py`), so the two can't drift on what a non-admin
caller is allowed to see. Same "shared helper, not reimplemented per-route"
shape `app/services/responsibilities.py`'s `role_coverage`/
`signup_display_name` already follow."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.schemas.teams import TeamAdminOut, TeamOut, TeamRoleOut, TeamSignupOut
from app.db.models import Team, TeamRole, TeamSignup, User


def roles_for_team(team_id: str, db: Session) -> list[TeamRole]:
    return (
        db.query(TeamRole)
        .filter(TeamRole.team_id == team_id)
        .order_by(TeamRole.sort_order.asc(), TeamRole.created_at.asc())
        .all()
    )


def signup_out(signup: TeamSignup, user: User) -> TeamSignupOut:
    return TeamSignupOut(
        id=signup.id, user_id=signup.user_id, name=user.name, text_value=signup.text_value, created_at=signup.created_at
    )


def role_out(role: TeamRole, actor: User | None, is_admin: bool, db: Session) -> TeamRoleOut:
    """`signup_count` and `my_signup` are safe for any caller; the full
    `signups` roster is only ever populated for an admin caller (empty list
    otherwise, e.g. every guest and every non-admin member) — a guest is
    never an admin, so `is_admin` must never be computed from a guest
    caller's own say-so, only from `is_group_admin` on a resolved bearer
    member."""
    signups = (
        db.query(TeamSignup).filter(TeamSignup.role_id == role.id).order_by(TeamSignup.created_at.asc()).all()
    )
    my_signup_out: TeamSignupOut | None = None
    if actor is not None:
        mine = next((s for s in signups if s.user_id == actor.id), None)
        if mine is not None:
            my_signup_out = signup_out(mine, actor)

    full_signups: list[TeamSignupOut] = []
    if is_admin and signups:
        user_ids = {s.user_id for s in signups}
        users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        full_signups = [signup_out(s, users_by_id[s.user_id]) for s in signups if s.user_id in users_by_id]

    return TeamRoleOut(
        id=role.id,
        name=role.name,
        has_text_field=role.has_text_field,
        sort_order=role.sort_order,
        signup_count=len(signups),
        my_signup=my_signup_out,
        signups=full_signups,
    )


def team_out(team: Team, actor: User | None, db: Session) -> TeamOut:
    """Member/guest-facing shape: `contact_email`/`contact_phone` are only
    the raw stored values when their respective `contact_show_*` flag is
    true, `None` otherwise. Never call this for an admin caller's own view
    of their own team (use `team_admin_out` there) — this always redacts."""
    return TeamOut(
        id=team.id,
        name=team.name,
        description=team.description,
        contact_name=team.contact_name,
        contact_email=team.contact_email if team.contact_show_email else None,
        contact_phone=team.contact_phone if team.contact_show_phone else None,
        roles=[role_out(r, actor, is_admin=False, db=db) for r in roles_for_team(team.id, db)],
    )


def team_admin_out(team: Team, actor: User | None, db: Session) -> TeamAdminOut:
    """Admin-facing shape: true stored contact fields regardless of the show
    flags, plus the two show-booleans themselves."""
    return TeamAdminOut(
        id=team.id,
        name=team.name,
        description=team.description,
        contact_name=team.contact_name,
        contact_email=team.contact_email,
        contact_phone=team.contact_phone,
        contact_show_email=team.contact_show_email,
        contact_show_phone=team.contact_show_phone,
        roles=[role_out(r, actor, is_admin=True, db=db) for r in roles_for_team(team.id, db)],
    )
