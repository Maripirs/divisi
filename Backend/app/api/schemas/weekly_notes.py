"""A group admin's dated bulletin entries — a history feed, not a single
running note (see `app/db/models.py`'s `WeeklyNote`)."""

from datetime import datetime

from pydantic import BaseModel


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
