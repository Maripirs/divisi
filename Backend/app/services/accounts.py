"""Deleting a user and everything that hangs off their id.

The deletion counterpart to `app/services/participants.py`'s
`merge_participant`: where a merge repoints every user reference onto
another row, this removes or detaches every one of them so the `users` row
itself can go. Shared by `DELETE /auth/me` (`app/api/routes/auth.py`) and
`scripts/prune_anonymous_participants.py`, so the two can't drift apart
again. `tests/test_account_deletion.py` fails if a new FK to `users.id`
shows up that this doesn't know about.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import (
    Annotation,
    AnnotationShare,
    CarpoolEvent,
    CarpoolPost,
    CarpoolRiderInterest,
    CarpoolSeatClaim,
    Distribution,
    GroupMembership,
    GroupResource,
    Homework,
    OAuthAccount,
    OmrJob,
    OwnerType,
    PasswordResetToken,
    Piece,
    PieceMarkupMark,
    PieceRehearsalNote,
    PieceVersion,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    TeamSignup,
    User,
    WeeklyNote,
)

# User-id columns whose rows are genuinely the user's own and nothing else
# points at: deleted outright.
DELETED_USER_ROWS = (
    ResponsibilitySignup.user_id,
    TeamSignup.user_id,
    PieceMarkupMark.user_id,
    OmrJob.user_id,
    PasswordResetToken.user_id,
    OAuthAccount.user_id,
    GroupMembership.user_id,
)

# Attribution on content that belongs to a group, not to the user: the row
# survives with the column nulled (every one of these is nullable for
# exactly this reason).
NULLED_USER_COLUMNS = (
    PieceVersion.created_by,
    PieceVersion.reviewed_by,
    Homework.created_by,
    WeeklyNote.created_by,
    PieceRehearsalNote.created_by,
    GroupResource.created_by,
    ResponsibilitySchedule.created_by,
    CarpoolEvent.created_by,
)


def _delete_piece(db: Session, piece: Piece) -> None:
    """A personally-owned piece and every row with a FK to it (or to its
    versions). Annotations, markup, and rehearsal notes on it can't outlive
    the piece (`piece_id` is NOT NULL); homework and OMR jobs that merely
    reference it keep existing with `piece_id` nulled."""
    version_ids = [v.id for v in db.query(PieceVersion).filter(PieceVersion.piece_id == piece.id).all()]
    if version_ids:
        db.query(Distribution).filter(Distribution.piece_version_id.in_(version_ids)).delete(
            synchronize_session=False
        )
        db.query(PieceVersion).filter(PieceVersion.id.in_(version_ids)).delete(synchronize_session=False)
    _delete_annotations(db, [a.id for a in db.query(Annotation).filter(Annotation.piece_id == piece.id).all()])
    db.query(PieceMarkupMark).filter(PieceMarkupMark.piece_id == piece.id).delete(synchronize_session=False)
    db.query(PieceRehearsalNote).filter(PieceRehearsalNote.piece_id == piece.id).delete(
        synchronize_session=False
    )
    db.query(Homework).filter(Homework.piece_id == piece.id).update(
        {"piece_id": None}, synchronize_session=False
    )
    db.query(OmrJob).filter(OmrJob.piece_id == piece.id).update({"piece_id": None}, synchronize_session=False)
    db.delete(piece)


def _delete_annotations(db: Session, annotation_ids: list[str]) -> None:
    """Annotations plus the shares that point at them."""
    if not annotation_ids:
        return
    db.query(AnnotationShare).filter(AnnotationShare.annotation_id.in_(annotation_ids)).delete(
        synchronize_session=False
    )
    db.query(Annotation).filter(Annotation.id.in_(annotation_ids)).delete(synchronize_session=False)


def delete_user_and_owned_data(db: Session, user: User) -> None:
    """Delete `user` and everything that's genuinely theirs, detaching the
    group content they merely created. Flushed, not committed (the caller
    owns the transaction, and any "may this user be deleted?" policy, e.g.
    `delete_account`'s sole-admin guard).

    - Personally-owned `Piece`s (`owner_type == user`, a polymorphic id
      with no FK): deleted, see `_delete_piece` for their dependents.
    - `Annotation`s they wrote: deleted along with every `AnnotationShare`
      of them; shares granted *to* them are deleted too.
    - `CarpoolPost`s: deleted, after every `CarpoolSeatClaim` /
      `CarpoolRiderInterest` on them (by anyone). Their own claims and
      interests on other people's posts are deleted as well.
    - Everything in `DELETED_USER_ROWS` (signups, team signups, personal
      markup, OMR jobs, reset tokens, OAuth links, memberships): deleted.
    - Everything in `NULLED_USER_COLUMNS` (created_by/reviewed_by on
      group content): nulled, the row survives.
    """
    user_id = user.id

    for piece in (
        db.query(Piece).filter(Piece.owner_type == OwnerType.user, Piece.owner_id == user_id).all()
    ):
        _delete_piece(db, piece)
    db.flush()

    _delete_annotations(db, [a.id for a in db.query(Annotation).filter(Annotation.user_id == user_id).all()])
    db.query(AnnotationShare).filter(AnnotationShare.shared_with_user_id == user_id).delete(
        synchronize_session=False
    )

    # Carpool: other people's claims/interests on this user's posts go
    # before the posts themselves, then this user's own claims/interests
    # on anyone else's posts.
    post_ids = [p.id for p in db.query(CarpoolPost).filter(CarpoolPost.user_id == user_id).all()]
    if post_ids:
        db.query(CarpoolSeatClaim).filter(CarpoolSeatClaim.driver_post_id.in_(post_ids)).delete(
            synchronize_session=False
        )
        db.query(CarpoolRiderInterest).filter(CarpoolRiderInterest.rider_post_id.in_(post_ids)).delete(
            synchronize_session=False
        )
        db.query(CarpoolPost).filter(CarpoolPost.id.in_(post_ids)).delete(synchronize_session=False)
    db.query(CarpoolSeatClaim).filter(CarpoolSeatClaim.user_id == user_id).delete(synchronize_session=False)
    db.query(CarpoolRiderInterest).filter(CarpoolRiderInterest.user_id == user_id).delete(
        synchronize_session=False
    )

    for column in DELETED_USER_ROWS:
        db.query(column.class_).filter(column == user_id).delete(synchronize_session=False)
    for column in NULLED_USER_COLUMNS:
        db.query(column.class_).filter(column == user_id).update(
            {column.key: None}, synchronize_session=False
        )

    db.flush()
    db.delete(user)
    db.flush()
