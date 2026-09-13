"""B24: `CarpoolEvent`/`CarpoolPost` create/update/out shapes, scoped to a
carpool-template `GroupCustomPage`. B29 added the map pins (`destination_*`
on the event, `origin_*` on the post): see `app/db/models.py`'s `CarpoolEvent`/
`CarpoolPost` docstrings for the shape and plan.md's B29 for the privacy
rounding rationale."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, model_validator

from app.db.models import CarpoolEventStatus, CarpoolLocationPrecision, CarpoolPostKind, CarpoolPostStatus


def _validate_coordinate_pair(latitude: float | None, longitude: float | None) -> None:
    """Shared by every schema below that accepts a lat/lng pair: both or
    neither (no half-set coordinate), and each within its valid range.
    Raises `ValueError` so a pydantic `model_validator` can call this
    directly and have the message surface as a normal 422."""
    if (latitude is None) != (longitude is None):
        raise ValueError("latitude and longitude must both be set, or both left out")
    if latitude is not None and not (-90 <= latitude <= 90):
        raise ValueError("latitude must be between -90 and 90")
    if longitude is not None and not (-180 <= longitude <= 180):
        raise ValueError("longitude must be between -180 and 180")


class CarpoolEventCreate(BaseModel):
    """The admin-facing dated-event creation payload. B26 unchanged: no
    `is_standing` field here at all, so a client can't create (or claim to
    create) the standing event, that's the one thing the get-or-create
    helper in `app.services.carpool` owns.

    B29: `destination_latitude`/`destination_longitude`/`destination_place_id`
    are optional and never rounded (see `CarpoolEvent`'s docstring). Coming
    from an admin dropping a pin on a venue, not a rider's home."""

    title: str
    starts_at: datetime
    destination_label: str
    destination_latitude: float | None = None
    destination_longitude: float | None = None
    destination_place_id: str | None = None

    @model_validator(mode="after")
    def _validate_destination_coordinates(self) -> "CarpoolEventCreate":
        _validate_coordinate_pair(self.destination_latitude, self.destination_longitude)
        return self


class CarpoolEventUpdate(BaseModel):
    """Partial patch, checked via `model_fields_set` (same convention as
    `GroupCustomPageUpdate`/`ResponsibilityDateUpdate`). `status` transitions
    (lock/archive/reopen) ride this same endpoint rather than dedicated
    `/lock`/`/archive` actions, matching `ResponsibilityDateUpdate`'s
    "edit/lock/cancel in one endpoint" precedent.

    No `is_standing` field: it never flips after creation, for either
    shape. `starts_at` stays here for rescheduling a dated event, but the
    route (`update_event`) rejects setting it on a standing event, and
    rejects `status=archived` there too. See `app.services.carpool`.

    B29: the destination pin can be added/changed the same way
    `destination_label` already can. Since this is a partial patch, "both
    or neither" is only checked when at least one of the pair is actually
    part of this request (`model_fields_set`), not against whatever the
    row already has stored."""

    title: str | None = None
    starts_at: datetime | None = None
    destination_label: str | None = None
    destination_latitude: float | None = None
    destination_longitude: float | None = None
    destination_place_id: str | None = None
    status: CarpoolEventStatus | None = None

    @model_validator(mode="after")
    def _validate_destination_coordinates(self) -> "CarpoolEventUpdate":
        fields = self.model_fields_set
        if "destination_latitude" in fields or "destination_longitude" in fields:
            _validate_coordinate_pair(self.destination_latitude, self.destination_longitude)
        return self


class CarpoolEventOut(BaseModel):
    id: str
    page_id: str
    title: str
    starts_at: datetime | None
    destination_label: str | None
    destination_latitude: float | None
    destination_longitude: float | None
    destination_place_id: str | None
    is_standing: bool
    status: CarpoolEventStatus
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CarpoolPostCreate(BaseModel):
    """B29: `origin_latitude`/`origin_longitude`/`origin_place_id`/
    `origin_precision` are all optional, same as `origin_label` staying the
    only required way to describe where a rider is coming from. This
    schema only validates shape (range, both-or-neither); the
    `approximate`-by-default resolution and the actual privacy rounding
    happen server-side in `app/services/carpool.resolve_origin_coordinates`,
    called from the route, never trusting a client-sent value to already be
    rounded."""

    kind: CarpoolPostKind
    origin_label: str
    origin_latitude: float | None = None
    origin_longitude: float | None = None
    origin_place_id: str | None = None
    origin_precision: CarpoolLocationPrecision | None = None
    seats_total: int | None = None
    leave_time_text: str | None = None
    notes: str | None = None
    # B25: same anonymous-participant identity fields `ResponsibilitySignupCreate`
    # carries, for the same reason (mint-on-demand, reconnect via local_id).
    # Ignored for a bearer-authenticated member.
    local_id: str | None = None
    display_name: str | None = None

    @model_validator(mode="after")
    def _validate_origin_coordinates(self) -> "CarpoolPostCreate":
        _validate_coordinate_pair(self.origin_latitude, self.origin_longitude)
        return self

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
    below the post's current active-claim count.

    B29: same coordinate/precision fields as `CarpoolPostCreate`, same
    "both or neither" pair check, but only enforced when at least one of
    the pair is actually part of this patch (`model_fields_set`) rather
    than against whatever the post already has stored."""

    origin_label: str | None = None
    origin_latitude: float | None = None
    origin_longitude: float | None = None
    origin_place_id: str | None = None
    origin_precision: CarpoolLocationPrecision | None = None
    seats_total: int | None = None
    leave_time_text: str | None = None
    notes: str | None = None
    status: CarpoolPostStatus | None = None

    @model_validator(mode="after")
    def _validate_origin_coordinates(self) -> "CarpoolPostUpdate":
        fields = self.model_fields_set
        if "origin_latitude" in fields or "origin_longitude" in fields:
            _validate_coordinate_pair(self.origin_latitude, self.origin_longitude)
        return self


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
    origin_latitude: float | None
    origin_longitude: float | None
    origin_place_id: str | None
    origin_precision: CarpoolLocationPrecision | None
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
