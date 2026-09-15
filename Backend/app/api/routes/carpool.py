"""Carpool board routes: `CarpoolEvent`/`CarpoolPost` on the group's
built-in carpool page (B31; originally B24 scoped these to a carpool-
template `GroupCustomPage`, a generic system since dropped).

Path shape: events are directly group-scoped
(`/groups/{group_id}/carpool/events`), while a single event/post is
addressed directly by id (`/carpool/events/{event_id}`, `/carpool/events/
{event_id}/posts`, `/carpool/posts/{post_id}`) once the caller already has
that id, same "no group prefix once you have an id" convention
Responsibilities' `/responsibilities/dates/{id}` etc. use.

Event routes (create/list/edit) stay bearer-only, admin or member. B25
reworked the post routes (create/edit/delete) to also accept an
unauthenticated caller with no bearer token: `create_post` mints or
resolves an anonymous participant exactly like `create_signup`'s
self-signup branch (`app/api/routes/responsibilities.py`), gated by
`require_guest_page_access` + `require_saved_identity` against
`GroupPage.carpool`. Guest reads for events/posts live in
`app/api/routes/guest.py`, not here (this router has no `get_db`-only,
no-bearer-at-all read path, following the "guest routes live in guest.py"
convention every other feature uses).

B30: `create_interest`/`release_interest` are the rider-post mirror of
B27's `create_claim`/`release_claim` — a driver expressing interest in a
rider's request rather than a rider claiming a driver's seat, which is
also how a rider's `CarpoolPost.contact_phone` gets revealed to that
driver (see `app.services.carpool.serialize_post`).

B32: `direction` (there/back/round_trip) is a plain content field on
`CarpoolPost` handled the same way `leave_time_text`/`notes` are; `list_posts`
gains an optional `direction` query param filter (see that function).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional, get_optional_participant
from app.api.schemas import (
    CarpoolEventCreate,
    CarpoolEventOut,
    CarpoolEventUpdate,
    CarpoolPostCreate,
    CarpoolPostOut,
    CarpoolPostUpdate,
    CarpoolRiderInterestCreate,
    CarpoolRiderInterestOut,
    CarpoolSeatClaimCreate,
    CarpoolSeatClaimOut,
)
from app.db.models import (
    CarpoolEvent,
    CarpoolEventStatus,
    CarpoolPost,
    CarpoolPostDirection,
    CarpoolPostKind,
    CarpoolPostStatus,
    CarpoolRiderInterest,
    CarpoolRiderInterestStatus,
    CarpoolSeatClaim,
    CarpoolSeatClaimStatus,
    GroupPage,
    User,
)
from app.db.session import get_db
from app.services.actors import (
    authorize_page_write_actor,
    is_group_admin,
    resolve_existing_actor,
    resolve_or_mint_actor,
    resolve_page_write_actor,
)
from app.services.carpool import (
    active_claims_for,
    active_interests_for,
    list_events_ordered,
    resolve_origin_coordinates,
    serialize_post,
    serialize_posts,
)
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access
from app.services.participants import set_participant_cookie

router = APIRouter(tags=["carpool"])


def _get_event_or_404(event_id: str, db: Session) -> CarpoolEvent:
    return get_or_404(db, CarpoolEvent, event_id, "Event not found")


def _get_post_or_404(post_id: str, db: Session) -> CarpoolPost:
    return get_or_404(db, CarpoolPost, post_id, "Post not found")


def _get_claim_or_404(claim_id: str, db: Session) -> CarpoolSeatClaim:
    """A released claim reads as gone, same "already removed" 404 a hard
    delete would give on a second attempt (see `release_claim` below)."""
    claim = get_or_404(db, CarpoolSeatClaim, claim_id, "Claim not found")
    if claim.status != CarpoolSeatClaimStatus.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    return claim


def _get_interest_or_404(interest_id: str, db: Session) -> CarpoolRiderInterest:
    """B30: the rider-interest mirror of `_get_claim_or_404` — a released
    interest reads as gone, same "already removed" 404 shape."""
    interest = get_or_404(db, CarpoolRiderInterest, interest_id, "Interest not found")
    if interest.status != CarpoolRiderInterestStatus.active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interest not found")
    return interest


def _event_for_post(post: CarpoolPost, db: Session) -> CarpoolEvent:
    event = db.get(CarpoolEvent, post.event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return event


@router.post(
    "/groups/{group_id}/carpool/events",
    response_model=CarpoolEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    group_id: str,
    payload: CarpoolEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CarpoolEvent:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    event = CarpoolEvent(
        group_id=group_id,
        title=payload.title,
        starts_at=payload.starts_at,
        destination_label=payload.destination_label,
        destination_latitude=payload.destination_latitude,
        destination_longitude=payload.destination_longitude,
        destination_place_id=payload.destination_place_id,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/groups/{group_id}/carpool/events", response_model=list[CarpoolEventOut])
def list_events(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CarpoolEvent]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.carpool, current_user.id, db)
    return list_events_ordered(group_id, db)


@router.patch("/carpool/events/{event_id}", response_model=CarpoolEventOut)
def update_event(
    event_id: str,
    payload: CarpoolEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CarpoolEvent:
    """Admin-only. Covers edit and the lock/archive (and reopen) status
    transitions in one partial-patch endpoint, same precedent as
    `ResponsibilityDate`'s `update_date`.

    B26: a standing event (`is_standing`) rejects two attempts outright
    rather than silently dropping them, same "a confused client finds out
    immediately" reasoning as `CarpoolPostCreate`'s seat validation:
    `status=archived` (the standing event's whole point is that it doesn't
    go away, though locking/unlocking still works) and `starts_at` (setting
    a date on it would half-turn it into a dated event). `is_standing`
    itself isn't in `CarpoolEventUpdate` at all, so there's nothing to
    guard there."""
    event = _get_event_or_404(event_id, db)
    require_admin(event.group_id, current_user, db)
    fields = payload.model_fields_set
    if event.is_standing and "starts_at" in fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="starts_at can't be set on the standing carpool event",
        )
    if event.is_standing and "status" in fields and payload.status == CarpoolEventStatus.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The standing carpool event can't be archived",
        )
    if "title" in fields and payload.title is not None:
        event.title = payload.title
    if "starts_at" in fields and payload.starts_at is not None:
        event.starts_at = payload.starts_at
    if "destination_label" in fields and payload.destination_label is not None:
        event.destination_label = payload.destination_label
    if "destination_latitude" in fields:
        event.destination_latitude = payload.destination_latitude
    if "destination_longitude" in fields:
        event.destination_longitude = payload.destination_longitude
    if "destination_place_id" in fields:
        event.destination_place_id = payload.destination_place_id
    if "status" in fields and payload.status is not None:
        event.status = payload.status
    db.commit()
    db.refresh(event)
    return event


@router.post(
    "/carpool/events/{event_id}/posts",
    response_model=CarpoolPostOut,
    status_code=status.HTTP_201_CREATED,
)
def create_post(
    event_id: str,
    payload: CarpoolPostCreate,
    response: Response,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> CarpoolPostOut:
    """B25: mirrors `create_signup`'s self-signup branch (`app/api/routes/
    responsibilities.py`) — a real member, an existing anonymous
    participant, or a brand-new one minted right here. An anonymous actor
    must clear `require_guest_page_access` (page enabled, audience
    everyone) and `require_saved_identity` (page's `min_identity`); a
    member goes through the usual `require_member`/`require_member_page_access`
    instead. `ensure_guest_membership` runs before the post is written so a
    first-time guest shows up on the roster, and the response carries a
    fresh `divisi_participant` cookie for a minted/resolved anonymous actor."""
    event = _get_event_or_404(event_id, db)

    actor_ctx = resolve_page_write_actor(
        event.group_id,
        GroupPage.carpool,
        db,
        maybe_user,
        maybe_participant,
        payload.local_id,
        payload.display_name,
    )
    actor = actor_ctx.user
    is_admin = actor_ctx.is_admin

    if not is_admin and event.status != CarpoolEventStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This event is locked or archived"
        )
    origin_latitude, origin_longitude, origin_precision = resolve_origin_coordinates(
        payload.origin_latitude, payload.origin_longitude, payload.origin_precision
    )
    post = CarpoolPost(
        event_id=event_id,
        user_id=actor.id,
        display_name=actor.name,
        kind=payload.kind,
        direction=payload.direction,
        origin_label=payload.origin_label,
        origin_latitude=origin_latitude,
        origin_longitude=origin_longitude,
        origin_place_id=payload.origin_place_id if origin_latitude is not None else None,
        origin_precision=origin_precision,
        seats_total=payload.seats_total,
        leave_time_text=payload.leave_time_text,
        notes=payload.notes,
        contact_phone=payload.contact_phone,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    if actor.is_anonymous:
        set_participant_cookie(response, actor, payload.local_id)
    return serialize_post(post, db, viewer_user_id=actor.id, viewer_is_admin=is_admin)


@router.get("/carpool/events/{event_id}/posts", response_model=list[CarpoolPostOut])
def list_posts(
    event_id: str,
    direction: CarpoolPostDirection | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CarpoolPostOut]:
    """B32: `direction` is an optional filter for splitting the board into
    "on the way there" / "on the way back" views. A `round_trip` post
    always matches either filter, alongside the exact-direction match; no
    `direction` param at all means no filtering, unchanged behavior."""
    event = _get_event_or_404(event_id, db)
    require_member(event.group_id, current_user, db)
    require_member_page_access(event.group_id, GroupPage.carpool, current_user.id, db)
    is_admin = is_group_admin(event.group_id, current_user, db)
    query = db.query(CarpoolPost).filter(CarpoolPost.event_id == event_id)
    if not is_admin:
        # Hidden/cancelled posts are moderated-out or withdrawn: a regular
        # member sees only the active list, same "moderation is invisible
        # to those it's not for" shape as elsewhere in this codebase. An
        # owner who needs to edit/delete their own hidden or cancelled post
        # still can, directly by id.
        query = query.filter(CarpoolPost.status == CarpoolPostStatus.open)
    if direction is not None:
        query = query.filter(CarpoolPost.direction.in_([direction, CarpoolPostDirection.round_trip]))
    posts = query.order_by(CarpoolPost.created_at.asc()).all()
    return serialize_posts(posts, db, viewer_user_id=current_user.id, viewer_is_admin=is_admin)


@router.patch("/carpool/posts/{post_id}", response_model=CarpoolPostOut)
def update_post(
    post_id: str,
    payload: CarpoolPostUpdate,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> CarpoolPostOut:
    """Owner edits their own post's content; only an admin may flip
    `status` (the "hide" moderation action). Content edits are blocked once
    the event is locked/archived for non-admins, same as new posts;
    `delete_post` below deliberately does *not* apply that same block, see
    its own docstring.

    B25: the owner can be a real member or an anonymous participant,
    resolved the same way `create_post` does (minus minting: an actor must
    already exist to own a post). `local_id` is a query param rather than
    part of the body since it's only ever a fallback for a lost cookie.

    B27: lowering `seats_total` below the post's current active-claim count
    is rejected (400) rather than silently going negative on read."""
    post = _get_post_or_404(post_id, db)
    event = _event_for_post(post, db)
    actor = resolve_existing_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = is_group_admin(event.group_id, actor, db)
    if post.user_id != actor.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only edit your own post")
    fields = payload.model_fields_set
    if "status" in fields and payload.status is not None:
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required to change post status"
            )
        post.status = payload.status
    content_fields = fields - {"status"}
    if content_fields and not is_admin and event.status != CarpoolEventStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This event is locked or archived"
        )
    if "origin_label" in fields and payload.origin_label is not None:
        post.origin_label = payload.origin_label
    if "direction" in fields and payload.direction is not None:
        post.direction = payload.direction
    origin_fields = {"origin_latitude", "origin_longitude", "origin_place_id", "origin_precision"}
    if fields & origin_fields:
        # Coordinates and precision move together, same "the whole pin
        # moves as a unit" reasoning as `create_post`. A patch that only
        # touches `origin_place_id`/`origin_precision` without touching the
        # coordinates re-resolves against whatever lat/lng the post already
        # has, so precision still gets (re-)applied and re-rounded
        # consistently rather than trusting a stale stored value.
        latitude = payload.origin_latitude if "origin_latitude" in fields else post.origin_latitude
        longitude = payload.origin_longitude if "origin_longitude" in fields else post.origin_longitude
        precision = payload.origin_precision if "origin_precision" in fields else post.origin_precision
        origin_latitude, origin_longitude, origin_precision = resolve_origin_coordinates(
            latitude, longitude, precision
        )
        post.origin_latitude = origin_latitude
        post.origin_longitude = origin_longitude
        post.origin_precision = origin_precision
        if "origin_place_id" in fields:
            post.origin_place_id = payload.origin_place_id if origin_latitude is not None else None
        elif origin_latitude is None:
            post.origin_place_id = None
    if "seats_total" in fields:
        if payload.seats_total is not None:
            active_count = len(active_claims_for(post.id, db))
            if payload.seats_total < active_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="seats_total can't drop below the number of active claims",
                )
        post.seats_total = payload.seats_total
    if "leave_time_text" in fields:
        post.leave_time_text = payload.leave_time_text
    if "notes" in fields:
        post.notes = payload.notes
    if "contact_phone" in fields:
        post.contact_phone = payload.contact_phone
    db.commit()
    db.refresh(post)
    return serialize_post(post, db, viewer_user_id=actor.id, viewer_is_admin=is_admin)


@router.delete("/carpool/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: str,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> None:
    """Owner delete is always allowed, regardless of the event's lock/
    archive state: withdrawing your own ride shouldn't be blocked by an
    admin's later lock. Deliberate narrower reading of "locked/archived
    events reject new posts" (plan.md's B24), which this extends to edits
    but not to a member deleting their own row. Admin delete always works
    too, same as admin edit. B25: actor resolution matches `update_post`."""
    post = _get_post_or_404(post_id, db)
    event = _event_for_post(post, db)
    actor = resolve_existing_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = is_group_admin(event.group_id, actor, db)
    if post.user_id != actor.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only delete your own post")
    db.delete(post)
    db.commit()


@router.post(
    "/carpool/posts/{driver_post_id}/claims",
    response_model=CarpoolSeatClaimOut,
    status_code=status.HTTP_201_CREATED,
)
def create_claim(
    driver_post_id: str,
    payload: CarpoolSeatClaimCreate,
    response: Response,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> CarpoolSeatClaim:
    """B27: claim one seat on a driver's post. Actor resolution mirrors
    `create_post` exactly (bearer member, or mint-or-resolve anonymous
    participant): a guest with no post of their own at all can still claim
    a seat, that's the whole reason `CarpoolSeatClaim` is its own table
    rather than a repurposed `CarpoolPost`.

    Checked in this order: the post must be a driver post (400) before
    anything else runs (no point minting a participant for a request
    that's wrong regardless of who's asking); the actor can't be the
    driver themselves (400, a seat claim only makes sense for someone else
    riding along); the event's lock/archive state (409, same as
    `create_post`) only blocks a non-admin; then full (400) and
    already-claimed (400) are checked against the post's current active
    claims."""
    post = _get_post_or_404(driver_post_id, db)
    if post.kind != CarpoolPostKind.driver:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only a driver post can be claimed"
        )
    event = _event_for_post(post, db)

    actor = resolve_or_mint_actor(
        db,
        maybe_user,
        maybe_participant,
        payload.local_id,
        payload.display_name,
    )

    if actor.id == post.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You can't claim a seat on your own post"
        )
    is_admin = authorize_page_write_actor(event.group_id, GroupPage.carpool, actor, db)

    if not is_admin and event.status != CarpoolEventStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This event is locked or archived"
        )

    active = active_claims_for(post.id, db)
    if any(c.user_id == actor.id for c in active):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a claim on this post"
        )
    if post.seats_total is not None and len(active) >= post.seats_total:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This post is full")

    claim = CarpoolSeatClaim(driver_post_id=post.id, user_id=actor.id, display_name=actor.name)
    db.add(claim)
    db.commit()
    db.refresh(claim)
    if actor.is_anonymous:
        set_participant_cookie(response, actor, payload.local_id)
    return claim


@router.delete("/carpool/claims/{claim_id}", status_code=status.HTTP_204_NO_CONTENT)
def release_claim(
    claim_id: str,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> None:
    """The claimant, the driver post's own owner, or an admin can release a
    seat; anyone else gets 403. Soft-removed (`status`/`removed_at`), not
    hard-deleted, so a released seat leaves a trace the same way a removed
    `ResponsibilitySignup` would. Actor resolution matches `update_post`/
    `delete_post`: an actor must already exist, nothing is minted here."""
    claim = _get_claim_or_404(claim_id, db)
    post = _get_post_or_404(claim.driver_post_id, db)
    event = _event_for_post(post, db)
    actor = resolve_existing_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = is_group_admin(event.group_id, actor, db)
    if actor.id != claim.user_id and actor.id != post.user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only release your own claim")
    claim.status = CarpoolSeatClaimStatus.removed
    claim.removed_at = datetime.now(timezone.utc)
    db.commit()


@router.post(
    "/carpool/posts/{rider_post_id}/interests",
    response_model=CarpoolRiderInterestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_interest(
    rider_post_id: str,
    payload: CarpoolRiderInterestCreate,
    response: Response,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> CarpoolRiderInterest:
    """B30: the rider-post mirror of `create_claim` — a driver expressing
    interest in one rider's request, since a rider's post has no seats to
    claim. Actor resolution mirrors `create_claim`/`create_post` exactly
    (bearer member, or mint-or-resolve anonymous participant): a guest with
    no post of their own at all can still express interest.

    Checked in this order, same shape as `create_claim`: the post must be a
    rider post (400) before anything else runs; the actor can't be the
    rider themselves (400, expressing interest in your own request doesn't
    make sense); the event's lock/archive state (409, same as
    `create_post`/`create_claim`) only blocks a non-admin; then
    already-interested (400) is checked against the post's current active
    interests. No capacity check at all, unlike `create_claim`: a rider's
    request isn't seat-limited the way a driver's post is."""
    post = _get_post_or_404(rider_post_id, db)
    if post.kind != CarpoolPostKind.rider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only a rider post can get interest"
        )
    event = _event_for_post(post, db)

    actor = resolve_or_mint_actor(
        db,
        maybe_user,
        maybe_participant,
        payload.local_id,
        payload.display_name,
    )

    if actor.id == post.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't express interest in your own post",
        )
    is_admin = authorize_page_write_actor(event.group_id, GroupPage.carpool, actor, db)

    if not is_admin and event.status != CarpoolEventStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This event is locked or archived"
        )

    active = active_interests_for(post.id, db)
    if any(i.user_id == actor.id for i in active):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You already have an interest on this post"
        )

    interest = CarpoolRiderInterest(rider_post_id=post.id, user_id=actor.id, display_name=actor.name)
    db.add(interest)
    db.commit()
    db.refresh(interest)
    if actor.is_anonymous:
        set_participant_cookie(response, actor, payload.local_id)
    return interest


@router.delete("/carpool/interests/{interest_id}", status_code=status.HTTP_204_NO_CONTENT)
def release_interest(
    interest_id: str,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> None:
    """The interested party, the rider post's own owner, or an admin can
    release an interest; anyone else gets 403. Soft-removed (`status`/
    `removed_at`), not hard-deleted, same trace-left-behind reasoning as
    `release_claim`. Actor resolution matches `release_claim`: an actor
    must already exist, nothing is minted here."""
    interest = _get_interest_or_404(interest_id, db)
    post = _get_post_or_404(interest.rider_post_id, db)
    event = _event_for_post(post, db)
    actor = resolve_existing_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = is_group_admin(event.group_id, actor, db)
    if actor.id != interest.user_id and actor.id != post.user_id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Can only release your own interest"
        )
    interest.status = CarpoolRiderInterestStatus.removed
    interest.removed_at = datetime.now(timezone.utc)
    db.commit()
