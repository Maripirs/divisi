"""Carpool post direction filtering coverage."""

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

# --- B32: carpool post direction (there / back / round_trip) -------------


def test_post_direction_defaults_to_round_trip(client):
    admin_headers = _register_and_login(client, "cp-dir1-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    created = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    )
    assert created.status_code == 201
    assert created.json()["direction"] == "round_trip"


def test_post_direction_round_trips_through_create_and_read(client):
    admin_headers = _register_and_login(client, "cp-dir2-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    for direction in ("there", "back", "round_trip"):
        created = client.post(
            "/carpool/events/" + event["id"] + "/posts",
            json=_rider_post(direction=direction),
            headers=admin_headers,
        )
        assert created.status_code == 201
        post_id = created.json()["id"]
        assert created.json()["direction"] == direction

        listing = client.get("/carpool/events/" + event["id"] + "/posts", headers=admin_headers).json()
        post = next(p for p in listing if p["id"] == post_id)
        assert post["direction"] == direction


def test_post_direction_is_patchable(client):
    admin_headers = _register_and_login(client, "cp-dir3-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(direction="there"), headers=admin_headers
    ).json()

    patched = client.patch(
        "/carpool/posts/" + post["id"], json={"direction": "back"}, headers=admin_headers
    )
    assert patched.status_code == 200
    assert patched.json()["direction"] == "back"


def test_member_post_list_direction_filter(client):
    admin_headers = _register_and_login(client, "cp-dir4-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()
    there_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="A", direction="there"),
        headers=admin_headers,
    ).json()
    back_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="B", direction="back"),
        headers=admin_headers,
    ).json()
    round_trip_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="C", direction="round_trip"),
        headers=admin_headers,
    ).json()

    there_view = client.get(
        "/carpool/events/" + event["id"] + "/posts", params={"direction": "there"}, headers=admin_headers
    ).json()
    assert {p["id"] for p in there_view} == {there_post["id"], round_trip_post["id"]}

    back_view = client.get(
        "/carpool/events/" + event["id"] + "/posts", params={"direction": "back"}, headers=admin_headers
    ).json()
    assert {p["id"] for p in back_view} == {back_post["id"], round_trip_post["id"]}

    unfiltered_view = client.get(
        "/carpool/events/" + event["id"] + "/posts", headers=admin_headers
    ).json()
    assert {p["id"] for p in unfiltered_view} == {there_post["id"], back_post["id"], round_trip_post["id"]}


def test_guest_post_list_direction_filter(client):
    admin_headers = _register_and_login(client, "cp-dir5-admin@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"]).json()
    there_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="A", direction="there"),
        headers=admin_headers,
    ).json()
    back_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="B", direction="back"),
        headers=admin_headers,
    ).json()
    round_trip_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_rider_post(origin_label="C", direction="round_trip"),
        headers=admin_headers,
    ).json()

    there_view = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts",
        params={"direction": "there"},
    ).json()
    assert {p["id"] for p in there_view} == {there_post["id"], round_trip_post["id"]}

    back_view = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts",
        params={"direction": "back"},
    ).json()
    assert {p["id"] for p in back_view} == {back_post["id"], round_trip_post["id"]}

    unfiltered_view = client.get(
        "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
    ).json()
    assert {p["id"] for p in unfiltered_view} == {
        there_post["id"],
        back_post["id"],
        round_trip_post["id"],
    }
