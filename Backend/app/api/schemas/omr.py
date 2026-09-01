"""B8 OMR job status + library-import shapes."""

from datetime import datetime

from pydantic import BaseModel

from app.api.schemas.library import PieceOut, PieceVersionOut
from app.db.models import OmrJobStatus, OwnerType


class OmrJobOut(BaseModel):
    """B8: status/result of one OMR job. `musicxml_url`/`midi_url` are
    only populated once `status == done`.

    B16: `paged` is set when a multi-page PDF was transcribed
    page-by-page and re-merged. `needs_review` is then true if the pages
    didn't all merge into one segment — `musicxml_url` is a provisional
    guess across the unresolved joins, and `report_url` has the segment /
    boundary / per-page breakdown."""

    id: str
    piece_id: str | None
    status: OmrJobStatus
    error_message: str | None
    musicxml_url: str | None
    midi_url: str | None
    paged: bool = False
    needs_review: bool | None = None
    report_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OmrJobListItemOut(BaseModel):
    """One row of `GET /omr/jobs` — the caller's own OMR jobs, enough for
    the header alert to say "«Piece» finished generating" and link
    straight to where the draft is accepted or discarded (a group's
    Tracks tab). `piece_id`/`piece_title`/`group_id` are null for a job
    that was never tagged with a piece, or whose piece has since been
    deleted. `pending_generated_version_id` is set once the runner has
    auto-imported the result as a draft nobody has acted on yet."""

    id: str
    status: OmrJobStatus
    error_message: str | None
    piece_id: str | None
    piece_title: str | None
    group_id: str | None
    pending_generated_version_id: str | None
    needs_review: bool | None = None
    created_at: datetime
    updated_at: datetime


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
