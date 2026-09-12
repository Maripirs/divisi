"""B26: the standing (non-dated) carpool event, get-or-created lazily
rather than admin-created, so a brand-new carpool page has one from its
very first view. One shared helper so the member (`app/api/routes/
carpool.py`) and guest (`app/api/routes/guest.py`) read paths can't drift
out of sync on this, same reasoning as `app/services/custom_pages.py`
being its own small module rather than logic duplicated per route file.

B27: same reasoning extended to seat claims — `seats_available_for` and
`serialize_post` are the one place `seats_total - active claims` gets
computed and turned into a `CarpoolPostOut`, so the member and guest post
listings can't compute (or shape) it differently."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.schemas.carpool import CarpoolPostOut, CarpoolSeatClaimOut
from app.db.models import CarpoolEvent, CarpoolPost, CarpoolPostKind, CarpoolSeatClaim, CarpoolSeatClaimStatus

STANDING_EVENT_TITLE = "Ongoing carpool"


def get_or_create_standing_event(page_id: str, db: Session) -> CarpoolEvent:
    """Idempotent: a second call for the same page returns the same row,
    never a duplicate. `starts_at`/`destination_label` stay `None`, the
    whole point of the standing shape."""
    event = (
        db.query(CarpoolEvent)
        .filter(CarpoolEvent.page_id == page_id, CarpoolEvent.is_standing.is_(True))
        .first()
    )
    if event is not None:
        return event
    event = CarpoolEvent(
        page_id=page_id,
        title=STANDING_EVENT_TITLE,
        starts_at=None,
        destination_label=None,
        is_standing=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_events_ordered(page_id: str, db: Session) -> list[CarpoolEvent]:
    """The standing event first, then dated events by `starts_at`
    ascending. Ordered explicitly rather than via a raw `ORDER BY
    starts_at` (a `NULL` there sorts unpredictably across backends) so a
    caller in `carpool.py` or `guest.py` doesn't have to re-derive this.
    Bootstraps the standing event first, so this is also the one call a
    listing route needs to make."""
    standing = get_or_create_standing_event(page_id, db)
    dated = (
        db.query(CarpoolEvent)
        .filter(CarpoolEvent.page_id == page_id, CarpoolEvent.is_standing.is_(False))
        .order_by(CarpoolEvent.starts_at.asc())
        .all()
    )
    return [standing, *dated]


def active_claims_for(driver_post_id: str, db: Session) -> list[CarpoolSeatClaim]:
    """A driver post's active (not released) claims, oldest first — first-
    come-first-served order, matching how a seat was actually filled."""
    return (
        db.query(CarpoolSeatClaim)
        .filter(CarpoolSeatClaim.driver_post_id == driver_post_id, CarpoolSeatClaim.status == CarpoolSeatClaimStatus.active)
        .order_by(CarpoolSeatClaim.created_at.asc())
        .all()
    )


def seats_available_for(post: CarpoolPost, db: Session) -> int | None:
    """`seats_total` minus active claims. `None` for a rider post (seat
    counts don't apply, same as `seats_total` itself being `None` there).
    The one place this subtraction happens, so `CarpoolPostOut`
    serialization below and any future caller can't drift on it."""
    if post.kind != CarpoolPostKind.driver or post.seats_total is None:
        return None
    return post.seats_total - len(active_claims_for(post.id, db))


def serialize_post(post: CarpoolPost, db: Session) -> CarpoolPostOut:
    """The one place a `CarpoolPost` ORM row turns into a `CarpoolPostOut`,
    so the member (`carpool.py`) and guest (`guest.py`) routes can't ship a
    different `claims`/`seats_available` shape for the same post. A rider
    post's `claims` is always empty, it isn't a driver post, so it can't be
    claimed."""
    claims = active_claims_for(post.id, db) if post.kind == CarpoolPostKind.driver else []
    return CarpoolPostOut(
        id=post.id,
        event_id=post.event_id,
        user_id=post.user_id,
        display_name=post.display_name,
        kind=post.kind,
        status=post.status,
        origin_label=post.origin_label,
        seats_total=post.seats_total,
        seats_available=seats_available_for(post, db),
        leave_time_text=post.leave_time_text,
        notes=post.notes,
        claims=[CarpoolSeatClaimOut.model_validate(c) for c in claims],
        created_at=post.created_at,
        updated_at=post.updated_at,
    )
