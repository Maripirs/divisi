"""`merge_participant` completeness: a source participant that owns one of
every kind of user-attributed row folds cleanly into a target, every row
lands on the target (or is deduped against a unique constraint the way the
function documents), and nothing anywhere still points at the deleted
source.

SQLite only enforces foreign keys with `PRAGMA foreign_keys=ON`, which the
shared fixtures don't set; `_fk_on` turns it on for these tests so a
forgotten FK fails loudly here the same way it would on Postgres.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.models import (
    Annotation,
    AnnotationShare,
    CarpoolEvent,
    CarpoolPost,
    CarpoolPostKind,
    CarpoolRiderInterest,
    CarpoolRiderInterestStatus,
    CarpoolSeatClaim,
    CarpoolSeatClaimStatus,
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
from app.services.participants import merge_participant

# Every (table, column) with a FK to `users.id` that `merge_participant`
# handles. A new FK to users that isn't added here (and to the function)
# fails `test_every_fk_to_users_is_handled_by_merge_participant`.
HANDLED_USER_FKS = {
    ("password_reset_tokens", "user_id"),
    ("oauth_accounts", "user_id"),
    ("group_memberships", "user_id"),
    ("piece_versions", "created_by"),
    ("piece_versions", "reviewed_by"),
    ("annotations", "user_id"),
    ("annotation_shares", "shared_with_user_id"),
    ("piece_markup_marks", "user_id"),
    ("homework", "created_by"),
    ("weekly_notes", "created_by"),
    ("piece_rehearsal_notes", "created_by"),
    ("group_resources", "created_by"),
    ("responsibility_schedules", "created_by"),
    ("responsibility_signups", "user_id"),
    ("omr_jobs", "user_id"),
    ("carpool_events", "created_by"),
    ("carpool_posts", "user_id"),
    ("carpool_seat_claims", "user_id"),
    ("carpool_rider_interests", "user_id"),
    ("team_signups", "user_id"),
}


def _user_fk_columns():
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            for fk in column.foreign_keys:
                if fk.target_fullname == "users.id":
                    yield table, column


def _fk_on(db):
    db.execute(text("PRAGMA foreign_keys=ON"))


def _user(db, name, anonymous=False):
    user = User(
        email=f"{name.lower().replace(' ', '-')}-{datetime.now().timestamp()}@example.com",
        name=name,
        hashed_password="x",
        is_anonymous=anonymous,
    )
    db.add(user)
    db.flush()
    return user


def _assert_nothing_references(db, user_id):
    for table, column in _user_fk_columns():
        count = db.execute(
            text(f"SELECT COUNT(*) FROM {table.name} WHERE {column.name} = :uid"), {"uid": user_id}
        ).scalar()
        assert count == 0, f"{table.name}.{column.name} still references the merged-away user"
    assert db.query(Piece).filter(Piece.owner_type == OwnerType.user, Piece.owner_id == user_id).count() == 0
    assert db.get(User, user_id) is None


def test_every_fk_to_users_is_handled_by_merge_participant():
    found = {(table.name, column.name) for table, column in _user_fk_columns()}
    unhandled = found - HANDLED_USER_FKS
    assert not unhandled, (
        f"New FK(s) to users.id {sorted(unhandled)}: teach app.services.participants."
        "merge_participant how to fold them, then add them to HANDLED_USER_FKS"
    )
    # And nothing listed here has quietly disappeared from the models.
    assert HANDLED_USER_FKS <= found


def _world(db):
    """A group with one of everything a user can be attached to."""
    group = Group(name="G", join_code=f"code-{datetime.now().timestamp()}")
    db.add(group)
    db.flush()
    piece = Piece(title="Group piece", owner_type=OwnerType.group, owner_id=group.id)
    db.add(piece)
    schedule_owner = _user(db, "Admin")
    schedule = ResponsibilitySchedule(group_id=group.id, name="Sunday", created_by=schedule_owner.id)
    db.add(schedule)
    db.flush()
    role = ResponsibilityRole(schedule_id=schedule.id, name="Cantor")
    date = ResponsibilityDate(date=datetime(2026, 9, 6, tzinfo=timezone.utc))
    team = Team(group_id=group.id, name="Publicity")
    event = CarpoolEvent(group_id=group.id, title="Concert")
    db.add_all([role, date, team, event])
    db.flush()
    team_role = TeamRole(team_id=team.id, name="Posters", has_text_field=True)
    db.add(team_role)
    db.flush()
    return group, piece, role, date, team_role, event


def _post(db, event, user, kind=CarpoolPostKind.driver, display_name="Nisha Anand"):
    post = CarpoolPost(
        event_id=event.id,
        user_id=user.id,
        display_name=display_name,
        kind=kind,
        origin_label="Downtown",
        seats_total=3 if kind == CarpoolPostKind.driver else None,
    )
    db.add(post)
    db.flush()
    return post


def test_merge_moves_one_of_everything_and_deletes_source(db_session):
    db = db_session
    _fk_on(db)
    group, piece, role, date, team_role, event = _world(db)
    source = _user(db, "Nisha Anand", anonymous=True)
    target = _user(db, "Nisha Anand")
    other = _user(db, "Other")

    db.add(GroupMembership(group_id=group.id, user_id=source.id, is_guest=True))
    personal_piece = Piece(title="Mine", owner_type=OwnerType.user, owner_id=source.id)
    db.add(personal_piece)
    version = PieceVersion(
        piece_id=piece.id, source=VersionSource.original, created_by=source.id, reviewed_by=source.id
    )
    annotation = Annotation(user_id=source.id, piece_id=piece.id, position="p1", content="breathe")
    others_annotation = Annotation(user_id=other.id, piece_id=piece.id, position="p2", content="hi")
    db.add_all([version, annotation, others_annotation])
    db.flush()
    db.add(AnnotationShare(annotation_id=others_annotation.id, shared_with_user_id=source.id))
    mark = PieceMarkupMark(user_id=source.id, piece_id=piece.id, page_number=1, kind="stamp", color="#000")
    homework = Homework(group_id=group.id, title="HW", range="mm 1-4", created_by=source.id)
    weekly = WeeklyNote(group_id=group.id, title="Wk", note_date=datetime.now(timezone.utc), created_by=source.id)
    rnote = PieceRehearsalNote(group_id=group.id, piece_id=piece.id, created_by=source.id)
    resource = GroupResource(group_id=group.id, label="Drive", url="https://x", created_by=source.id)
    schedule = ResponsibilitySchedule(group_id=group.id, name="Other", created_by=source.id)
    signup = ResponsibilitySignup(date_id=date.id, role_id=role.id, user_id=source.id)
    omr = OmrJob(user_id=source.id, source_file_path="/x.pdf")
    oauth = OAuthAccount(user_id=source.id, provider=OAuthProvider.google, provider_user_id="g-1")
    token = PasswordResetToken(
        user_id=source.id, token_hash="h1", expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    sourced_event = CarpoolEvent(group_id=group.id, title="Retreat", created_by=source.id)
    team_signup = TeamSignup(role_id=team_role.id, user_id=source.id, text_value="I can print")
    db.add_all(
        [mark, homework, weekly, rnote, resource, schedule, signup, omr, oauth, token, sourced_event, team_signup]
    )
    post = _post(db, event, source)
    others_driver = _post(db, event, other, display_name="Other")
    others_rider = _post(db, event, other, kind=CarpoolPostKind.rider, display_name="Other")
    claim = CarpoolSeatClaim(driver_post_id=others_driver.id, user_id=source.id, display_name="Nisha Anand")
    interest = CarpoolRiderInterest(rider_post_id=others_rider.id, user_id=source.id, display_name="Nisha")
    db.add_all([claim, interest])
    db.commit()
    source_id, target_id, token_id = source.id, target.id, token.id

    merge_participant(db, source=source, target=target)
    db.commit()
    db.expire_all()

    _assert_nothing_references(db, source_id)
    membership = db.query(GroupMembership).filter(GroupMembership.user_id == target_id).one()
    assert membership.group_id == group.id and membership.is_guest is False
    assert db.get(Piece, personal_piece.id).owner_id == target_id
    assert db.get(PieceVersion, version.id).created_by == target_id
    assert db.get(PieceVersion, version.id).reviewed_by == target_id
    assert db.get(Annotation, annotation.id).user_id == target_id
    assert db.query(AnnotationShare).filter(AnnotationShare.shared_with_user_id == target_id).count() == 1
    for model, row in [
        (PieceMarkupMark, mark),
        (OmrJob, omr),
        (OAuthAccount, oauth),
        (ResponsibilitySignup, signup),
        (CarpoolPost, post),
        (CarpoolSeatClaim, claim),
        (CarpoolRiderInterest, interest),
        (TeamSignup, team_signup),
    ]:
        assert db.get(model, row.id).user_id == target_id, model.__name__
    for model, row in [
        (Homework, homework),
        (WeeklyNote, weekly),
        (PieceRehearsalNote, rnote),
        (GroupResource, resource),
        (ResponsibilitySchedule, schedule),
        (CarpoolEvent, sourced_event),
    ]:
        assert db.get(model, row.id).created_by == target_id, model.__name__
    # Carpool content keeps the name the guest typed.
    assert db.get(CarpoolPost, post.id).display_name == "Nisha Anand"
    assert db.get(CarpoolSeatClaim, claim.id).status == CarpoolSeatClaimStatus.active
    assert db.get(PasswordResetToken, token_id) is None


def test_merge_dedupes_on_every_unique_constraint(db_session):
    db = db_session
    _fk_on(db)
    group, piece, role, date, team_role, event = _world(db)
    source = _user(db, "Guest", anonymous=True)
    target = _user(db, "Real")
    other = _user(db, "Other")

    # Both in the group: source's membership is dropped, target's kept.
    db.add(GroupMembership(group_id=group.id, user_id=source.id, is_guest=True, role=GroupRole.member))
    db.add(GroupMembership(group_id=group.id, user_id=target.id, role=GroupRole.member))
    # Both signed up for the same role on the same date.
    db.add(ResponsibilitySignup(date_id=date.id, role_id=role.id, user_id=source.id))
    tgt_signup = ResponsibilitySignup(date_id=date.id, role_id=role.id, user_id=target.id)
    # Both on the same team role: target's row survives, picking up source's text.
    db.add(TeamSignup(role_id=team_role.id, user_id=source.id, text_value="from guest", contact="555"))
    tgt_team = TeamSignup(role_id=team_role.id, user_id=target.id, contact="real@example.com")
    db.add_all([tgt_signup, tgt_team])
    # The same annotation shared with both.
    others_ann = Annotation(user_id=other.id, piece_id=piece.id, position="p", content="c")
    # Target's own annotation shared with source: becomes a self-share, dropped.
    target_ann = Annotation(user_id=target.id, piece_id=piece.id, position="p", content="t")
    db.add_all([others_ann, target_ann])
    db.flush()
    db.add_all(
        [
            AnnotationShare(annotation_id=others_ann.id, shared_with_user_id=source.id),
            AnnotationShare(annotation_id=others_ann.id, shared_with_user_id=target.id),
            AnnotationShare(annotation_id=target_ann.id, shared_with_user_id=source.id),
        ]
    )
    # Carpool: both actively claimed the same driver post; source also
    # claimed a seat on target's own driver post and expressed interest in
    # target's own rider post. A removed source claim just repoints.
    others_driver = _post(db, event, other, display_name="Other")
    target_driver = _post(db, event, target, display_name="Real")
    target_rider = _post(db, event, target, kind=CarpoolPostKind.rider, display_name="Real")
    db.add(CarpoolSeatClaim(driver_post_id=others_driver.id, user_id=target.id, display_name="Real"))
    dup_claim = CarpoolSeatClaim(driver_post_id=others_driver.id, user_id=source.id, display_name="Guest")
    self_claim = CarpoolSeatClaim(driver_post_id=target_driver.id, user_id=source.id, display_name="Guest")
    old_claim = CarpoolSeatClaim(
        driver_post_id=others_driver.id,
        user_id=source.id,
        display_name="Guest",
        status=CarpoolSeatClaimStatus.removed,
        removed_at=datetime.now(timezone.utc),
    )
    self_interest = CarpoolRiderInterest(rider_post_id=target_rider.id, user_id=source.id, display_name="Guest")
    db.add_all([dup_claim, self_claim, old_claim, self_interest])
    db.commit()
    source_id, target_id = source.id, target.id

    merge_participant(db, source=source, target=target)
    db.commit()
    db.expire_all()

    _assert_nothing_references(db, source_id)
    assert db.query(GroupMembership).filter(GroupMembership.group_id == group.id).count() == 1
    assert db.query(ResponsibilitySignup).filter(ResponsibilitySignup.user_id == target_id).one().id == tgt_signup.id
    team = db.query(TeamSignup).filter(TeamSignup.user_id == target_id).one()
    assert team.id == tgt_team.id
    assert team.text_value == "from guest"
    assert team.contact == "real@example.com"
    shares = db.query(AnnotationShare).filter(AnnotationShare.shared_with_user_id == target_id).all()
    assert [s.annotation_id for s in shares] == [others_ann.id]
    active_claims = (
        db.query(CarpoolSeatClaim)
        .filter(CarpoolSeatClaim.user_id == target_id, CarpoolSeatClaim.status == CarpoolSeatClaimStatus.active)
        .all()
    )
    assert len(active_claims) == 1 and active_claims[0].driver_post_id == others_driver.id
    for claim in (dup_claim, self_claim):
        merged = db.get(CarpoolSeatClaim, claim.id)
        assert merged.user_id == target_id
        assert merged.status == CarpoolSeatClaimStatus.removed
        assert merged.removed_at is not None
    assert db.get(CarpoolSeatClaim, old_claim.id).user_id == target_id
    merged_interest = db.get(CarpoolRiderInterest, self_interest.id)
    assert merged_interest.status == CarpoolRiderInterestStatus.removed


def test_merge_annotations_keep_newer_per_piece_and_drop_losers_shares(db_session):
    db = db_session
    _fk_on(db)
    group, piece, *_ = _world(db)
    source = _user(db, "Guest", anonymous=True)
    target = _user(db, "Real")
    other = _user(db, "Other")
    older = Annotation(
        user_id=target.id,
        piece_id=piece.id,
        position="p",
        content="old",
        created_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    newer = Annotation(user_id=source.id, piece_id=piece.id, position="p", content="new")
    db.add_all([older, newer])
    db.flush()
    db.add(AnnotationShare(annotation_id=older.id, shared_with_user_id=other.id))
    db.commit()
    source_id, target_id = source.id, target.id

    merge_participant(db, source=source, target=target)
    db.commit()
    db.expire_all()

    _assert_nothing_references(db, source_id)
    remaining = db.query(Annotation).filter(Annotation.user_id == target_id).one()
    assert remaining.content == "new"
    assert db.query(AnnotationShare).count() == 0
