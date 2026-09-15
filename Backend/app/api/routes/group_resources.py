"""Group Resources routes: a group admin's stable link list (rehearsal
playlist, member portal, shared drive folder, a standing join link, ...).

Same two-prefix shape as `weekly_notes.py`: `/groups/{group_id}/resources`
(list/create, group-scoped) and `/groups/{group_id}/resources/{resource_id}`
(edit/delete) — kept under the group prefix throughout, unlike
`weekly_notes.py`'s bare `/weekly-notes/{id}`, since there's no other call
site that already has a bare resource id handy without its group id
alongside it.

Read access (list) rides along with the group's existing `about` page gate
(`GroupPageSettings`) rather than a new `GroupPage` value of its own — see
`GroupResource`'s own docstring in `app/db/models.py` for why."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import GroupResourceCreate, GroupResourceOut, GroupResourceUpdate
from app.db.models import GroupPage, GroupResource, User
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access

router = APIRouter(tags=["group-resources"])


def _get_resource_or_404(group_id: str, resource_id: str, db: Session) -> GroupResource:
    resource = get_or_404(db, GroupResource, resource_id, "Resource not found")
    if resource.group_id != group_id:
        # Same "wrong group -> 404, not 403" shape as `guest.py`'s
        # `_get_guest_carpool_event_or_404`: a resource id from another
        # group 404s exactly like a nonexistent one.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return resource


@router.get("/groups/{group_id}/resources", response_model=list[GroupResourceOut])
def list_group_resources(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupResource]:
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    require_member_page_access(group_id, GroupPage.about, current_user.id, db)
    return (
        db.query(GroupResource)
        .filter(GroupResource.group_id == group_id)
        .order_by(GroupResource.created_at.asc())
        .all()
    )


@router.post(
    "/groups/{group_id}/resources", response_model=GroupResourceOut, status_code=status.HTTP_201_CREATED
)
def create_group_resource(
    group_id: str,
    payload: GroupResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupResource:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    resource = GroupResource(
        group_id=group_id,
        label=payload.label,
        url=payload.url,
        created_by=current_user.id,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.patch("/groups/{group_id}/resources/{resource_id}", response_model=GroupResourceOut)
def update_group_resource(
    group_id: str,
    resource_id: str,
    payload: GroupResourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupResource:
    """Admin-only, partial update (unlike `weekly_notes.py`'s `PUT` full
    replace) — only the fields the caller actually sent change."""
    resource = _get_resource_or_404(group_id, resource_id, db)
    require_admin(group_id, current_user, db)
    if payload.label is not None:
        resource.label = payload.label
    if payload.url is not None:
        resource.url = payload.url
    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/groups/{group_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group_resource(
    group_id: str,
    resource_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    resource = _get_resource_or_404(group_id, resource_id, db)
    require_admin(group_id, current_user, db)
    db.delete(resource)
    db.commit()
