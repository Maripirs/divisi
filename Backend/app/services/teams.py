"""Shared Team/TeamRole/TeamSignup serialization, used by both the
member/admin routes (`app/api/routes/teams.py`) and the guest read route
(`app/api/routes/guest.py`), so the two can't drift on what a non-admin
caller is allowed to see. Same "shared helper, not reimplemented per-route"
shape `app/services/responsibilities.py`'s `role_signups`/
`signup_display_name` already follow. `role_signups` below is deliberately
the same outer-join shape, for the same reason: a `guest_name`-only roster
entry has no `user_id` at all, and an inner join would silently drop it."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.schemas.teams import TeamAdminOut, TeamOut, TeamRoleOut, TeamSignupOut
from app.db.models import Team, TeamRole, TeamRoleMode, TeamSignup, User


def roles_for_team(team_id: str, db: Session) -> list[TeamRole]:
    return (
        db.query(TeamRole)
        .filter(TeamRole.team_id == team_id)
        .order_by(TeamRole.sort_order.asc(), TeamRole.created_at.asc())
        .all()
    )


def role_signups(role_id: str, db: Session) -> list[tuple[TeamSignup, User | None]]:
    """Every signup/roster row for one role, with its user if it has one,
    oldest first. An outer join, not an inner one: a `guest_name`-only
    roster entry (someone with no Divisi account at all) has no `user_id`
    at all, and an inner join would silently drop it from both the roster
    list and the count."""
    return (
        db.query(TeamSignup, User)
        .outerjoin(User, TeamSignup.user_id == User.id)
        .filter(TeamSignup.role_id == role_id)
        .order_by(TeamSignup.created_at.asc())
        .all()
    )


def signup_display_name(signup: TeamSignup, user: User | None) -> str:
    """The name to show for one signup/roster row: a real member's
    `user.name`, or the admin-assigned `guest_name` for a roster entry with
    no account at all (falling back to "Unnamed" if even that's missing).
    Mirrors `app.services.responsibilities.signup_display_name` exactly."""
    return user.name if user is not None else (signup.guest_name or "Unnamed")


def signup_out(signup: TeamSignup, user: User | None) -> TeamSignupOut:
    return TeamSignupOut(
        id=signup.id,
        user_id=signup.user_id,
        name=signup_display_name(signup, user),
        contact=signup.contact,
        text_value=signup.text_value,
        created_at=signup.created_at,
    )


def role_out(role: TeamRole, actor: User | None, is_admin: bool, db: Session) -> TeamRoleOut:
    """`signup_count` and `my_signup` are safe for any caller. The full
    `signups` roster is populated for an admin caller, or for any caller
    when this is a `roster`-mode role with `roster_visible_to_members` true.
    A published roster entry is a fact the admin chose to show every
    member, not another member's private "who's interested" state the way
    an `interest`-mode role's other signups are. `is_admin` must never be
    computed from a guest caller's own say-so, only from `is_group_admin` on
    a resolved bearer member."""
    signups = role_signups(role.id, db)

    my_signup_out: TeamSignupOut | None = None
    if actor is not None:
        mine = next((s for s, _u in signups if s.user_id == actor.id), None)
        if mine is not None:
            my_signup_out = signup_out(mine, actor)

    show_roster = is_admin or (role.mode == TeamRoleMode.roster and role.roster_visible_to_members)
    full_signups: list[TeamSignupOut] = [signup_out(s, u) for s, u in signups] if show_roster else []

    return TeamRoleOut(
        id=role.id,
        name=role.name,
        has_text_field=role.has_text_field,
        mode=role.mode,
        roster_visible_to_members=role.roster_visible_to_members,
        sort_order=role.sort_order,
        signup_count=len(signups),
        my_signup=my_signup_out,
        signups=full_signups,
    )


def team_out(team: Team, actor: User | None, db: Session) -> TeamOut:
    """Member/guest-facing shape: `contact_email`/`contact_phone` are only
    the raw stored values when their respective `contact_show_*` flag is
    true, `None` otherwise. Never call this for an admin caller's own view
    of their own team (use `team_admin_out` there): this always redacts."""
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
