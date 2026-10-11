"""B16: a piece's durable, group-wide rehearsal reminders. The Rehearsal
Notes section that stays next to the music, not a dated bulletin (see
`app/db/models.py`'s `PieceRehearsalNote`)."""

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.db.models import PieceRehearsalNoteKind
from app.services.part_scope import normalize_part_scope


class PieceRehearsalNoteCreate(BaseModel):
    kind: PieceRehearsalNoteKind = PieceRehearsalNoteKind.other
    title: str | None = None
    body: str = ""
    page_number: int | None = None
    measure_label: str | None = None
    # Section tag (`app/services/part_scope.py`): `None` = everyone.
    part_scope: str | None = None

    @field_validator("part_scope")
    @classmethod
    def _normalize_part_scope(cls, value: str | None) -> str | None:
        return normalize_part_scope(value)


class PieceRehearsalNoteUpdate(BaseModel):
    kind: PieceRehearsalNoteKind = PieceRehearsalNoteKind.other
    title: str | None = None
    body: str = ""
    page_number: int | None = None
    measure_label: str | None = None
    # Section tag (`app/services/part_scope.py`): `None` = everyone.
    part_scope: str | None = None

    @field_validator("part_scope")
    @classmethod
    def _normalize_part_scope(cls, value: str | None) -> str | None:
        return normalize_part_scope(value)


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
    # Backlog: set when this note was promoted from a `WeeklyNote` (`POST
    # /weekly-notes/{id}/promote`); `None` for a note created directly here.
    source_weekly_note_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
