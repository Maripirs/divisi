"""B24: `CarpoolEvent`/`CarpoolPost` on a carpool-template `GroupCustomPage`
- admin event CRUD (create/edit/lock/archive), member post CRUD, ownership
(can't edit/delete someone else's post), admin moderation (hide/delete any
post), and locked/archived events rejecting new posts. Fixture shape
follows `tests/test_custom_pages.py` (B23) and `tests/test_responsibilities.py`
(B13, the closest "own row vs. admin moderation" precedent)."""


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _make_carpool_page(
    client, admin_headers, group_id, title="Carpool", publish=True, audience=None, min_identity=None
):
    payload = {"title": title, "template_key": "carpool_board"}
    if audience is not None:
        payload["audience"] = audience
    if min_identity is not None:
        payload["min_identity"] = min_identity
    page = client.post(
        "/groups/" + group_id + "/custom-pages",
        json=payload,
        headers=admin_headers,
    ).json()
    if publish:
        client.post(
            "/groups/" + group_id + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers
        )
    return page


def _make_event(client, admin_headers, group_id, page_id, title="Sep 16 rehearsal", **kwargs):
    payload = {
        "title": title,
        "starts_at": "2026-09-16T18:00:00Z",
        "destination_label": "SFCC rehearsal hall",
        **kwargs,
    }
    return client.post(
        "/groups/" + group_id + "/pages/" + page_id + "/carpool/events", json=payload, headers=admin_headers
    )


def _driver_post(origin_label="Mission", seats_total=3, **kwargs):
    return {"kind": "driver", "origin_label": origin_label, "seats_total": seats_total, **kwargs}


def _rider_post(origin_label="Sunset", **kwargs):
    return {"kind": "rider", "origin_label": origin_label, **kwargs}


def test_admin_can_create_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin1@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    created = _make_event(client, admin_headers, group["id"], page["id"])
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Sep 16 rehearsal"
    assert body["destination_label"] == "SFCC rehearsal hall"
    assert body["status"] == "open"
    assert body["page_id"] == page["id"]


def test_member_cannot_create_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin2@example.com")
    member_headers = _register_and_login(client, "cp-ev-member2@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member2@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"])

    forbidden = _make_event(client, member_headers, group["id"], page["id"])
    assert forbidden.status_code == 403


def test_member_can_list_published_events(client):
    admin_headers = _register_and_login(client, "cp-ev-admin4@example.com")
    member_headers = _register_and_login(client, "cp-ev-member4@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member4@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"])
    _make_event(client, admin_headers, group["id"], page["id"])

    listing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=member_headers
    )
    assert listing.status_code == 200
    # B26: every listing also carries the page's standing event now, so this
    # checks the dated event specifically rather than the raw list length.
    dated = [e for e in listing.json() if not e["is_standing"]]
    assert len(dated) == 1


def test_member_cannot_list_events_on_draft_page(client):
    admin_headers = _register_and_login(client, "cp-ev-admin5@example.com")
    member_headers = _register_and_login(client, "cp-ev-member5@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-ev-member5@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"], publish=False)

    listing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=member_headers
    )
    assert listing.status_code == 403


def test_admin_can_edit_lock_and_archive_event(client):
    admin_headers = _register_and_login(client, "cp-ev-admin6@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

    forbidden = client.patch(
        "/carpool/events/" + event["id"], json={"title": "Hijacked"}, headers=member_headers
    )
    assert forbidden.status_code == 403


def test_member_can_create_driver_and_rider_posts(client):
    admin_headers = _register_and_login(client, "cp-post-admin1@example.com")
    member_headers = _register_and_login(client, "cp-post-member1@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member1@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

    missing_seats = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json={"kind": "driver", "origin_label": "Mission"},
        headers=admin_headers,
    )
    assert missing_seats.status_code == 422


def test_rider_post_rejects_seat_fields(client):
    admin_headers = _register_and_login(client, "cp-post-admin3@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=owner_headers
    ).json()

    forbidden_edit = client.patch(
        "/carpool/posts/" + post["id"], json={"notes": "Not mine"}, headers=other_headers
    )
    assert forbidden_edit.status_code == 403

    forbidden_delete = client.delete("/carpool/posts/" + post["id"], headers=other_headers)
    assert forbidden_delete.status_code == 403


def test_member_cannot_set_own_post_status(client):
    admin_headers = _register_and_login(client, "cp-post-admin6@example.com")
    member_headers = _register_and_login(client, "cp-post-member6@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-post-member6@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    allowed = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    )
    assert allowed.status_code == 201


def test_cross_group_page_id_404s(client):
    admin_headers = _register_and_login(client, "cp-xg-admin1@example.com")
    group_a = _make_group(client, admin_headers, name="A24")
    group_b = _make_group(client, admin_headers, name="B24")
    page = _make_carpool_page(client, admin_headers, group_a["id"])

    assert _make_event(client, admin_headers, group_b["id"], page["id"]).status_code == 404


def test_unknown_group_or_page_404s(client):
    admin_headers = _register_and_login(client, "cp-xg-admin2@example.com")
    assert _make_event(client, admin_headers, "does-not-exist", "also-nope").status_code == 404


# --- B25: guest carpool access (read + write via anonymous participants) ---


def test_guest_can_list_published_everyone_pages(client):
    admin_headers = _register_and_login(client, "cp-g-admin1@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    # A draft page and a published members-only page must not show up.
    _make_carpool_page(client, admin_headers, group["id"], title="Draft", publish=False)
    _make_carpool_page(client, admin_headers, group["id"], title="Members Only", audience="members")

    listing = client.get("/guest/" + group["join_code"] + "/pages")
    assert listing.status_code == 200
    assert [p["id"] for p in listing.json()] == [page["id"]]


def test_guest_tabs_reports_visibility_and_custom_pages(client):
    """Guest fast-follow (2026-09-12): one call instead of the four
    `list_guest_homework`/`list_guest_weekly_notes`/
    `list_guest_responsibility_dates`/`list_guest_custom_pages` calls
    `pages/[slug]/+page.server.ts` used to make just to learn these
    booleans, which was tripping `rate_limit_guest` during ordinary
    tab-to-tab navigation."""
    admin_headers = _register_and_login(client, "cp-tabs-admin1@example.com")
    group = _make_group(client, admin_headers)
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "homework", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    _make_carpool_page(client, admin_headers, group["id"], title="Draft", publish=False)

    tabs = client.get("/guest/" + group["join_code"] + "/tabs")
    assert tabs.status_code == 200
    body = tabs.json()
    assert body["homework_visible"] is True
    # weekly_notes/responsibilities default to members-only audience (B12),
    # so a plain join code with no page-settings override sees neither.
    assert body["weekly_notes_visible"] is False
    assert body["responsibilities_visible"] is False
    assert [p["id"] for p in body["custom_pages"]] == [page["id"]]


def test_guest_tabs_unknown_join_code_404s(client):
    assert client.get("/guest/NOTAREAL/tabs").status_code == 404


def test_guest_can_list_carpool_events_and_posts(client):
    admin_headers = _register_and_login(client, "cp-g-admin2@example.com")
    member_headers = _register_and_login(client, "cp-g-member2@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "cp-g-member2@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
    post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=member_headers
    ).json()

    events = client.get("/guest/" + group["join_code"] + "/pages/" + page["slug"] + "/carpool/events")
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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="members")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

    assert (
        client.get("/guest/" + group["join_code"] + "/pages/" + page["slug"] + "/carpool/events").status_code
        == 404
    )
    assert (
        client.get(
            "/guest/" + group["join_code"] + "/carpool/events/" + event["id"] + "/posts"
        ).status_code
        == 404
    )


def test_guest_self_post_mints_participant_and_sets_cookie(client):
    admin_headers = _register_and_login(client, "cp-g-admin5@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event1 = _make_event(client, admin_headers, group["id"], page["id"], title="Event 1").json()
    event2 = _make_event(client, admin_headers, group["id"], page["id"], title="Event 2").json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event1 = _make_event(client, admin_headers, group["id"], page["id"], title="Event 1").json()
    event2 = _make_event(client, admin_headers, group["id"], page["id"], title="Event 2").json()

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
    page = _make_carpool_page(
        client, admin_headers, group["id"], audience="everyone", min_identity="saved"
    )
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="members")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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


# --- B26: standing (non-dated) carpool event ---


def test_first_listing_bootstraps_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin1@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    listing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()
    assert len(listing) == 1
    standing = listing[0]
    assert standing["is_standing"] is True
    assert standing["starts_at"] is None
    assert standing["destination_label"] is None
    assert standing["title"]  # some sensible default, exact string not asserted


def test_second_listing_reuses_same_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin2@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    first = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()
    second = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()
    assert len(second) == 1
    assert second[0]["id"] == first[0]["id"]


def test_guest_listing_bootstraps_and_reuses_same_standing_event(client):
    admin_headers = _register_and_login(client, "cp-st-admin3@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")

    first = client.get(
        "/guest/" + group["join_code"] + "/pages/" + page["slug"] + "/carpool/events"
    ).json()
    assert len(first) == 1
    assert first[0]["is_standing"] is True

    second = client.get(
        "/guest/" + group["join_code"] + "/pages/" + page["slug"] + "/carpool/events"
    ).json()
    assert len(second) == 1
    assert second[0]["id"] == first[0]["id"]

    # The member route's bootstrap and the guest route's bootstrap must be
    # the exact same row, not two independent standing events.
    member_view = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()
    assert len(member_view) == 1
    assert member_view[0]["id"] == first[0]["id"]


def test_listing_orders_standing_first_then_dated_by_starts_at(client):
    admin_headers = _register_and_login(client, "cp-st-admin4@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    later = _make_event(
        client, admin_headers, group["id"], page["id"], title="Later", starts_at="2026-10-01T18:00:00Z"
    ).json()
    earlier = _make_event(
        client, admin_headers, group["id"], page["id"], title="Earlier", starts_at="2026-09-20T18:00:00Z"
    ).json()

    listing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()
    assert [e["is_standing"] for e in listing] == [True, False, False]
    assert [e["id"] for e in listing[1:]] == [earlier["id"], later["id"]]


def test_standing_event_cannot_be_archived(client):
    admin_headers = _register_and_login(client, "cp-st-admin5@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=member_headers
    ).json()[0]

    forbidden = client.patch(
        "/carpool/events/" + standing["id"], json={"title": "Hijacked"}, headers=member_headers
    )
    assert forbidden.status_code == 403


def test_standing_event_can_be_locked_and_reopened(client):
    admin_headers = _register_and_login(client, "cp-st-admin6@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    standing = client.get(
        "/groups/" + group["id"] + "/pages/" + page["id"] + "/carpool/events", headers=admin_headers
    ).json()[0]

    post = client.post(
        "/carpool/events/" + standing["id"] + "/posts", json=_rider_post(), headers=admin_headers
    )
    assert post.status_code == 201


# --- B27: claiming a seat in a driver's post ---


def _setup_driver_post(client, admin_email_prefix, seats_total=2):
    admin_headers = _register_and_login(client, admin_email_prefix + "-admin@example.com")
    driver_headers = _register_and_login(client, admin_email_prefix + "-driver@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], admin_email_prefix + "-driver@example.com")
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
    driver_post = client.post(
        "/carpool/events/" + event["id"] + "/posts",
        json=_driver_post(seats_total=seats_total),
        headers=driver_headers,
    ).json()
    return admin_headers, driver_headers, group, page, event, driver_post


def test_member_can_claim_a_seat(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl1")
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
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl2")
    rider_headers = _register_and_login(client, "cp-cl2-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl2-rider@example.com")

    first = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert first.status_code == 201
    second = client.post("/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers)
    assert second.status_code == 400


def test_driver_cannot_claim_own_post(client):
    _admin_headers, driver_headers, _group, _page, _event, driver_post = _setup_driver_post(client, "cp-cl11")

    rejected = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=driver_headers
    )
    assert rejected.status_code == 400


def test_claiming_a_full_post_rejected(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(
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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
    rider_post = client.post(
        "/carpool/events/" + event["id"] + "/posts", json=_rider_post(), headers=admin_headers
    ).json()

    rejected = client.post(
        "/carpool/posts/" + rider_post["id"] + "/claims", json={}, headers=member_headers
    )
    assert rejected.status_code == 400


def test_claiming_on_locked_event_rejected_for_non_admin(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl5")
    rider_headers = _register_and_login(client, "cp-cl5-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl5-rider@example.com")
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    rejected = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    )
    assert rejected.status_code == 409


def test_admin_can_claim_on_locked_event(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl6")
    client.patch("/carpool/events/" + event["id"], json={"status": "locked"}, headers=admin_headers)

    allowed = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=admin_headers
    )
    assert allowed.status_code == 201


def test_claimant_can_release_own_claim(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl7")
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
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl8")
    rider_headers = _register_and_login(client, "cp-cl8-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl8-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    released = client.delete("/carpool/claims/" + claim["id"], headers=driver_headers)
    assert released.status_code == 204


def test_admin_can_release_any_claim(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl9")
    rider_headers = _register_and_login(client, "cp-cl9-rider@example.com")
    _add_member(client, admin_headers, group["id"], "cp-cl9-rider@example.com")
    claim = client.post(
        "/carpool/posts/" + driver_post["id"] + "/claims", json={}, headers=rider_headers
    ).json()

    released = client.delete("/carpool/claims/" + claim["id"], headers=admin_headers)
    assert released.status_code == 204


def test_unrelated_member_cannot_release_a_claim(client):
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(client, "cp-cl10")
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
    admin_headers, driver_headers, group, page, event, driver_post = _setup_driver_post(
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
    page = _make_carpool_page(client, admin_headers, group["id"], audience="everyone")
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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


# --- B29: map pins -------------------------------------------------------
# Event destination coordinates are never rounded (a venue address isn't
# privacy-sensitive); post origin coordinates default to `approximate` and
# get server-side rounded to 2 decimal places, regardless of what a client
# claims, since that's a real person's home. See `app/services/carpool.
# resolve_origin_coordinates` and plan.md's B29.


def test_event_destination_coordinates_round_trip(client):
    admin_headers = _register_and_login(client, "cp-map1-admin@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    created = _make_event(
        client,
        admin_headers,
        group["id"],
        page["id"],
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
    page = _make_carpool_page(client, admin_headers, group["id"])

    rejected = _make_event(
        client, admin_headers, group["id"], page["id"], destination_latitude=95.0, destination_longitude=0.0
    )
    assert rejected.status_code == 422


def test_event_destination_coordinate_half_set_rejected(client):
    admin_headers = _register_and_login(client, "cp-map3-admin@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])

    rejected = _make_event(client, admin_headers, group["id"], page["id"], destination_latitude=37.7)
    assert rejected.status_code == 422


def test_event_destination_coordinates_patchable(client):
    admin_headers = _register_and_login(client, "cp-map4-admin@example.com")
    group = _make_group(client, admin_headers)
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()

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
    page = _make_carpool_page(client, admin_headers, group["id"])
    event = _make_event(client, admin_headers, group["id"], page["id"]).json()
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


