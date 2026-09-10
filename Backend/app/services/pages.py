"""B12: `GroupPageSettings` seeding + access checks.

Generalizes B10's single `Group.guest_homework_visible` boolean into a
per-(group, page) `enabled`/`audience` row across all 5 pages (homework,
tracks, members, about, responsibilities). Kept separate from
`app/services/pieces.py` since it's a group-level concern, not a
piece-level one, but follows the same "shared helper, not reimplemented
per-route" shape.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import GroupPage, GroupPageSettings, GroupRole, PageAudience, PageMinIdentity
from app.services.groups import group_role

# Matches today's pre-B12 behavior exactly, so seeding a brand-new group and
# backfilling an existing one (see the B12 migration) agree on defaults:
# homework was members-only-visible by default (old `guest_homework_visible`
# default False), tracks were always guest-visible unconditionally, and
# members/about/responsibilities had no guest route at all.
DEFAULT_AUDIENCE: dict[GroupPage, PageAudience] = {
    GroupPage.homework: PageAudience.members,
    GroupPage.tracks: PageAudience.everyone,
    GroupPage.members: PageAudience.members,
    GroupPage.about: PageAudience.members,
    GroupPage.responsibilities: PageAudience.members,
    GroupPage.weekly_notes: PageAudience.members,
}


def seed_default_page_settings(group_id: str, db: Session) -> None:
    """Called once at group creation (`app/api/routes/groups.py`) — the
    migration's own backfill covers groups that already existed."""
    for page, audience in DEFAULT_AUDIENCE.items():
        db.add(
            GroupPageSettings(
                group_id=group_id,
                page=page,
                enabled=True,
                audience=audience,
                min_identity=PageMinIdentity.anyone,
            )
        )


def _get_settings(group_id: str, page: GroupPage, db: Session) -> GroupPageSettings | None:
    return (
        db.query(GroupPageSettings)
        .filter(GroupPageSettings.group_id == group_id, GroupPageSettings.page == page)
        .first()
    )


def _effective_settings(group_id: str, page: GroupPage, db: Session) -> tuple[bool, PageAudience]:
    """Every group should have a row per page (seeded at creation,
    backfilled by the B12 migration) — but if one's somehow missing, fall
    back to the same safe (members-only, enabled) default the column
    itself uses, rather than a missing row silently meaning "wide open"."""
    settings = _get_settings(group_id, page, db)
    if settings is None:
        return True, PageAudience.members
    return settings.enabled, settings.audience


def require_guest_page_access(group_id: str, page: GroupPage, db: Session) -> None:
    """Gate for the unauthenticated `/guest/*` routes: the page must be
    both enabled and audience=everyone. Same generic 404 the pre-B12
    `guest_homework_visible` check used — nothing here should tell an
    unauthorized caller which of "disabled" vs. "members-only" applies."""
    enabled, audience = _effective_settings(group_id, page, db)
    if not enabled or audience != PageAudience.everyone:
        page_label = page.value.replace("_", " ").capitalize()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{page_label} not available for this group"
        )


def require_saved_identity(group_id: str, page: GroupPage, db: Session) -> None:
    """B19 gate for a *write* by an anonymous participant: if the page's
    `min_identity` is `saved`, a local-only client must run "Save across
    devices" first. The 403 detail starts with `SAVE_REQUIRED:` so the
    Frontend can match on it and route the user into the Save flow rather
    than showing a generic error."""
    settings = _get_settings(group_id, page, db)
    if settings is not None and settings.min_identity == PageMinIdentity.saved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SAVE_REQUIRED: Save your account first",
        )


def require_member_page_access(group_id: str, page: GroupPage, user_id: str, db: Session) -> None:
    """Gate for authenticated member routes. Admins always pass regardless
    of the page's settings (per B12's acceptance criteria); everyone else
    just needs the page enabled — `audience` doesn't restrict members
    either way, it only decides guest reachability."""
    if group_role(group_id, user_id, db) == GroupRole.admin:
        return
    enabled, _audience = _effective_settings(group_id, page, db)
    if not enabled:
        page_label = page.value.replace("_", " ").capitalize()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=f"{page_label} is disabled for this group"
        )
