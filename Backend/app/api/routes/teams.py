"""Teams routes: a group's standing list of teams/committees, each with a
list of roles that are either `interest` (member self-signup) or `roster`
(admin-maintained names, no self-signup); see `app/db/models.py`'s `Team`/
`TeamRole`/`TeamRoleMode`/`TeamSignup` docstrings and `app/api/schemas/
teams.py`'s own module docstring for the member-vs-admin data-shape split.

Three path shapes on one router, same "combine related resources on one
router, split by path prefix" convention `responsibilities.py` uses:
`/groups/{group_id}/teams` (group-scoped list/create), `/teams/{id}` and
`/teams/{id}/roles` (single-team get/edit, since once you have an id you
don't need the group in the path), `/teams/roles/{id}` (single-role
edit/delete), and `/teams/roles/{id}/signups` / `/teams/signups/{id}` for
the member-facing self-signup/admin-roster-assignment/withdraw actions.

Guest reads live in `app/api/routes/guest.py` (`GET /guest/{join_code}/
teams`), per this codebase's convention of keeping every unauthenticated
route on that one router; both routers share their team/role serialization
via `app/services/teams.py` so the two can't drift.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional, get_optional_participant
from app.api.schemas import (
    TeamAdminOut,
    TeamCreate,
    TeamMove,
    TeamOut,
    TeamRoleCreate,
    TeamRoleMove,
    TeamRoleOut,
    TeamRoleUpdate,
    TeamSignupCreate,
    TeamSignupOut,
    TeamUpdate,
)
from app.db.models import GroupPage, Team, TeamRole, TeamRoleMode, TeamSignup, User
from app.db.session import get_db
from app.services.actors import authorize_page_write_actor, is_group_admin, resolve_existing_actor, resolve_or_mint_actor
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, group_role, require_admin, require_member
from app.services.pages import require_member_page_access
from app.services.participants import set_participant_cookie
from app.services.teams import role_out, roles_for_team, signup_out, team_admin_out, team_out

router = APIRouter(tags=["teams"])


def _get_team_or_404(team_id: str, db: Session) -> Team:
    return get_or_404(db, Team, team_id, "Team not found")


def _get_role_or_404(role_id: str, db: Session) -> TeamRole:
    return get_or_404(db, TeamRole, role_id, "Role not found")


def _get_signup_or_404(signup_id: str, db: Session) -> TeamSignup:
    return get_or_404(db, TeamSignup, signup_id, "Signup not found")


@router.get("/groups/{group_id}/teams", response_model=list[TeamAdminOut] | list[TeamOut])
def list_teams(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeamAdminOut] | list[TeamOut]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.teams, current_user.id, db)
    is_admin = is_group_admin(group_id, current_user, db)
    teams = (
        db.query(Team)
        .filter(Team.group_id == group_id)
        .order_by(Team.sort_order.asc(), Team.created_at.asc())
        .all()
    )
    if is_admin:
        return [team_admin_out(t, current_user, db) for t in teams]
    return [team_out(t, current_user, db) for t in teams]


@router.post("/groups/{group_id}/teams", response_model=TeamAdminOut, status_code=status.HTTP_201_CREATED)
def create_team(
    group_id: str,
    payload: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAdminOut:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    next_sort = db.query(Team).filter(Team.group_id == group_id).count()
    team = Team(
        group_id=group_id,
        name=payload.name,
        description=payload.description,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        contact_show_email=payload.contact_show_email,
        contact_show_phone=payload.contact_show_phone,
        sort_order=next_sort,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team_admin_out(team, current_user, db)


@router.patch("/teams/{team_id}", response_model=TeamAdminOut)
def update_team(
    team_id: str,
    payload: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAdminOut:
    team = _get_team_or_404(team_id, db)
    require_admin(team.group_id, current_user, db)
    fields_sent = payload.model_fields_set
    for field in (
        "name",
        "description",
        "contact_name",
        "contact_email",
        "contact_phone",
        "contact_show_email",
        "contact_show_phone",
    ):
        if field in fields_sent:
            setattr(team, field, getattr(payload, field))
    db.commit()
    db.refresh(team)
    return team_admin_out(team, current_user, db)


@router.post("/teams/{team_id}/move", response_model=TeamAdminOut)
def move_team(
    team_id: str,
    payload: TeamMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAdminOut:
    """Swaps this team's `sort_order` with its neighbor's, `up` toward the
    front of the group's team list or `down` toward the back, a no-op (200,
    unchanged) at either end. Loads every team in the group in the exact
    same order `list_teams`/`sort_order.asc(), created_at.asc()` uses, so
    "the adjacent team" always means the one actually next to it on
    screen. Swapping the two rows' `sort_order` values (rather than
    renumbering the whole list) keeps every other team's position
    untouched."""
    team = _get_team_or_404(team_id, db)
    require_admin(team.group_id, current_user, db)
    ordered = (
        db.query(Team)
        .filter(Team.group_id == team.group_id)
        .order_by(Team.sort_order.asc(), Team.created_at.asc())
        .all()
    )
    index = next(i for i, t in enumerate(ordered) if t.id == team_id)
    neighbor_index = index - 1 if payload.direction == "up" else index + 1
    if 0 <= neighbor_index < len(ordered):
        neighbor = ordered[neighbor_index]
        team.sort_order, neighbor.sort_order = neighbor.sort_order, team.sort_order
        db.commit()
        db.refresh(team)
    return team_admin_out(team, current_user, db)


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Admin-only. No FK cascade at the DB level (this codebase's
    convention), so this cleans up its roles' signups, then the roles, then
    the team itself, by hand."""
    team = _get_team_or_404(team_id, db)
    require_admin(team.group_id, current_user, db)
    role_ids = [r.id for r in roles_for_team(team_id, db)]
    if role_ids:
        db.query(TeamSignup).filter(TeamSignup.role_id.in_(role_ids)).delete(synchronize_session=False)
    db.query(TeamRole).filter(TeamRole.team_id == team_id).delete(synchronize_session=False)
    db.delete(team)
    db.commit()


@router.post("/teams/{team_id}/roles", response_model=TeamRoleOut, status_code=status.HTTP_201_CREATED)
def add_role(
    team_id: str,
    payload: TeamRoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamRoleOut:
    team = _get_team_or_404(team_id, db)
    require_admin(team.group_id, current_user, db)
    next_sort = db.query(TeamRole).filter(TeamRole.team_id == team_id).count()
    role = TeamRole(
        team_id=team_id,
        name=payload.name,
        has_text_field=payload.has_text_field,
        mode=payload.mode,
        roster_visible_to_members=payload.roster_visible_to_members,
        sort_order=next_sort,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role_out(role, current_user, is_admin=True, db=db)


@router.patch("/teams/roles/{role_id}", response_model=TeamRoleOut)
def update_role(
    role_id: str,
    payload: TeamRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamRoleOut:
    """Toggling `has_text_field` from true to false nulls out any existing
    `text_value`s on this role's signups (the safer, simpler choice over
    silently keeping now-orphaned free text around)."""
    role = _get_role_or_404(role_id, db)
    team = _get_team_or_404(role.team_id, db)
    require_admin(team.group_id, current_user, db)
    fields_sent = payload.model_fields_set
    if "name" in fields_sent and payload.name is not None:
        role.name = payload.name
    if "has_text_field" in fields_sent and payload.has_text_field is not None:
        turning_off = role.has_text_field and not payload.has_text_field
        role.has_text_field = payload.has_text_field
        if turning_off:
            db.query(TeamSignup).filter(TeamSignup.role_id == role_id).update(
                {TeamSignup.text_value: None}, synchronize_session=False
            )
    if "mode" in fields_sent and payload.mode is not None:
        role.mode = payload.mode
    if "roster_visible_to_members" in fields_sent and payload.roster_visible_to_members is not None:
        role.roster_visible_to_members = payload.roster_visible_to_members
    db.commit()
    db.refresh(role)
    return role_out(role, current_user, is_admin=True, db=db)


@router.post("/teams/roles/{role_id}/move", response_model=TeamRoleOut)
def move_role(
    role_id: str,
    payload: TeamRoleMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamRoleOut:
    """The role-level mirror of `move_team`, scoped to the roles within this
    role's own team (not the whole group), same neighbor-swap, same no-op
    at either end, same "load in the exact order the list route uses"
    reasoning."""
    role = _get_role_or_404(role_id, db)
    team = _get_team_or_404(role.team_id, db)
    require_admin(team.group_id, current_user, db)
    ordered = roles_for_team(role.team_id, db)
    index = next(i for i, r in enumerate(ordered) if r.id == role_id)
    neighbor_index = index - 1 if payload.direction == "up" else index + 1
    if 0 <= neighbor_index < len(ordered):
        neighbor = ordered[neighbor_index]
        role.sort_order, neighbor.sort_order = neighbor.sort_order, role.sort_order
        db.commit()
        db.refresh(role)
    return role_out(role, current_user, is_admin=True, db=db)


@router.delete("/teams/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    role = _get_role_or_404(role_id, db)
    team = _get_team_or_404(role.team_id, db)
    require_admin(team.group_id, current_user, db)
    db.query(TeamSignup).filter(TeamSignup.role_id == role_id).delete(synchronize_session=False)
    db.delete(role)
    db.commit()


@router.post(
    "/teams/roles/{role_id}/signups",
    response_model=TeamSignupOut,
    status_code=status.HTTP_201_CREATED,
)
def create_signup(
    role_id: str,
    payload: TeamSignupCreate,
    response: Response,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> TeamSignupOut:
    """Two shapes, mirroring `responsibilities.create_signup`'s own split:
    an admin assignment (`payload.user_id` or `payload.name` present) is
    only valid on a `roster`-mode role, bearer-only, admin-only; the plain
    self-signup shape (neither present) is only valid on an `interest`-mode
    role, and goes through `resolve_or_mint_actor`/`authorize_page_write_actor`
    exactly as before. A client can't cross the two (self-signing up on a
    roster role, or admin-assigning onto an interest role) regardless of
    what the Frontend renders."""
    role = _get_role_or_404(role_id, db)
    team = _get_team_or_404(role.team_id, db)
    group_id = team.group_id

    guest_name = (payload.name or "").strip() or None

    if payload.user_id or payload.name:
        # Admin assignment onto a roster-mode role: an existing member by
        # `user_id`, or a name-only entry (`guest_name`) for someone with no
        # Divisi account at all. Bearer-only.
        if maybe_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        current_user = maybe_user
        require_member(group_id, current_user, db)
        require_member_page_access(group_id, GroupPage.teams, current_user.id, db)
        if not is_group_admin(group_id, current_user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to assign a roster member"
            )
        if role.mode != TeamRoleMode.roster:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only roster roles support assigning members directly",
            )

        contact = (payload.contact or "").strip() or None

        if guest_name is not None:
            if payload.user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a member or a name, not both"
                )
            signup = TeamSignup(role_id=role_id, user_id=None, guest_name=guest_name, contact=contact)
            db.add(signup)
            db.commit()
            db.refresh(signup)
            return signup_out(signup, None)

        if group_role(group_id, payload.user_id, db) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="That user is not a member of this group"
            )
        signup = TeamSignup(role_id=role_id, user_id=payload.user_id, contact=contact)
        db.add(signup)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Already signed up for this role"
            ) from exc
        db.refresh(signup)
        target_user = db.query(User).filter(User.id == payload.user_id).first()
        return signup_out(signup, target_user)

    # Plain self-signup, only valid on an interest-mode role.
    if role.mode != TeamRoleMode.interest:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This role isn't self-signup, ask an admin to add you",
        )

    if payload.text_value is not None and not role.has_text_field:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This role does not accept a text value"
        )

    actor = resolve_or_mint_actor(db, maybe_user, maybe_participant, payload.local_id, payload.display_name)
    authorize_page_write_actor(group_id, GroupPage.teams, actor, db)

    signup = TeamSignup(role_id=role_id, user_id=actor.id, text_value=payload.text_value)
    db.add(signup)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Already signed up for this role"
        ) from exc
    db.refresh(signup)
    if actor.is_anonymous:
        set_participant_cookie(response, actor, payload.local_id)
    return signup_out(signup, actor)


@router.delete("/teams/signups/{signup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_signup(
    signup_id: str,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> None:
    """The signup's own actor (bearer member or anonymous participant via
    cookie/`local_id`), or a group admin, can withdraw it. Mirrors
    `responsibilities.delete_signup`'s permission shape."""
    signup = _get_signup_or_404(signup_id, db)
    role = _get_role_or_404(signup.role_id, db)
    team = _get_team_or_404(role.team_id, db)
    actor = resolve_existing_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = is_group_admin(team.group_id, actor, db)
    if signup.user_id != actor.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only remove your own signup")
    db.delete(signup)
    db.commit()
