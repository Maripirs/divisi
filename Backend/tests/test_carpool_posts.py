"""Carpool post CRUD, moderation, lock, and guest-access coverage."""

from tests.carpool_helpers import (
    _add_member,
    _driver_post,
    _make_event,
    _make_group,
    _register_and_login,
    _rider_post,
    _set_carpool_page_settings,
    _setup_driver_post,
)

def test_member_can_create_driver_and_rider_posts(client):
    admin_headers = _register_and_login(client, "cp-post-admin1@example.com")
    member_headers = _register_and_login(client, "cp-post-member1@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member1@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    driver = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_driver_post(), headers=admin_headers
    )
    assert driver.status_code == 201
    body = driver.json()
    assert body["kind"] == "driver"
    assert body["seats_total"] == 3
    assert body["seats_available"] == 3  # computed: no claims yet
    assert body["claims"] == []
    assert body["status"] == "open"

    rider = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    )
    assert rider.status_code == 201
    assert rider.json()["kind"] == "rider"
    assert rider.json()["seats_total"] is None
    assert rider.json()["seats_available"] is None
    assert rider.json()["claims"] == []


def test_driver_post_requires_seats(client):
    admin_headers = _register_and_login(client, "cp-post-admin2@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    missing_seats = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json={"kind": "driver", "origin_label": "Mission"},
        headers=admin_headers,
    )
    assert missing_seats.status_code == 422


def test_rider_post_rejects_seat_fields(client):
    admin_headers = _register_and_login(client, "cp-post-admin3@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    bad = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(seats_total=2),
        headers=admin_headers,
    )
    assert bad.status_code == 422


def test_member_can_edit_and_delete_own_post(client):
    admin_headers = _register_and_login(client, "cp-post-admin4@example.com")
    member_headers = _register_and_login(client, "cp-post-member4@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member4@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()

    edited = client.patch(
        "/carpool/posts/" + post["id"], json={"notes": "Flexible on time"}, headers=member_headers
    )
    assert edited.status_code == 200
    assert edited.json()["notes"] == "Flexible on time"

    deleted = client.delete("/carpool/posts/" + post["id"], headers=member_headers)
    assert deleted.status_code == 204


def test_member_cannot_edit_or_delete_others_post(client):
    admin_headers = _register_and_login(client, "cp-post-admin5@example.com")
    owner_headers = _register_and_login(client, "cp-post-owner5@example.com")
    other_headers = _register_and_login(client, "cp-post-other5@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-owner5@example.com")
    _add_member(client, admin_headers, group["id"], "cp-post-other5@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=owner_headers
    ).json()

    forbidden_edit = client.patch(
        "/carpool/posts/" + post["id"], json={"notes": "Not mine"}, headers=other_headers
    )
    assert forbidden_edit.status_code == 403

    forbidden_delete = client.delete("/carpool/posts/" + post["id"], headers=other_headers)
    assert forbidden_delete.status_code == 403


def test_deleting_a_driver_post_with_an_active_claim_succeeds(client):
    # Regression: `driver_post_id` has no ON DELETE CASCADE, and
    # CarpoolSeatClaim is soft-removed, never hard-deleted -- an
    # unhandled IntegrityError (500) instead of a clean delete was the
    # real live bug.
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-del-driver")
    rider_headers = _register_and_login(client, "cp-del-driver-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-del-driver-rider@example.com")
    claimed = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert claimed.status_code == 201

    deleted = client.delete("/carpool/posts/" + driver_post["id"], headers=driver_headers)
    assert deleted.status_code == 204


def test_deleting_a_driver_post_with_a_released_claim_succeeds(client):
    # A *released* (soft-removed) claim's row still physically references
    # the post -- same FK hazard as an active claim.
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-del-released")
    rider_headers = _register_and_login(client, "cp-del-released-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-del-released-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()
    released = client.delete("/carpool/claims/" + claim["id"], headers=rider_headers)
    assert released.status_code == 204

    deleted = client.delete("/carpool/posts/" + driver_post["id"], headers=driver_headers)
    assert deleted.status_code == 204


def test_deleting_a_rider_post_with_an_active_interest_succeeds(client):
    admin_headers = _register_and_login(client, "cp-del-rider-admin@example.com")
    rider_owner_headers = _register_and_login(client, "cp-del-rider-owner@example.com")
    driver_headers = _register_and_login(client, "cp-del-rider-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-del-rider-owner@example.com")
    _add_member(client, admin_headers, group["id"], "cp-del-rider-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=rider_owner_headers
    ).json()
    interested = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=driver_headers
    )
    assert interested.status_code == 201

    deleted = client.delete("/carpool/posts/" + rider_post["id"], headers=rider_owner_headers)
    assert deleted.status_code == 204


def test_member_cannot_set_own_post_status(client):
    admin_headers = _register_and_login(client, "cp-post-admin6@example.com")
    member_headers = _register_and_login(client, "cp-post-member6@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member6@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()

    forbidden = client.patch(
        "/carpool/posts/" + post["id"], json={"status": "hidden"}, headers=member_headers
    )
    assert forbidden.status_code == 403


def test_admin_can_hide_and_delete_any_post(client):
    admin_headers = _register_and_login(client, "cp-post-admin7@example.com")
    member_headers = _register_and_login(client, "cp-post-member7@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member7@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()

    hidden = client.patch(
        "/carpool/posts/" + post["id"], json={"status": "hidden"}, headers=admin_headers
    )
    assert hidden.status_code == 200
    assert hidden.json()["status"] == "hidden"

    deleted = client.delete("/carpool/posts/" + post["id"], headers=admin_headers)
    assert deleted.status_code == 204


def test_list_posts_hides_non_open_from_members_but_not_admin(client):
    admin_headers = _register_and_login(client, "cp-post-admin8@example.com")
    member_headers = _register_and_login(client, "cp-post-member8@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member8@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()
    client.patch("/carpool/posts/" + post["id"], json={"status": "hidden"}, headers=admin_headers)

    member_view = client.get("/carpool/events/" + event["id"] + "/posts", headers=member_headers)
    assert member_view.status_code == 200
    assert member_view.json() == []

    admin_view = client.get("/carpool/events/" + event["id"] + "/posts", headers=admin_headers)
    assert admin_view.status_code == 200
    assert len(admin_view.json()) == 1


def test_locked_event_rejects_new_post(client):
    admin_headers = _register_and_login(client, "cp-lock-admin1@example.com")
    member_headers = _register_and_login(client, "cp-lock-member1@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-lock-member1@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    rejected = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    )
    assert rejected.status_code == 409


def test_archived_event_rejects_new_post(client):
    admin_headers = _register_and_login(client, "cp-lock-admin2@example.com")
    member_headers = _register_and_login(client, "cp-lock-member2@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-lock-member2@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "archived"}, headers=admin_headers)

    rejected = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    )
    assert rejected.status_code == 409


def test_locked_event_rejects_post_edit_but_allows_delete(client):
    admin_headers = _register_and_login(client, "cp-lock-admin3@example.com")
    member_headers = _register_and_login(client, "cp-lock-member3@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-lock-member3@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    edit_rejected = client.patch(
        "/carpool/posts/" + post["id"], json={"notes": "too late"}, headers=member_headers
    )
    assert edit_rejected.status_code == 409

    # Withdrawing your own post is still allowed: a member shouldn't be
    # stuck with a stale post just because an admin locked the event.
    delete_ok = client.delete("/carpool/posts/" + post["id"], headers=member_headers)
    assert delete_ok.status_code == 204


def test_admin_bypasses_locked_event_when_posting(client):
    admin_headers = _register_and_login(client, "cp-lock-admin4@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    allowed = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    )
    assert allowed.status_code == 201

def test_guest_can_list_carpool_events_and_posts(client):
    admin_headers = _register_and_login(client, "cp-g-admin2@example.com")
    member_headers = _register_and_login(client, "cp-g-member2@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-g-member2@example.com")
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()

    events = client.get("/guest/" + group["join_code"] + "/carpool/events")
    assert events.status_code == 200
    # B26: the standing event rides along in every listing now; check the
    # dated event specifically rather than the raw list.
    dated_events = [e for e in events.json() if not e["is_standing"]]
    assert [e["id"] for e in dated_events] == [event["id"]]

    posts = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts")
    assert posts.status_code == 200
    assert [p["id"] for p in posts.json()] == [post["id"]]


def test_guest_post_list_hides_non_open_posts(client):
    admin_headers = _register_and_login(client, "cp-g-admin3@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    ).json()
    client.patch("/carpool/posts/" + post["id"], json={"status": "hidden"}, headers=admin_headers)

    posts = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts")
    assert posts.status_code == 200
    assert posts.json() == []


def test_guest_carpool_routes_404_for_members_audience_page(client):
    admin_headers = _register_and_login(client, "cp-g-admin4@example.com")
    group = _make_group(client, admin_headers)
    # Members-only audience is already the default for a fresh group.
    event = _make_event(client, admin_headers, group["id"]).json()

    assert client.get("/guest/" + group["join_code"] + "/carpool/events").status_code == 404
    assert (
        client.get(
            "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
        ).status_code
        == 404
    )


def test_guest_self_post_mints_participant_and_sets_cookie(client):
    admin_headers = _register_and_login(client, "cp-g-admin5@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()

    # The backend sets the participant cookie `Secure`, only round-tripped
    # by the TestClient over https.
    client.base_url = "https://testserver"
    client.cookies.clear()
    resp = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-alex", display_name="Alex"),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["display_name"] == "Alex"
    assert "divisi_participant" in resp.headers.get("set-cookie", "")

    members = client.get("/groups/" + group["id"] + "/members", headers=admin_headers).json()
    anon = [m for m in members if m["is_anonymous"]]
    assert len(anon) == 1
    assert anon[0]["name"] == "Alex"


def test_second_guest_post_from_same_client_reuses_participant(client):
    admin_headers = _register_and_login(client, "cp-g-admin6@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event1 = _make_event(client, admin_headers, group["id"], title="Event 1").json()
    event2 = _make_event(client, admin_headers, group["id"], title="Event 2").json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    first = client.post(
        "/carpool/events/" + event1["id"] + "/posts",
        json=_rider_post(local_id="dev-bo", display_name="Bo"),
    )
    assert first.status_code == 201
    # The cookie now identifies the same participant; no local_id/display_name needed.
    second = client.post("/carpool/events/" + event2["id"] + "/posts", json=_rider_post())
    assert second.status_code == 201
    assert second.json()["user_id"] == first.json()["user_id"]

    members = client.get("/groups/" + group["id"] + "/members", headers=admin_headers).json()
    assert sum(1 for m in members if m["is_anonymous"]) == 1


def test_guest_post_reuses_via_local_id_when_cookie_is_gone(client):
    admin_headers = _register_and_login(client, "cp-g-admin7@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event1 = _make_event(client, admin_headers, group["id"], title="Event 1").json()
    event2 = _make_event(client, admin_headers, group["id"], title="Event 2").json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    first = client.post(
        "/carpool/events/" + event1["id"] + "/posts",
        json=_rider_post(local_id="dev-cy", display_name="Cy"),
    )
    assert first.status_code == 201

    client.cookies.clear()  # cookie lost, localStorage (local_id) survives
    second = client.post(
        "/carpool/events/" + event2["id"] + "/posts",
        json=_rider_post(local_id="dev-cy"),
    )
    assert second.status_code == 201
    assert second.json()["user_id"] == first.json()["user_id"]


def test_min_identity_saved_blocks_anonymous_post_but_not_member_or_read(client):
    admin_headers = _register_and_login(client, "cp-g-admin8@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(
        client, admin_headers, group["id"], audience="everyone", min_identity="saved"
    )
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    blocked = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-dee", display_name="Dee"),
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"].startswith("SAVE_REQUIRED")

    member_headers = _register_and_login(client, "cp-g-member8@example.com")
    _add_member(client, admin_headers, group["id"], "cp-g-member8@example.com")
    ok = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    )
    assert ok.status_code == 201

    reads = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts")
    assert reads.status_code == 200


def test_members_audience_page_gives_anonymous_post_a_404(client):
    admin_headers = _register_and_login(client, "cp-g-admin9@example.com")
    group = _make_group(client, admin_headers)
    # Members-only audience is already the default for a fresh group.
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    blocked = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-el", display_name="El"),
    )
    assert blocked.status_code == 404

    member_headers = _register_and_login(client, "cp-g-member9@example.com")
    _add_member(client, admin_headers, group["id"], "cp-g-member9@example.com")
    ok = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    )
    assert ok.status_code == 201


def test_guest_owner_can_edit_and_delete_own_post(client):
    admin_headers = _register_and_login(client, "cp-g-admin10@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-fi", display_name="Fi"),
    ).json()

    edited = client.patch("/carpool/posts/" + post["id"], json={"notes": "Flexible on time"})
    assert edited.status_code == 200
    assert edited.json()["notes"] == "Flexible on time"

    deleted = client.delete("/carpool/posts/" + post["id"])
    assert deleted.status_code == 204


def test_guest_cannot_edit_or_delete_another_guests_post(client):
    admin_headers = _register_and_login(client, "cp-g-admin11@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-owner", display_name="Owner"),
    ).json()

    # A different device (no cookie, unrelated local_id) can't touch it.
    client.cookies.clear()
    other_local_id_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-other", display_name="Other"),
    )
    assert other_local_id_post.status_code == 201

    forbidden_edit = client.patch("/carpool/posts/" + post["id"], json={"notes": "Not mine"})
    assert forbidden_edit.status_code == 403
    forbidden_delete = client.delete("/carpool/posts/" + post["id"])
    assert forbidden_delete.status_code == 403


def test_no_actor_resolves_gives_401_on_edit_or_delete(client):
    admin_headers = _register_and_login(client, "cp-g-admin12@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    ).json()

    # No bearer token, no participant cookie, no local_id: nobody at all.
    client.base_url = "https://testserver"
    client.cookies.clear()
    unauthed_edit = client.patch("/carpool/posts/" + post["id"], json={"notes": "anyone?"})
    assert unauthed_edit.status_code == 401
    unauthed_delete = client.delete("/carpool/posts/" + post["id"])
    assert unauthed_delete.status_code == 401


def test_admin_can_moderate_a_guests_post(client):
    admin_headers = _register_and_login(client, "cp-g-admin13@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(local_id="dev-gg", display_name="Gigi"),
    ).json()

    hidden = client.patch(
        "/carpool/posts/" + post["id"], json={"status": "hidden"}, headers=admin_headers
    )
    assert hidden.status_code == 200
    assert hidden.json()["status"] == "hidden"

    deleted = client.delete("/carpool/posts/" + post["id"], headers=admin_headers)
    assert deleted.status_code == 204
