"""`POST /auth/claim-participant`: a guest who acted on this device (the
`divisi_participant` cookie) and then registers or logs in gets their
anonymous participant folded into the account, instead of leaving an
"unverified" duplicate in the group. Best-effort and idempotent: every
no-op is a 200 with a `reason`."""

from datetime import datetime

from app.core.security import create_access_token, create_participant_token
from app.db.models import (
    CarpoolEvent,
    CarpoolPost,
    CarpoolPostKind,
    Group,
    GroupMembership,
    GroupRole,
    User,
)


def _login(client, email, name="Real Person"):
    client.post("/auth/register", json={"email": email, "name": name, "password": "hunter22"})
    res = client.post("/auth/login", json={"email": email, "password": "hunter22"})
    token = res.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    return {"Authorization": f"Bearer {token}"}, me["id"]


def _guest_with_carpool_post(db, group_name="Choir"):
    """An anonymous participant who joined a group as a guest and posted a
    carpool ride there, the way the guest carpool routes leave things."""
    group = Group(name=group_name, join_code=f"C{datetime.now().timestamp():.0f}"[-8:])
    db.add(group)
    db.flush()
    guest = User(
        email=f"anon-{datetime.now().timestamp()}@participants.divisi.invalid",
        name="Guest Me",
        hashed_password="x",
        is_anonymous=True,
        anonymous_local_id="dev-1",
    )
    db.add(guest)
    db.flush()
    db.add(GroupMembership(group_id=group.id, user_id=guest.id, role=GroupRole.member, is_guest=True))
    event = CarpoolEvent(group_id=group.id, title="Concert")
    db.add(event)
    db.flush()
    post = CarpoolPost(
        event_id=event.id,
        user_id=guest.id,
        display_name="Guest Me",
        kind=CarpoolPostKind.driver,
        origin_label="Downtown",
        seats_total=3,
    )
    db.add(post)
    db.commit()
    return group, guest, post


def test_claim_folds_the_device_participant_into_the_account(client, db_session):
    group, guest, post = _guest_with_carpool_post(db_session)
    guest_id, group_id, post_id = guest.id, group.id, post.id
    headers, user_id = _login(client, "claimer@example.com")

    client.cookies.set("divisi_participant", create_participant_token(guest_id, "dev-1"))
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["merged"] is True
    assert body["participant_id"] == guest_id
    assert body["group_ids"] == [group_id]
    assert body["carpool_posts"] == 1

    db_session.expire_all()
    assert db_session.get(User, guest_id) is None
    assert db_session.get(CarpoolPost, post_id).user_id == user_id
    memberships = db_session.query(GroupMembership).filter(GroupMembership.group_id == group_id).all()
    assert [(m.user_id, m.is_guest) for m in memberships] == [(user_id, False)]
    # The group now shows up for the account, as a real member.
    assert [g["id"] for g in client.get("/groups", headers=headers).json()] == [group_id]


def test_claim_is_idempotent_once_the_participant_is_gone(client, db_session):
    _, guest, _ = _guest_with_carpool_post(db_session)
    guest_id = guest.id
    headers, _ = _login(client, "twice@example.com")

    client.cookies.set("divisi_participant", create_participant_token(guest_id, "dev-1"))
    assert client.post("/auth/claim-participant", headers=headers).json()["merged"] is True
    again = client.post("/auth/claim-participant", headers=headers)
    assert again.status_code == 200
    assert again.json() == {**again.json(), "merged": False, "reason": "no_participant"}


def test_claim_with_no_cookie_is_a_noop(client):
    headers, _ = _login(client, "nocookie@example.com")
    client.cookies.clear()
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["merged"] is False
    assert res.json()["reason"] == "no_participant"


def test_claim_with_an_invalid_token_is_a_noop(client):
    headers, _ = _login(client, "badtoken@example.com")
    client.cookies.set("divisi_participant", "not-a-jwt")
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["reason"] == "no_participant"


def test_claim_with_an_access_token_in_the_cookie_is_a_noop(client, db_session):
    # A member's session token is not a participant token (scope check).
    headers, user_id = _login(client, "scope@example.com")
    _, other_id = _login(client, "scope-other@example.com", name="Other")
    other = db_session.get(User, other_id)
    client.cookies.set("divisi_participant", create_access_token(other_id, other.password_changed_at))
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["reason"] == "no_participant"
    db_session.expire_all()
    assert db_session.get(User, other_id) is not None


def test_claim_for_a_participant_already_deleted_is_a_noop(client):
    headers, _ = _login(client, "gone@example.com")
    client.cookies.set("divisi_participant", create_participant_token("no-such-user-id", "dev-x"))
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["reason"] == "no_participant"


def test_claim_for_the_callers_own_id_is_a_noop(client, db_session):
    headers, user_id = _login(client, "self@example.com")
    client.cookies.set("divisi_participant", create_participant_token(user_id, ""))
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["reason"] == "same_user"
    db_session.expire_all()
    assert db_session.get(User, user_id) is not None


def test_claim_never_merges_a_real_account(client, db_session):
    # A participant token that resolves to a real, non-anonymous account
    # (e.g. one minted before a "Save across devices" promotion) is never
    # folded into someone else.
    headers, _ = _login(client, "taker@example.com")
    _, victim_id = _login(client, "victim@example.com", name="Victim")
    client.cookies.set("divisi_participant", create_participant_token(victim_id, ""))
    res = client.post("/auth/claim-participant", headers=headers)
    assert res.status_code == 200
    assert res.json()["merged"] is False
    assert res.json()["reason"] == "not_anonymous"
    db_session.expire_all()
    assert db_session.get(User, victim_id) is not None


def test_claim_crosses_groups_the_account_is_not_in(client, db_session):
    # Same browser, same person: unlike the admin merge, a participant in a
    # group the account isn't in yet is still claimed, and brings that
    # membership along.
    headers, user_id = _login(client, "cross@example.com")
    client.post("/groups", json={"name": "Mine"}, headers=headers)
    group, guest, _ = _guest_with_carpool_post(db_session, group_name="Elsewhere")
    group_id, guest_id = group.id, guest.id

    client.cookies.set("divisi_participant", create_participant_token(guest_id, "dev-1"))
    assert client.post("/auth/claim-participant", headers=headers).json()["merged"] is True
    names = {g["name"] for g in client.get("/groups", headers=headers).json()}
    assert names == {"Mine", "Elsewhere"}
    db_session.expire_all()
    membership = (
        db_session.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == user_id)
        .one()
    )
    assert membership.is_guest is False


def test_claim_requires_a_signed_in_account(client, db_session):
    _, guest, _ = _guest_with_carpool_post(db_session)
    client.cookies.set("divisi_participant", create_participant_token(guest.id, "dev-1"))
    assert client.post("/auth/claim-participant").status_code == 401
