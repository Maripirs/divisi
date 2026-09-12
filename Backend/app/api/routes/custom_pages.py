"""Custom Group Pages routes (B23): admin-managed pages distinct from the
built-in `GroupPage` enum (homework/tracks/members/about/responsibilities/
weekly_notes), one dynamic row per page instead of a fixed member.

Two path shapes on one router: `/groups/{group_id}/custom-pages[/{page_id}]`
for admin management (create/list/get/patch/delete, plus the `/publish` and
`/archive` actions), and `/groups/{group_id}/pages/{slug}` for the
member-facing read, which reuses `require_member_page_access` exactly like
a built-in page's route does. The guest counterpart lives in `guest.py`
(`GET /guest/{join_code}/pages/{slug}`), same split as every other page
type in this codebase.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import GroupCustomPageCreate, GroupCustomPageOut, GroupCustomPageUpdate
from app.db.models import GroupCustomPage, GroupCustomPageStatus, User
from app.db.session import get_db
from app.services.common import get_or_404
from app.services.custom_pages import generate_slug_or_409, get_custom_page_by_slug_or_404
from app.services.groups import get_group_or_404, require_admin, require_member
from app.services.pages import require_member_page_access

router = APIRouter(tags=["custom-pages"])


def _get_page_in_group_or_404(group_id: str, page_id: str, db: Session) -> GroupCustomPage:
    """Same "id exists, just not in this scope" shape as a wrong-group id
    anywhere else in this codebase: a 404, not a 403, since the caller
    shouldn't learn the id is valid for some *other* group."""
    page = get_or_404(db, GroupCustomPage, page_id, "Page not found")
    if page.group_id != group_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
    return page


@router.post(
    "/groups/{group_id}/custom-pages", response_model=GroupCustomPageOut, status_code=status.HTTP_201_CREATED
)
def create_custom_page(
    group_id: str,
    payload: GroupCustomPageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    slug = generate_slug_or_409(group_id, payload.title, db)
    page = GroupCustomPage(
        group_id=group_id,
        title=payload.title,
        slug=slug,
        template_key=payload.template_key,
        audience=payload.audience,
        min_identity=payload.min_identity,
        created_by=current_user.id,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.get("/groups/{group_id}/custom-pages", response_model=list[GroupCustomPageOut])
def list_custom_pages(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupCustomPage]:
    """Admin-only, every status included — this is the management list,
    not the public one. There's no member-facing "list all custom pages"
    route (out of scope for B23: a member reaches a specific page by its
    slug, e.g. from a link an admin shares)."""
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    return (
        db.query(GroupCustomPage)
        .filter(GroupCustomPage.group_id == group_id)
        .order_by(GroupCustomPage.created_at.asc())
        .all()
    )


@router.get("/groups/{group_id}/custom-pages/{page_id}", response_model=GroupCustomPageOut)
def get_custom_page(
    group_id: str,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    return _get_page_in_group_or_404(group_id, page_id, db)


@router.patch("/groups/{group_id}/custom-pages/{page_id}", response_model=GroupCustomPageOut)
def update_custom_page(
    group_id: str,
    page_id: str,
    payload: GroupCustomPageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    page = _get_page_in_group_or_404(group_id, page_id, db)
    fields = payload.model_fields_set
    # `title` is patchable but `slug` never regenerates from it: the slug
    # is fixed at create time (plan.md's B23: "immutable after"), so a
    # renamed page keeps whatever link already points at it.
    if "title" in fields and payload.title is not None:
        page.title = payload.title
    if "audience" in fields and payload.audience is not None:
        page.audience = payload.audience
    if "min_identity" in fields and payload.min_identity is not None:
        page.min_identity = payload.min_identity
    if "status" in fields and payload.status is not None:
        page.status = payload.status
    db.commit()
    db.refresh(page)
    return page


@router.delete("/groups/{group_id}/custom-pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_page(
    group_id: str,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    page = _get_page_in_group_or_404(group_id, page_id, db)
    db.delete(page)
    db.commit()


@router.post("/groups/{group_id}/custom-pages/{page_id}/publish", response_model=GroupCustomPageOut)
def publish_custom_page(
    group_id: str,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    page = _get_page_in_group_or_404(group_id, page_id, db)
    page.status = GroupCustomPageStatus.published
    db.commit()
    db.refresh(page)
    return page


@router.post("/groups/{group_id}/custom-pages/{page_id}/archive", response_model=GroupCustomPageOut)
def archive_custom_page(
    group_id: str,
    page_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    get_group_or_404(group_id, db)
    require_admin(group_id, current_user, db)
    page = _get_page_in_group_or_404(group_id, page_id, db)
    page.status = GroupCustomPageStatus.archived
    db.commit()
    db.refresh(page)
    return page


@router.get("/groups/{group_id}/pages/{slug}", response_model=GroupCustomPageOut)
def get_member_custom_page(
    group_id: str,
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupCustomPage:
    """Member read by slug, same access-check shape a built-in page's
    member route uses: `require_member_page_access` bypasses for admins
    (so an admin previewing their own draft works with no special-case
    here) and otherwise requires `status == published`."""
    get_group_or_404(group_id, db)
    require_member(group_id, current_user, db)
    page = get_custom_page_by_slug_or_404(group_id, slug, db)
    require_member_page_access(group_id, page, current_user.id, db)
    return page
