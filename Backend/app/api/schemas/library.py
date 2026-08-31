"""Piece/version/distribution, per-user library listing, guest join-code
piece listing, and B7 render-manifest shapes."""

from datetime import datetime

from pydantic import BaseModel

from app.db.models import OwnerType, VersionSource, VersionStatus


class PieceOut(BaseModel):
    id: str
    title: str
    owner_type: OwnerType
    owner_id: str
    default_tempo_bpm: int | None = None
    composer: str | None = None
    youtube_url: str | None = None

    model_config = {"from_attributes": True}


class PieceDetailsUpdate(BaseModel):
    """Same review-authority boundary as default-tempo: full replace of a
    piece's editable metadata (title/composer/reference link/default
    tempo), not just the upload-time write-once fields they look like.
    `composer`/`youtube_url`/`default_tempo_bpm` of `None` (or blank)
    clears them; `title` is required — a piece must always have one. One
    endpoint covering what used to be two (this plus the dedicated
    default-tempo route) so the Frontend's single "Edit details" panel
    only needs one call."""

    title: str
    composer: str | None = None
    youtube_url: str | None = None
    default_tempo_bpm: int | None = None


class PieceDefaultTempoUpdate(BaseModel):
    """Admin (group-owned piece) or owner (personal piece) only, full
    replace — `None`/omitted clears it back to "use the MIDI file's own
    tempo"."""

    default_tempo_bpm: int | None = None


class PieceVersionOut(BaseModel):
    id: str
    piece_id: str
    created_by: str | None
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
    default_tempo_bpm: int | None = None
    composer: str | None = None
    youtube_url: str | None = None
    # Computed booleans, not raw paths — never leak a storage-relative path
    # to the client. The Frontend uses these to decide what to render, and
    # reaches actual bytes only through the file-serving routes below.
    has_music: bool = False
    has_pdf: bool = False
    # Original uploaded filenames, display-only (e.g. the Tracks tab's edit
    # panel showing "PDF: 'lacrymosa.pdf' — Replace"). Safe to expose,
    # unlike `PieceVersion.file_path`/`pdf_file_path` — those are
    # storage-relative and never sent to the client.
    music_file_name: str | None = None
    pdf_file_name: str | None = None


class GuestPieceOut(BaseModel):
    """One of a group's currently-distributed pieces, as seen by an
    unauthenticated guest via B6's join-code route."""

    piece_id: str
    title: str
    version_id: str
    distributed_at: datetime
    composer: str | None = None
    youtube_url: str | None = None
    has_music: bool = False
    has_pdf: bool = False


class GuestGroupOut(BaseModel):
    group_name: str
    pieces: list[GuestPieceOut]


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
