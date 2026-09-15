"""Carpool event, standing-event, and built-in-page migration coverage."""

from app.services.pages import resolve_carpool_page_settings_from_custom_pages

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

def test_admin_can_create_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin1@example.com")
    group = _make_group(client, admin_headers)

    created = _make_event(client, admin_headers, group["id"])
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Sep 16 rehearsal"
    assert body["destination_label"] == "SFCC rehearsal hall"
    assert body["status"] == "open"
    assert body["group_id"] == group["id"]


def test_member_cannot_create_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin2@example.com")
    member_headers = _register_and_login(client, "cp-ev-member2@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member2@example.com")

    forbidden = _make_event(client, member_headers, group["id"])
    assert forbidden.status_code == 403


def test_member_can_list_published_events(client):
    admin_headers = _register_and_login(client, "cp-ev-admin4@example.com")
    member_headers = _register_and_login(client, "cp-ev-member4@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member4@example.com")
    _make_event(client, admin_headers, group["id"])

    listing = client.get("/groups/" + group["id"] + "/carpool/events", headers=member_headers)
    assert listing.status_code == 200
    # B26: every listing also carries the group's standing event now, so this
    # checks the dated event specifically rather than the raw list length.
    dated = [e for e in listing.json() if not e["is_standing"]]
    assert len(dated) == 1


def test_member_cannot_list_events_when_carpool_disabled(client):
    admin_headers = _register_and_login(client, "cp-ev-admin5@example.com")
    member_headers = _register_and_login(client, "cp-ev-member5@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member5@example.com")
    _set_carpool_page_settings(client, admin_headers, group["id"], enabled=False)

    listing = client.get("/groups/" + group["id"] + "/carpool/events", headers=member_headers)
    assert listing.status_code == 403


def test_admin_can_edit_lock_and_archive_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin6@example.com")
    group = _make_group(client, admin_headers)
    event = _make_event(client, admin_headers, group["id"]).json()

    edited = client.patch(
        "/carpool/events/" + event["id"], json={"title": "Renamed rehearsal"}, headers=admin_headers
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Renamed rehearsal"

    locked = client.patch(
        "/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers
    )
    assert locked.status_code == 200
    assert locked.json()["status"] == "locked"

    archived = client.patch(
        "/carpool/events/" + event["id"], json={"status": "archived"}, headers=admin_headers
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_member_cannot_edit_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin7@example.com")
    member_headers = _register_and_login(client, "cp-ev-member7@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member7@example.com")
    event = _make_event(client, admin_headers, group["id"]).json()

    forbidden = client.patch(
        "/carpool/events/" + event["id"], json={"title": "Hijacked"}, headers=member_headers
    )
    assert forbidden.status_code == 403

def test_unknown_group_404s(client):
    admin_headers = _register_and_login(client, "cp-xg-admin2@example.com")
    assert _make_event(client, admin_headers, "does-not-exist").status_code == 404


# --- B25: guest carpool access (read + write via anonymous participants) ---


def test_guest_tabs_reports_visibility_including_carpool(client):
    """Guest fast-follow (2026-09-12), repurposed for B31: one call instead
    of several `list_guest_homework`/`list_guest_weekly_notes`/
    `list_guest_responsibility_dates` calls `pages/[slug]/+page.server.ts`
    used to make just to learn these booleans, which was tripping
    `rate_limit_guest` during ordinary tab-to-tab navigation. B31 dropped
    the `custom_pages` field this test used to also assert on; carpool
    joined the boolean flags instead."""
    admin_headers = _register_and_login(client, "cp-tabs-admin1@example.com")
    group = _make_group(client, admin_headers)
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "homework", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")

    tabs = client.get("/guest/" + group["join_code"] + "/tabs")
    assert tabs.status_code == 200
    body = tabs.json()
    assert body["group_name"] == group["name"]
    assert body["homework_visible"] is True
    # weekly_notes/responsibilities default to members-only audience (B12),
    # so a plain join code with no page-settings override sees neither.
    assert body["weekly_notes_visible"] is False
    assert body["responsibilities_visible"] is False
    assert body["carpool_visible"] is True
    # about defaults to members-only audience (B12) same as the others.
    assert body["about_visible"] is False


def test_guest_tabs_unknown_join_code_404s(client):
    assert client.get("/guest/NOTAREAL/tabs").status_code == 404

# --- B26: standing (non-dated) carpool event ---


def test_first_listing_bootstraps_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin1@example.com")
    group = _make_group(client, admin_headers)

    listing = client.get("/groups/" + group["id"] + "/carpool/events", headers=admin_headers).json()
    assert len(listing) == 1
    standing = listing[0]
    assert standing["is_standing"] is True
    assert standing["starts_at"] is None
    assert standing["destination_label"] is None
    assert standing["title"]  # some sensible default, exact string not asserted


def test_second_listing_reuses_same_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin2@example.com")
    group = _make_group(client, admin_headers)

    first = client.get("/groups/" + group["id"] + "/carpool/events", headers=admin_headers).json()
    second = client.get("/groups/" + group["id"] + "/carpool/events", headers=admin_headers).json()
    assert len(second) == 1
    assert second[0]["id"] == first[0]["id"]


def test_guest_listing_bootstraps_and_reuses_same_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin3@example.com")
    group = _make_group(client, admin_headers)
    _set_carpool_page_settings(client, admin_headers, group["id"], audience="everyone")

    first = client.get("/guest/" + group["join_code"] + "/carpool/events").json()
    assert len(first) == 1
    assert first[0]["is_standing"] is True

    second = client.get("/guest/" + group["join_code"] + "/carpool/events").json()
    assert len(second) == 1
    assert second[0]["id"] == first[0]["id"]

    # The member route's bootstrap and the guest route's bootstrap must be
    # the exact same row, not two independent standing events.
    member_view = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()
    assert len(member_view) == 1
    assert member_view[0]["id"] == first[0]["id"]


def test_listing_orders_standing_first_then_dated_by_starts_at(client):
    admin_headers = _register_and_login(client, "cp-st-admin4@example.com")
    group = _make_group(client, admin_headers)

    later = _make_event(
        client, admin_headers, group["id"], title="Later", starts_at="2026-10-01T18:00:00Z"
    ).json()
    earlier = _make_event(
        client, admin_headers, group["id"], title="Earlier", starts_at="2026-09-20T18:00:00Z"
    ).json()

    listing = client.get("/groups/" + group["id"] + "/carpool/events", headers=admin_headers).json()
    assert [e["is_standing"] for e in listing] == [True, False, False]
    assert [e["id"] for e in listing[1:]] == [earlier["id"], later["id"]]


def test_standing_event_cannot_be_archived(client):
    admin_headers = _register_and_login(client, "cp-st-admin5@example.com")
    group = _make_group(client, admin_headers)
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    rejected = client.patch(
        "/carpool/events/" + standing["id"], json={"status": "archived"}, headers=admin_headers
    )
    assert rejected.status_code == 400


def test_member_cannot_edit_standing_event(client):
    """Same `require_admin` gate as `test_member_cannot_edit_event`, exercised
    against the standing event specifically: `update_event` checks admin
    status before it ever looks at `is_standing`, so a member is blocked here
    too rather than the standing row getting a carve-out by accident."""
    admin_headers = _register_and_login(client, "cp-st-member1-admin@example.com")
    member_headers = _register_and_login(client, "cp-st-member1@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-st-member1@example.com")
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=member_headers
    ).json()[0]

    forbidden = client.patch(
        "/carpool/events/" + standing["id"], json={"title": "Hijacked"}, headers=member_headers
    )
    assert forbidden.status_code == 403


def test_standing_event_can_be_locked_and_reopened(client):
    admin_headers = _register_and_login(client, "cp-st-admin6@example.com")
    group = _make_group(client, admin_headers)
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    locked = client.patch(
        "/carpool/events/" + standing["id"], json={"status": "locked"}, headers=admin_headers
    )
    assert locked.status_code == 200
    assert locked.json()["status"] == "locked"

    reopened = client.patch(
        "/carpool/events/" + standing["id"], json={"status": "open"}, headers=admin_headers
    )
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "open"


def test_standing_event_title_and_destination_are_editable(client):
    admin_headers = _register_and_login(client, "cp-st-admin7@example.com")
    group = _make_group(client, admin_headers)
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    edited = client.patch(
        "/carpool/events/" + standing["id"],
        json={"title": "Weekly rehearsal carpool", "destination_label": "SFCC rehearsal hall"},
        headers=admin_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Weekly rehearsal carpool"
    assert edited.json()["destination_label"] == "SFCC rehearsal hall"


def test_standing_event_rejects_starts_at_patch(client):
    admin_headers = _register_and_login(client, "cp-st-admin8@example.com")
    group = _make_group(client, admin_headers)
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    rejected = client.patch(
        "/carpool/events/" + standing["id"],
        json={"starts_at": "2026-09-20T18:00:00Z"},
        headers=admin_headers,
    )
    assert rejected.status_code == 400


def test_standing_event_can_still_accept_posts(client):
    admin_headers = _register_and_login(client, "cp-st-admin9@example.com")
    group = _make_group(client, admin_headers)
    standing = client.get(
        "/groups/" + group["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    post = client.post(
        "/carpool/events/" + standing["id"] + "/posts", json=_rider_post(), headers=admin_headers
    )
    assert post.status_code == 201

# --- B31: promotion to a built-in page ------------------------------------


def test_resolve_carpool_page_settings_no_existing_page_defaults_to_members():
    """Unit coverage of the migration's winner-picking logic (pytest never
    runs Alembic against its SQLite test DB, so this exercises the pure
    function directly rather than the migration file itself). No candidate
    rows at all -> carpool's own members-only default, matching
    `DEFAULT_AUDIENCE`."""
    enabled, audience, min_identity = resolve_carpool_page_settings_from_custom_pages([])
    assert (enabled, audience, min_identity) == (True, "members", "anyone")


def test_resolve_carpool_page_settings_prefers_published_row():
    from datetime import datetime, timezone

    candidates = [
        ("draft", "members", "anyone", datetime(2026, 1, 1, tzinfo=timezone.utc)),
        ("published", "everyone", "saved", datetime(2026, 2, 1, tzinfo=timezone.utc)),
        ("archived", "members", "anyone", datetime(2026, 3, 1, tzinfo=timezone.utc)),
    ]
    enabled, audience, min_identity = resolve_carpool_page_settings_from_custom_pages(candidates)
    assert (enabled, audience, min_identity) == (True, "everyone", "saved")


def test_resolve_carpool_page_settings_no_published_row_uses_earliest_and_disables():
    from datetime import datetime, timezone

    candidates = [
        ("archived", "everyone", "anyone", datetime(2026, 3, 1, tzinfo=timezone.utc)),
        ("draft", "members", "saved", datetime(2026, 1, 1, tzinfo=timezone.utc)),
    ]
    enabled, audience, min_identity = resolve_carpool_page_settings_from_custom_pages(candidates)
    # The earliest-created row wins (the draft one), but disabled either way.
    assert (enabled, audience, min_identity) == (False, "members", "saved")


def test_old_page_scoped_carpool_url_is_gone(client):
    admin_headers = _register_and_login(client, "cp-oldurl-admin@example.com")
    group = _make_group(client, admin_headers)

    old_shape = client.post(
        "/groups/" + group["id"] + "/pages/some-page-id/carpool/events",
        json={
            "title": "Sep 16 rehearsal",
            "starts_at": "2026-09-16T18:00:00Z",
            "destination_label": "SFCC rehearsal hall",
        },
        headers=admin_headers,
    )
    assert old_shape.status_code in (404, 405)


def test_new_flat_carpool_url_works(client):
    admin_headers = _register_and_login(client, "cp-newurl-admin@example.com")
    group = _make_group(client, admin_headers)

    new_shape = _make_event(client, admin_headers, group["id"])
    assert new_shape.status_code == 201
