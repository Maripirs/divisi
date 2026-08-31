"""Freehand drawing marks on a piece's PDF pages: strokes, stamps, and text.
See `app.db.models.PieceMarkupMark` for the shape/rationale."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

MarkKind = Literal["stroke", "stamp", "text"]


class MarkupMarkCreate(BaseModel):
    piece_id: str
    page_number: int
    kind: MarkKind
    color: str

    # Stroke-only.
    width: float | None = None
    points: list[list[float]] | None = None

    # Stamp-only.
    stamp_type: str | None = None
    x: float | None = None
    y: float | None = None

    # Text-only.
    text: str | None = None

    @model_validator(mode="after")
    def _shape_matches_kind(self) -> "MarkupMarkCreate":
        if self.kind == "stroke":
            if not self.points or len(self.points) < 2 or self.width is None:
                raise ValueError("A stroke needs `width` and at least 2 `points`")
        elif self.kind == "stamp":
            if self.stamp_type is None or self.x is None or self.y is None:
                raise ValueError("A stamp needs `stamp_type`, `x`, and `y`")
        else:
            if self.text is None or not self.text.strip() or self.width is None or self.x is None or self.y is None:
                raise ValueError("Text needs `text`, `width`, `x`, and `y`")
        return self


class MarkupMarkUpdate(BaseModel):
    color: str | None = None
    width: float | None = None
    text: str | None = None
    x: float | None = None
    y: float | None = None


class MarkupMarkOut(BaseModel):
    id: str
    user_id: str
    piece_id: str
    page_number: int
    kind: MarkKind
    color: str
    width: float | None
    points: list[list[float]] | None
    stamp_type: str | None
    x: float | None
    y: float | None
    text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
