"""Pydantic request/response models for the API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.db.models import GroupRole, OwnerType, VersionSource, VersionStatus


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


class GroupOut(BaseModel):
    id: str
    name: str
    role: GroupRole  # the requesting user's role in this group

    model_config = {"from_attributes": True}


class GroupMemberAdd(BaseModel):
    email: EmailStr
    role: GroupRole = GroupRole.member


class GroupMemberOut(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    role: GroupRole

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


class TimeSignatureOut(BaseModel):
    numerator: int
    denominator: int


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
