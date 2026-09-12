"""Piece/version/distribution, per-user library listing, guest join-code
piece listing, and B7 render-manifest shapes."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.db.models import OmrJobStatus, OwnerType, VersionSource, VersionStatus

# Admin-set hint for how a piece first presents to a viewer who has never
# opened it. `None` = today's automatic behavior. `"score_reference"` seeds
# the first open onto the PDF score + reference recording; `"play_along"`
# seeds it onto the play-along synth mix. First-open seed only: a viewer's
# saved per-piece settings always win over this.
PiecePresentation = Literal["score_reference", "play_along"]


class PieceOut(BaseModel):
    id: str
    title: str
    owner_type: OwnerType
    owner_id: str
    default_tempo_bpm: int | None = None
    composer: str | None = None
    youtube_url: str | None = None
    presentation: PiecePresentation | None = None

    model_config = {"from_attributes": True}


class PieceDetailsUpdate(BaseModel):
    """Same review-authority boundary as default-tempo: full replace of a
    piece's editable metadata (title/composer/reference link/default
    tempo), not just the upload-time write-once fields they look like.
    `composer`/`youtube_url`/`default_tempo_bpm`/`presentation` of `None`
    (or blank) clears them; `title` is required (a piece must always have
    one). One endpoint covering what used to be two (this plus the dedicated
    default-tempo route) so the Frontend's single "Edit details" panel
    only needs one call."""

    title: str
    composer: str | None = None
    youtube_url: str | None = None
    default_tempo_bpm: int | None = None
    presentation: PiecePresentation | None = None


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


class WorkingDraftOut(BaseModel):
    """B17: the piece's single open working draft, as returned by
    `POST /library/pieces/{id}/working-draft`. `forked_from_live` is true
    when this call just created it by copying the live version (the editor
    badges it "Working draft — not yet live" either way, but F16 uses this
    to know it's a fresh copy)."""

    version: PieceVersionOut
    forked_from_live: bool


class VersionPublishRequest(BaseModel):
    """B17: body of `POST /library/versions/{id}/publish`. `seams_resolved`
    is F16's editor gate (every OMR seam marked resolved client-side); the
    Backend can't verify it, only record it and refuse a `false`."""

    seams_resolved: bool


class DistributionOut(BaseModel):
    id: str
    piece_version_id: str
    group_id: str
    distributed_at: datetime

    model_config = {"from_attributes": True}


class LibraryEntryOmrJobOut(BaseModel):
    """Just enough of the most recent "Generate music from PDF" job for
    the Tracks tab's edit panel to show generating / failed / done, and
    (B16) whether a paged run left seams for a human to review."""

    id: str
    status: OmrJobStatus
    error_message: str | None = None
    paged: bool = False
    needs_review: bool | None = None
    # B17: best-effort "page X of Y" while a paged run is in progress.
    pages_done: int | None = None
    pages_total: int | None = None

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
    presentation: PiecePresentation | None = None
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
    # "Generate music from PDF" (Tracks tab): the most recent OMR job for
    # this piece, and the id of the draft version a finished job produced
    # (newest `draft` + `modification` version), if one is waiting for an
    # admin to accept or discard it. Both null when the feature was never
    # used on this track.
    latest_omr_job: LibraryEntryOmrJobOut | None = None
    pending_generated_version_id: str | None = None


class GuestPieceOut(BaseModel):
    """One of a group's currently-distributed pieces, as seen by an
    unauthenticated guest via B6's join-code route."""

    piece_id: str
    title: str
    version_id: str
    distributed_at: datetime
    composer: str | None = None
    youtube_url: str | None = None
    presentation: PiecePresentation | None = None
    has_music: bool = False
    has_pdf: bool = False


class GuestGroupOut(BaseModel):
    group_name: str
    pieces: list[GuestPieceOut]
    # B20: true only for the one group `Settings.demo_join_code` names (the
    # public demo choir) — tells the Frontend whether to offer "Preview
    # Admin" at all, so it never needs its own copy of that join code.
    admin_preview_available: bool = False


class AdminPreviewOut(BaseModel):
    """B20: the read-only "preview Admin" session. `group_id` (unlike the
    plain `Token` other flows return) is here so the Frontend can navigate
    straight to `/groups/{group_id}` without a follow-up `GET /groups`
    round trip to work out which one it just became an admin of."""

    access_token: str
    token_type: str = "bearer"
    group_id: str


class GuestPieceOwnerOut(BaseModel):
    """The group a bare piece id belongs to, for an unauthenticated caller.
    Name + join code only, never any piece content: it exists so a bare
    `/piece/{id}` link can show a gate that names the owning group instead
    of an unexplained bounce to login. `guest_password_required` tells the
    Frontend whether to draw that gate at all or send the visitor straight
    into the guest player (a group with no guest password gates nothing)."""

    group_name: str
    join_code: str
    guest_password_required: bool


class GuestNameMatchOut(BaseModel):
    """B21: one candidate a typed name might be — an existing *guest*
    participant already in this same group (never a real member/admin,
    see `find_guest_matches`'s safety boundary). The join page shows this
    as "is this you?" before a first shared action, so a returning singer
    on a new device can reconnect to their earlier signups instead of
    minting a duplicate participant. `title` mirrors the roster's
    per-membership title (e.g. "Soprano 2"); `joined_at` is the fallback
    the Frontend shows when there's no title."""

    user_id: str
    title: str | None = None
    joined_at: datetime


class GuestAuthIn(BaseModel):
    """Body of POST /guest/{join_code}/auth: the group's guest password,
    exchanged for a signed guest token. Optional so a group with no guest
    password set can still be hit uniformly by the frontend."""

    password: str | None = None


class GuestAuthOut(BaseModel):
    token: str


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
