"""B13: shared coverage computation for Responsibility dates/roles.

Kept separate from the route file so the member route
(`app/api/routes/responsibilities.py`) and the guest route (`app/api/routes/
guest.py`) compute coverage identically. Both now see the same signup names
too: the guest route's real gate is reachability itself (`audience ==
everyone`, see `require_guest_page_access`), not a second layer of hiding
names once a guest is already let in. The one thing the guest payload still
never carries is email or account id, see `signup_display_name` below.
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


def role_signups(date_id: str, role_id: str, db: Session) -> list[tuple[ResponsibilitySignup, User | None]]:
    """Every signup for one (date, role) pair, with its signed-up user if it
    has one, oldest first. An outer join, not an inner one — a
    `guest_name`-only signup (an admin-assigned, unenrolled volunteer) has
    no `user_id` at all, and an inner join would silently drop it from both
    the signups list and the coverage count."""
    return (
        db.query(ResponsibilitySignup, User)
        .outerjoin(User, ResponsibilitySignup.user_id == User.id)
        .filter(ResponsibilitySignup.date_id == date_id, ResponsibilitySignup.role_id == role_id)
        .order_by(ResponsibilitySignup.created_at.asc())
        .all()
    )


def role_coverage(date_id: str, role: ResponsibilityRole, db: Session) -> tuple[int, str, list[tuple[ResponsibilitySignup, User | None]]]:
    """`(active_count, status, signups)` for one role on one date."""
    signups = role_signups(date_id, role.id, db)
    active_count = len(signups)
    return active_count, _coverage_status(role.needed_count, active_count), signups


def signup_display_name(signup: ResponsibilitySignup, user: User | None) -> str:
    """The name to show for one signup: a real member's `user.name`, or the
    admin-assigned `guest_name` for an unenrolled volunteer with no account
    at all (falling back to "Unnamed" if even that's missing). Shared by
    both the member route's `_signup_out` and the guest route, so the two
    can never drift on name resolution. Deliberately name only, never
    email or user id, that's the caller's job to withhold or include."""
    return user.name if user is not None else (signup.guest_name or "Unnamed")
