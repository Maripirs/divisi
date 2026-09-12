"""SQLAlchemy models.

Grows milestone by milestone: User (B2), Group/GroupMembership (B3),
Piece/PieceVersion/Distribution (B4), Annotation/AnnotationShare (B5).
See ../../plan.md for the agreed domain shape.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    # B19: a lazily minted "anonymous participant" (a local-only singer who
    # performed a shared action before registering). Its `email` is a
    # synthetic `anon-<uuid>@participants.divisi.invalid` value and its
    # `hashed_password` is a random string nobody knows. B21 folds one
    # anonymous row into another *guest* row in the same group when a typed
    # name matches (`find_guest_matches` / `merge_participant`); it never
    # promotes to a real account in place (that only happens by
    # registering a separate, ordinary `User` row).
    is_anonymous: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    # The acting client's own local id (Frontend F23's localStorage profile),
    # a fallback resolver for when the `divisi_participant` cookie is lost but
    # localStorage survives. Only ever set on an anonymous participant row.
    anonymous_local_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PasswordResetToken(Base):
    """A single-use, time-limited "forgot password" token. Only
    `token_hash` (SHA-256 of the raw token) is ever stored — the raw token
    itself only exists in the reset link (currently just logged
    server-side, no email provider wired up yet, see `Backend/plan.md`).
    `used_at` set means the token's been spent; a null `used_at` past
    `expires_at` just means it expired unused. Old rows are never cleaned
    up (no scheduled-job runner exists in this backend yet) — an accepted
    gap, not a correctness issue, since `reset_password` re-checks
    `expires_at`/`used_at` on every attempt regardless of row age."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OAuthProvider(str, enum.Enum):
    google = "google"
    apple = "apple"


class OAuthAccount(Base):
    """Links a `User` to a third-party identity (Google/Apple Sign-In) —
    scaffolded ahead of real OAuth app credentials existing (see
    `Backend/plan.md`'s Backlog): the routes that create these rows report
    themselves unconfigured/501 until `Settings.google_client_id`/
    `apple_client_id` are actually set, so this table stays empty in
    practice until then. A `User` can have both a password and one or more
    of these — sign-in method is additive, not exclusive."""

    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id", name="uq_oauth_identity"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    provider: Mapped[OAuthProvider] = mapped_column(SAEnum(OAuthProvider, native_enum=False), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GroupRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # B6: lets a guest resolve this group's distributed pieces with no
    # login (`<frontend>/join/{join_code}`). Generated explicitly at
    # creation time (app/api/routes/groups.py), not as a column default,
    # so a rare collision can be retried against the unique constraint
    # below rather than failing silently.
    join_code: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Optional second factor on top of the join code itself, so a leaked
    # link alone doesn't hand out guest access — `None` means "no password
    # set", the group behaves exactly as it did before this existed. Stored
    # hashed via the same bcrypt helper `User.hashed_password` uses.
    guest_password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    # Free-text blurb shown on the group's Info/About page — admin-editable,
    # `None` means nothing's been written yet (not the same as an empty
    # string, though the Frontend treats both as "nothing to show").
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    # A regular weekly rehearsal slot (e.g. "Wednesdays at 7pm"), so the
    # Responsibilities "Add a date" form can offer a one-click "Next
    # rehearsal" fill instead of the admin hand-computing/typing it every
    # time. Deliberately no timezone stored here — `rehearsal_time` is a
    # plain "HH:MM" wall-clock value, and "next occurrence" is always
    # computed client-side against the browser's own local clock (same
    # implicit-local-time convention the existing `datetime-local` date
    # inputs already use elsewhere on this page). `None`/`None` means no
    # regular rehearsal is set — both fields are set or cleared together,
    # never independently (see `GroupRehearsalScheduleUpdate`).
    rehearsal_weekday: Mapped[int | None] = mapped_column(nullable=True)  # 0=Monday .. 6=Sunday
    rehearsal_time: Mapped[str | None] = mapped_column(String, nullable=True)  # "HH:MM", 24h
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GroupMembership(Base):
    __tablename__ = "group_memberships"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_membership"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    role: Mapped[GroupRole] = mapped_column(
        SAEnum(GroupRole, native_enum=False), nullable=False, default=GroupRole.member
    )
    # Free-text context shown next to this member on the group's Members
    # page (e.g. "Soprano 2 — Section leader") — per-membership, not
    # per-account, since the same person can hold a different role/section
    # in a different group. Admin-editable, `None` means nothing set.
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    # B19: this membership was created for an anonymous participant (a
    # local-only singer). A clean audit signal for the roster badge and the
    # sweep, kept off `GroupRole` on purpose so the dozens of `== admin` /
    # `!= admin` checks a new enum value would touch stay untouched. Cleared
    # to False when the participant runs "Save across devices".
    is_guest: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GroupPage(str, enum.Enum):
    homework = "homework"
    tracks = "tracks"
    members = "members"
    about = "about"
    responsibilities = "responsibilities"
    weekly_notes = "weekly_notes"


class PageAudience(str, enum.Enum):
    members = "members"
    everyone = "everyone"


class PageMinIdentity(str, enum.Enum):
    """B19: the credential-state floor for *writing* on a page. `anyone`
    (the default, today's behavior) lets a local-only anonymous participant
    act; `saved` requires the caller to have run "Save across devices"
    first. Orthogonal to `audience`, which is about login state, not
    credential state (a conductor may want "everyone can see it, but you
    must Save before you claim a slot")."""

    anyone = "anyone"
    saved = "saved"


class GroupPageSettings(Base):
    """B12: generalizes the old `Group.guest_homework_visible` boolean into
    a per-(group, page) row across all 5 pages. `enabled=False` makes a page
    unreachable via its routes for everyone but the group's admins;
    `audience` only matters while `enabled` is true, and controls whether
    the unauthenticated guest routes can reach it too (`everyone`) or it's
    members-only (`members`). Every group gets one row per page, seeded at
    creation (see `app/api/routes/groups.py`) and backfilled for pre-B12
    groups by this migration."""

    __tablename__ = "group_page_settings"
    __table_args__ = (UniqueConstraint("group_id", "page", name="uq_group_page_settings"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    page: Mapped[GroupPage] = mapped_column(SAEnum(GroupPage, native_enum=False), nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True, server_default="true")
    audience: Mapped[PageAudience] = mapped_column(
        SAEnum(PageAudience, native_enum=False), nullable=False, default=PageAudience.members
    )
    # B19: credential-state floor for writes on this page (see
    # `PageMinIdentity`). `anyone` is today's behavior for every existing
    # group, backfilled via server_default.
    min_identity: Mapped[PageMinIdentity] = mapped_column(
        SAEnum(PageMinIdentity, native_enum=False),
        nullable=False,
        default=PageMinIdentity.anyone,
        server_default="anyone",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OwnerType(str, enum.Enum):
    user = "user"
    group = "group"


class VersionSource(str, enum.Enum):
    original = "original"
    modification = "modification"


class VersionStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class Piece(Base):
    __tablename__ = "pieces"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String, nullable=False)
    owner_type: Mapped[OwnerType] = mapped_column(SAEnum(OwnerType, native_enum=False), nullable=False)
    # Polymorphic: a user id when owner_type == user, a group id when owner_type == group.
    # No FK constraint since it points at either table depending on owner_type.
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    # Admin-set (group admin, or the owner for a personal piece) starting
    # tempo the player resets to — `None` means "use the MIDI file's own
    # tempo", today's behavior unchanged. Distinct from a singer's own
    # practice-tempo preference, which stays a per-piece, per-browser
    # `localStorage` value on the Frontend, never written here.
    default_tempo_bpm: Mapped[int | None] = mapped_column(nullable=True)
    # Piece-level, not per-version: neither is a revision concern. `None`
    # means nothing set yet.
    composer: Mapped[str | None] = mapped_column(String, nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Admin-set (group admin, or the owner for a personal piece) hint for how
    # the piece first presents to a viewer who has never opened it. `None`
    # means today's automatic behavior, unchanged. `"score_reference"` seeds
    # the first open onto the PDF score plus the reference recording;
    # `"play_along"` seeds it onto the play-along synth mix. First-open seed
    # only: a viewer's saved per-piece view/audio always wins over this.
    presentation: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PieceVersion(Base):
    __tablename__ = "piece_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    piece_id: Mapped[str] = mapped_column(String, ForeignKey("pieces.id"), nullable=False)
    # Nullable so deleting the creator's account can null this out rather
    # than deleting a version the rest of the group still relies on.
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    source: Mapped[VersionSource] = mapped_column(SAEnum(VersionSource, native_enum=False), nullable=False)
    status: Mapped[VersionStatus] = mapped_column(
        SAEnum(VersionStatus, native_enum=False), nullable=False, default=VersionStatus.draft
    )
    # Nullable: a version can be PDF-only, with no playable music file at
    # all. At least one of `file_path`/`pdf_file_path` is required — that
    # rule lives at the API layer (upload_piece/upload_version), not a DB
    # constraint, matching this codebase's general style of keeping DB
    # constraints minimal.
    file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    pdf_file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    # Original uploaded filenames, purely for display (e.g. the Tracks
    # tab's edit panel showing "PDF: lacrymosa.pdf" next to "Replace") —
    # `file_path`/`pdf_file_path` are storage-relative, uuid-named paths,
    # never the name a human recognizes.
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    pdf_file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # B17: the editor's "Publish as live version" gate is client-side (every
    # OMR seam marked resolved in localStorage). The Backend can't verify
    # that, so it just records the single acknowledgement the publish call
    # carried — `None` until the working draft has been published at least
    # once through that flow. Audit trail, nothing reads it back.
    seams_resolved_ack: Mapped[bool | None] = mapped_column(nullable=True)


class Distribution(Base):
    __tablename__ = "distributions"
    __table_args__ = (UniqueConstraint("piece_version_id", "group_id", name="uq_distribution"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    piece_version_id: Mapped[str] = mapped_column(String, ForeignKey("piece_versions.id"), nullable=False)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    distributed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Annotation(Base):
    """Attaches to the logical `Piece`, not a specific version, so it carries
    forward across versions. Private to its owner by default; visible to a
    peer only via an explicit `AnnotationShare`."""

    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    piece_id: Mapped[str] = mapped_column(String, ForeignKey("pieces.id"), nullable=False)
    position: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AnnotationShare(Base):
    __tablename__ = "annotation_shares"
    __table_args__ = (
        UniqueConstraint("annotation_id", "shared_with_user_id", name="uq_annotation_share"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    annotation_id: Mapped[str] = mapped_column(String, ForeignKey("annotations.id"), nullable=False)
    shared_with_user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PieceMarkupMark(Base):
    """A piaScore-style freehand mark drawn directly on
    one page of a piece's PDF — distinct from `Annotation` (a single text
    note at one score position, no drawing involved). Every mark is scoped
    `scope`: a `personal` mark belongs to its creator; a `group` mark lives
    on a group-owned piece's shared layer and is co-edited by any admin of
    that group (see `scope` below).

    `x`/`y`/`points` are fractions of the PDF page's own rendered *width*
    (both axes, not width/height respectively — so 1 unit means the same
    physical length horizontally and vertically, keeping a stroke's
    thickness, stamp size, and text size undistorted regardless of the page's aspect
    ratio) — never raw pixels, so a mark stays correctly positioned
    regardless of zoom level or the viewing device's resolution. `y` can
    exceed 1.0 for a page taller than it is wide.
    """

    __tablename__ = "piece_markup_marks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    # Creator / last editor. Always set. For a `group`-scoped mark this is
    # audit-only (any admin of the owning group may edit it), not a
    # permission check.
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    piece_id: Mapped[str] = mapped_column(String, ForeignKey("pieces.id"), nullable=False)
    # "personal" (only the creator sees / edits it) or "group" (the shared
    # layer on a group-owned piece, co-edited by any admin of that group).
    # Plain string validated by a Pydantic enum at the API layer, same as
    # `kind` below.
    scope: Mapped[str] = mapped_column(
        String, nullable=False, server_default="personal", default="personal"
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-indexed, matches pdf.js
    kind: Mapped[str] = mapped_column(String, nullable=False)  # "stroke" | "stamp" | "text"
    color: Mapped[str] = mapped_column(String, nullable=False)  # CSS hex color

    # Stroke-only (kind == "stroke"):
    width: Mapped[float | None] = mapped_column(Float, nullable=True)  # fraction of page width
    points: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [[x, y], ...]

    # Stamp-only (kind == "stamp"): a fixed symbol (breath mark, accent, ...)
    # placed at one point. `stamp_type` is a plain string, not an enum, so
    # the Frontend's stamp palette can grow without a migration.
    stamp_type: Mapped[str | None] = mapped_column(String, nullable=True)
    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Text-only (kind == "text"): inline score text placed at `x`/`y`.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cue-only (kind == "cue", B18): milliseconds into the piece's reference
    # recording that tapping this marker seeks to. Positioned like a stamp
    # (`x`/`y`/`page_number`). Null for every other kind.
    time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Homework(Base):
    """B9: a group admin's assignment to their members — a piece (optional;
    a homework entry can exist before a piece is picked), a range/label,
    instructions, and a due date. Unrelated to `PieceVersion.status` (B4);
    an assignment can point at any piece regardless of its review state."""

    __tablename__ = "homework"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    piece_id: Mapped[str | None] = mapped_column(String, ForeignKey("pieces.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    range: Mapped[str] = mapped_column(String, nullable=False)
    instructions: Mapped[str] = mapped_column(String, nullable=False, default="")
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the assignment out from under the rest of the group.
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WeeklyNote(Base):
    """A group admin's dated bulletin entry (e.g. "week of Sept 1: no
    rehearsal, retreat instead") — a history feed, not a single running
    note, so members can scroll back through past weeks' entries.
    `note_date` is the admin-set "week of" date this entry is about,
    distinct from `created_at` (when it was actually posted)."""

    __tablename__ = "weekly_notes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False, default="")
    note_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the note out from under the rest of the group.
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PieceRehearsalNoteKind(str, enum.Enum):
    pronunciation = "pronunciation"
    rhythm = "rhythm"
    breath = "breath"
    dynamics = "dynamics"
    entrance = "entrance"
    page_turn = "page_turn"
    other = "other"


class PieceRehearsalNote(Base):
    """B16: a durable, group-wide rehearsal reminder shown in a piece's
    Rehearsal Notes section (e.g. "sopranos: lift off beat 3 on p.4",
    "watch the tenor entrance at m.52"). Outlives the weekly note it may
    have started life as, so it stays put next to the music rather than
    scrolling away with the week. Distinct from `Annotation` /
    `PieceMarkupMark` (marks drawn on the PDF itself) and from
    `WeeklyNote` (a dated bulletin members scroll back through)."""

    __tablename__ = "piece_rehearsal_notes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    piece_id: Mapped[str] = mapped_column(String, ForeignKey("pieces.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False, default=PieceRehearsalNoteKind.other.value)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    body: Mapped[str] = mapped_column(String, nullable=False, default="")
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    measure_label: Mapped[str | None] = mapped_column(String, nullable=True)
    part_scope: Mapped[str | None] = mapped_column(String, nullable=True)
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the note out from under the rest of the group.
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResponsibilitySchedule(Base):
    """B13: a named, reusable set of roles (e.g. "Sunday cantors") that
    individual one-off dates get added to. Scoped down hard from the
    original proposal doc (no longer in the repo, see plan.md's own
    history): no `recurrence_rule`/lazy generation (no scheduled-job
    runner exists in this backend yet), so every date is created
    explicitly by an admin."""

    __tablename__ = "responsibility_schedules"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the schedule out from under the rest of the group.
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResponsibilityRole(Base):
    """A role definition within a schedule (e.g. "Cantor", `needed_count`=1).
    Kept as its own entity rather than inlined on `ResponsibilityDate` so the
    same role list is reused across every date added to the schedule instead
    of being redefined per date."""

    __tablename__ = "responsibility_roles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    schedule_id: Mapped[str] = mapped_column(
        String, ForeignKey("responsibility_schedules.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    needed_count: Mapped[int] = mapped_column(default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResponsibilityDate(Base):
    """One calendar date on a group's Responsibilities page. Belongs to one
    or more schedules (shown in the UI as "role sets") via
    `ResponsibilityDateSchedule`, so a single date can carry several role
    sets at once, with coverage rolled up across all of them. `locked`
    blocks member self-signup/self-removal (admins bypass it either way);
    `canceled` marks a date inactive without deleting its signup history."""

    __tablename__ = "responsibility_dates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str] = mapped_column(String, nullable=False, default="")
    locked: Mapped[bool] = mapped_column(default=False, server_default="false")
    canceled: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResponsibilityDateSchedule(Base):
    """Join row binding one `ResponsibilityDate` to one
    `ResponsibilitySchedule` (a "role set" in the UI). A date carries one
    row per role set attached to it, and its coverage view is rolled up
    across every attached role set's roles. `created_at` drives the display
    order of the role-set groups shown under a date. No DB-level cascade
    (same as the rest of this codebase), so detaching a role set, or
    deleting a date/schedule, cleans these rows up by hand in the routes.
    The unique constraint keeps the same role set from being attached to a
    date twice."""

    __tablename__ = "responsibility_date_schedules"
    __table_args__ = (
        UniqueConstraint("date_id", "schedule_id", name="uq_responsibility_date_schedule"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    date_id: Mapped[str] = mapped_column(
        String, ForeignKey("responsibility_dates.id"), nullable=False
    )
    schedule_id: Mapped[str] = mapped_column(
        String, ForeignKey("responsibility_schedules.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResponsibilitySignup(Base):
    """One member (or, admin-assigned only, one *named but unenrolled*
    volunteer) covering one role on one date. Unique per (date, role, user)
    so a real member re-signing up is a no-op collision rather than a
    duplicate row; nothing stops the same user covering *different* roles on
    the same date, or a role having more signups than `needed_count` (that's
    exactly what "overfilled" coverage means).

    `user_id`/`guest_name` are mutually exclusive: a self- or admin-signed-up
    real member has `user_id` set and `guest_name` null; an admin covering a
    slot with someone who isn't a group member at all (a parent, a hired
    accompanist, ...) has `user_id` null and `guest_name` set instead — no
    account required. The unique constraint above only ever fires for the
    `user_id` case (Postgres treats NULLs as distinct), so nothing stops two
    identical `guest_name`s on the same (date, role) — an accepted gap, not
    worth a name-collision check for what's just a display label."""

    __tablename__ = "responsibility_signups"
    __table_args__ = (
        UniqueConstraint("date_id", "role_id", "user_id", name="uq_responsibility_signup"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    date_id: Mapped[str] = mapped_column(String, ForeignKey("responsibility_dates.id"), nullable=False)
    role_id: Mapped[str] = mapped_column(String, ForeignKey("responsibility_roles.id"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OmrJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class OmrJob(Base):
    """B8: tracks one OMR (optical music recognition) attempt on an
    uploaded scanned-score file, run via `app/jobs/omr_jobs.py`'s
    background task. `POST /omr/jobs/{id}/import` (`app/api/routes/omr.py`)
    can turn a `done` job's result into a real library entry on demand.

    `piece_id` is optional: when a job is started against an existing
    track (the Tracks tab's "Generate music from PDF" button), the runner
    auto-imports the finished result as a *draft* `PieceVersion` on that
    piece — no explicit import call, and no submit/approve/distribute."""

    __tablename__ = "omr_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    # No FK-level cascade (this codebase keeps DB constraints minimal); a
    # deleted piece just leaves its jobs pointing at a gone id, harmless.
    piece_id: Mapped[str | None] = mapped_column(String, ForeignKey("pieces.id"), nullable=True)
    status: Mapped[OmrJobStatus] = mapped_column(
        SAEnum(OmrJobStatus, native_enum=False), nullable=False, default=OmrJobStatus.pending
    )
    source_file_path: Mapped[str] = mapped_column(String, nullable=False)
    result_musicxml_path: Mapped[str | None] = mapped_column(String, nullable=True)
    result_midi_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    # B16: a multi-page PDF is transcribed page-by-page and re-merged
    # (`app/omr/paged.py`). `needs_review` is set when the pages didn't
    # all merge into one segment, so `result_musicxml_path` is only a
    # provisional guess across the unresolved page joins.
    # `paged_report_path` points at the stored `paged-report.json`.
    paged: Mapped[bool] = mapped_column(default=False, server_default="false")
    needs_review: Mapped[bool | None] = mapped_column(nullable=True)
    paged_report_path: Mapped[str | None] = mapped_column(String, nullable=True)
    # B17: best-effort per-page progress for the Tracks-tab "page X of Y"
    # readout while a paged job runs. `run_omr_paged`'s `on_page_done`
    # callback bumps `pages_done` (and sets `pages_total` on the first
    # page) and commits after each page. Both null for a single-run job or
    # one that hasn't reached the paged loop yet.
    pages_done: Mapped[int | None] = mapped_column(nullable=True)
    pages_total: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class GroupCustomPageTemplate(str, enum.Enum):
    """B23: exactly one template for now. Adding a second is a migration
    (append a value), not a schema redesign, since the column is already a
    real enum rather than a free-text string."""

    carpool_board = "carpool_board"


class GroupCustomPageStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class GroupCustomPage(Base):
    """B23: an admin-created page distinct from the built-in `GroupPage`
    enum/`GroupPageSettings` row (B12) — a dynamic row per page instead of
    a fixed enum member, so a group can have zero or several. Reuses
    `PageAudience`/`PageMinIdentity` rather than new enums, and
    `app/services/pages.py`'s existing gate helpers rather than a parallel
    set: `status == published` stands in for a built-in page's `enabled`
    bool (draft and archived are both unreachable outside the owning
    group's admins). No `GroupPageBlock`: one template doesn't justify a
    generic block system yet (see plan.md's B23).

    `slug` is generated from `title` at creation and immutable after
    (`app/services/custom_pages.py`), unique per group, not globally.
    """

    __tablename__ = "group_custom_pages"
    __table_args__ = (UniqueConstraint("group_id", "slug", name="uq_group_custom_page_slug"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    template_key: Mapped[GroupCustomPageTemplate] = mapped_column(
        SAEnum(GroupCustomPageTemplate, native_enum=False), nullable=False
    )
    status: Mapped[GroupCustomPageStatus] = mapped_column(
        SAEnum(GroupCustomPageStatus, native_enum=False),
        nullable=False,
        default=GroupCustomPageStatus.draft,
        server_default="draft",
    )
    audience: Mapped[PageAudience] = mapped_column(
        SAEnum(PageAudience, native_enum=False), nullable=False, default=PageAudience.members
    )
    min_identity: Mapped[PageMinIdentity] = mapped_column(
        SAEnum(PageMinIdentity, native_enum=False), nullable=False, default=PageMinIdentity.anyone
    )
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the page out from under the rest of the group (same
    # convention as `WeeklyNote.created_by`).
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class CarpoolEventStatus(str, enum.Enum):
    open = "open"
    locked = "locked"
    archived = "archived"


class CarpoolEvent(Base):
    """B24: one dated carpool occurrence on a carpool-template
    `GroupCustomPage`. `status` gates member writes (`app/api/routes/
    carpool.py`): `open` accepts new posts and post edits, `locked`/
    `archived` both reject them (an admin still bypasses either state, same
    admin-always-wins convention as Responsibilities' `locked` dates). No
    lat/lng: MVP is label-only, no map (plan.md's B24)."""

    __tablename__ = "carpool_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(String, ForeignKey("group_custom_pages.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    destination_label: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[CarpoolEventStatus] = mapped_column(
        SAEnum(CarpoolEventStatus, native_enum=False),
        nullable=False,
        default=CarpoolEventStatus.open,
        server_default="open",
    )
    # Nullable so deleting the creator's account can null this out rather
    # than deleting the event out from under the rest of the group (same
    # convention as `GroupCustomPage.created_by`).
    created_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class CarpoolPostKind(str, enum.Enum):
    driver = "driver"
    rider = "rider"


class CarpoolPostStatus(str, enum.Enum):
    open = "open"
    hidden = "hidden"
    cancelled = "cancelled"


class CarpoolPost(Base):
    """B24: one member's ride offer/request against a `CarpoolEvent`.
    `user_id` is required (not nullable, unlike `ResponsibilitySignup`'s
    guest_name carve-out): join-link guest and anonymous-participant
    carpool writes are explicitly deferred (see GROUP_PAGES_CARPOOL_PLAN.md
    and plan.md's B24), so every post traces to a real member. `display_name`
    is captured at post time rather than resolved from `user` at read time,
    so a later name change doesn't rewrite history. Free-text `origin_label`
    only, no coordinates until a map milestone justifies storing them."""

    __tablename__ = "carpool_posts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    event_id: Mapped[str] = mapped_column(String, ForeignKey("carpool_events.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[CarpoolPostKind] = mapped_column(SAEnum(CarpoolPostKind, native_enum=False), nullable=False)
    status: Mapped[CarpoolPostStatus] = mapped_column(
        SAEnum(CarpoolPostStatus, native_enum=False),
        nullable=False,
        default=CarpoolPostStatus.open,
        server_default="open",
    )
    origin_label: Mapped[str] = mapped_column(String, nullable=False)
    # Null for a rider post (seat counts don't apply); a driver post always
    # has both set (`CarpoolPostCreate` validates this at the schema layer).
    seats_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    seats_available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    leave_time_text: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
