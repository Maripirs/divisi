"""B13: schedules/roles/dates/signups, plus their guest-facing counterparts.
The guest shapes now carry signup names too (reachability is already the
real gate, see `require_guest_page_access`); they still never carry an
email or an account id, only member/admin ever see those."""

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
    # B19 self-signup only: the local-only singer's client identity (F23's
    # localStorage profile). `local_id` binds the minted anonymous
    # participant so a later action from the same client resolves back to
    # it; `display_name` seeds its `name`. Both ignored for an
    # authenticated call or an admin assignment (`user_id`/`name`).
    local_id: str | None = None
    display_name: str | None = None
    # B21: set when the caller confirmed a `GET /guest/{join_code}/
    # name-matches` "is this you?" candidate. The route re-validates it
    # against `find_guest_matches` before merging — never trusted blind —
    # so a guest can only ever fold into another guest already in this
    # same group, never claim a real account. Ignored for an authenticated
    # call or an admin assignment, same as `local_id`/`display_name`.
    claim_user_id: str | None = None


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


class ResponsibilityGuestSignupOut(BaseModel):
    """Guest-facing signup identity: name only, never email or account
    id. Reachability is already gated by `audience = everyone` (see
    `require_guest_page_access`), this is just what's in the payload
    once a guest is allowed to see the page at all."""

    id: str
    name: str


class ResponsibilityGuestRoleCoverageOut(BaseModel):
    """Same coverage numbers as the member view, plus `signups` with the
    same names a member sees, just never an email or account id, only
    member/admin ever see those two."""

    role_id: str
    role_name: str
    needed_count: int
    active_count: int
    status: str
    signups: list[ResponsibilityGuestSignupOut]


class ResponsibilityGuestScheduleGroupOut(BaseModel):
    """Guest-facing counterpart of `ResponsibilityDateScheduleGroupOut`: a
    role set's name plus its per-role coverage, including who signed up
    (names only, never email or account id)."""

    schedule_name: str
    roles: list[ResponsibilityGuestRoleCoverageOut]


class ResponsibilityGuestDateOut(BaseModel):
    """Guest-facing counterpart of `ResponsibilityDateOut`: same shape,
    same signup names, just never an email or account id anywhere in it."""

    id: str
    date: datetime
    notes: str
    locked: bool
    canceled: bool
    schedules: list[ResponsibilityGuestScheduleGroupOut]
