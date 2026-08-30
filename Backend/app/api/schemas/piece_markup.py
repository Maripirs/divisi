"""Freehand drawing marks on a piece's PDF pages — pen strokes and stamps.
See `app.db.models.PieceMarkupMark` for the shape/rationale."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

MarkKind = Literal["stroke", "stamp"]


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

    @model_validator(mode="after")
    def _shape_matches_kind(self) -> "MarkupMarkCreate":
        if self.kind == "stroke":
            if not self.points or len(self.points) < 2 or self.width is None:
                raise ValueError("A stroke needs `width` and at least 2 `points`")
        else:  # stamp
            if self.stamp_type is None or self.x is None or self.y is None:
                raise ValueError("A stamp needs `stamp_type`, `x`, and `y`")
        return self


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
    created_at: datetime

    model_config = {"from_attributes": True}
