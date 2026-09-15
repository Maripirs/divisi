"""A group admin's dated bulletin entries — a history feed, not a single
running note (see `app/db/models.py`'s `WeeklyNote`)."""

from datetime import datetime

from pydantic import BaseModel

from app.db.models import PieceRehearsalNoteKind


class WeeklyNoteCreate(BaseModel):
    title: str
    body: str = ""
    note_date: datetime


class WeeklyNoteUpdate(BaseModel):
    title: str
    body: str = ""
    note_date: datetime


class WeeklyNoteOut(BaseModel):
    id: str
    group_id: str
    title: str
    body: str
    note_date: datetime
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WeeklyNotePromoteRequest(BaseModel):
    """Backlog: turn a dated bulletin entry into a durable
    `PieceRehearsalNote` pinned to a piece. `piece_id` is required — a
    `WeeklyNote` carries no piece of its own, so the admin promoting it has
    to pick one (see `app/api/routes/weekly_notes.py`'s `promote_weekly_note`).
    `title`/`body` default to the source note's own values when omitted;
    `kind` defaults the same way `PieceRehearsalNoteCreate` already does."""

    piece_id: str
    kind: PieceRehearsalNoteKind = PieceRehearsalNoteKind.other
    title: str | None = None
    body: str | None = None
    page_number: int | None = None
    measure_label: str | None = None
    part_scope: str | None = None
