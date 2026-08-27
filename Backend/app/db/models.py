"""SQLAlchemy models.

Grows milestone by milestone: User (B2), Group/GroupMembership (B3),
Piece/PieceVersion/Distribution (B4), Annotation/AnnotationShare (B5).
See ../../plan.md for the agreed domain shape.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint
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
    # Whether the guest (no-login) view exposes this group's homework, not
    # just its distributed pieces. Defaults to hidden — an admin opts in
    # per group rather than every group's assignments being guest-visible
    # by default.
    guest_homework_visible: Mapped[bool] = mapped_column(default=False, server_default="false")
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PieceVersion(Base):
    __tablename__ = "piece_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    piece_id: Mapped[str] = mapped_column(String, ForeignKey("pieces.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    source: Mapped[VersionSource] = mapped_column(SAEnum(VersionSource, native_enum=False), nullable=False)
    status: Mapped[VersionStatus] = mapped_column(
        SAEnum(VersionStatus, native_enum=False), nullable=False, default=VersionStatus.draft
    )
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OmrJobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class OmrJob(Base):
    """B8: tracks one OMR (optical music recognition) attempt on an
    uploaded scanned-score file, run via `app/jobs/omr_jobs.py`'s
    background task. Still not tied to a `Piece`/`PieceVersion` by a
    foreign key here — a job's result (MusicXML + derived MIDI) stays a
    downloadable pair on its own — but `POST /omr/jobs/{id}/import`
    (`app/api/routes/omr.py`) can turn a `done` job's result into a real
    library entry on demand."""

    __tablename__ = "omr_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    status: Mapped[OmrJobStatus] = mapped_column(
        SAEnum(OmrJobStatus, native_enum=False), nullable=False, default=OmrJobStatus.pending
    )
    source_file_path: Mapped[str] = mapped_column(String, nullable=False)
    result_musicxml_path: Mapped[str | None] = mapped_column(String, nullable=True)
    result_midi_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
