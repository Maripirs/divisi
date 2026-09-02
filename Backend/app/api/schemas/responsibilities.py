"""B13: schedules/roles/dates/signups, plus their guest-facing (no signup
identities) counterparts."""

from datetime import datetime

from pydantic import BaseModel


class ResponsibilityRoleCreate(BaseModel):
    name: str
    needed_count: int = 1


class ResponsibilityRoleUpdate(BaseModel):
    """Partial patch (checked via `model_fields_set`, same convention as
    `GroupGuestSettingsUpdate`) — a field left out is left untouched."""

    name: str | None = None
    needed_count: int | None = None


class ResponsibilityRoleOut(BaseModel):
    id: str
    schedule_id: str
    name: str
    needed_count: int

    model_config = {"from_attributes": True}


class ResponsibilityScheduleCreate(BaseModel):
    name: str
    roles: list[ResponsibilityRoleCreate] = []


class ResponsibilityScheduleUpdate(BaseModel):
    name: str | None = None


class ResponsibilityScheduleOut(BaseModel):
    id: str
    group_id: str
    name: str
    created_by: str | None
    created_at: datetime
    roles: list[ResponsibilityRoleOut]


class ResponsibilityDateCreate(BaseModel):
    """A date is created against a group and attached to one or more role
    sets at once. `schedule_ids` must be non-empty (enforced in the route)
    and every id must name a role set in the same group."""

    date: datetime
    notes: str = ""
    schedule_ids: list[str]


class ResponsibilityDateUpdate(BaseModel):
    """Partial patch, same `model_fields_set` convention — lets an admin
    lock/cancel a date (or edit its date/notes) independently."""

    date: datetime | None = None
    notes: str | None = None
    locked: bool | None = None
    canceled: bool | None = None


class ResponsibilitySignupCreate(BaseModel):
    """Exactly one of three shapes: both `user_id`/`name` omitted means "sign
    myself up"; an explicit `user_id` assigns an existing group member
    (admin-only); `name` with no `user_id` assigns someone with no account
    at all — a name only, admin-only, for a volunteer who isn't (and may
    never be) an enrolled member. See the route for the actual enforcement."""

    role_id: str
    user_id: str | None = None
    name: str | None = None


class ResponsibilitySignupOut(BaseModel):
    id: str
    user_id: str | None
    name: str
    email: str | None
    created_at: datetime


class ResponsibilityRoleCoverageOut(BaseModel):
    """Per-role coverage on one date, as seen by a member/admin — includes
    who's actually signed up."""

    role_id: str
    role_name: str
    needed_count: int
    active_count: int
    status: str  # "underfilled" | "covered" | "overfilled"
    signups: list[ResponsibilitySignupOut]


class ResponsibilityDateScheduleGroupOut(BaseModel):
    """One role set's slice of a date: its roles with full per-role coverage
    (including who's signed up), as seen by a member/admin. A date returns
    one of these per attached role set, in attach order."""

    schedule_id: str
    schedule_name: str
    roles: list[ResponsibilityRoleCoverageOut]


class ResponsibilityDateOut(BaseModel):
    id: str
    date: datetime
    notes: str
    locked: bool
    canceled: bool
    schedules: list[ResponsibilityDateScheduleGroupOut]


class ResponsibilityDateScheduleAttach(BaseModel):
    schedule_id: str


class ResponsibilityGuestRoleCoverageOut(BaseModel):
    """Same coverage numbers as the member view, minus `signups` — a guest
    gets no member names/emails, just whether a role still needs people."""

    role_id: str
    role_name: str
    needed_count: int
    active_count: int
    status: str


class ResponsibilityGuestScheduleGroupOut(BaseModel):
    """Guest-facing counterpart of `ResponsibilityDateScheduleGroupOut`: a
    role set's name plus its per-role coverage numbers only, never who
    signed up."""

    schedule_name: str
    roles: list[ResponsibilityGuestRoleCoverageOut]


class ResponsibilityGuestDateOut(BaseModel):
    id: str
    date: datetime
    notes: str
    locked: bool
    canceled: bool
    schedules: list[ResponsibilityGuestScheduleGroupOut]
