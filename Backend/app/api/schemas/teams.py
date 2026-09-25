"""Teams: a group's standing list of teams/committees a member can express
interest in helping with, each with a list of roles/tasks a member signs up
for. `TeamOut` is the member/guest-facing shape (redacted contact fields,
`signups` empty on every role); `TeamAdminOut` is the admin-facing shape
(raw contact fields plus the two show-booleans, full `signups` roster on
every role). See `app/api/routes/teams.py` for which callers get which."""

from datetime import datetime

from pydantic import BaseModel


class TeamSignupCreate(BaseModel):
    """Self-signup only (no admin-assigns-someone-else shape here, unlike
    `ResponsibilitySignupCreate`). `text_value` is only accepted when the
    target role's `has_text_field` is true (checked in the route)."""

    text_value: str | None = None
    # B19-style guest-mint path, same fields as `ResponsibilitySignupCreate`
    # for the same purpose: `local_id` binds a freshly minted anonymous
    # participant so a later action from the same client resolves back to
    # it; `display_name` seeds its name. Both ignored for an authenticated
    # call.
    local_id: str | None = None
    display_name: str | None = None


class TeamSignupOut(BaseModel):
    id: str
    user_id: str
    name: str
    text_value: str | None
    created_at: datetime


class TeamRoleCreate(BaseModel):
    name: str
    has_text_field: bool = False


class TeamRoleUpdate(BaseModel):
    """Partial patch (checked via `model_fields_set`, same convention as
    `ResponsibilityRoleUpdate`) — a field left out is left untouched."""

    name: str | None = None
    has_text_field: bool | None = None


class TeamRoleOut(BaseModel):
    """Member/guest-facing role shape: `signup_count` is safe for any
    caller, `my_signup` is only ever the calling actor's own signup, and
    `signups` (the full roster) is populated only for an admin caller — the
    route layer decides that, not this schema."""

    id: str
    name: str
    has_text_field: bool
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
    above — a field left out of the request body is left untouched."""

    name: str | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    contact_show_email: bool | None = None
    contact_show_phone: bool | None = None


class TeamOut(BaseModel):
    """Member/guest-facing shape: `contact_email`/`contact_phone` are only
    ever the raw stored values when their respective `contact_show_*` flag
    is true, `None` otherwise — never the raw column regardless of who's
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
