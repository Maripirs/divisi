"""B19: anonymous participants. B21: group-scoped guest name matching,
replacing B19's PIN-based "Save across devices".

The participant-level counterpart to `app/services/groups.py` (group-level)
and `app/services/pages.py` (group-page-level): the same "shared helper,
not reimplemented per-route" shape.

A local-only singer (Frontend F23 owns their client-side profile) only
reaches the Backend when they perform a shared action. At that point
`mint_anonymous_participant` creates a durable `User` row with
`is_anonymous = True` and a synthetic email / unknowable password, exactly
the pattern `app/api/routes/auth.py`'s OAuth callback already uses for a
"user whose password nobody knows". B21's `find_guest_matches` lets a
returning singer on a new device reconnect to that same row instead of
minting a duplicate: since a group's join code is already the real
gatekeeper, a name match against another *guest* already in that specific
group is enough friction on its own, no PIN needed. `merge_participant`
does the actual folding, same as it always has.
"""

from __future__ import annotations

import secrets
from uuid import uuid4

from fastapi import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import PARTICIPANT_COOKIE
from app.core.config import get_settings
from app.core.security import create_participant_token, hash_password
from app.db.models import (
    Annotation,
    AnnotationShare,
    GroupMembership,
    GroupRole,
    PieceMarkupMark,
    ResponsibilitySignup,
    User,
)
from app.services.common import as_utc


def mint_anonymous_participant(db: Session, display_name: str, local_id: str | None) -> User:
    """Create (and flush, not commit) a fresh anonymous participant. The
    synthetic `@participants.divisi.invalid` email keeps the `users.email`
    unique constraint satisfied without colliding with any real address;
    the random password is never told to anyone (the row is only ever
    unlocked via its device token until it is Saved)."""
    user = User(
        email=f"anon-{uuid4()}@participants.divisi.invalid",
        name=(display_name or "").strip() or "Guest",
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        is_anonymous=True,
        anonymous_local_id=local_id,
    )
    db.add(user)
    db.flush()
    return user


def resolve_participant(
    db: Session, cookie_user: User | None, local_id: str | None
) -> User | None:
    """The acting participant: the cookie's user if we have one, else the
    anonymous row bound to this client's `local_id` (the fallback for when
    the cookie is lost but localStorage survives), else None."""
    if cookie_user is not None:
        return cookie_user
    if local_id:
        return (
            db.query(User)
            .filter(User.anonymous_local_id == local_id, User.is_anonymous.is_(True))
            .first()
        )
    return None


def find_guest_matches(db: Session, group_id: str, name: str) -> list[User]:
    """B21: every *guest* participant (`GroupMembership.is_guest == True`)
    in this specific group whose name matches `name` (case-insensitive,
    trimmed). This is the entire safety boundary for "is this you?"
    reconnect: the join code already gates who can reach the group at
    all, so the only thing left to guard is that a guest can never match
    (and therefore claim, via `merge_participant`) a real member/admin
    account, or a guest in some *other* group. Both are enforced by the
    same filter — `is_guest.is_(True)` scoped to this `group_id` — never
    relaxed for any caller."""
    normalized = name.strip()
    if not normalized:
        return []
    return (
        db.query(User)
        .join(GroupMembership, GroupMembership.user_id == User.id)
        .filter(
            GroupMembership.group_id == group_id,
            GroupMembership.is_guest.is_(True),
            func.lower(User.name) == normalized.lower(),
        )
        .all()
    )


def ensure_guest_membership(db: Session, group_id: str, user: User) -> GroupMembership:
    """The (group, user) membership, created flagged `is_guest` when the
    user is still anonymous. Flushed, not committed."""
    existing = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user.id)
        .first()
    )
    if existing is not None:
        return existing
    membership = GroupMembership(
        group_id=group_id,
        user_id=user.id,
        role=GroupRole.member,
        is_guest=user.is_anonymous,
    )
    db.add(membership)
    db.flush()
    return membership


def set_participant_cookie(response: Response, user: User, local_id: str | None) -> None:
    """Attach a fresh `divisi_participant` device token to `response`.
    `secure` + `samesite="none"` because the API is a cross-site origin
    from the Frontend."""
    token = create_participant_token(user.id, local_id or user.anonymous_local_id or "")
    response.set_cookie(
        PARTICIPANT_COOKIE,
        token,
        max_age=get_settings().participant_token_expire_minutes * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


def merge_participant(db: Session, source: User, target: User) -> None:
    """Fold `source` (an anonymous participant) into `target` (the account
    the Save credential resolved to), then delete `source`. Flushed, not
    committed (the caller owns the transaction).

    - Annotations: last-writer-wins per `piece_id` (newer `created_at`
      wins, the loser is deleted along with its `AnnotationShare` rows).
    - `GroupMembership`: union per group, repointed when `target` has
      none there (and `is_guest` cleared), otherwise `source`'s is dropped.
    - `ResponsibilitySignup`: repointed, dropping a `source` row that would
      collide on `(date_id, role_id, user_id)`.
    - `PieceMarkupMark`: repointed wholesale (personal marks).
    """
    # Annotations, last-writer-wins per piece.
    target_by_piece: dict[str, Annotation] = {}
    for ann in db.query(Annotation).filter(Annotation.user_id == target.id).all():
        target_by_piece.setdefault(ann.piece_id, ann)
    for src_ann in db.query(Annotation).filter(Annotation.user_id == source.id).all():
        tgt_ann = target_by_piece.get(src_ann.piece_id)
        if tgt_ann is None:
            src_ann.user_id = target.id
            target_by_piece[src_ann.piece_id] = src_ann
            continue
        if as_utc(src_ann.created_at) > as_utc(tgt_ann.created_at):
            loser, winner = tgt_ann, src_ann
            winner.user_id = target.id
            target_by_piece[src_ann.piece_id] = winner
        else:
            loser = src_ann
        db.query(AnnotationShare).filter(AnnotationShare.annotation_id == loser.id).delete(
            synchronize_session=False
        )
        db.delete(loser)

    # Group memberships, union per group.
    target_group_ids = {
        m.group_id
        for m in db.query(GroupMembership).filter(GroupMembership.user_id == target.id).all()
    }
    for src_m in db.query(GroupMembership).filter(GroupMembership.user_id == source.id).all():
        if src_m.group_id in target_group_ids:
            db.delete(src_m)
        else:
            src_m.user_id = target.id
            src_m.is_guest = False
            target_group_ids.add(src_m.group_id)

    # Responsibility signups, repoint and drop would-be duplicates.
    target_signup_keys = {
        (s.date_id, s.role_id)
        for s in db.query(ResponsibilitySignup)
        .filter(ResponsibilitySignup.user_id == target.id)
        .all()
    }
    for src_s in (
        db.query(ResponsibilitySignup).filter(ResponsibilitySignup.user_id == source.id).all()
    ):
        key = (src_s.date_id, src_s.role_id)
        if key in target_signup_keys:
            db.delete(src_s)
        else:
            src_s.user_id = target.id
            target_signup_keys.add(key)

    # Personal markup marks, repoint wholesale.
    db.query(PieceMarkupMark).filter(PieceMarkupMark.user_id == source.id).update(
        {"user_id": target.id}, synchronize_session=False
    )

    db.flush()
    db.delete(source)
