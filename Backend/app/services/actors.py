"""Shared actor resolution for routes that allow member or guest writes.

Carpool and responsibilities both support the same write shape: a bearer
member, an existing anonymous participant from the device cookie/local id, or
for create-style actions, a freshly minted anonymous participant. Keeping that
policy here makes future guest-write pages reuse the same access gates instead
of copying security-sensitive route branches.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import GroupPage, GroupRole, User
from app.services.groups import group_role, require_member
from app.services.pages import require_guest_page_access, require_member_page_access, require_saved_identity
from app.services.participants import ensure_guest_membership, mint_anonymous_participant, resolve_participant


@dataclass(frozen=True)
class PageWriteActor:
    user: User
    is_admin: bool


def is_group_admin(group_id: str, user: User, db: Session) -> bool:
    return group_role(group_id, user.id, db) == GroupRole.admin


def resolve_existing_actor(
    local_id: str | None,
    maybe_user: User | None,
    maybe_participant: User | None,
    db: Session,
) -> User:
    """Resolve a bearer member or existing anonymous participant.

    Used by edit/delete/release routes where the actor must already exist. A
    missing actor is a bearer-shaped 401, matching the previous route-local
    helpers.
    """
    actor = maybe_user or resolve_participant(db, maybe_participant, local_id)
    if actor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return actor


def resolve_or_mint_actor(
    db: Session,
    maybe_user: User | None,
    maybe_participant: User | None,
    local_id: str | None,
    display_name: str | None,
) -> User:
    actor = maybe_user or resolve_participant(db, maybe_participant, local_id)
    if actor is not None:
        return actor
    return mint_anonymous_participant(db, display_name or "", local_id)


def authorize_page_write_actor(group_id: str, page: GroupPage, actor: User, db: Session) -> bool:
    """Apply the page write gates for a resolved actor and return admin status."""
    if actor.is_anonymous:
        require_guest_page_access(group_id, page, db)
        require_saved_identity(group_id, page, db)
        ensure_guest_membership(db, group_id, actor)
        return False

    require_member(group_id, actor, db)
    require_member_page_access(group_id, page, actor.id, db)
    return is_group_admin(group_id, actor, db)


def resolve_page_write_actor(
    group_id: str,
    page: GroupPage,
    db: Session,
    maybe_user: User | None,
    maybe_participant: User | None,
    local_id: str | None,
    display_name: str | None,
) -> PageWriteActor:
    actor = resolve_or_mint_actor(db, maybe_user, maybe_participant, local_id, display_name)
    return PageWriteActor(
        user=actor,
        is_admin=authorize_page_write_actor(group_id, page, actor, db),
    )
