"""B13: shared coverage computation for Responsibility dates/roles.

Kept separate from the route file so the member route
(`app/api/routes/responsibilities.py`) and the guest route (`app/api/routes/
guest.py`) compute coverage identically — the only difference between the two
is whether the caller gets to see *who* signed up (see `role_signups` vs.
`role_coverage`).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import ResponsibilityRole, ResponsibilitySignup, User


def _coverage_status(needed_count: int, active_count: int) -> str:
    if active_count < needed_count:
        return "underfilled"
    if active_count > needed_count:
        return "overfilled"
    return "covered"


def role_signups(date_id: str, role_id: str, db: Session) -> list[tuple[ResponsibilitySignup, User]]:
    """Every signup for one (date, role) pair, with the signed-up user,
    oldest first."""
    return (
        db.query(ResponsibilitySignup, User)
        .join(User, ResponsibilitySignup.user_id == User.id)
        .filter(ResponsibilitySignup.date_id == date_id, ResponsibilitySignup.role_id == role_id)
        .order_by(ResponsibilitySignup.created_at.asc())
        .all()
    )


def role_coverage(date_id: str, role: ResponsibilityRole, db: Session) -> tuple[int, str, list[tuple[ResponsibilitySignup, User]]]:
    """`(active_count, status, signups)` for one role on one date."""
    signups = role_signups(date_id, role.id, db)
    active_count = len(signups)
    return active_count, _coverage_status(role.needed_count, active_count), signups
