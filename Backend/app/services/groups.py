"""Group membership + role helpers.

The group-level counterpart to `app/services/pieces.py` (piece-level) and
`app/services/pages.py` (group-page-level) — the same "shared helper, not
reimplemented per-route" shape those two already follow.

`group_role` moved here from `pieces.py`, where it was the one group-level
function in an otherwise piece-scoped module; `pieces.py` and `pages.py`
now import it from here. `get_group_or_404` / `require_member` /
`require_admin` were byte-identical `_`-prefixed copies in `homework.py`,
`weekly_notes.py`, and `responsibilities.py`; those modules now alias
these (same pattern `library.py` already uses for the piece helpers).
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import Group, GroupMembership, GroupRole, User
from app.services.common import get_or_404


def group_role(group_id: str, user_id: str, db: Session) -> GroupRole | None:
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user_id)
        .first()
    )
    return membership.role if membership else None


def get_group_or_404(group_id: str, db: Session) -> Group:
    return get_or_404(db, Group, group_id, "Group not found")


def require_member(group_id: str, user: User, db: Session) -> None:
    if group_role(group_id, user.id, db) is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


def require_admin(group_id: str, user: User, db: Session) -> None:
    if group_role(group_id, user.id, db) != GroupRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
