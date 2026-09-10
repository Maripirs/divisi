"""B19: anonymous participants (mint-on-first-shared-action), the
`min_identity` write gate, "Save across devices" merge, the roster badge,
and the prune command.

The first wired shared action is a responsibility self-signup, so these
drive that route. Helpers mirror `tests/test_responsibilities.py`.
"""

from datetime import datetime, timedelta, timezone

from app.db.models import Annotation, GroupMembership, ResponsibilitySignup, User
from scripts.prune_anonymous_participants import prune_anonymous_participants


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _add_member(client, admin_headers, group_id, email):
    client.post(f"/groups/{group_id}/members", json={"email": email}, headers=admin_headers)


def _make_schedule(client, admin_headers, group_id, name="Sunday Service"):
    return client.post(
        f"/groups/{group_id}/responsibilities/schedules",
        json={"name": name, "roles": [{"name": "Cantor", "needed_count": 3}]},
        headers=admin_headers,
    ).json()


def _make_date(client, admin_headers, schedule, date="2026-09-06T10:00:00Z"):
    return client.post(
        f"/groups/{schedule['group_id']}/responsibilities/dates",
        json={"date": date, "notes": "", "schedule_ids": [schedule["id"]]},
        headers=admin_headers,
    ).json()


def _set_responsibilities_page(client, admin_headers, group_id, audience="everyone", min_identity=None):
    page = {"page": "responsibilities", "enabled": True, "audience": audience}
    if min_identity is not None:
        page["min_identity"] = min_identity
    return client.put(
        f"/groups/{group_id}/page-settings", json={"pages": [page]}, headers=admin_headers
    )


def _fresh_setup(client, admin_email, audience="everyone", min_identity=None):
    # The backend sets the `divisi_participant` cookie `Secure`, so the
    # TestClient only round-trips it on an https base URL.
    client.base_url = "https://testserver"
    admin_headers = _register_and_login(client, admin_email)
    group_id = _make_group(client, admin_headers)
    _set_responsibilities_page(client, admin_headers, group_id, audience, min_identity)
    schedule = _make_schedule(client, admin_headers, group_id)
    role_id = schedule["roles"][0]["id"]
    return admin_headers, group_id, schedule, role_id


def _members(client, admin_headers, group_id):
    return client.get(f"/groups/{group_id}/members", headers=admin_headers).json()


def test_first_self_signup_mints_one_anonymous_participant_and_sets_cookie(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-a@example.com")
    date = _make_date(client, admin_headers, schedule)

    client.cookies.clear()
    resp = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-alex", "display_name": "Alex"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Alex"
    assert "divisi_participant" in resp.headers.get("set-cookie", "")

    members = _members(client, admin_headers, group_id)
    anon = [m for m in members if m["is_anonymous"]]
    assert len(anon) == 1
    assert anon[0]["name"] == "Alex"


def test_second_self_signup_from_the_same_client_reuses_the_participant(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-b@example.com")
    date1 = _make_date(client, admin_headers, schedule, "2026-09-06T10:00:00Z")
    date2 = _make_date(client, admin_headers, schedule, "2026-09-13T10:00:00Z")

    client.cookies.clear()
    first = client.post(
        f"/responsibilities/dates/{date1['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-bo", "display_name": "Bo"},
    )
    assert first.status_code == 201
    # The client now holds the participant cookie; a second signup carries
    # no local_id / display_name and must resolve to the same row.
    second = client.post(
        f"/responsibilities/dates/{date2['id']}/signups", json={"role_id": role_id}
    )
    assert second.status_code == 201
    assert second.json()["user_id"] == first.json()["user_id"]

    members = _members(client, admin_headers, group_id)
    assert len(members) == 2  # admin + one participant, not two
    assert sum(1 for m in members if m["is_anonymous"]) == 1


def test_self_signup_reuses_via_local_id_when_the_cookie_is_gone(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-c@example.com")
    date1 = _make_date(client, admin_headers, schedule, "2026-09-06T10:00:00Z")
    date2 = _make_date(client, admin_headers, schedule, "2026-09-13T10:00:00Z")

    client.cookies.clear()
    first = client.post(
        f"/responsibilities/dates/{date1['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-cy", "display_name": "Cy"},
    )
    assert first.status_code == 201

    client.cookies.clear()  # cookie lost, localStorage (local_id) survives
    second = client.post(
        f"/responsibilities/dates/{date2['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-cy"},
    )
    assert second.status_code == 201
    assert second.json()["user_id"] == first.json()["user_id"]
    assert len(_members(client, admin_headers, group_id)) == 2


def test_min_identity_saved_blocks_anonymous_write_but_not_a_member_or_a_read(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(
        client, "b19-d@example.com", audience="everyone", min_identity="saved"
    )
    date = _make_date(client, admin_headers, schedule)

    # Anonymous self-signup is refused with the distinct SAVE_REQUIRED error.
    client.cookies.clear()
    blocked = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-dee", "display_name": "Dee"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"].startswith("SAVE_REQUIRED")

    # A real bearer member is unaffected.
    member_headers = _register_and_login(client, "b19-d-member@example.com")
    _add_member(client, admin_headers, group_id, "b19-d-member@example.com")
    ok = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id},
        headers=member_headers,
    )
    assert ok.status_code == 201

    # Guest reads are unaffected.
    groups = client.get("/groups", headers=admin_headers).json()
    join_code = next(g["join_code"] for g in groups if g["id"] == group_id)
    reads = client.get(f"/guest/{join_code}/responsibilities/dates")
    assert reads.status_code == 200


def test_members_only_responsibilities_page_gives_an_anonymous_self_signup_a_404(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(
        client, "b19-e@example.com", audience="members"
    )
    date = _make_date(client, admin_headers, schedule)

    client.cookies.clear()
    blocked = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-el", "display_name": "El"},
    )
    assert blocked.status_code == 404

    member_headers = _register_and_login(client, "b19-e-member@example.com")
    _add_member(client, admin_headers, group_id, "b19-e-member@example.com")
    ok = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id},
        headers=member_headers,
    )
    assert ok.status_code == 201


def test_save_via_pin_promotes_in_place_and_keeps_the_earlier_signup(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-p@example.com")
    date = _make_date(client, admin_headers, schedule)

    client.cookies.clear()
    signup = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-pat", "display_name": "Pat"},
    )
    assert signup.status_code == 201
    participant_id = signup.json()["user_id"]

    saved = client.post("/auth/save", json={"name": "Patricia", "pin": "1234", "local_id": "dev-pat"})
    assert saved.status_code == 200
    token = saved.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["id"] == participant_id  # same row, promoted in place

    members = {m["user_id"]: m for m in _members(client, admin_headers, group_id)}
    assert members[participant_id]["is_anonymous"] is False

    # The signup made before Save still belongs to the (now saved) account.
    dates = client.get(
        f"/groups/{group_id}/responsibilities/dates", headers=admin_headers
    ).json()
    signups = dates[0]["schedules"][0]["roles"][0]["signups"]
    assert any(s["user_id"] == participant_id and s["name"] == "Patricia" for s in signups)


def test_merge_across_two_devices_folds_into_one_account(client, db_session):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-f@example.com")
    date = _make_date(client, admin_headers, schedule)

    # Device A: mint via a self-signup, then Save.
    client.cookies.clear()
    a_signup = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-A", "display_name": "Sammy"},
    )
    assert a_signup.status_code == 201
    a_save = client.post("/auth/save", json={"name": "Sam", "pin": "1234", "local_id": "dev-A"})
    assert a_save.status_code == 200
    a_token = a_save.json()["access_token"]
    a_user_id = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {a_token}"}
    ).json()["id"]

    # Device B: a fresh client state, mint via a signup on the same group
    # with a different local_id, then Save with the same name + PIN.
    client.cookies.clear()
    b_signup = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-B", "display_name": "Sam B"},
    )
    assert b_signup.status_code == 201
    b_user_id = b_signup.json()["user_id"]
    assert b_user_id != a_user_id

    b_save = client.post("/auth/save", json={"name": "Sam", "pin": "1234", "local_id": "dev-B"})
    assert b_save.status_code == 200
    b_token = b_save.json()["access_token"]
    surviving_id = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {b_token}"}
    ).json()["id"]
    assert surviving_id == a_user_id

    db_session.rollback()
    assert db_session.get(User, b_user_id) is None
    memberships = (
        db_session.query(GroupMembership)
        .filter(GroupMembership.user_id == a_user_id, GroupMembership.group_id == group_id)
        .all()
    )
    assert len(memberships) == 1
    # Device B's signup now resolves to the surviving account.
    b_signups = (
        db_session.query(ResponsibilitySignup)
        .filter(ResponsibilitySignup.user_id == a_user_id, ResponsibilitySignup.date_id == date["id"])
        .all()
    )
    assert len(b_signups) == 1


def test_merge_reconciles_annotations_last_writer_wins_per_piece(client, db_session):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-g@example.com")
    date = _make_date(client, admin_headers, schedule)

    client.cookies.clear()
    client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-GA", "display_name": "Gaia"},
    )
    a_save = client.post("/auth/save", json={"name": "Gee", "pin": "4321", "local_id": "dev-GA"})
    a_token = a_save.json()["access_token"]
    a_user_id = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {a_token}"}
    ).json()["id"]

    client.cookies.clear()
    b_signup = client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-GB", "display_name": "Gene"},
    )
    b_user_id = b_signup.json()["user_id"]

    # Seed a conflicting annotation on the same piece for each side; B's is
    # newer, so its content must be the one that survives the merge.
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 1, tzinfo=timezone.utc)
    db_session.add(
        Annotation(user_id=a_user_id, piece_id="piece-x", position="m1", content="A-older", created_at=older)
    )
    db_session.add(
        Annotation(user_id=b_user_id, piece_id="piece-x", position="m1", content="B-newer", created_at=newer)
    )
    db_session.commit()

    merged = client.post("/auth/save", json={"name": "Gee", "pin": "4321", "local_id": "dev-GB"})
    assert merged.status_code == 200

    db_session.rollback()
    rows = (
        db_session.query(Annotation)
        .filter(Annotation.user_id == a_user_id, Annotation.piece_id == "piece-x")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].content == "B-newer"
    assert db_session.get(User, b_user_id) is None


def test_roster_flags_a_participant_and_not_the_admin(client):
    admin_headers, group_id, schedule, role_id = _fresh_setup(client, "b19-h@example.com")
    date = _make_date(client, admin_headers, schedule)

    client.cookies.clear()
    client.post(
        f"/responsibilities/dates/{date['id']}/signups",
        json={"role_id": role_id, "local_id": "dev-h", "display_name": "Hal"},
    )
    members = {m["name"]: m["is_anonymous"] for m in _members(client, admin_headers, group_id)}
    assert members["Hal"] is True
    assert members["Name"] is False  # the admin (registered as name="Name")


def test_prune_keeps_a_participant_with_a_signup_and_deletes_a_bare_one(db_session):
    keep = User(
        email="keep@participants.divisi.invalid",
        name="Keep",
        hashed_password="x",
        is_anonymous=True,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    bare = User(
        email="bare@participants.divisi.invalid",
        name="Bare",
        hashed_password="x",
        is_anonymous=True,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    real = User(email="real@example.com", name="Real", hashed_password="x", is_anonymous=False)
    db_session.add_all([keep, bare, real])
    db_session.commit()
    db_session.add(ResponsibilitySignup(date_id="d1", role_id="r1", user_id=keep.id))
    db_session.commit()

    result = prune_anonymous_participants(db_session, days=0, dry_run=False)
    assert result["deleted"] == 1
    assert result["kept"] == 1

    db_session.rollback()
    assert db_session.get(User, keep.id) is not None
    assert db_session.get(User, bare.id) is None
    assert db_session.get(User, real.id) is not None


def test_prune_dry_run_deletes_nothing(db_session):
    bare = User(
        email="bare2@participants.divisi.invalid",
        name="Bare2",
        hashed_password="x",
        is_anonymous=True,
        created_at=datetime.now(timezone.utc) - timedelta(days=90),
    )
    db_session.add(bare)
    db_session.commit()

    result = prune_anonymous_participants(db_session, days=0, dry_run=True)
    assert result["deleted"] == 1
    db_session.rollback()
    assert db_session.get(User, bare.id) is not None
