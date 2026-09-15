"""Carpool destination/origin coordinate and privacy-rounding coverage."""

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

# --- B29: map pins -------------------------------------------------------
# Event destination coordinates are never rounded (a venue address isn't
# privacy-sensitive); post origin coordinates default to `approximate` and
# get server-side rounded to 2 decimal places, regardless of what a client
# claims, since that's a real person's home. See `app/services/carpool.
# resolve_origin_coordinates` and plan.md's B29.


def test_event_destination_coordinates_round_trip(client):
    admin_headers = _register_and_login(client, "cp-map1-admin@example.com")
    group = _make_group(client, admin_headers)

    created = _make_event(
        client,
        admin_headers,
        group["id"],
        destination_latitude=37.774900,
        destination_longitude=-122.419400,
        destination_place_id="ChIJIQBpAG2ahYAR_6128GcTUEo",
    )
    assert created.status_code == 201
    body = created.json()
    # Never rounded, unlike a post's origin.
    assert body["destination_latitude"] == 37.774900
    assert body["destination_longitude"] == -122.419400
    assert body["destination_place_id"] == "ChIJIQBpAG2ahYAR_6128GcTUEo"


def test_event_destination_coordinate_out_of_range_rejected(client):
    admin_headers = _register_and_login(client, "cp-map2-admin@example.com")
    group = _make_group(client, admin_headers)

    rejected = _make_event(
        client, admin_headers, group["id"], destination_latitude=95.0, destination_longitude=0.0
    )
    assert rejected.status_code == 422


def test_event_destination_coordinate_half_set_rejected(client):
    admin_headers = _register_and_login(client, "cp-map3-admin@example.com")
    group = _make_group(client, admin_headers)

    rejected = _make_event(client, admin_headers, group["id"], destination_latitude=37.7)
    assert rejected.status_code == 422


def test_event_destination_coordinates_patchable(client):
    admin_headers = _register_and_login(client, "cp-map4-admin@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    patched = client.patch(
        "/carpool/events/" + event["id"],
        json={"destination_latitude": 40.0, "destination_longitude": -73.9},
        headers=admin_headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["destination_latitude"] == 40.0
    assert body["destination_longitude"] == -73.9


def test_post_origin_approximate_is_the_default_and_rounds_server_side(client):
    admin_headers = _register_and_login(client, "cp-map5-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map5-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map5-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    # A client claims nothing about precision at all; the server still
    # rounds, and reports `approximate` back, not whatever exact value was
    # sent.
    created = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(origin_latitude=37.774912345, origin_longitude=-122.419415678),
        headers=driver_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["origin_precision"] == "approximate"
    assert body["origin_latitude"] == 37.77
    assert body["origin_longitude"] == -122.42


def test_post_origin_approximate_rounds_even_if_client_claims_it_already_did(client):
    """A buggy or malicious client could send exact coordinates while
    setting precision to `approximate`. The server must not trust that."""
    admin_headers = _register_and_login(client, "cp-map6-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map6-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map6-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    created = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(
            origin_latitude=37.774912345,
            origin_longitude=-122.419415678,
            origin_precision="approximate",
        ),
        headers=driver_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["origin_latitude"] == 37.77
    assert body["origin_longitude"] == -122.42


def test_post_origin_exact_precision_is_not_rounded(client):
    admin_headers = _register_and_login(client, "cp-map7-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map7-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map7-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    created = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(
            origin_latitude=37.774912345,
            origin_longitude=-122.419415678,
            origin_precision="exact",
        ),
        headers=driver_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["origin_precision"] == "exact"
    assert body["origin_latitude"] == 37.774912345
    assert body["origin_longitude"] == -122.419415678


def test_post_origin_coordinate_out_of_range_rejected(client):
    admin_headers = _register_and_login(client, "cp-map8-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map8-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map8-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    rejected = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(origin_latitude=10.0, origin_longitude=200.0),
        headers=driver_headers,
    )
    assert rejected.status_code == 422


def test_post_origin_coordinate_half_set_rejected(client):
    admin_headers = _register_and_login(client, "cp-map9-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map9-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map9-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    rejected = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(origin_longitude=-122.4),
        headers=driver_headers,
    )
    assert rejected.status_code == 422


def test_post_origin_coordinates_patchable_and_re_round(client):
    admin_headers = _register_and_login(client, "cp-map10-admin@example.com")
    driver_headers = _register_and_login(client, "cp-map10-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-map10-driver@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_driver_post(), headers=driver_headers
    ).json()
    assert post["origin_latitude"] is None
    assert post["origin_precision"] is None

    patched = client.patch(
        "/carpool/posts/" + post["id"],
        json={"origin_latitude": 34.052235123, "origin_longitude": -118.243683456},
        headers=driver_headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["origin_precision"] == "approximate"
    assert body["origin_latitude"] == 34.05
    assert body["origin_longitude"] == -118.24
