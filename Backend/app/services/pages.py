"""B12: `GroupPageSettings` seeding + access checks.

Generalizes B10's single `Group.guest_homework_visible` boolean into a
per-(group, page) `enabled`/`audience` row across all built-in pages
(homework, tracks, members, about, responsibilities, weekly_notes,
carpool). Kept separate from `app/services/pieces.py` since it's a
group-level concern, not a piece-level one, but follows the same "shared
helper, not reimplemented per-route" shape.

B23 briefly extended the three gate functions below to also accept a
`GroupCustomPage` row in place of a `GroupPage` enum member, so a custom
page carried its own `status`/`audience`/`min_identity` directly instead
of a separate `GroupPageSettings` row. B31 dropped `GroupCustomPage`
entirely (carpool, its only template, is now a built-in `GroupPage`), so
these gates are back down to the single `GroupPage`-only code path.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import GroupPage, GroupPageSettings, GroupRole, PageAudience, PageMinIdentity
from app.services.groups import group_role

# Matches today's pre-B12 behavior exactly, so seeding a brand-new group and
# backfilling an existing one (see the B12 migration) agree on defaults:
# homework was members-only-visible by default (old `guest_homework_visible`
# default False), tracks were always guest-visible unconditionally, and
# members/about/responsibilities had no guest route at all. B31 added
# carpool as members-only, matching its own pre-existing default as a
# `GroupCustomPage` (see `resolve_carpool_page_settings_from_custom_pages`
# below for the migration's per-group backfill of that page specifically).
DEFAULT_AUDIENCE: dict[GroupPage, PageAudience] = {
    GroupPage.homework: PageAudience.members,
    GroupPage.tracks: PageAudience.everyone,
    GroupPage.members: PageAudience.members,
    GroupPage.about: PageAudience.members,
    GroupPage.responsibilities: PageAudience.members,
    GroupPage.weekly_notes: PageAudience.members,
    GroupPage.carpool: PageAudience.members,
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


def resolve_carpool_page_settings_from_custom_pages(
    candidates: list[tuple[str, str, str, datetime]],
) -> tuple[bool, str, str]:
    """B31 migration helper: pick one `GroupPageSettings(page=carpool)` row
    for a group out of its pre-existing `group_custom_pages` rows with
    `template_key == 'carpool_board'` (there was never a DB constraint
    stopping more than one, even though the product never created a
    second). Each candidate is `(status, audience, min_identity,
    created_at)`.

    A `published` row wins if any exist (the earliest-created one, for
    determinism, if there's more than one) and carries over its own
    `audience`/`min_identity`; otherwise the earliest-created row overall
    wins, mapped to `enabled=False` (draft and archived are both
    unreachable). Pulled out as its own pure function so it's unit-testable
    directly, without running the migration itself (pytest never runs
    Alembic against its SQLite test DB).

    Empty input isn't a real case the migration hits (it only calls this
    for a group it already knows has at least one such row), but returns
    the same members-only default `DEFAULT_AUDIENCE` uses, for safety.
    """
    if not candidates:
        return True, PageAudience.members.value, PageMinIdentity.anyone.value
    published = [c for c in candidates if c[0] == "published"]
    pool = published if published else candidates
    winner = min(pool, key=lambda c: c[3])
    enabled = winner[0] == "published"
    return enabled, winner[1], winner[2]


def _get_settings(group_id: str, page: GroupPage, db: Session) -> GroupPageSettings | None:
    return (
        db.query(GroupPageSettings)
        .filter(GroupPageSettings.group_id == group_id, GroupPageSettings.page == page)
        .first()
    )


def _effective(group_id: str, page: GroupPage, db: Session) -> tuple[bool, PageAudience, PageMinIdentity, str]:
    """`(enabled, audience, min_identity, label)` for a built-in page,
    looked up via `GroupPageSettings`."""
    settings = _get_settings(group_id, page, db)
    if settings is None:
        # Every group should have a row per built-in page (seeded at
        # creation, backfilled by the B12 migration) — but if one's
        # somehow missing, fall back to the same safe (members-only,
        # enabled) default the column itself uses, rather than a missing
        # row silently meaning "wide open".
        enabled, audience, min_identity = True, PageAudience.members, PageMinIdentity.anyone
    else:
        enabled, audience, min_identity = settings.enabled, settings.audience, settings.min_identity
    return enabled, audience, min_identity, page.value.replace("_", " ").capitalize()


def _effective_settings(group_id: str, page: GroupPage, db: Session) -> tuple[bool, PageAudience]:
    enabled, audience, _min_identity, _label = _effective(group_id, page, db)
    return enabled, audience


def require_guest_page_access(group_id: str, page: GroupPage, db: Session) -> None:
    """Gate for the unauthenticated `/guest/*` routes: the page must be
    both enabled and audience=everyone. Same generic 404 the pre-B12
    `guest_homework_visible` check used — nothing here should tell an
    unauthorized caller which of "disabled" vs. "members-only" applies."""
    enabled, audience, _min_identity, label = _effective(group_id, page, db)
    if not enabled or audience != PageAudience.everyone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not available for this group"
        )


def require_saved_identity(group_id: str, page: GroupPage, db: Session) -> None:
    """B19 gate for a *write* by an anonymous participant: if the page's
    `min_identity` is `saved`, a local-only client must run "Save across
    devices" first. The 403 detail starts with `SAVE_REQUIRED:` so the
    Frontend can match on it and route the user into the Save flow rather
    than showing a generic error."""
    _enabled, _audience, min_identity, _label = _effective(group_id, page, db)
    if min_identity == PageMinIdentity.saved:
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
    enabled, _audience, _min_identity, label = _effective(group_id, page, db)
    if not enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=f"{label} is disabled for this group"
        )
