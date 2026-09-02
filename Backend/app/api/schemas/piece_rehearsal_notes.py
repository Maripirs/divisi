"""B16: a piece's durable, group-wide rehearsal reminders. The Rehearsal
Notes section that stays next to the music, not a dated bulletin (see
`app/db/models.py`'s `PieceRehearsalNote`)."""

from datetime import datetime

from pydantic import BaseModel

from app.db.models import PieceRehearsalNoteKind


class PieceRehearsalNoteCreate(BaseModel):
    kind: PieceRehearsalNoteKind = PieceRehearsalNoteKind.other
    title: str | None = None
    body: str = ""
    page_number: int | None = None
    measure_label: str | None = None
    part_scope: str | None = None


class PieceRehearsalNoteUpdate(BaseModel):
    kind: PieceRehearsalNoteKind = PieceRehearsalNoteKind.other
    title: str | None = None
    body: str = ""
    page_number: int | None = None
    measure_label: str | None = None
    part_scope: str | None = None


class PieceRehearsalNoteOut(BaseModel):
    id: str
    group_id: str
    piece_id: str
    kind: str
    title: str | None
    body: str
    page_number: int | None
    measure_label: str | None
    part_scope: str | None
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
