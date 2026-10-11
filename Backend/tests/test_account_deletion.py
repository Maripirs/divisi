"""`delete_user_and_owned_data` completeness, through both of its callers
(`DELETE /auth/me` and the anonymous-participant prune script): a user who
owns one of every kind of user-attributed row is deleted with no FK
error, their own rows are gone, and the group content they merely created
survives with its attribution nulled.

SQLite only enforces foreign keys with `PRAGMA foreign_keys=ON`, which the
shared fixtures don't set; these tests turn it on (on the shared
`StaticPool` connection, so the app's own sessions get it too) so a
forgotten FK fails loudly here the same way it would on Postgres.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.security import create_access_token
from app.db.models import (
    Annotation,
    AnnotationShare,
    CarpoolEvent,
    CarpoolPost,
    CarpoolPostKind,
    CarpoolRiderInterest,
    CarpoolSeatClaim,
    Distribution,
    Group,
    GroupMembership,
    GroupResource,
    GroupRole,
    Homework,
    OAuthAccount,
    OAuthProvider,
    OmrJob,
    OwnerType,
    PasswordResetToken,
    Piece,
    PieceMarkupMark,
    PieceRehearsalNote,
    PieceVersion,
    ResponsibilityDate,
    ResponsibilityRole,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    Team,
    TeamRole,
    TeamSignup,
    User,
    VersionSource,
    WeeklyNote,
)
from app.db.session import Base
from app.services.accounts import DELETED_USER_ROWS, NULLED_USER_COLUMNS
from scripts.prune_anonymous_participants import prune_anonymous_participants

# Every (table, column) with a FK to `users.id` that
# `delete_user_and_owned_data` handles: the two inventory tuples plus the
# columns it handles by hand (annotations and their shares, carpool posts
# and the claims/interests that hang off them).
HANDLED_BY_HAND = {
    ("annotations", "user_id"),
    ("annotation_shares", "shared_with_user_id"),
    ("carpool_posts", "user_id"),
    ("carpool_seat_claims", "user_id"),
    ("carpool_rider_interests", "user_id"),
}


def _handled_user_fks():
    inventory = {(c.class_.__tablename__, c.key) for c in (*DELETED_USER_ROWS, *NULLED_USER_COLUMNS)}
    return inventory | HANDLED_BY_HAND


def _user_fk_columns():
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            for fk in column.foreign_keys:
                if fk.target_fullname == "users.id":
                    yield table, column


def _fk_on(db):
    db.execute(text("PRAGMA foreign_keys=ON"))


def test_every_fk_to_users_is_handled_by_account_deletion():
    found = {(table.name, column.name) for table, column in _user_fk_columns()}
    handled = _handled_user_fks()
    unhandled = found - handled
    assert not unhandled, (
        f"New FK(s) to users.id {sorted(unhandled)}: teach app.services.accounts."
        "delete_user_and_owned_data whether to delete or null them"
    )
    assert handled <= found


def test_nulled_user_columns_are_nullable():
    for column in NULLED_USER_COLUMNS:
        assert column.property.columns[0].nullable, f"{column} can't be nulled on user deletion"


def _user(db, name, anonymous=False, created_at=None):
    user = User(
        email=f"{name.lower().replace(' ', '-')}-{datetime.now().timestamp()}@example.com",
        name=name,
        hashed_password="x",
        is_anonymous=anonymous,
    )
    if created_at is not None:
        user.created_at = created_at
    db.add(user)
    db.flush()
    return user


def _post(db, event, user, kind=CarpoolPostKind.driver):
    post = CarpoolPost(
        event_id=event.id,
        user_id=user.id,
        display_name=user.name,
        kind=kind,
        origin_label="Downtown",
        seats_total=3 if kind == CarpoolPostKind.driver else None,
    )
    db.add(post)
    db.flush()
    return post


def _seed_one_of_everything(db, doomed):
    """`doomed` owns or is attributed on one of every kind of row; `other`
    owns the group and the rows `doomed` merely touches. Returns the ids to
    check afterwards, split into deleted / nulled / surviving."""
    other = _user(db, "Other")
    group = Group(name="G", join_code=f"code-{datetime.now().timestamp()}")
    db.add(group)
    db.flush()
    db.add(GroupMembership(group_id=group.id, user_id=other.id, role=GroupRole.admin))
    db.add(GroupMembership(group_id=group.id, user_id=doomed.id, role=GroupRole.member))
    group_piece = Piece(title="Group piece", owner_type=OwnerType.group, owner_id=group.id)
    personal_piece = Piece(title="Mine", owner_type=OwnerType.user, owner_id=doomed.id)
    db.add_all([group_piece, personal_piece])
    db.flush()

    # Group content doomed created: survives with attribution nulled.
    version = PieceVersion(
        piece_id=group_piece.id, source=VersionSource.original, created_by=doomed.id, reviewed_by=doomed.id
    )
    homework = Homework(group_id=group.id, title="HW", range="mm 1-4", created_by=doomed.id)
    weekly = WeeklyNote(group_id=group.id, title="Wk", note_date=datetime.now(timezone.utc), created_by=doomed.id)
    rnote = PieceRehearsalNote(group_id=group.id, piece_id=group_piece.id, created_by=doomed.id)
    resource = GroupResource(group_id=group.id, label="Drive", url="https://x", created_by=doomed.id)
    schedule = ResponsibilitySchedule(group_id=group.id, name="Sunday", created_by=doomed.id)
    event = CarpoolEvent(group_id=group.id, title="Concert", created_by=doomed.id)
    team = Team(group_id=group.id, name="Publicity")
    db.add_all([version, homework, weekly, rnote, resource, schedule, event, team])
    db.flush()

    # The personal piece, distributed to the group, with other people's
    # rows hanging off it.
    personal_version = PieceVersion(
        piece_id=personal_piece.id, source=VersionSource.original, created_by=doomed.id
    )
    db.add(personal_version)
    db.flush()
    distribution = Distribution(piece_version_id=personal_version.id, group_id=group.id)
    others_ann_on_personal = Annotation(user_id=other.id, piece_id=personal_piece.id, position="p", content="x")
    others_mark_on_personal = PieceMarkupMark(
        user_id=other.id, piece_id=personal_piece.id, page_number=1, kind="stamp", color="#000"
    )
    hw_on_personal = Homework(group_id=group.id, piece_id=personal_piece.id, title="HW2", range="all")
    omr_on_personal = OmrJob(user_id=other.id, source_file_path="/y.pdf", piece_id=personal_piece.id)
    db.add_all([distribution, others_ann_on_personal, others_mark_on_personal, hw_on_personal, omr_on_personal])

    # Doomed's own rows: deleted.
    role = ResponsibilityRole(schedule_id=schedule.id, name="Cantor")
    date = ResponsibilityDate(date=datetime(2026, 9, 6, tzinfo=timezone.utc))
    team_role = TeamRole(team_id=team.id, name="Posters", has_text_field=True)
    db.add_all([role, date, team_role])
    db.flush()
    signup = ResponsibilitySignup(date_id=date.id, role_id=role.id, user_id=doomed.id)
    team_signup = TeamSignup(role_id=team_role.id, user_id=doomed.id, text_value="I can print")
    mark = PieceMarkupMark(user_id=doomed.id, piece_id=group_piece.id, page_number=1, kind="stamp", color="#000")
    omr = OmrJob(user_id=doomed.id, source_file_path="/x.pdf")
    oauth = OAuthAccount(user_id=doomed.id, provider=OAuthProvider.google, provider_user_id="g-1")
    token = PasswordResetToken(
        user_id=doomed.id, token_hash="h1", expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    own_annotation = Annotation(user_id=doomed.id, piece_id=group_piece.id, position="p1", content="breathe")
    others_annotation = Annotation(user_id=other.id, piece_id=group_piece.id, position="p2", content="hi")
    db.add_all([signup, team_signup, mark, omr, oauth, token, own_annotation, others_annotation])
    db.flush()
    share_of_own = AnnotationShare(annotation_id=own_annotation.id, shared_with_user_id=other.id)
    share_to_doomed = AnnotationShare(annotation_id=others_annotation.id, shared_with_user_id=doomed.id)
    db.add_all([share_of_own, share_to_doomed])

    # Carpool: doomed's own posts with other people's claim/interest on
    # them, and doomed's own claim/interest on other people's posts.
    doomed_driver = _post(db, event, doomed)
    doomed_rider = _post(db, event, doomed, kind=CarpoolPostKind.rider)
    others_driver = _post(db, event, other)
    others_rider = _post(db, event, other, kind=CarpoolPostKind.rider)
    claim_on_doomed = CarpoolSeatClaim(driver_post_id=doomed_driver.id, user_id=other.id, display_name="Other")
    interest_on_doomed = CarpoolRiderInterest(rider_post_id=doomed_rider.id, user_id=other.id, display_name="Other")
    doomed_claim = CarpoolSeatClaim(driver_post_id=others_driver.id, user_id=doomed.id, display_name=doomed.name)
    doomed_interest = CarpoolRiderInterest(
        rider_post_id=others_rider.id, user_id=doomed.id, display_name=doomed.name
    )
    db.add_all([claim_on_doomed, interest_on_doomed, doomed_claim, doomed_interest])
    db.commit()

    deleted = [
        (Piece, personal_piece.id),
        (PieceVersion, personal_version.id),
        (Distribution, distribution.id),
        (Annotation, others_ann_on_personal.id),
        (PieceMarkupMark, others_mark_on_personal.id),
        (ResponsibilitySignup, signup.id),
        (TeamSignup, team_signup.id),
        (PieceMarkupMark, mark.id),
        (OmrJob, omr.id),
        (OAuthAccount, oauth.id),
        (PasswordResetToken, token.id),
        (Annotation, own_annotation.id),
        (AnnotationShare, share_of_own.id),
        (AnnotationShare, share_to_doomed.id),
        (CarpoolPost, doomed_driver.id),
        (CarpoolPost, doomed_rider.id),
        (CarpoolSeatClaim, claim_on_doomed.id),
        (CarpoolRiderInterest, interest_on_doomed.id),
        (CarpoolSeatClaim, doomed_claim.id),
        (CarpoolRiderInterest, doomed_interest.id),
    ]
    nulled = [
        (PieceVersion, version.id, "created_by"),
        (PieceVersion, version.id, "reviewed_by"),
        (Homework, homework.id, "created_by"),
        (WeeklyNote, weekly.id, "created_by"),
        (PieceRehearsalNote, rnote.id, "created_by"),
        (GroupResource, resource.id, "created_by"),
        (ResponsibilitySchedule, schedule.id, "created_by"),
        (CarpoolEvent, event.id, "created_by"),
        (Homework, hw_on_personal.id, "piece_id"),
        (OmrJob, omr_on_personal.id, "piece_id"),
    ]
    surviving = [
        (User, other.id),
        (Group, group.id),
        (Piece, group_piece.id),
        (Annotation, others_annotation.id),
        (CarpoolPost, others_driver.id),
        (CarpoolPost, others_rider.id),
    ]
    return deleted, nulled, surviving


def _assert_cleanly_deleted(db, user_id, deleted, nulled, surviving):
    db.expire_all()
    assert db.get(User, user_id) is None
    for table, column in _user_fk_columns():
        count = db.execute(
            text(f"SELECT COUNT(*) FROM {table.name} WHERE {column.name} = :uid"), {"uid": user_id}
        ).scalar()
        assert count == 0, f"{table.name}.{column.name} still references the deleted user"
    assert db.query(Piece).filter(Piece.owner_type == OwnerType.user, Piece.owner_id == user_id).count() == 0
    for model, row_id in deleted:
        assert db.get(model, row_id) is None, f"{model.__name__} {row_id} should be deleted"
    for model, row_id, attr in nulled:
        row = db.get(model, row_id)
        assert row is not None, f"{model.__name__} {row_id} should survive"
        assert getattr(row, attr) is None, f"{model.__name__}.{attr} should be nulled"
    for model, row_id in surviving:
        assert db.get(model, row_id) is not None, f"{model.__name__} {row_id} should survive"


def test_delete_account_removes_one_of_everything_with_fks_enforced(client, db_session):
    db = db_session
    _fk_on(db)
    doomed = _user(db, "Doomed")
    deleted, nulled, surviving = _seed_one_of_everything(db, doomed)
    doomed_id = doomed.id

    headers = {"Authorization": f"Bearer {create_access_token(doomed_id, doomed.password_changed_at)}"}
    res = client.delete("/auth/me", headers=headers)
    assert res.status_code == 204, res.text

    _assert_cleanly_deleted(db, doomed_id, deleted, nulled, surviving)


def test_prune_removes_a_stale_guest_with_one_of_everything_with_fks_enforced(db_session):
    db = db_session
    _fk_on(db)
    # The prune keeps a guest with any real activity (responsibility or team
    # signups, annotations, carpool posts/claims/interests), so this one has
    # none of that but still owns everything else.
    guest = _user(db, "Stale Guest", anonymous=True, created_at=datetime.now(timezone.utc) - timedelta(days=90))
    deleted, nulled, surviving = _seed_one_of_everything(db, guest)
    db.query(ResponsibilitySignup).filter(ResponsibilitySignup.user_id == guest.id).delete()
    db.query(TeamSignup).filter(TeamSignup.user_id == guest.id).delete()
    db.query(AnnotationShare).filter(
        AnnotationShare.annotation_id.in_(db.query(Annotation.id).filter(Annotation.user_id == guest.id))
    ).delete(synchronize_session=False)
    db.query(Annotation).filter(Annotation.user_id == guest.id).delete()
    guest_post_ids = db.query(CarpoolPost.id).filter(CarpoolPost.user_id == guest.id)
    db.query(CarpoolSeatClaim).filter(
        (CarpoolSeatClaim.user_id == guest.id) | CarpoolSeatClaim.driver_post_id.in_(guest_post_ids)
    ).delete(synchronize_session=False)
    db.query(CarpoolRiderInterest).filter(
        (CarpoolRiderInterest.user_id == guest.id) | CarpoolRiderInterest.rider_post_id.in_(guest_post_ids)
    ).delete(synchronize_session=False)
    db.query(CarpoolPost).filter(CarpoolPost.user_id == guest.id).delete(synchronize_session=False)
    db.commit()
    guest_id = guest.id

    result = prune_anonymous_participants(db, days=30, dry_run=False)
    assert result["deleted"] == 1

    _assert_cleanly_deleted(db, guest_id, deleted, nulled, surviving)
