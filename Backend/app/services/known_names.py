"""Admin tool: list and rename the free-text guest names typed into a
group's Responsibilities signups and Carpool posts/claims/interests. Never
touches a real member's own account name (`users.name`): a member's own
`ResponsibilitySignup` has `guest_name` null by design (see that model's
docstring), and the three carpool tables' `display_name` columns are
snapshots frozen at write time either way, not a live read of `users.name`.
"""

from __future__ import annotations

from typing import NamedTuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    CarpoolEvent,
    CarpoolPost,
    CarpoolRiderInterest,
    CarpoolSeatClaim,
    ResponsibilityRole,
    ResponsibilitySchedule,
    ResponsibilitySignup,
)


class KnownName(NamedTuple):
    """One row of `list_known_names`'s result: a distinct free-text name,
    its usage count, and (independently) the most-recently-created non-null
    phone and email seen for that name across the Carpool tables that carry
    contact info. Either or both of `phone`/`email` are `None` when the
    name never came with that piece of contact info (e.g. it only ever
    appeared via `ResponsibilitySignup`, which has no contact fields at
    all)."""

    name: str
    count: int
    phone: str | None
    email: str | None


def _responsibility_name_counts(group_id: str, db: Session) -> dict[str, int]:
    rows = (
        db.query(ResponsibilitySignup.guest_name, func.count(ResponsibilitySignup.id))
        .join(ResponsibilityRole, ResponsibilityRole.id == ResponsibilitySignup.role_id)
        .join(ResponsibilitySchedule, ResponsibilitySchedule.id == ResponsibilityRole.schedule_id)
        .filter(
            ResponsibilitySchedule.group_id == group_id,
            ResponsibilitySignup.guest_name.isnot(None),
            ResponsibilitySignup.guest_name != "",
        )
        .group_by(ResponsibilitySignup.guest_name)
        .all()
    )
    return dict(rows)


def _carpool_post_name_counts(group_id: str, db: Session) -> dict[str, int]:
    rows = (
        db.query(CarpoolPost.display_name, func.count(CarpoolPost.id))
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(CarpoolEvent.group_id == group_id, CarpoolPost.display_name != "")
        .group_by(CarpoolPost.display_name)
        .all()
    )
    return dict(rows)


def _carpool_claim_name_counts(group_id: str, db: Session) -> dict[str, int]:
    rows = (
        db.query(CarpoolSeatClaim.display_name, func.count(CarpoolSeatClaim.id))
        .join(CarpoolPost, CarpoolPost.id == CarpoolSeatClaim.driver_post_id)
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(CarpoolEvent.group_id == group_id, CarpoolSeatClaim.display_name != "")
        .group_by(CarpoolSeatClaim.display_name)
        .all()
    )
    return dict(rows)


def _carpool_interest_name_counts(group_id: str, db: Session) -> dict[str, int]:
    rows = (
        db.query(CarpoolRiderInterest.display_name, func.count(CarpoolRiderInterest.id))
        .join(CarpoolPost, CarpoolPost.id == CarpoolRiderInterest.rider_post_id)
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(CarpoolEvent.group_id == group_id, CarpoolRiderInterest.display_name != "")
        .group_by(CarpoolRiderInterest.display_name)
        .all()
    )
    return dict(rows)


def _carpool_post_contact_rows(group_id: str, db: Session):
    return (
        db.query(
            CarpoolPost.display_name,
            CarpoolPost.contact_phone,
            CarpoolPost.contact_email,
            CarpoolPost.created_at,
        )
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(
            CarpoolEvent.group_id == group_id,
            CarpoolPost.display_name != "",
            (CarpoolPost.contact_phone.isnot(None)) | (CarpoolPost.contact_email.isnot(None)),
        )
        .all()
    )


def _carpool_claim_contact_rows(group_id: str, db: Session):
    return (
        db.query(
            CarpoolSeatClaim.display_name,
            CarpoolSeatClaim.contact_phone,
            CarpoolSeatClaim.contact_email,
            CarpoolSeatClaim.created_at,
        )
        .join(CarpoolPost, CarpoolPost.id == CarpoolSeatClaim.driver_post_id)
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(
            CarpoolEvent.group_id == group_id,
            CarpoolSeatClaim.display_name != "",
            (CarpoolSeatClaim.contact_phone.isnot(None)) | (CarpoolSeatClaim.contact_email.isnot(None)),
        )
        .all()
    )


def _carpool_interest_contact_rows(group_id: str, db: Session):
    return (
        db.query(
            CarpoolRiderInterest.display_name,
            CarpoolRiderInterest.contact_phone,
            CarpoolRiderInterest.contact_email,
            CarpoolRiderInterest.created_at,
        )
        .join(CarpoolPost, CarpoolPost.id == CarpoolRiderInterest.rider_post_id)
        .join(CarpoolEvent, CarpoolEvent.id == CarpoolPost.event_id)
        .filter(
            CarpoolEvent.group_id == group_id,
            CarpoolRiderInterest.display_name != "",
            (CarpoolRiderInterest.contact_phone.isnot(None)) | (CarpoolRiderInterest.contact_email.isnot(None)),
        )
        .all()
    )


def _known_name_contacts(group_id: str, db: Session) -> tuple[dict[str, str], dict[str, str]]:
    """Most-recently-created non-null phone/email per free-text name, each
    picked independently (a name might get its phone from one row and its
    email from a different, unrelated row) across the three Carpool tables
    that carry contact info. `ResponsibilitySignup` has no contact fields,
    so it never contributes here."""
    rows = [
        *_carpool_post_contact_rows(group_id, db),
        *_carpool_claim_contact_rows(group_id, db),
        *_carpool_interest_contact_rows(group_id, db),
    ]
    rows.sort(key=lambda row: row[3], reverse=True)
    phone_by_name: dict[str, str] = {}
    email_by_name: dict[str, str] = {}
    for name, phone, email, _created_at in rows:
        if phone is not None and name not in phone_by_name:
            phone_by_name[name] = phone
        if email is not None and name not in email_by_name:
            email_by_name[name] = email
    return phone_by_name, email_by_name


def list_known_names(group_id: str, db: Session) -> list[KnownName]:
    """Every distinct free-text name across this group's four sources, with
    how many rows (summed across all four) carry it, sorted by name. Each
    entry also carries the most-recently-created non-null phone/email
    (independently picked, see `_known_name_contacts`) contributed by any
    Carpool post/claim/interest under that name; `None` for a name that
    never came with that piece of contact info."""
    merged: dict[str, int] = {}
    for counts in (
        _responsibility_name_counts(group_id, db),
        _carpool_post_name_counts(group_id, db),
        _carpool_claim_name_counts(group_id, db),
        _carpool_interest_name_counts(group_id, db),
    ):
        for name, count in counts.items():
            merged[name] = merged.get(name, 0) + count
    phone_by_name, email_by_name = _known_name_contacts(group_id, db)
    return [
        KnownName(name=name, count=count, phone=phone_by_name.get(name), email=email_by_name.get(name))
        for name, count in sorted(merged.items())
    ]


def rename_known_name(group_id: str, old_name: str, new_name: str, db: Session) -> int:
    """Rewrite `old_name` to `new_name` everywhere it appears across all
    four free-text columns, scoped to this group, in one transaction (all
    four updates commit together, or none do). `users.name` is never
    touched: renaming a real member's account is a separate, more
    consequential action. Returns the total number of rows changed, 0 if
    `old_name` doesn't appear in this group at all."""
    old_name = old_name.strip()
    new_name = new_name.strip()
    if not old_name or not new_name or old_name == new_name:
        raise ValueError("old_name and new_name must both be non-empty and different")

    role_ids = (
        db.query(ResponsibilityRole.id)
        .join(ResponsibilitySchedule, ResponsibilitySchedule.id == ResponsibilityRole.schedule_id)
        .filter(ResponsibilitySchedule.group_id == group_id)
    )
    signups_changed = (
        db.query(ResponsibilitySignup)
        .filter(ResponsibilitySignup.guest_name == old_name, ResponsibilitySignup.role_id.in_(role_ids))
        .update({"guest_name": new_name}, synchronize_session=False)
    )

    event_ids = db.query(CarpoolEvent.id).filter(CarpoolEvent.group_id == group_id)
    posts_changed = (
        db.query(CarpoolPost)
        .filter(CarpoolPost.display_name == old_name, CarpoolPost.event_id.in_(event_ids))
        .update({"display_name": new_name}, synchronize_session=False)
    )

    group_post_ids = db.query(CarpoolPost.id).filter(CarpoolPost.event_id.in_(event_ids))
    claims_changed = (
        db.query(CarpoolSeatClaim)
        .filter(CarpoolSeatClaim.display_name == old_name, CarpoolSeatClaim.driver_post_id.in_(group_post_ids))
        .update({"display_name": new_name}, synchronize_session=False)
    )
    interests_changed = (
        db.query(CarpoolRiderInterest)
        .filter(CarpoolRiderInterest.display_name == old_name, CarpoolRiderInterest.rider_post_id.in_(group_post_ids))
        .update({"display_name": new_name}, synchronize_session=False)
    )

    db.commit()
    return signups_changed + posts_changed + claims_changed + interests_changed
