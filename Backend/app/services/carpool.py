"""B26: the standing (non-dated) carpool event, get-or-created lazily
rather than admin-created, so a brand-new carpool page has one from its
very first view. One shared helper so the member (`app/api/routes/
carpool.py`) and guest (`app/api/routes/guest.py`) read paths can't drift
out of sync on this, same reasoning as `app/services/custom_pages.py`
being its own small module rather than logic duplicated per route file."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import CarpoolEvent

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
