"""Pydantic request/response models for the API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.db.models import GroupPage, GroupRole, OmrJobStatus, OwnerType, PageAudience, VersionSource, VersionStatus


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


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

    model_config = {"from_attributes": True}


class GroupDescriptionUpdate(BaseModel):
    """Admin-only, full replace — `None`/omitted clears it back to nothing
    written yet."""

    description: str | None = None


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

    model_config = {"from_attributes": True}


class GroupPageSettingUpdate(BaseModel):
    page: GroupPage
    enabled: bool
    audience: PageAudience


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


class GroupMemberOut(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    role: GroupRole
    title: str | None = None

    model_config = {"from_attributes": True}


class PieceOut(BaseModel):
    id: str
    title: str
    owner_type: OwnerType
    owner_id: str

    model_config = {"from_attributes": True}


class PieceVersionOut(BaseModel):
    id: str
    piece_id: str
    created_by: str
    created_at: datetime
    source: VersionSource
    status: VersionStatus
    reviewed_by: str | None
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class PieceUploadOut(BaseModel):
    piece: PieceOut
    version: PieceVersionOut


class DistributionOut(BaseModel):
    id: str
    piece_version_id: str
    group_id: str
    distributed_at: datetime

    model_config = {"from_attributes": True}


class LibraryEntryOut(BaseModel):
    piece_id: str
    title: str
    owner_type: OwnerType
    owner_id: str
    version_id: str
    version_status: VersionStatus
    version_source: VersionSource
    version_created_at: datetime


class AnnotationCreate(BaseModel):
    piece_id: str
    position: str
    content: str


class AnnotationUpdate(BaseModel):
    position: str | None = None
    content: str | None = None


class AnnotationOut(BaseModel):
    id: str
    user_id: str
    piece_id: str
    position: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AnnotationShareCreate(BaseModel):
    email: EmailStr


class AnnotationShareOut(BaseModel):
    annotation_id: str
    shared_with_user_id: str
    email: EmailStr


class HomeworkCreate(BaseModel):
    piece_id: str | None = None
    title: str
    range: str
    instructions: str = ""
    due_date: datetime | None = None


class HomeworkOut(BaseModel):
    id: str
    group_id: str
    piece_id: str | None
    title: str
    range: str
    instructions: str
    due_date: datetime | None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TimeSignatureOut(BaseModel):
    numerator: int
    denominator: int


class GuestPieceOut(BaseModel):
    """One of a group's currently-distributed pieces, as seen by an
    unauthenticated guest via B6's join-code route."""

    piece_id: str
    title: str
    version_id: str
    distributed_at: datetime


class GuestGroupOut(BaseModel):
    group_name: str
    pieces: list[GuestPieceOut]


class OmrJobOut(BaseModel):
    """B8: status/result of one OMR job. `musicxml_url`/`midi_url` are
    only populated once `status == done`."""

    id: str
    status: OmrJobStatus
    error_message: str | None
    musicxml_url: str | None
    midi_url: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OmrImportRequest(BaseModel):
    """B8 follow-up: turn a completed OMR job's derived MIDI into a
    library entry. Exactly one of `piece_id` (add a version to an
    existing piece) or `title` (create a brand-new piece, with
    `owner_type`/`group_id` matching `/library/pieces`' upload shape)
    must be given."""

    piece_id: str | None = None
    title: str | None = None
    owner_type: OwnerType | None = None
    group_id: str | None = None


class OmrImportOut(BaseModel):
    piece: PieceOut
    version: PieceVersionOut
    created_new_piece: bool


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
    created_by: str
    created_at: datetime
    roles: list[ResponsibilityRoleOut]


class ResponsibilityDateCreate(BaseModel):
    date: datetime
    notes: str = ""


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


class ResponsibilityDateOut(BaseModel):
    id: str
    schedule_id: str
    schedule_name: str
    date: datetime
    notes: str
    locked: bool
    canceled: bool
    roles: list[ResponsibilityRoleCoverageOut]


class ResponsibilityGuestRoleCoverageOut(BaseModel):
    """Same coverage numbers as the member view, minus `signups` — a guest
    gets no member names/emails, just whether a role still needs people."""

    role_id: str
    role_name: str
    needed_count: int
    active_count: int
    status: str


class ResponsibilityGuestDateOut(BaseModel):
    id: str
    schedule_name: str
    date: datetime
    notes: str
    locked: bool
    canceled: bool
    roles: list[ResponsibilityGuestRoleCoverageOut]


class RenderManifestOut(BaseModel):
    """B7: stems + MusicXML + tempo metadata for a rendered `PieceVersion`.
    URLs are relative to this API's root."""

    piece_version_id: str
    stems: dict[str, str]
    musicxml_url: str
    tempo_bpm: float
    time_signature: TimeSignatureOut
    key_signature_fifths: int
    ms_per_whole_note: float
    duration_ms: int
