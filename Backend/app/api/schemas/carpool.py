"""B24: `CarpoolEvent`/`CarpoolPost` create/update/out shapes, scoped to a
carpool-template `GroupCustomPage`. Deliberately no coordinate/map/
`CarpoolMatch` fields anywhere here, see `app/db/models.py`'s `CarpoolEvent`/
`CarpoolPost` docstrings and plan.md's B24 for what's out of scope."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from app.db.models import CarpoolEventStatus, CarpoolPostKind, CarpoolPostStatus


class CarpoolEventCreate(BaseModel):
    """The admin-facing dated-event creation payload. B26 unchanged: no
    `is_standing` field here at all, so a client can't create (or claim to
    create) the standing event, that's the one thing the get-or-create
    helper in `app.services.carpool` owns."""

    title: str
    starts_at: datetime
    destination_label: str


class CarpoolEventUpdate(BaseModel):
    """Partial patch, checked via `model_fields_set` (same convention as
    `GroupCustomPageUpdate`/`ResponsibilityDateUpdate`). `status` transitions
    (lock/archive/reopen) ride this same endpoint rather than dedicated
    `/lock`/`/archive` actions, matching `ResponsibilityDateUpdate`'s
    "edit/lock/cancel in one endpoint" precedent.

    No `is_standing` field: it never flips after creation, for either
    shape. `starts_at` stays here for rescheduling a dated event, but the
    route (`update_event`) rejects setting it on a standing event, and
    rejects `status=archived` there too. See `app.services.carpool`."""

    title: str | None = None
    starts_at: datetime | None = None
    destination_label: str | None = None
    status: CarpoolEventStatus | None = None


class CarpoolEventOut(BaseModel):
    id: str
    page_id: str
    title: str
    starts_at: datetime | None
    destination_label: str | None
    is_standing: bool
    status: CarpoolEventStatus
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CarpoolPostCreate(BaseModel):
    kind: CarpoolPostKind
    origin_label: str
    seats_total: int | None = None
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
        # nobody reads. B27: `seats_available` dropped entirely (it's now
        # computed from active claims, see `CarpoolPostOut`), so there's
        # nothing left to validate here but `seats_total`.
        if self.kind == CarpoolPostKind.rider:
            if self.seats_total is not None:
                raise ValueError("Riders don't set seat counts")
            return self
        if self.seats_total is None or self.seats_total < 1:
            raise ValueError("Drivers must offer at least 1 seat")
        return self


class CarpoolPostUpdate(BaseModel):
    """Content fields only. `kind` isn't here at all (immutable after
    create, same "identity fields don't change" convention as
    `GroupCustomPage.template_key`); `status` is included but admin-only,
    enforced in the route since whether it's allowed depends on who's
    calling, not on the payload shape. B27: `seats_available` dropped, same
    reason as `CarpoolPostCreate`; the route rejects lowering `seats_total`
    below the post's current active-claim count."""

    origin_label: str | None = None
    seats_total: int | None = None
    leave_time_text: str | None = None
    notes: str | None = None
    status: CarpoolPostStatus | None = None


class CarpoolSeatClaimCreate(BaseModel):
    """B27: same anonymous-participant identity fields `CarpoolPostCreate`
    carries, for the same mint-on-demand reason. A guest with no post of
    their own can still claim a seat."""

    local_id: str | None = None
    display_name: str | None = None


class CarpoolSeatClaimOut(BaseModel):
    id: str
    user_id: str
    display_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CarpoolPostOut(BaseModel):
    id: str
    event_id: str
    user_id: str
    display_name: str
    kind: CarpoolPostKind
    status: CarpoolPostStatus
    origin_label: str
    seats_total: int | None
    # B27: computed (`seats_total` minus active claims), not a stored
    # column, see `app.services.carpool.seats_available_for`. Still `None`
    # for a rider post, same as `seats_total` itself.
    seats_available: int | None
    leave_time_text: str | None
    notes: str | None
    # B27: a driver post's active claims (`id`, `user_id`, `display_name`,
    # `created_at`); always empty for a rider post, which can't be claimed.
    claims: list[CarpoolSeatClaimOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
