"""Group, group-page-settings, and membership shapes."""

from pydantic import BaseModel, EmailStr

from app.db.models import GroupPage, GroupRole, PageAudience, PageMinIdentity


class GroupCreate(BaseModel):
    name: str
    # Optional second factor on the guest (no-login) join-code view — see
    # `Group.guest_password_hash`. `None`/omitted means no password.
    guest_password: str | None = None


class GroupOut(BaseModel):
    id: str
    name: str
    join_code: str  # B6: share this (or a link embedding it) to let guests in
    role: GroupRole  # the requesting user's role in this group
    has_guest_password: bool  # never the password/hash itself, just whether one is set
    description: str | None = None  # free-text blurb on the group's Info/About page
    # A regular weekly rehearsal slot, e.g. weekday=2 ("Wednesday"),
    # time="19:00" — see `Group.rehearsal_weekday`'s doc comment for why no
    # timezone is stored. Both `None` means unset.
    rehearsal_weekday: int | None = None
    rehearsal_time: str | None = None

    model_config = {"from_attributes": True}


class GroupDescriptionUpdate(BaseModel):
    """Admin-only, full replace — `None`/omitted clears it back to nothing
    written yet."""

    description: str | None = None


class GroupRehearsalScheduleUpdate(BaseModel):
    """Admin-only, full replace — both fields always set or cleared
    together (a weekday with no time, or vice versa, isn't a valid
    schedule), enforced in the route rather than here to keep this a plain
    passthrough shape like the sibling `*Update` models."""

    rehearsal_weekday: int | None = None
    rehearsal_time: str | None = None


class GroupGuestSettingsUpdate(BaseModel):
    """Partial patch: a field left out of the request body is left
    untouched (checked via Pydantic's `model_fields_set`, not just "was it
    `None`") — currently just the password, since B12 moved per-page guest
    visibility (formerly `guest_homework_visible`) to
    `GET/PUT /groups/{id}/page-settings` below. Explicitly sending
    `guest_password: null` does clear it — that's a provided value, just an
    empty one."""

    guest_password: str | None = None


class GroupPageSettingOut(BaseModel):
    page: GroupPage
    enabled: bool
    audience: PageAudience
    # B19: credential-state floor for writes on this page. Always present;
    # `anyone` for every group that predates B19.
    min_identity: PageMinIdentity

    model_config = {"from_attributes": True}


class GroupPageSettingUpdate(BaseModel):
    page: GroupPage
    enabled: bool
    audience: PageAudience
    # B19: applied only when sent, so F6's existing PUT payloads that omit
    # it are undisturbed.
    min_identity: PageMinIdentity | None = None


class GroupPageSettingsUpdate(BaseModel):
    """Partial: only the pages included get changed — a group always has
    all 5 rows already (seeded/backfilled), so this is an update, not a
    replace-everything-or-nothing operation."""

    pages: list[GroupPageSettingUpdate]


class GroupMemberAdd(BaseModel):
    email: EmailStr
    role: GroupRole = GroupRole.member


class GroupMemberRoleUpdate(BaseModel):
    role: GroupRole


class GroupMemberTitleUpdate(BaseModel):
    """Admin-only, full replace — `None`/omitted clears it. E.g. "Soprano 2
    — Section leader", shown next to the member on the group's Members
    page."""

    title: str | None = None


class KnownNameOut(BaseModel):
    """One distinct free-text guest name from `app.services.known_names.
    list_known_names`, with how many signup/post/claim/interest rows across
    the group carry it. `phone`/`email` are the most-recently-created
    non-null value seen for that name across the Carpool tables that carry
    contact info (independently picked for each), `None` when the name
    never came with that piece of contact info (e.g. Responsibilities-only
    names always have both `None`, since that table has no contact
    fields). This route is admin-only, so no extra visibility gating is
    applied here beyond that."""

    name: str
    count: int
    phone: str | None = None
    email: str | None = None


class KnownNameRenameIn(BaseModel):
    old_name: str
    new_name: str


class GroupMemberOut(BaseModel):
    user_id: str
    # Plain `str`, not `EmailStr`: an anonymous participant (B19) carries a
    # synthetic `anon-<uuid>@participants.divisi.invalid` address that is
    # deliberately non-routable and fails RFC-6761 email validation.
    email: str
    name: str
    role: GroupRole
    title: str | None = None
    # B19 roster badge: True for an anonymous participant (a local-only
    # singer who acted before registering), so a conductor can tell them
    # apart from a real account at a glance.
    is_anonymous: bool = False

    model_config = {"from_attributes": True}
