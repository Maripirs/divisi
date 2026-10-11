"""Admin merge of an unverified participant into a real member:
`POST /groups/{group_id}/members/{user_id}/merge`. The guest is made the
way the app makes one, by a no-login carpool post, so the merge has real
content to move."""

from app.db.models import CarpoolPost, GroupMembership, GroupRole, User
from tests.carpool_helpers import (
    _add_member,
    _make_event,
    _make_group,
    _register_and_login,
    _rider_post,
    _set_carpool_page_settings,
)


def _members(client, headers, group_id):
    return client.get(f"/groups/{group_id}/members", headers=headers).json()


def _setup(client, prefix, guest_name="Nisha Anand", local_id="dev-nisha"):
    """An admin, a real member "Nisha Anand", and an unverified guest
    "Nisha Anand" who has posted in carpool."""
    client.base_url = "https://testserver"
    admin_headers = _register_and_login(client, f"{prefix}-admin@example.com", name="Admin")
    real_headers = _register_and_login(client, f"{prefix}-nisha@example.com", name="Nisha Anand")
    group = _make_group(client, admin_headers)
    group_id = group["id"]
    _add_member(client, admin_headers, group_id, f"{prefix}-nisha@example.com")
    _set_carpool_page_settings(client, admin_headers, group_id, audience="everyone")
    event = _make_event(client, admin_headers, group_id).json()
    client.cookies.clear()
    post = client.post(
        f"/carpool/events/{event['id']}/posts",
        json=_rider_post(local_id=local_id, display_name=guest_name),
    ).json()
    client.cookies.clear()
    members = _members(client, admin_headers, group_id)
    guest = next(m for m in members if m["is_anonymous"])
    real = next(m for m in members if m["email"] == f"{prefix}-nisha@example.com")
    return admin_headers, real_headers, group_id, event, post, guest, real


def _merge(client, headers, group_id, source_id, target_id):
    return client.post(
        f"/groups/{group_id}/members/{source_id}/merge",
        json={"target_user_id": target_id},
        headers=headers,
    )


def test_admin_merges_guest_into_real_member_and_content_moves(client, db_session):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-ok")

    resp = _merge(client, admin_headers, group_id, guest["user_id"], real["user_id"])

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user_id"] == real["user_id"]
    assert body["role"] == "member"
    assert body["is_anonymous"] is False
    members = _members(client, admin_headers, group_id)
    assert [m["name"] for m in members if m["name"] == "Nisha Anand"] == ["Nisha Anand"]
    assert not any(m["is_anonymous"] for m in members)
    assert db_session.get(User, guest["user_id"]) is None
    moved = db_session.get(CarpoolPost, post["id"])
    assert moved.user_id == real["user_id"]
    assert moved.display_name == "Nisha Anand"
    # The real member now manages the post as its owner.
    edit = client.patch(f"/carpool/posts/{post['id']}", json={"notes": "Can leave at 6"}, headers=real_headers)
    assert edit.status_code == 200, edit.text
    assert edit.json()["notes"] == "Can leave at 6"


def test_non_admin_cannot_merge(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-403")
    resp = _merge(client, real_headers, group_id, guest["user_id"], real["user_id"])
    assert resp.status_code == 403


def test_source_must_be_an_unverified_participant(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-src")
    admin_id = next(m for m in _members(client, admin_headers, group_id) if m["name"] == "Admin")["user_id"]
    resp = _merge(client, admin_headers, group_id, real["user_id"], admin_id)
    assert resp.status_code == 400
    assert "unverified" in resp.json()["detail"]


def test_target_must_not_be_anonymous(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-tgt")
    client.cookies.clear()
    client.post(
        f"/carpool/events/{event['id']}/posts",
        json=_rider_post(local_id="dev-other", display_name="Other Guest"),
    )
    client.cookies.clear()
    other_guest = next(m for m in _members(client, admin_headers, group_id) if m["name"] == "Other Guest")
    resp = _merge(client, admin_headers, group_id, guest["user_id"], other_guest["user_id"])
    assert resp.status_code == 400
    assert "real account" in resp.json()["detail"]


def test_cannot_merge_into_itself(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-self")
    resp = _merge(client, admin_headers, group_id, guest["user_id"], guest["user_id"])
    assert resp.status_code == 400


def test_target_must_be_in_this_group(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-out")
    _register_and_login(client, "mg-out-stranger@example.com", name="Stranger")
    # A real account in a different group only.
    stranger_headers = _register_and_login(client, "mg-out-stranger@example.com")
    _make_group(client, stranger_headers, name="Elsewhere")
    stranger_id = client.get("/auth/me", headers=stranger_headers).json()["id"]
    resp = _merge(client, admin_headers, group_id, guest["user_id"], stranger_id)
    assert resp.status_code == 404


def test_refuses_a_participant_who_belongs_to_another_group(client, db_session):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-xg")
    other_admin = _register_and_login(client, "mg-xg-other@example.com")
    other_group = _make_group(client, other_admin, name="Other choir")
    db_session.add(GroupMembership(group_id=other_group["id"], user_id=guest["user_id"], is_guest=True))
    db_session.commit()

    resp = _merge(client, admin_headers, group_id, guest["user_id"], real["user_id"])

    assert resp.status_code == 409
    assert "another group" in resp.json()["detail"]
    db_session.expire_all()
    assert db_session.get(User, guest["user_id"]) is not None
    assert db_session.get(CarpoolPost, post["id"]).user_id == guest["user_id"]


def test_unverified_admin_merge_keeps_admin_role_and_title(client, db_session):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-role")
    source_m = (
        db_session.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == guest["user_id"])
        .one()
    )
    source_m.role = GroupRole.admin
    source_m.title = "Alto 1"
    db_session.commit()

    resp = _merge(client, admin_headers, group_id, guest["user_id"], real["user_id"])

    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "admin"
    assert resp.json()["title"] == "Alto 1"


def test_target_keeps_its_own_title_and_higher_role(client, db_session):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-keep")
    client.put(f"/groups/{group_id}/members/{real['user_id']}/role", json={"role": "admin"}, headers=admin_headers)
    client.put(f"/groups/{group_id}/members/{real['user_id']}/title", json={"title": "Soprano 2"}, headers=admin_headers)
    source_m = (
        db_session.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id, GroupMembership.user_id == guest["user_id"])
        .one()
    )
    source_m.title = "Guest title"
    db_session.commit()

    resp = _merge(client, admin_headers, group_id, guest["user_id"], real["user_id"])

    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    assert resp.json()["title"] == "Soprano 2"


def test_source_not_in_group_404s(client):
    admin_headers, real_headers, group_id, event, post, guest, real = _setup(client, "mg-404")
    other_admin = _register_and_login(client, "mg-404-other@example.com")
    other_group = _make_group(client, other_admin, name="Other")
    resp = _merge(client, other_admin, other_group["id"], guest["user_id"], real["user_id"])
    assert resp.status_code == 404
