"""Carpool board routes (B24): `CarpoolEvent`/`CarpoolPost` on a carpool-
template `GroupCustomPage`, following B23's own `custom_pages.py` for how a
custom-page feature nests its routes and Responsibilities' router
(`app/api/routes/responsibilities.py`) for the "member acts on their own
row, admin moderates anyone's" shape.

Path shape: events nest under the owning page
(`/groups/{group_id}/pages/{page_id}/carpool/events`, matching
`GROUP_PAGES_CARPOOL_PLAN.md`'s sketch), while a single event/post is
addressed directly by id (`/carpool/events/{event_id}`, `/carpool/events/
{event_id}/posts`, `/carpool/posts/{post_id}`) once the caller already has
that id, same "no group/page prefix once you have an id" convention
Responsibilities' `/responsibilities/dates/{id}` etc. use.

Event routes (create/list/edit) stay bearer-only, admin or member. B25
reworked the post routes (create/edit/delete) to also accept an
unauthenticated caller with no bearer token: `create_post` mints or
resolves an anonymous participant exactly like `create_signup`'s
self-signup branch (`app/api/routes/responsibilities.py`), gated by
`require_guest_page_access` + `require_saved_identity` against the post's
`GroupCustomPage`. Guest reads for events/posts live in
`app/api/routes/guest.py`, not here (this router has no `get_db`-only,
no-bearer-at-all read path, following the "guest routes live in guest.py"
convention every other feature uses).
"""

from __future__ import annotations

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
)
from app.db.models import (
    CarpoolEvent,
    CarpoolEventStatus,
    CarpoolPost,
    CarpoolPostStatus,
    GroupCustomPage,
    GroupCustomPageTemplate,
    GroupRole,
    User,
)
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, group_role, require_admin, require_member
from app.services.pages import require_member_page_access, require_guest_page_access, require_saved_identity
from app.services.participants import (
    ensure_guest_membership,
    mint_anonymous_participant,
    resolve_participant,
    set_participant_cookie,
)

router = APIRouter(tags=["carpool"])


def _is_admin(group_id: str, user: User, db: Session) -> bool:
    return group_role(group_id, user.id, db) == GroupRole.admin


def _get_carpool_page_or_404(group_id: str, page_id: str, db: Session) -> GroupCustomPage:
    """Same "wrong group -> 404, not 403" shape `custom_pages.py` uses for
    cross-group ids, a privacy boundary. A right-group page with the wrong
    `template_key` isn't a privacy boundary, just a caller pointing carpool
    routes at a page that isn't a carpool board, so that's a 400 instead."""
    page = get_or_404(db, GroupCustomPage, page_id, "Page not found")
    if page.group_id != group_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
    if page.template_key != GroupCustomPageTemplate.carpool_board:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This page is not a carpool board"
        )
    return page


def _get_event_or_404(event_id: str, db: Session) -> CarpoolEvent:
    return get_or_404(db, CarpoolEvent, event_id, "Event not found")


def _get_post_or_404(post_id: str, db: Session) -> CarpoolPost:
    return get_or_404(db, CarpoolPost, post_id, "Post not found")


def _page_for_event(event: CarpoolEvent, db: Session) -> GroupCustomPage:
    """An event's page can't have been deleted out from under it in normal
    operation (no delete route ships on `GroupCustomPage` deletion cascade
    handling for carpool rows yet), but this stays a 404 rather than an
    assertion in case that ever changes."""
    page = db.get(GroupCustomPage, event.page_id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return page


def _event_for_post(post: CarpoolPost, db: Session) -> CarpoolEvent:
    event = db.get(CarpoolEvent, post.event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return event


@router.post(
    "/groups/{group_id}/pages/{page_id}/carpool/events",
    response_model=CarpoolEventOut,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    group_id: str,
    page_id: str,
    payload: CarpoolEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CarpoolEvent:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    _get_carpool_page_or_404(group_id, page_id, db)
    event = CarpoolEvent(
        page_id=page_id,
        title=payload.title,
        starts_at=payload.starts_at,
        destination_label=payload.destination_label,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/groups/{group_id}/pages/{page_id}/carpool/events", response_model=list[CarpoolEventOut])
def list_events(
    group_id: str,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CarpoolEvent]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    page = _get_carpool_page_or_404(group_id, page_id, db)
    require_member_page_access(group_id, page, current_user.id, db)
    return (
        db.query(CarpoolEvent)
        .filter(CarpoolEvent.page_id == page_id)
        .order_by(CarpoolEvent.starts_at.asc())
        .all()
    )


@router.patch("/carpool/events/{event_id}", response_model=CarpoolEventOut)
def update_event(
    event_id: str,
    payload: CarpoolEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CarpoolEvent:
    """Admin-only. Covers edit and the lock/archive (and reopen) status
    transitions in one partial-patch endpoint, same precedent as
    `ResponsibilityDate`'s `update_date`."""
    event = _get_event_or_404(event_id, db)
    page = _page_for_event(event, db)
    require_admin(page.group_id, current_user, db)
    fields = payload.model_fields_set
    if "title" in fields and payload.title is not None:
        event.title = payload.title
    if "starts_at" in fields and payload.starts_at is not None:
        event.starts_at = payload.starts_at
    if "destination_label" in fields and payload.destination_label is not None:
        event.destination_label = payload.destination_label
    if "status" in fields and payload.status is not None:
        event.status = payload.status
    db.commit()
    db.refresh(event)
    return event


def _resolve_actor(
    local_id: str | None,
    maybe_user: User | None,
    maybe_participant: User | None,
    db: Session,
) -> User:
    """Bearer member or cookie/`local_id`-resolved anonymous participant,
    for the edit/delete routes below where there's no create-time minting
    (an actor must already exist to own a post). 401 when neither
    resolves, same "not even a guest yet" shape `create_signup`'s
    admin-assignment branch uses for a missing bearer token."""
    actor = maybe_user or resolve_participant(db, maybe_participant, local_id)
    if actor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return actor


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
) -> CarpoolPost:
    """B25: mirrors `create_signup`'s self-signup branch (`app/api/routes/
    responsibilities.py`) — a real member, an existing anonymous
    participant, or a brand-new one minted right here. An anonymous actor
    must clear `require_guest_page_access` (page published, audience
    everyone) and `require_saved_identity` (page's `min_identity`); a
    member goes through the usual `require_member`/`require_member_page_access`
    instead. `ensure_guest_membership` runs before the post is written so a
    first-time guest shows up on the roster, and the response carries a
    fresh `divisi_participant` cookie for a minted/resolved anonymous actor."""
    event = _get_event_or_404(event_id, db)
    page = _page_for_event(event, db)

    actor = maybe_user or resolve_participant(db, maybe_participant, payload.local_id)
    if actor is None:
        actor = mint_anonymous_participant(db, payload.display_name or "", payload.local_id)

    if actor.is_anonymous:
        require_guest_page_access(page.group_id, page, db)
        require_saved_identity(page.group_id, page, db)
        ensure_guest_membership(db, page.group_id, actor)
        is_admin = False
    else:
        require_member(page.group_id, actor, db)
        require_member_page_access(page.group_id, page, actor.id, db)
        is_admin = _is_admin(page.group_id, actor, db)

    if not is_admin and event.status != CarpoolEventStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This event is locked or archived"
        )
    post = CarpoolPost(
        event_id=event_id,
        user_id=actor.id,
        display_name=actor.name,
        kind=payload.kind,
        origin_label=payload.origin_label,
        seats_total=payload.seats_total,
        seats_available=payload.seats_available,
        leave_time_text=payload.leave_time_text,
        notes=payload.notes,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    if actor.is_anonymous:
        set_participant_cookie(response, actor, payload.local_id)
    return post


@router.get("/carpool/events/{event_id}/posts", response_model=list[CarpoolPostOut])
def list_posts(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CarpoolPost]:
    event = _get_event_or_404(event_id, db)
    page = _page_for_event(event, db)
    require_member(page.group_id, current_user, db)
    require_member_page_access(page.group_id, page, current_user.id, db)
    query = db.query(CarpoolPost).filter(CarpoolPost.event_id == event_id)
    if not _is_admin(page.group_id, current_user, db):
        # Hidden/cancelled posts are moderated-out or withdrawn: a regular
        # member sees only the active list, same "moderation is invisible
        # to those it's not for" shape as elsewhere in this codebase. An
        # owner who needs to edit/delete their own hidden or cancelled post
        # still can, directly by id.
        query = query.filter(CarpoolPost.status == CarpoolPostStatus.open)
    return query.order_by(CarpoolPost.created_at.asc()).all()


@router.patch("/carpool/posts/{post_id}", response_model=CarpoolPostOut)
def update_post(
    post_id: str,
    payload: CarpoolPostUpdate,
    local_id: str | None = None,
    db: Session = Depends(get_db),
    maybe_user: User | None = Depends(get_current_user_optional),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> CarpoolPost:
    """Owner edits their own post's content; only an admin may flip
    `status` (the "hide" moderation action). Content edits are blocked once
    the event is locked/archived for non-admins, same as new posts;
    `delete_post` below deliberately does *not* apply that same block, see
    its own docstring.

    B25: the owner can be a real member or an anonymous participant,
    resolved the same way `create_post` does (minus minting: an actor must
    already exist to own a post). `local_id` is a query param rather than
    part of the body since it's only ever a fallback for a lost cookie."""
    post = _get_post_or_404(post_id, db)
    event = _event_for_post(post, db)
    page = _page_for_event(event, db)
    actor = _resolve_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = _is_admin(page.group_id, actor, db)
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
    if "seats_total" in fields:
        post.seats_total = payload.seats_total
    if "seats_available" in fields:
        post.seats_available = payload.seats_available
    if "leave_time_text" in fields:
        post.leave_time_text = payload.leave_time_text
    if "notes" in fields:
        post.notes = payload.notes
    db.commit()
    db.refresh(post)
    return post


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
    page = _page_for_event(event, db)
    actor = _resolve_actor(local_id, maybe_user, maybe_participant, db)
    is_admin = _is_admin(page.group_id, actor, db)
    if post.user_id != actor.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only delete your own post")
    db.delete(post)
    db.commit()
