"""B26: the standing (non-dated) carpool event, get-or-created lazily
rather than admin-created, so a brand-new group's carpool board has one
from its very first view. One shared helper so the member (`app/api/routes/
carpool.py`) and guest (`app/api/routes/guest.py`) read paths can't drift
out of sync on this.

B27: same reasoning extended to seat claims — `seats_available_for` and
`serialize_post` are the one place `seats_total - active claims` gets
computed and turned into a `CarpoolPostOut`, so the member and guest post
listings can't compute (or shape) it differently.

B29: `resolve_origin_coordinates` is the one place the approximate-by-
default rule and the actual privacy rounding happen, so `create_post` and
`update_post` (`app/api/routes/carpool.py`) can't apply it inconsistently.
Rounding happens here, server-side, regardless of what a client sends: a
buggy or malicious client claiming `approximate` while sending exact
coordinates must still end up rounded on write.

B30: same "one place" reasoning extended to `contact_phone` visibility —
`serialize_post` is the only spot that decides whether a viewer gets the
real phone number or `None`, so the member (`carpool.py`) and guest
(`guest.py`) routes can't ship a different visibility rule for the same
post. `active_interests_for` is the rider-post mirror of
`active_claims_for`, backing that decision for a rider post the same way
`active_claims_for` already does for a driver post.

B32: `serialize_post` also just passes `post.direction` straight through
to `CarpoolPostOut` — no computation involved, unlike `seats_available`/
`contact_phone`, it's included here purely so every `CarpoolPostOut` still
comes from this one function."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.schemas.carpool import CarpoolPostOut, CarpoolRiderInterestOut, CarpoolSeatClaimOut
from app.db.models import (
    CarpoolEvent,
    CarpoolLocationPrecision,
    CarpoolPost,
    CarpoolPostKind,
    CarpoolRiderInterest,
    CarpoolRiderInterestStatus,
    CarpoolSeatClaim,
    CarpoolSeatClaimStatus,
)

# ~1.1km grid at the equator, tightening a touch at mid latitudes. Chosen
# as "close enough to place a pin near the right neighborhood, not the
# right building" for a carpool rider's home.
ORIGIN_ROUNDING_DECIMALS = 2

STANDING_EVENT_TITLE = "Ongoing carpool"


def get_or_create_standing_event(group_id: str, db: Session) -> CarpoolEvent:
    """Idempotent: a second call for the same group returns the same row,
    never a duplicate. `starts_at`/`destination_label` stay `None`, the
    whole point of the standing shape."""
    event = (
        db.query(CarpoolEvent)
        .filter(CarpoolEvent.group_id == group_id, CarpoolEvent.is_standing.is_(True))
        .first()
    )
    if event is not None:
        return event
    event = CarpoolEvent(
        group_id=group_id,
        title=STANDING_EVENT_TITLE,
        starts_at=None,
        destination_label=None,
        is_standing=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_events_ordered(group_id: str, db: Session) -> list[CarpoolEvent]:
    """The standing event first, then dated events by `starts_at`
    ascending. Ordered explicitly rather than via a raw `ORDER BY
    starts_at` (a `NULL` there sorts unpredictably across backends) so a
    caller in `carpool.py` or `guest.py` doesn't have to re-derive this.
    Bootstraps the standing event first, so this is also the one call a
    listing route needs to make."""
    standing = get_or_create_standing_event(group_id, db)
    dated = (
        db.query(CarpoolEvent)
        .filter(CarpoolEvent.group_id == group_id, CarpoolEvent.is_standing.is_(False))
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


def active_interests_for(rider_post_id: str, db: Session) -> list[CarpoolRiderInterest]:
    """A rider post's active (not released) interests, oldest first, same
    ordering/"not removed" filter as `active_claims_for`."""
    return (
        db.query(CarpoolRiderInterest)
        .filter(
            CarpoolRiderInterest.rider_post_id == rider_post_id,
            CarpoolRiderInterest.status == CarpoolRiderInterestStatus.active,
        )
        .order_by(CarpoolRiderInterest.created_at.asc())
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


def _group_claims_by_post_id(driver_post_ids: list[str], db: Session) -> dict[str, list[CarpoolSeatClaim]]:
    if not driver_post_ids:
        return {}
    claims = (
        db.query(CarpoolSeatClaim)
        .filter(
            CarpoolSeatClaim.driver_post_id.in_(driver_post_ids),
            CarpoolSeatClaim.status == CarpoolSeatClaimStatus.active,
        )
        .order_by(CarpoolSeatClaim.created_at.asc())
        .all()
    )
    grouped: dict[str, list[CarpoolSeatClaim]] = {post_id: [] for post_id in driver_post_ids}
    for claim in claims:
        grouped.setdefault(claim.driver_post_id, []).append(claim)
    return grouped


def _group_interests_by_post_id(rider_post_ids: list[str], db: Session) -> dict[str, list[CarpoolRiderInterest]]:
    if not rider_post_ids:
        return {}
    interests = (
        db.query(CarpoolRiderInterest)
        .filter(
            CarpoolRiderInterest.rider_post_id.in_(rider_post_ids),
            CarpoolRiderInterest.status == CarpoolRiderInterestStatus.active,
        )
        .order_by(CarpoolRiderInterest.created_at.asc())
        .all()
    )
    grouped: dict[str, list[CarpoolRiderInterest]] = {post_id: [] for post_id in rider_post_ids}
    for interest in interests:
        grouped.setdefault(interest.rider_post_id, []).append(interest)
    return grouped


def resolve_origin_coordinates(
    latitude: float | None,
    longitude: float | None,
    precision: CarpoolLocationPrecision | None,
) -> tuple[float | None, float | None, CarpoolLocationPrecision | None]:
    """The one place `CarpoolPost.origin_*` coordinates get their default
    precision and their actual rounding applied, called from the route right
    before a value is assigned to the model (never from the schema layer,
    which only validates shape). `precision` defaults to `approximate`
    whenever coordinates are given and it isn't explicitly `exact`; only an
    explicit `exact` skips rounding. No coordinates means no precision
    either, regardless of what was passed in."""
    if latitude is None or longitude is None:
        return None, None, None
    if precision == CarpoolLocationPrecision.exact:
        return latitude, longitude, CarpoolLocationPrecision.exact
    return (
        round(latitude, ORIGIN_ROUNDING_DECIMALS),
        round(longitude, ORIGIN_ROUNDING_DECIMALS),
        CarpoolLocationPrecision.approximate,
    )


def _contact_phone_visible_to(
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
    claims: list[CarpoolSeatClaim],
    interests: list[CarpoolRiderInterest],
) -> str | None:
    """B30: the one place `CarpoolPost.contact_phone` visibility is decided.
    `viewer_user_id` is `None` when the caller couldn't be identified at all
    (an unrecognized guest, see `guest.py`'s `list_guest_carpool_posts`) —
    that never reveals the phone, not even for what would otherwise be the
    post's own owner, since there's no owner id to match against `None`.
    Fails closed on purpose: showing a phone number to the wrong person is
    a much worse failure than hiding it from the right one."""
    if post.contact_phone is None or viewer_user_id is None:
        return None
    if viewer_user_id == post.user_id or viewer_is_admin:
        return post.contact_phone
    if post.kind == CarpoolPostKind.driver:
        matched = any(c.user_id == viewer_user_id for c in claims)
    elif post.kind == CarpoolPostKind.rider:
        matched = any(i.user_id == viewer_user_id for i in interests)
    else:
        matched = False
    return post.contact_phone if matched else None


def _claim_contact_phone_visible_to(
    claim: CarpoolSeatClaim,
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
) -> str | None:
    """B34: the inverse of `_contact_phone_visible_to` -- gates
    `CarpoolSeatClaim.contact_phone` (an opt-in left by the person claiming
    a seat, for the driver to reach back). Visible to the driver post's own
    owner (`post.user_id`), a group admin, or the claimant themselves
    (`viewer_user_id == claim.user_id`); `None` for everyone else,
    including another claimant on the same post. Same "fails closed" shape
    as `_contact_phone_visible_to`: no viewer identified never reveals it."""
    if claim.contact_phone is None or viewer_user_id is None:
        return None
    if viewer_user_id == claim.user_id or viewer_user_id == post.user_id or viewer_is_admin:
        return claim.contact_phone
    return None


def _claim_contact_email_visible_to(
    claim: CarpoolSeatClaim,
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
) -> str | None:
    """B34: the email mirror of `_claim_contact_phone_visible_to` above."""
    if claim.contact_email is None or viewer_user_id is None:
        return None
    if viewer_user_id == claim.user_id or viewer_user_id == post.user_id or viewer_is_admin:
        return claim.contact_email
    return None


def _interest_contact_phone_visible_to(
    interest: CarpoolRiderInterest,
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
) -> str | None:
    """B34: the rider-interest mirror of `_claim_contact_phone_visible_to`
    -- gates `CarpoolRiderInterest.contact_phone` (an opt-in left by the
    driver expressing interest, for the rider to reach back). Visible to
    the rider post's own owner, a group admin, or the interested driver
    themselves; `None` for everyone else, including another driver
    interested in the same post."""
    if interest.contact_phone is None or viewer_user_id is None:
        return None
    if viewer_user_id == interest.user_id or viewer_user_id == post.user_id or viewer_is_admin:
        return interest.contact_phone
    return None


def _interest_contact_email_visible_to(
    interest: CarpoolRiderInterest,
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
) -> str | None:
    """B34: the email mirror of `_interest_contact_phone_visible_to` above."""
    if interest.contact_email is None or viewer_user_id is None:
        return None
    if viewer_user_id == interest.user_id or viewer_user_id == post.user_id or viewer_is_admin:
        return interest.contact_email
    return None


def _contact_email_visible_to(
    post: CarpoolPost,
    viewer_user_id: str | None,
    viewer_is_admin: bool,
    claims: list[CarpoolSeatClaim],
    interests: list[CarpoolRiderInterest],
) -> str | None:
    """B33: the email mirror of `_contact_phone_visible_to` above, same
    visibility rule applied to `CarpoolPost.contact_email` instead. See that
    function's docstring for the "fails closed" reasoning."""
    if post.contact_email is None or viewer_user_id is None:
        return None
    if viewer_user_id == post.user_id or viewer_is_admin:
        return post.contact_email
    if post.kind == CarpoolPostKind.driver:
        matched = any(c.user_id == viewer_user_id for c in claims)
    elif post.kind == CarpoolPostKind.rider:
        matched = any(i.user_id == viewer_user_id for i in interests)
    else:
        matched = False
    return post.contact_email if matched else None


def serialize_post(
    post: CarpoolPost,
    db: Session,
    viewer_user_id: str | None = None,
    viewer_is_admin: bool = False,
) -> CarpoolPostOut:
    """The one place a `CarpoolPost` ORM row turns into a `CarpoolPostOut`,
    so the member (`carpool.py`) and guest (`guest.py`) routes can't ship a
    different `claims`/`interests`/`seats_available`/`contact_phone` shape
    for the same post. A rider post's `claims` is always empty (it isn't a
    driver post, so it can't be claimed); a driver post's `interests` is
    always empty the same way (it isn't a rider post, so no one "expresses
    interest" in it).

    B30: `viewer_user_id`/`viewer_is_admin` identify who's asking, purely to
    decide `contact_phone` visibility (`_contact_phone_visible_to`) —
    they don't otherwise change what's returned. Defaults (`None`/`False`)
    mean "no viewer identified", which always resolves to a hidden phone;
    every real call site should pass the actual caller."""
    claims = active_claims_for(post.id, db) if post.kind == CarpoolPostKind.driver else []
    interests = active_interests_for(post.id, db) if post.kind == CarpoolPostKind.rider else []
    return _serialize_post_with_related(post, claims, interests, viewer_user_id, viewer_is_admin)


def serialize_posts(
    posts: list[CarpoolPost],
    db: Session,
    viewer_user_id: str | None = None,
    viewer_is_admin: bool = False,
) -> list[CarpoolPostOut]:
    """Batch `serialize_post` for list routes.

    The single-post serializer stays convenient for create/update responses,
    while list endpoints avoid one claims/interests query per row and the
    second driver-claim query that `seats_available_for` would otherwise do.
    """
    driver_post_ids = [post.id for post in posts if post.kind == CarpoolPostKind.driver]
    rider_post_ids = [post.id for post in posts if post.kind == CarpoolPostKind.rider]
    claims_by_post = _group_claims_by_post_id(driver_post_ids, db)
    interests_by_post = _group_interests_by_post_id(rider_post_ids, db)
    return [
        _serialize_post_with_related(
            post,
            claims_by_post.get(post.id, []),
            interests_by_post.get(post.id, []),
            viewer_user_id,
            viewer_is_admin,
        )
        for post in posts
    ]


def _serialize_post_with_related(
    post: CarpoolPost,
    claims: list[CarpoolSeatClaim],
    interests: list[CarpoolRiderInterest],
    viewer_user_id: str | None,
    viewer_is_admin: bool,
) -> CarpoolPostOut:
    seats_available = None
    if post.kind == CarpoolPostKind.driver and post.seats_total is not None:
        seats_available = post.seats_total - len(claims)
    return CarpoolPostOut(
        id=post.id,
        event_id=post.event_id,
        user_id=post.user_id,
        display_name=post.display_name,
        kind=post.kind,
        status=post.status,
        direction=post.direction,
        origin_label=post.origin_label,
        origin_latitude=post.origin_latitude,
        origin_longitude=post.origin_longitude,
        origin_place_id=post.origin_place_id,
        origin_precision=post.origin_precision,
        seats_total=post.seats_total,
        seats_available=seats_available,
        leave_time_text=post.leave_time_text,
        notes=post.notes,
        contact_phone=_contact_phone_visible_to(post, viewer_user_id, viewer_is_admin, claims, interests),
        contact_email=_contact_email_visible_to(post, viewer_user_id, viewer_is_admin, claims, interests),
        claims=[
            CarpoolSeatClaimOut(
                id=c.id,
                user_id=c.user_id,
                display_name=c.display_name,
                contact_phone=_claim_contact_phone_visible_to(c, post, viewer_user_id, viewer_is_admin),
                contact_email=_claim_contact_email_visible_to(c, post, viewer_user_id, viewer_is_admin),
                created_at=c.created_at,
            )
            for c in claims
        ],
        interests=[
            CarpoolRiderInterestOut(
                id=i.id,
                user_id=i.user_id,
                display_name=i.display_name,
                contact_phone=_interest_contact_phone_visible_to(i, post, viewer_user_id, viewer_is_admin),
                contact_email=_interest_contact_email_visible_to(i, post, viewer_user_id, viewer_is_admin),
                created_at=i.created_at,
            )
            for i in interests
        ],
        created_at=post.created_at,
        updated_at=post.updated_at,
    )
