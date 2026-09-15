"""Carpool seat claims, rider interests, and contact-phone visibility coverage."""

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

def test_member_can_claim_a_seat(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl1")
    rider_headers = _register_and_login(client, "cp-cl1-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl1-rider@example.com")

    claimed = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert claimed.status_code == 201
    body = claimed.json()
    assert body["display_name"] == "Name"

    listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=driver_headers).json()
    post = next(p for p in listing if p["id"] == driver_post["id"])
    assert post["seats_available"] == 1
    assert len(post["claims"]) == 1
    assert post["claims"][0]["id"] == body["id"]


def test_double_claim_rejected(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl2")
    rider_headers = _register_and_login(client, "cp-cl2-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl2-rider@example.com")

    first = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert first.status_code == 201
    second = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert second.status_code == 400


def test_driver_cannot_claim_own_post(client):
    _admin_headers, driver_headers, _group, _event, driver_post = _setup_driver_post(client, "cp-cl11")

    rejected = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=driver_headers
    )
    assert rejected.status_code == 400


def test_claiming_a_full_post_rejected(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(
        client, "cp-cl3", seats_total=1
    )
    rider1 = _register_and_login(client, "cp-cl3-rider1@example.com")
    rider2 = _register_and_login(client, "cp-cl3-rider2@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl3-rider1@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl3-rider2@example.com")

    first = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider1)
    assert first.status_code == 201
    second = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider2)
    assert second.status_code == 400


def test_claiming_a_rider_post_rejected(client):
    admin_headers = _register_and_login(client, "cp-cl4-admin@example.com")
    member_headers = _register_and_login(client, "cp-cl4-member@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-cl4-member@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    ).json()

    rejected = client.post(
        "/carpool/posts/" + rider_post["id"] + "/claims", json={}, headers=member_headers
    )
    assert rejected.status_code == 400


def test_claiming_on_locked_event_rejected_for_non_admin(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl5")
    rider_headers = _register_and_login(client, "cp-cl5-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl5-rider@example.com")
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    rejected = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    )
    assert rejected.status_code == 409


def test_admin_can_claim_on_locked_event(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl6")
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    allowed = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=admin_headers
    )
    assert allowed.status_code == 201


def test_claimant_can_release_own_claim(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl7")
    rider_headers = _register_and_login(client, "cp-cl7-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl7-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    released = client.delete("/carpool/claims/" + claim["id"], headers=rider_headers)
    assert released.status_code == 204

    listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=driver_headers).json()
    post = next(p for p in listing if p["id"] == driver_post["id"])
    assert post["seats_available"] == 2
    assert post["claims"] == []

    # Released, not gone: a second release attempt reads as already-gone.
    assert client.delete("/carpool/claims/" + claim["id"], headers=rider_headers).status_code == 404


def test_driver_can_release_someone_elses_claim(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl8")
    rider_headers = _register_and_login(client, "cp-cl8-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl8-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    released = client.delete("/carpool/claims/" + claim["id"], headers=driver_headers)
    assert released.status_code == 204


def test_admin_can_release_any_claim(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl9")
    rider_headers = _register_and_login(client, "cp-cl9-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl9-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    released = client.delete("/carpool/claims/" + claim["id"], headers=admin_headers)
    assert released.status_code == 204


def test_unrelated_member_cannot_release_a_claim(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-cl10")
    rider_headers = _register_and_login(client, "cp-cl10-rider@example.com")
    other_headers = _register_and_login(client, "cp-cl10-other@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl10-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl10-other@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    forbidden = client.delete("/carpool/claims/" + claim["id"], headers=other_headers)
    assert forbidden.status_code == 403


def test_seats_total_cannot_drop_below_active_claims(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(
        client, "cp-cl11", seats_total=2
    )
    rider_headers = _register_and_login(client, "cp-cl11-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl11-rider@example.com")
    client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)

    rejected = client.patch(
        "/carpool/posts/" + driver_post["id"], json={"seats_total": 0}, headers=driver_headers
    )
    assert rejected.status_code == 400

    allowed = client.patch(
        "/carpool/posts/" + driver_post["id"], json={"seats_total": 1}, headers=driver_headers
    )
    assert allowed.status_code == 200
    assert allowed.json()["seats_available"] == 0


def test_guest_can_claim_and_release_a_seat(client):
    admin_headers = _register_and_login(client, "cp-cl12-admin@example.com")
    driver_headers = _register_and_login(client, "cp-cl12-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-cl12-driver@example.com")
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()
    driver_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_driver_post(), headers=driver_headers
    ).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    claimed = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims",
        json={"local_id": "dev-hana", "display_name": "Hana"},
    )
    assert claimed.status_code == 201
    claim = claimed.json()
    assert claim["display_name"] == "Hana"
    assert "divisi_participant" in claimed.headers.get("set-cookie", "")

    posts = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts").json()
    post = next(p for p in posts if p["id"] == driver_post["id"])
    assert post["seats_available"] == 2
    assert len(post["claims"]) == 1

    released = client.delete("/carpool/claims/" + claim["id"])
    assert released.status_code == 204

    posts_after = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
    ).json()
    post_after = next(p for p in posts_after if p["id"] == driver_post["id"])
    assert post_after["seats_available"] == 3
    assert post_after["claims"] == []

# --- B30: contact phone + rider interests ---------------------------------
# `contact_phone` is stored opt-in on `CarpoolPost` but only ever revealed
# (via `CarpoolPostOut.contact_phone`) to the post's own owner, a group
# admin, or a matched counterparty: a rider who claimed a driver's seat
# (`CarpoolSeatClaim`, B27), or a driver who expressed interest in a rider's
# post (`CarpoolRiderInterest`, new here). See `app.services.carpool.
# serialize_post` and plan.md's B30.


def test_contact_phone_round_trips_for_owner_on_driver_and_rider_posts(client):
    admin_headers = _register_and_login(client, "cp-ph1-admin@example.com")
    member_headers = _register_and_login(client, "cp-ph1-member@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ph1-member@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    driver = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(contact_phone="+1 415-555-0100"),
        headers=admin_headers,
    )
    assert driver.status_code == 201
    assert driver.json()["contact_phone"] == "+1 415-555-0100"

    rider = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(contact_phone="(415) 555-0101"),
        headers=member_headers,
    )
    assert rider.status_code == 201
    assert rider.json()["contact_phone"] == "(415) 555-0101"


def test_unmatched_member_never_sees_contact_phone(client):
    admin_headers = _register_and_login(client, "cp-ph2-admin@example.com")
    owner_headers = _register_and_login(client, "cp-ph2-owner@example.com")
    other_headers = _register_and_login(client, "cp-ph2-other@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ph2-owner@example.com")
    _add_member(client, admin_headers, group["id"], "cp-ph2-other@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    driver_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(contact_phone="415-555-0100"),
        headers=owner_headers,
    ).json()

    listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=other_headers).json()
    post = next(p for p in listing if p["id"] == driver_post["id"])
    assert post["contact_phone"] is None


def test_invalid_contact_phone_format_rejected(client):
    admin_headers = _register_and_login(client, "cp-ph3-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    rejected = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(contact_phone="call me maybe"),
        headers=admin_headers,
    )
    assert rejected.status_code == 422


def test_rider_who_claims_seat_sees_driver_contact_phone_but_others_dont(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-ph4")
    driver_post = client.patch(
        "/carpool/posts/" + driver_post["id"],
        json={"contact_phone": "415-555-0102"},
        headers=driver_headers,
    ).json()
    rider_headers = _register_and_login(client, "cp-ph4-rider@example.com")
    other_headers = _register_and_login(client, "cp-ph4-other@example.com")
    _add_member(client, admin_headers, group["id"], "cp-ph4-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-ph4-other@example.com")

    client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)

    rider_view = client.get("/carpool/events/" + event["id"] + "/posts", headers=rider_headers).json()
    post = next(p for p in rider_view if p["id"] == driver_post["id"])
    assert post["contact_phone"] == "415-555-0102"

    other_view = client.get("/carpool/events/" + event["id"] + "/posts", headers=other_headers).json()
    post_other = next(p for p in other_view if p["id"] == driver_post["id"])
    assert post_other["contact_phone"] is None


def test_admin_always_sees_contact_phone(client):
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-ph5")
    client.patch(
        "/carpool/posts/" + driver_post["id"],
        json={"contact_phone": "415-555-0103"},
        headers=driver_headers,
    )

    listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=admin_headers).json()
    post = next(p for p in listing if p["id"] == driver_post["id"])
    assert post["contact_phone"] == "415-555-0103"


def test_rider_cannot_express_interest_in_own_post(client):
    admin_headers = _register_and_login(client, "cp-in1-admin@example.com")
    rider_headers = _register_and_login(client, "cp-in1-rider@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-in1-rider@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=rider_headers
    ).json()

    rejected = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=rider_headers
    )
    assert rejected.status_code == 400


def test_driver_expresses_interest_sees_rider_phone_then_releases(client):
    admin_headers = _register_and_login(client, "cp-in2-admin@example.com")
    rider_headers = _register_and_login(client, "cp-in2-rider@example.com")
    driver_headers = _register_and_login(client, "cp-in2-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-in2-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-in2-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(contact_phone="415-555-0104"),
        headers=rider_headers,
    ).json()

    interested = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=driver_headers
    )
    assert interested.status_code == 201
    interest = interested.json()
    assert interest["display_name"] == "Name"

    listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=driver_headers).json()
    post = next(p for p in listing if p["id"] == rider_post["id"])
    assert post["contact_phone"] == "415-555-0104"
    assert len(post["interests"]) == 1
    assert post["interests"][0]["id"] == interest["id"]

    released = client.delete("/carpool/interests/" + interest["id"], headers=driver_headers)
    assert released.status_code == 204

    listing_after = client.get("/carpool/events/" + event["id"] + "/posts", headers=driver_headers).json()
    post_after = next(p for p in listing_after if p["id"] == rider_post["id"])
    assert post_after["contact_phone"] is None
    assert post_after["interests"] == []


def test_double_interest_rejected(client):
    admin_headers = _register_and_login(client, "cp-in3-admin@example.com")
    rider_headers = _register_and_login(client, "cp-in3-rider@example.com")
    driver_headers = _register_and_login(client, "cp-in3-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-in3-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-in3-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=rider_headers
    ).json()

    first = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=driver_headers
    )
    assert first.status_code == 201
    second = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=driver_headers
    )
    assert second.status_code == 400


def test_interest_on_locked_event_rejected_for_non_admin(client):
    admin_headers = _register_and_login(client, "cp-in4-admin@example.com")
    rider_headers = _register_and_login(client, "cp-in4-rider@example.com")
    driver_headers = _register_and_login(client, "cp-in4-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-in4-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-in4-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=rider_headers
    ).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    rejected = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests", json={}, headers=driver_headers
    )
    assert rejected.status_code == 409


def test_claiming_a_driver_post_as_interest_rejected(client):
    """The kind check on `create_interest` mirrors `create_claim`'s own
    kind check in reverse: a driver post can be claimed but not
    "interested in"."""
    admin_headers, driver_headers, group, event, driver_post = _setup_driver_post(client, "cp-in5")
    other_headers = _register_and_login(client, "cp-in5-other@example.com")
    _add_member(client, admin_headers, group["id"], "cp-in5-other@example.com")

    rejected = client.post(
        "/carpool/posts/" + driver_post["id"] + "/interests", json={}, headers=other_headers
    )
    assert rejected.status_code == 400


def test_guest_driver_phone_revealed_only_after_guest_claims_seat(client):
    """Guest-side mirror of `test_rider_who_claims_seat_sees_driver_contact_phone_but_others_dont`,
    established the same way `test_guest_can_claim_and_release_a_seat` establishes
    an anonymous participant: via `local_id`/`display_name` on the claim
    payload, then reading back through the guest listing route with that
    participant's cookie forwarded (see `list_guest_carpool_posts`)."""
    admin_headers = _register_and_login(client, "cp-gph1-admin@example.com")
    driver_headers = _register_and_login(client, "cp-gph1-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-gph1-driver@example.com")
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()
    driver_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(contact_phone="415-555-0199"),
        headers=driver_headers,
    ).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    claimed = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims",
        json={"local_id": "dev-ida", "display_name": "Ida"},
    )
    assert claimed.status_code == 201
    # The claim response set a `divisi_participant` cookie identifying Ida;
    # the guest listing route (with `get_optional_participant`) picks that
    # cookie straight off this same client, same as any browser session.
    posts = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts").json()
    post = next(p for p in posts if p["id"] == driver_post["id"])
    assert post["contact_phone"] == "415-555-0199"

    # A brand-new, cookie-less guest sees nothing.
    client.cookies.clear()
    posts_unmatched = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
    ).json()
    post_unmatched = next(p for p in posts_unmatched if p["id"] == driver_post["id"])
    assert post_unmatched["contact_phone"] is None


def test_guest_rider_phone_revealed_only_after_guest_driver_expresses_interest(client):
    admin_headers = _register_and_login(client, "cp-gph2-admin@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()

    client.base_url = "https://testserver"
    client.cookies.clear()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(contact_phone="415-555-0200", local_id="dev-jo", display_name="Jo"),
    ).json()

    client.cookies.clear()
    interested = client.post(
        "/carpool/posts/" + rider_post["id"] + "/interests",
        json={"local_id": "dev-kai", "display_name": "Kai"},
    )
    assert interested.status_code == 201

    posts = client.get("/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts").json()
    post = next(p for p in posts if p["id"] == rider_post["id"])
    assert post["contact_phone"] == "415-555-0200"

    # A brand-new, cookie-less guest (neither Jo nor Kai) sees nothing.
    client.cookies.clear()
    posts_unmatched = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
    ).json()
    post_unmatched = next(p for p in posts_unmatched if p["id"] == rider_post["id"])
    assert post_unmatched["contact_phone"] is None
