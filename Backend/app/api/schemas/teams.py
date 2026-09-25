"""Teams: a group's standing list of teams/committees, each with a list of
roles. A role's own `mode` (see `app/db/models.py`'s `TeamRoleMode`) decides
whether it's `interest` (a member self-signup checklist item, today's only
pre-redesign behavior) or `roster` (a fixed, admin-maintained list of names,
no self-signup). `TeamOut` is the member/guest-facing shape (redacted
contact fields); `TeamAdminOut` is the admin-facing shape (raw contact
fields plus the two show-booleans). See `app/api/routes/teams.py` for which
callers get which, and for how `TeamRoleOut.signups` is populated
differently per caller and per role's `mode`/`roster_visible_to_members`."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.db.models import TeamRoleMode

# Plain `Literal`, same convention `app/api/schemas/piece_markup.py`'s
# `MarkKind`/`MarkScope` already use for a small fixed string set that
# doesn't need its own DB-backed enum.
MoveDirection = Literal["up", "down"]


class TeamSignupCreate(BaseModel):
    """Three shapes, same split as `ResponsibilitySignupCreate`: both
    `user_id`/`name` omitted means "sign myself up" (only valid on an
    `interest`-mode role); an explicit `user_id` assigns an existing group
    member to a roster slot (admin-only, only valid on a `roster`-mode
    role); `name` with no `user_id` assigns someone with no account at all
    to that same roster slot (also admin-only). `contact` is only ever
    meaningful alongside `name`/`user_id` (a roster entry's optional free
    text, e.g. an email or phone). Never set on a plain self-signup. See
    the route for the actual enforcement."""

    user_id: str | None = None
    name: str | None = None
    contact: str | None = None
    text_value: str | None = None
    # B19-style guest-mint path, same fields as `ResponsibilitySignupCreate`
    # for the same purpose: `local_id` binds a freshly minted anonymous
    # participant so a later action from the same client resolves back to
    # it; `display_name` seeds its name. Both ignored for an admin
    # assignment (`user_id`/`name`) or an authenticated self-signup.
    local_id: str | None = None
    display_name: str | None = None


class TeamSignupOut(BaseModel):
    id: str
    user_id: str | None
    name: str
    contact: str | None
    text_value: str | None
    created_at: datetime


class TeamRoleCreate(BaseModel):
    name: str
    has_text_field: bool = False
    mode: TeamRoleMode = TeamRoleMode.interest
    roster_visible_to_members: bool = False


class TeamRoleUpdate(BaseModel):
    """Partial patch (checked via `model_fields_set`, same convention as
    `ResponsibilityRoleUpdate`); a field left out is left untouched."""

    name: str | None = None
    has_text_field: bool | None = None
    mode: TeamRoleMode | None = None
    roster_visible_to_members: bool | None = None


class TeamRoleOut(BaseModel):
    """Member/guest-facing role shape: `signup_count` is safe for any
    caller, `my_signup` is only ever the calling actor's own signup, and
    `signups` (the full roster) is populated for an admin caller, or for any
    caller when this is a `roster`-mode role with `roster_visible_to_members`
    true (a published roster entry isn't a private "who's interested" fact
    the way another member's own `interest`-mode signup is). The route
    layer decides that, not this schema."""

    id: str
    name: str
    has_text_field: bool
    mode: TeamRoleMode
    roster_visible_to_members: bool
    sort_order: int
    signup_count: int
    my_signup: TeamSignupOut | None
    signups: list[TeamSignupOut]


class TeamCreate(BaseModel):
    name: str
    description: str = ""
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    contact_show_email: bool = False
    contact_show_phone: bool = False


class TeamUpdate(BaseModel):
    """Partial patch, same `model_fields_set` convention as `TeamRoleUpdate`
    above; a field left out of the request body is left untouched."""

    name: str | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    contact_show_email: bool | None = None
    contact_show_phone: bool | None = None


class TeamMove(BaseModel):
    """Swaps `Team.sort_order` with the adjacent team's, `up` toward the
    front of the list or `down` toward the back. See
    `app/api/routes/teams.py`'s `move_team` for the actual swap; a no-op
    (200, unchanged) at either end of the list."""

    direction: MoveDirection


class TeamRoleMove(BaseModel):
    """The role-level mirror of `TeamMove`, scoped to roles within one
    team (see `move_role`)."""

    direction: MoveDirection


class TeamOut(BaseModel):
    """Member/guest-facing shape: `contact_email`/`contact_phone` are only
    ever the raw stored values when their respective `contact_show_*` flag
    is true, `None` otherwise. Never the raw column regardless of who's
    asking, that's `TeamAdminOut`'s job."""

    id: str
    name: str
    description: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    roles: list[TeamRoleOut]


class TeamAdminOut(BaseModel):
    """Admin-facing shape: the true stored contact fields regardless of the
    show flags (an admin managing the team needs to see what's actually
    stored), plus the two show-booleans themselves so the admin UI can
    render/edit the toggles."""

    id: str
    name: str
    description: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    contact_show_email: bool
    contact_show_phone: bool
    roles: list[TeamRoleOut]
