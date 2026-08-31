"""A group admin's homework assignments (B9)."""

from datetime import datetime

from pydantic import BaseModel


class HomeworkCreate(BaseModel):
    piece_id: str | None = None
    title: str
    range: str
    instructions: str = ""
    due_date: datetime | None = None


class HomeworkUpdate(BaseModel):
    piece_id: str | None = None
    title: str
    range: str
    instructions: str = ""
    due_date: datetime | None = None


class HomeworkOut(BaseModel):
    id: str
    group_id: str
    piece_id: str | None
    title: str
    range: str
    instructions: str
    due_date: datetime | None
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
