"""Freehand drawing marks on a piece's PDF pages: strokes, stamps, and text.
See `app.db.models.PieceMarkupMark` for the shape/rationale."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, model_validator

MarkKind = Literal["stroke", "stamp", "text", "cue"]
MarkScope = Literal["personal", "group"]


class MarkupMarkCreate(BaseModel):
    piece_id: str
    page_number: int
    kind: MarkKind
    color: str

    # "personal" (default) or "group". `group` is only accepted on a
    # group-owned piece when the caller is an admin of that group; the
    # route enforces that.
    scope: MarkScope = "personal"

    # Stroke-only.
    width: float | None = None
    points: list[list[float]] | None = None

    # Stamp-only.
    stamp_type: str | None = None
    x: float | None = None
    y: float | None = None

    # Text-only.
    text: str | None = None

    # Cue-only (B18): milliseconds into the reference recording. Required
    # (and `>= 0`) when `kind == "cue"`, must stay null otherwise.
    time_ms: int | None = None

    @model_validator(mode="after")
    def _shape_matches_kind(self) -> "MarkupMarkCreate":
        if self.kind == "stroke":
            if not self.points or len(self.points) < 2 or self.width is None:
                raise ValueError("A stroke needs `width` and at least 2 `points`")
        elif self.kind == "stamp":
            if self.stamp_type is None or self.x is None or self.y is None:
                raise ValueError("A stamp needs `stamp_type`, `x`, and `y`")
        elif self.kind == "cue":
            if self.x is None or self.y is None:
                raise ValueError("A cue needs `x` and `y`")
            if self.time_ms is None or self.time_ms < 0:
                raise ValueError("A cue needs `time_ms` (>= 0)")
        else:
            if self.text is None or not self.text.strip() or self.width is None or self.x is None or self.y is None:
                raise ValueError("Text needs `text`, `width`, `x`, and `y`")
        if self.kind != "cue" and self.time_ms is not None:
            raise ValueError("`time_ms` is only valid on a `cue` mark")
        return self


class MarkupMarkUpdate(BaseModel):
    color: str | None = None
    width: float | None = None
    text: str | None = None
    x: float | None = None
    y: float | None = None
    # B18: re-time a cue. `exclude_unset` in the route means an omitted
    # field is left untouched; a sent `time_ms` must be `>= 0`.
    time_ms: int | None = None

    @model_validator(mode="after")
    def _time_ms_non_negative(self) -> "MarkupMarkUpdate":
        if self.time_ms is not None and self.time_ms < 0:
            raise ValueError("`time_ms` must be `>= 0`")
        return self


class MarkupMarkOut(BaseModel):
    id: str
    user_id: str
    piece_id: str
    scope: MarkScope
    page_number: int
    kind: MarkKind
    color: str
    width: float | None
    points: list[list[float]] | None
    stamp_type: str | None
    x: float | None
    y: float | None
    text: str | None
    time_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
