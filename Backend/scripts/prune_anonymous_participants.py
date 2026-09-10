#!/usr/bin/env python3
"""Delete stale anonymous participants (B19).

An "anonymous participant" is a `users` row with `is_anonymous = true`: a
local-only singer the Backend minted when they first performed a shared
action, before they ran "Save across devices". Some of those rows never
get promoted and never accumulate anything worth keeping. This command
deletes the ones that are:

  - older than `--days` (default 30), and
  - carry zero `ResponsibilitySignup` rows and zero `Annotation` rows.

A participant with either is kept untouched (that is real work attached to
the row). For a deletable one, its `GroupMembership` rows and personal
`PieceMarkupMark` rows go first (no FK-level cascade in this codebase),
then the `User`.

This is manual / host-cron only: there is no scheduled-job runner in this
backend yet (see `Backend/plan.md`'s Backlog). It reads `DATABASE_URL`
from `Backend/.env` the same way `alembic` does (via
`app.core.config.Settings`), so run it deliberately and know which
database that points at.

Usage:

    # Safe: reports what it would do, deletes nothing.
    python Backend/scripts/prune_anonymous_participants.py --dry-run

    # For real, with a custom retention window:
    python Backend/scripts/prune_anonymous_participants.py --days 45
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Make the Backend package importable when this is run as a bare script
# from the repo root (`python Backend/scripts/prune_anonymous_participants.py`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.models import (  # noqa: E402
    Annotation,
    GroupMembership,
    PieceMarkupMark,
    ResponsibilitySignup,
    User,
)
from app.db.session import SessionLocal  # noqa: E402
from app.services.common import as_utc  # noqa: E402


def prune_anonymous_participants(db, days: int, dry_run: bool) -> dict:
    """Core selection + delete, factored out so a test can drive it
    against the test DB. Returns a summary dict; does not print."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    candidates = db.query(User).filter(User.is_anonymous.is_(True)).all()

    scanned = 0
    kept = 0
    deleted = 0
    for user in candidates:
        if as_utc(user.created_at) >= cutoff:
            continue
        scanned += 1
        has_signup = (
            db.query(ResponsibilitySignup)
            .filter(ResponsibilitySignup.user_id == user.id)
            .first()
            is not None
        )
        has_annotation = (
            db.query(Annotation).filter(Annotation.user_id == user.id).first() is not None
        )
        if has_signup or has_annotation:
            kept += 1
            continue
        deleted += 1
        if dry_run:
            continue
        db.query(GroupMembership).filter(GroupMembership.user_id == user.id).delete(
            synchronize_session=False
        )
        db.query(PieceMarkupMark).filter(PieceMarkupMark.user_id == user.id).delete(
            synchronize_session=False
        )
        db.delete(user)
    if not dry_run:
        db.commit()
    return {"scanned": scanned, "kept": kept, "deleted": deleted, "dry_run": dry_run}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30, help="retention window in days (default 30)")
    parser.add_argument(
        "--dry-run", action="store_true", help="report only, delete nothing"
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = prune_anonymous_participants(db, days=args.days, dry_run=args.dry_run)
    finally:
        db.close()

    verb = "would delete" if result["dry_run"] else "deleted"
    print(
        f"anonymous participants older than {args.days}d: "
        f"scanned {result['scanned']}, kept {result['kept']} (has activity), "
        f"{verb} {result['deleted']}"
    )


if __name__ == "__main__":
    main()
