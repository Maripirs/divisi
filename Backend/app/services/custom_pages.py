"""B23: slug generation/uniqueness for `GroupCustomPage`.

Kept separate from `app/services/pages.py`, whose gate helpers are extended
in place to also accept a `GroupCustomPage` row (see that module) rather
than duplicated here — this module only owns the one thing that's actually
new: turning a title into a per-group-unique slug.
"""

from __future__ import annotations

import re

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import GroupCustomPage

_SLUG_INVALID = re.compile(r"[^a-z0-9]+")


def slugify(title: str) -> str:
    """Lowercase, non-alphanumeric runs collapsed to a single `-`, leading/
    trailing `-` trimmed. A title with no alphanumeric characters at all
    (e.g. "!!!") falls back to a fixed placeholder rather than an empty
    string, which would trip the `NOT NULL` column and every uniqueness
    check identically for every such title."""
    slug = _SLUG_INVALID.sub("-", title.strip().lower()).strip("-")
    return slug or "page"


def slug_available(group_id: str, slug: str, db: Session, exclude_page_id: str | None = None) -> bool:
    """`exclude_page_id` lets a future caller re-check a page's own slug
    against itself without a false collision — unused today since the slug
    is immutable after create, but the uniqueness check shouldn't have to
    change shape if that ever does."""
    query = db.query(GroupCustomPage).filter(
        GroupCustomPage.group_id == group_id, GroupCustomPage.slug == slug
    )
    if exclude_page_id is not None:
        query = query.filter(GroupCustomPage.id != exclude_page_id)
    return query.first() is None


def generate_slug_or_409(group_id: str, title: str, db: Session) -> str:
    """Slugs are rejected on collision, not auto-suffixed: two pages titled
    the same in one group is treated as an admin mistake to fix by picking
    a different title, not something to paper over silently."""
    slug = slugify(title)
    if not slug_available(group_id, slug, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A page with this title already exists in this group",
        )
    return slug


def get_custom_page_by_slug_or_404(group_id: str, slug: str, db: Session) -> GroupCustomPage:
    page = (
        db.query(GroupCustomPage)
        .filter(GroupCustomPage.group_id == group_id, GroupCustomPage.slug == slug)
        .first()
    )
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
    return page
