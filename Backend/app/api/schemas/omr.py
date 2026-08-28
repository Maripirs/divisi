"""B8 OMR job status + library-import shapes."""

from datetime import datetime

from pydantic import BaseModel

from app.api.schemas.library import PieceOut, PieceVersionOut
from app.db.models import OmrJobStatus, OwnerType


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
