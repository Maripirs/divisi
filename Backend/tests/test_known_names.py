"""Admin-only known-names list/rename: aggregates the free-text guest names
typed into a group's Responsibility signups and Carpool posts/claims/
interests, and lets an admin rewrite one exact string everywhere it
appears, scoped to one group. Seeds rows directly via `db_session` (same
convention as `tests/test_participants.py`) rather than driving every
carpool post through the API, since a bearer member's `CarpoolPost.
display_name` is always `actor.name`, not client-settable.
"""

from datetime import datetime, timezone

import pytest

from app.db.models import (
    CarpoolEvent,
    CarpoolPost,
    CarpoolPostKind,
    CarpoolRiderInterest,
    CarpoolSeatClaim,
    ResponsibilityDate,
    ResponsibilityRole,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    User,
)
from app.services.known_names import list_known_names, rename_known_name


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _add_member(client, admin_headers, group_id, email):
    client.post(f"/groups/{group_id}/members", json={"email": email}, headers=admin_headers)


def _user_id(db_session, email):
    return db_session.query(User).filter(User.email == email).first().id


def _seed_responsibility_signups(db_session, group_id, names):
    """One schedule/role/date in `group_id`, with one admin-assigned
    `guest_name` signup per name in `names`. Returns the role."""
    schedule = ResponsibilitySchedule(group_id=group_id, name="Sunday")
    db_session.add(schedule)
    db_session.flush()
    role = ResponsibilityRole(schedule_id=schedule.id, name="Cantor", needed_count=len(names))
    db_session.add(role)
    db_session.flush()
    date = ResponsibilityDate(date=datetime(2026, 9, 6, 10, 0, tzinfo=timezone.utc))
    db_session.add(date)
    db_session.flush()
    for name in names:
        db_session.add(ResponsibilitySignup(date_id=date.id, role_id=role.id, guest_name=name))
    db_session.commit()
    return role


def _seed_carpool_chain(db_session, group_id, driver_user_id, rider_user_id):
    """One event with a driver post ("Katlyn") and a rider post ("Sam"), a
    seat claim on the driver post ("Katlyn") and a rider interest on the
    rider post ("Sam"). Returns (driver_post, rider_post)."""
    event = CarpoolEvent(
        group_id=group_id,
        title="Rehearsal",
        starts_at=datetime(2026, 9, 16, 18, 0, tzinfo=timezone.utc),
        destination_label="Hall",
    )
    db_session.add(event)
    db_session.flush()
    driver_post = CarpoolPost(
        event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
        kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=3,
    )
    rider_post = CarpoolPost(
        event_id=event.id, user_id=rider_user_id, display_name="Sam",
        kind=CarpoolPostKind.rider, origin_label="Sunset",
    )
    db_session.add_all([driver_post, rider_post])
    db_session.flush()
    db_session.add(CarpoolSeatClaim(driver_post_id=driver_post.id, user_id=rider_user_id, display_name="Katlyn"))
    db_session.add(CarpoolRiderInterest(rider_post_id=rider_post.id, user_id=driver_user_id, display_name="Sam"))
    db_session.commit()
    return driver_post, rider_post


def test_list_known_names_aggregates_across_all_four_sources_scoped_to_group(client, db_session):
    admin_headers = _register_and_login(client, "kn-admin@example.com")
    _register_and_login(client, "kn-driver@example.com", name="Driver")
    _register_and_login(client, "kn-rider@example.com", name="Rider")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-driver@example.com")
    _add_member(client, admin_headers, group_id, "kn-rider@example.com")
    driver_user_id = _user_id(db_session, "kn-driver@example.com")
    rider_user_id = _user_id(db_session, "kn-rider@example.com")

    _seed_responsibility_signups(db_session, group_id, ["Katlyn", "Katlyn", "Sam"])
    _seed_carpool_chain(db_session, group_id, driver_user_id, rider_user_id)

    other_admin_headers = _register_and_login(client, "kn-admin2@example.com")
    other_group_id = _make_group(client, other_admin_headers, name="Other")
    _seed_responsibility_signups(db_session, other_group_id, ["Katlyn"])

    assert {kn.name: kn.count for kn in list_known_names(group_id, db_session)} == {"Katlyn": 4, "Sam": 3}
    assert {kn.name: kn.count for kn in list_known_names(other_group_id, db_session)} == {"Katlyn": 1}


def test_list_known_names_never_includes_a_real_members_own_signup(client, db_session):
    admin_headers = _register_and_login(client, "kn-admin3@example.com")
    member_headers = _register_and_login(client, "kn-member3@example.com", name="RealMember")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-member3@example.com")

    schedule = client.post(
        f"/groups/{group_id}/responsibilities/schedules",
        json={"name": "S", "roles": [{"name": "Cantor", "needed_count": 2}]},
        headers=admin_headers,
    ).json()
    date = client.post(
        f"/groups/{group_id}/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "notes": "", "schedule_ids": [schedule["id"]]},
        headers=admin_headers,
    ).json()
    role_id = schedule["roles"][0]["id"]
    signup = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id},
        headers=member_headers,
    )
    assert signup.status_code == 201
    assert signup.json()["user_id"] is not None

    assert list_known_names(group_id, db_session) == []


def test_list_known_names_includes_phone_from_carpool_post(client, db_session):
    admin_headers = _register_and_login(client, "kn-c1-admin@example.com")
    _register_and_login(client, "kn-c1-driver@example.com", name="Driver")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-c1-driver@example.com")
    driver_user_id = _user_id(db_session, "kn-c1-driver@example.com")

    event = CarpoolEvent(
        group_id=group_id,
        title="Rehearsal",
        starts_at=datetime(2026, 9, 16, 18, 0, tzinfo=timezone.utc),
        destination_label="Hall",
    )
    db_session.add(event)
    db_session.flush()
    db_session.add(
        CarpoolPost(
            event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
            kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=1,
            contact_phone="555-1234",
        )
    )
    db_session.commit()

    [kn] = list_known_names(group_id, db_session)
    assert kn.name == "Katlyn"
    assert kn.phone == "555-1234"
    assert kn.email is None


def test_list_known_names_picks_most_recently_created_contact_info(client, db_session):
    admin_headers = _register_and_login(client, "kn-c2-admin@example.com")
    _register_and_login(client, "kn-c2-driver@example.com", name="Driver")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-c2-driver@example.com")
    driver_user_id = _user_id(db_session, "kn-c2-driver@example.com")

    event = CarpoolEvent(
        group_id=group_id,
        title="Rehearsal",
        starts_at=datetime(2026, 9, 16, 18, 0, tzinfo=timezone.utc),
        destination_label="Hall",
    )
    db_session.add(event)
    db_session.flush()
    older_post = CarpoolPost(
        event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
        kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=1,
        contact_phone="OLD-PHONE", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    newer_post = CarpoolPost(
        event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
        kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=1,
        contact_phone="NEW-PHONE", created_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )
    db_session.add_all([older_post, newer_post])
    db_session.commit()

    [kn] = list_known_names(group_id, db_session)
    assert kn.phone == "NEW-PHONE"


def test_list_known_names_responsibility_only_name_has_no_contact_info(client, db_session):
    admin_headers = _register_and_login(client, "kn-c3-admin@example.com")
    group_id = _make_group(client, admin_headers)
    _seed_responsibility_signups(db_session, group_id, ["Alex"])

    [kn] = list_known_names(group_id, db_session)
    assert kn.name == "Alex"
    assert kn.phone is None
    assert kn.email is None


def test_list_known_names_phone_and_email_can_come_from_different_rows(client, db_session):
    admin_headers = _register_and_login(client, "kn-c4-admin@example.com")
    _register_and_login(client, "kn-c4-driver@example.com", name="Driver")
    _register_and_login(client, "kn-c4-rider@example.com", name="Rider")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-c4-driver@example.com")
    _add_member(client, admin_headers, group_id, "kn-c4-rider@example.com")
    driver_user_id = _user_id(db_session, "kn-c4-driver@example.com")
    rider_user_id = _user_id(db_session, "kn-c4-rider@example.com")

    event = CarpoolEvent(
        group_id=group_id,
        title="Rehearsal",
        starts_at=datetime(2026, 9, 16, 18, 0, tzinfo=timezone.utc),
        destination_label="Hall",
    )
    db_session.add(event)
    db_session.flush()
    driver_post = CarpoolPost(
        event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
        kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=3,
        contact_phone="555-1234",
    )
    db_session.add(driver_post)
    db_session.flush()
    db_session.add(
        CarpoolSeatClaim(
            driver_post_id=driver_post.id, user_id=rider_user_id, display_name="Katlyn",
            contact_email="katlyn@example.com",
        )
    )
    db_session.commit()

    [kn] = list_known_names(group_id, db_session)
    assert kn.name == "Katlyn"
    assert kn.phone == "555-1234"
    assert kn.email == "katlyn@example.com"


def test_rename_known_name_updates_all_four_tables_scoped_to_group(client, db_session):
    admin_headers = _register_and_login(client, "kn-admin4@example.com")
    _register_and_login(client, "kn-driver4@example.com", name="Driver")
    _register_and_login(client, "kn-rider4@example.com", name="Rider")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-driver4@example.com")
    _add_member(client, admin_headers, group_id, "kn-rider4@example.com")
    driver_user_id = _user_id(db_session, "kn-driver4@example.com")
    rider_user_id = _user_id(db_session, "kn-rider4@example.com")

    role = _seed_responsibility_signups(db_session, group_id, ["Katlyn", "Katlyn", "Sam"])
    driver_post, rider_post = _seed_carpool_chain(db_session, group_id, driver_user_id, rider_user_id)

    other_admin_headers = _register_and_login(client, "kn-admin5@example.com")
    other_group_id = _make_group(client, other_admin_headers, name="Other")
    other_role = _seed_responsibility_signups(db_session, other_group_id, ["Katlyn"])

    renamed_count = rename_known_name(group_id, "Katlyn", "Kaitlyn", db_session)
    assert renamed_count == 4

    signup_names = sorted(
        s.guest_name
        for s in db_session.query(ResponsibilitySignup).filter(ResponsibilitySignup.role_id == role.id)
    )
    assert signup_names == ["Kaitlyn", "Kaitlyn", "Sam"]

    driver_post_reloaded = db_session.get(CarpoolPost, driver_post.id)
    rider_post_reloaded = db_session.get(CarpoolPost, rider_post.id)
    assert driver_post_reloaded.display_name == "Kaitlyn"
    assert rider_post_reloaded.display_name == "Sam"  # untouched, never "Katlyn"

    claim = db_session.query(CarpoolSeatClaim).filter(CarpoolSeatClaim.driver_post_id == driver_post.id).first()
    interest = db_session.query(CarpoolRiderInterest).filter(
        CarpoolRiderInterest.rider_post_id == rider_post.id
    ).first()
    assert claim.display_name == "Kaitlyn"
    assert interest.display_name == "Sam"  # untouched

    other_signup = (
        db_session.query(ResponsibilitySignup).filter(ResponsibilitySignup.role_id == other_role.id).first()
    )
    assert other_signup.guest_name == "Katlyn"  # another group's same name, untouched


def test_rename_known_name_is_noop_when_old_name_not_present(client, db_session):
    admin_headers = _register_and_login(client, "kn-admin6@example.com")
    group_id = _make_group(client, admin_headers)

    assert rename_known_name(group_id, "Nobody", "Somebody", db_session) == 0


def test_rename_known_name_rejects_empty_or_identical_new_name(client, db_session):
    admin_headers = _register_and_login(client, "kn-admin7@example.com")
    group_id = _make_group(client, admin_headers)

    with pytest.raises(ValueError):
        rename_known_name(group_id, "Katlyn", "   ", db_session)
    with pytest.raises(ValueError):
        rename_known_name(group_id, "Katlyn", "Katlyn", db_session)


def test_known_names_routes_403_for_non_admin(client):
    admin_headers = _register_and_login(client, "kn-r-admin@example.com")
    member_headers = _register_and_login(client, "kn-r-member@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-r-member@example.com")

    assert client.get(f"/groups/{group_id}/known-names", headers=member_headers).status_code == 403
    assert (
        client.post(
            f"/groups/{group_id}/known-names/rename",
            json={"old_name": "A", "new_name": "B"},
            headers=member_headers,
        ).status_code
        == 403
    )


def test_known_names_routes_200_for_admin_list_and_rename(client, db_session):
    admin_headers = _register_and_login(client, "kn-r-admin2@example.com")
    _register_and_login(client, "kn-r-driver2@example.com", name="Driver")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "kn-r-driver2@example.com")
    driver_user_id = _user_id(db_session, "kn-r-driver2@example.com")

    event = CarpoolEvent(
        group_id=group_id,
        title="Rehearsal",
        starts_at=datetime(2026, 9, 16, 18, 0, tzinfo=timezone.utc),
        destination_label="Hall",
    )
    db_session.add(event)
    db_session.flush()
    db_session.add(
        CarpoolPost(
            event_id=event.id, user_id=driver_user_id, display_name="Katlyn",
            kind=CarpoolPostKind.driver, origin_label="Mission", seats_total=1,
        )
    )
    db_session.commit()

    listed = client.get(f"/groups/{group_id}/known-names", headers=admin_headers)
    assert listed.status_code == 200
    assert listed.json() == [{"name": "Katlyn", "count": 1, "phone": None, "email": None}]

    renamed = client.post(
        f"/groups/{group_id}/known-names/rename",
        json={"old_name": "Katlyn", "new_name": "Kaitlyn"},
        headers=admin_headers,
    )
    assert renamed.status_code == 200
    assert renamed.json() == {"renamed_count": 1}

    listed_again = client.get(f"/groups/{group_id}/known-names", headers=admin_headers)
    assert listed_again.json() == [{"name": "Kaitlyn", "count": 1, "phone": None, "email": None}]

    bad_rename = client.post(
        f"/groups/{group_id}/known-names/rename",
        json={"old_name": "Kaitlyn", "new_name": ""},
        headers=admin_headers,
    )
    assert bad_rename.status_code == 400
