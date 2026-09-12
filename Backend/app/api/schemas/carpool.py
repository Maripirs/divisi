"""B24: `CarpoolEvent`/`CarpoolPost` create/update/out shapes, scoped to a
carpool-template `GroupCustomPage`. Deliberately no coordinate/map/
`CarpoolMatch` fields anywhere here, see `app/db/models.py`'s `CarpoolEvent`/
`CarpoolPost` docstrings and plan.md's B24 for what's out of scope."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from app.db.models import CarpoolEventStatus, CarpoolPostKind, CarpoolPostStatus


class CarpoolEventCreate(BaseModel):
    title: str
    starts_at: datetime
    destination_label: str


class CarpoolEventUpdate(BaseModel):
    """Partial patch, checked via `model_fields_set` (same convention as
    `GroupCustomPageUpdate`/`ResponsibilityDateUpdate`). `status` transitions
    (lock/archive/reopen) ride this same endpoint rather than dedicated
    `/lock`/`/archive` actions, matching `ResponsibilityDateUpdate`'s
    "edit/lock/cancel in one endpoint" precedent."""

    title: str | None = None
    starts_at: datetime | None = None
    destination_label: str | None = None
    status: CarpoolEventStatus | None = None


class CarpoolEventOut(BaseModel):
    id: str
    page_id: str
    title: str
    starts_at: datetime
    destination_label: str
    status: CarpoolEventStatus
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CarpoolPostCreate(BaseModel):
    kind: CarpoolPostKind
    origin_label: str
    seats_total: int | None = None
    seats_available: int | None = None
    leave_time_text: str | None = None
    notes: str | None = None
    # B25: same anonymous-participant identity fields `ResponsibilitySignupCreate`
    # carries, for the same reason (mint-on-demand, reconnect via local_id).
    # Ignored for a bearer-authenticated member.
    local_id: str | None = None
    display_name: str | None = None

    @model_validator(mode="after")
    def _validate_seats(self) -> "CarpoolPostCreate":
        # Seat counts only make sense for a driver post. A rider setting
        # them is rejected outright rather than silently ignored, so a
        # confused client finds out immediately instead of shipping data
        # nobody reads.
        if self.kind == CarpoolPostKind.rider:
            if self.seats_total is not None or self.seats_available is not None:
                raise ValueError("Riders don't set seat counts")
            return self
        if self.seats_total is None or self.seats_total < 1:
            raise ValueError("Drivers must offer at least 1 seat")
        if self.seats_available is None:
            self.seats_available = self.seats_total
        if self.seats_available < 0 or self.seats_available > self.seats_total:
            raise ValueError("seats_available must be between 0 and seats_total")
        return self


class CarpoolPostUpdate(BaseModel):
    """Content fields only. `kind` isn't here at all (immutable after
    create, same "identity fields don't change" convention as
    `GroupCustomPage.template_key`); `status` is included but admin-only,
    enforced in the route since whether it's allowed depends on who's
    calling, not on the payload shape."""

    origin_label: str | None = None
    seats_total: int | None = None
    seats_available: int | None = None
    leave_time_text: str | None = None
    notes: str | None = None
    status: CarpoolPostStatus | None = None


class CarpoolPostOut(BaseModel):
    id: str
    event_id: str
    user_id: str
    display_name: str
    kind: CarpoolPostKind
    status: CarpoolPostStatus
    origin_label: str
    seats_total: int | None
    seats_available: int | None
    leave_time_text: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
