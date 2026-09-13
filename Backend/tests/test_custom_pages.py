"""B23: admin CRUD, publish/archive transitions, slug uniqueness, and the
same-shape access gates as B12's built-in pages (draft invisible to
members/guests, admin bypass, guest needs enabled+everyone, member needs
enabled)."""

from app.db.models import GroupCustomPage, GroupCustomPageStatus, PageMinIdentity
from app.services.pages import require_saved_identity


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()


def _create_page(client, admin_headers, group_id, title="Carpool", **kwargs):
    payload = {"title": title, "template_key": "carpool_board", **kwargs}
    return client.post("/groups/" + group_id + "/custom-pages", json=payload, headers=admin_headers)


def test_admin_can_create_custom_page(client):
    admin_headers = _register_and_login(client, "cp-admin1@example.com")
    group = _make_group(client, admin_headers)

    created = _create_page(client, admin_headers, group["id"])
    assert created.status_code == 201
    body = created.json()
    assert body["title"] == "Carpool"
    assert body["slug"] == "carpool"
    assert body["template_key"] == "carpool_board"
    assert body["status"] == "draft"
    assert body["audience"] == "members"
    assert body["min_identity"] == "anyone"
    assert body["group_id"] == group["id"]


def test_member_cannot_create_custom_page(client):
    admin_headers = _register_and_login(client, "cp-admin2@example.com")
    member_headers = _register_and_login(client, "cp-member2@example.com")
    group = _make_group(client, admin_headers)
    client.post("/groups/" + group["id"] + "/members", json={"email": "cp-member2@example.com"}, headers=admin_headers)

    forbidden = _create_page(client, member_headers, group["id"])
    assert forbidden.status_code == 403


def test_slug_generated_from_title(client):
    admin_headers = _register_and_login(client, "cp-admin3@example.com")
    group = _make_group(client, admin_headers)

    created = _create_page(client, admin_headers, group["id"], title="Sunday Carpool!! Board").json()
    assert created["slug"] == "sunday-carpool-board"


def test_slug_collision_within_same_group_rejected(client):
    admin_headers = _register_and_login(client, "cp-admin4@example.com")
    group = _make_group(client, admin_headers)

    first = _create_page(client, admin_headers, group["id"], title="Carpool Board")
    assert first.status_code == 201
    second = _create_page(client, admin_headers, group["id"], title="Carpool Board")
    assert second.status_code == 409


def test_slug_collision_across_groups_allowed(client):
    admin_headers = _register_and_login(client, "cp-admin5@example.com")
    group_a = _make_group(client, admin_headers, name="A")
    group_b = _make_group(client, admin_headers, name="B")

    first = _create_page(client, admin_headers, group_a["id"], title="Carpool Board")
    second = _create_page(client, admin_headers, group_b["id"], title="Carpool Board")
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["slug"] == second.json()["slug"] == "carpool-board"


def test_admin_can_publish_and_archive(client):
    admin_headers = _register_and_login(client, "cp-admin6@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()

    published = client.post(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    archived = client.post(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/archive", headers=admin_headers
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_member_cannot_publish_or_archive(client):
    admin_headers = _register_and_login(client, "cp-admin7@example.com")
    member_headers = _register_and_login(client, "cp-member7@example.com")
    group = _make_group(client, admin_headers)
    client.post("/groups/" + group["id"] + "/members", json={"email": "cp-member7@example.com"}, headers=admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()

    assert client.post(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=member_headers
    ).status_code == 403
    assert client.post(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/archive", headers=member_headers
    ).status_code == 403


def test_patch_updates_title_audience_and_min_identity(client):
    admin_headers = _register_and_login(client, "cp-admin8@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()

    patched = client.patch(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"],
        json={"title": "Renamed", "audience": "everyone", "min_identity": "saved"},
        headers=admin_headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["title"] == "Renamed"
    assert body["audience"] == "everyone"
    assert body["min_identity"] == "saved"
    # slug is immutable, even though the title that generated it changed
    assert body["slug"] == page["slug"]


def test_patch_status_can_unpublish(client):
    admin_headers = _register_and_login(client, "cp-admin9@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()
    client.post("/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers)

    unpublished = client.patch(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"],
        json={"status": "draft"},
        headers=admin_headers,
    )
    assert unpublished.status_code == 200
    assert unpublished.json()["status"] == "draft"


def test_admin_can_delete_custom_page(client):
    admin_headers = _register_and_login(client, "cp-admin10@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()

    deleted = client.delete("/groups/" + group["id"] + "/custom-pages/" + page["id"], headers=admin_headers)
    assert deleted.status_code == 204
    assert client.get(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"], headers=admin_headers
    ).status_code == 404


def test_admin_list_includes_drafts(client):
    admin_headers = _register_and_login(client, "cp-admin11@example.com")
    group = _make_group(client, admin_headers)
    _create_page(client, admin_headers, group["id"], title="Draft Page")

    listing = client.get("/groups/" + group["id"] + "/custom-pages", headers=admin_headers)
    assert listing.status_code == 200
    assert [p["status"] for p in listing.json()] == ["draft"]


def test_member_list_shows_only_published(client):
    admin_headers = _register_and_login(client, "cp-admin11b@example.com")
    member_headers = _register_and_login(client, "cp-member11b@example.com")
    group = _make_group(client, admin_headers)
    client.post(
        "/groups/" + group["id"] + "/members", json={"email": "cp-member11b@example.com"}, headers=admin_headers
    )
    draft = _create_page(client, admin_headers, group["id"], title="Draft Page").json()
    published = _create_page(client, admin_headers, group["id"], title="Published Page").json()
    client.post("/groups/" + group["id"] + "/custom-pages/" + published["id"] + "/publish", headers=admin_headers)

    listing = client.get("/groups/" + group["id"] + "/pages", headers=member_headers)
    assert listing.status_code == 200
    slugs = [p["slug"] for p in listing.json()]
    assert slugs == [published["slug"]]
    assert draft["slug"] not in slugs


def test_member_list_rejects_non_member(client):
    admin_headers = _register_and_login(client, "cp-admin11c@example.com")
    outsider_headers = _register_and_login(client, "cp-outsider11c@example.com")
    group = _make_group(client, admin_headers)

    listing = client.get("/groups/" + group["id"] + "/pages", headers=outsider_headers)
    assert listing.status_code == 403


def test_member_route_hides_draft_but_shows_published(client):
    admin_headers = _register_and_login(client, "cp-admin12@example.com")
    member_headers = _register_and_login(client, "cp-member12@example.com")
    group = _make_group(client, admin_headers)
    client.post(
        "/groups/" + group["id"] + "/members", json={"email": "cp-member12@example.com"}, headers=admin_headers
    )
    page = _create_page(client, admin_headers, group["id"]).json()

    draft_read = client.get(
        "/groups/" + group["id"] + "/pages/" + page["slug"], headers=member_headers
    )
    assert draft_read.status_code == 403

    client.post("/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers)
    published_read = client.get(
        "/groups/" + group["id"] + "/pages/" + page["slug"], headers=member_headers
    )
    assert published_read.status_code == 200
    assert published_read.json()["slug"] == page["slug"]


def test_admin_always_sees_own_draft_via_member_route(client):
    admin_headers = _register_and_login(client, "cp-admin13@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()

    read = client.get("/groups/" + group["id"] + "/pages/" + page["slug"], headers=admin_headers)
    assert read.status_code == 200


def test_non_member_cannot_read_via_member_route(client):
    admin_headers = _register_and_login(client, "cp-admin14@example.com")
    outsider_headers = _register_and_login(client, "cp-outsider14@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"]).json()
    client.post("/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers)

    read = client.get("/groups/" + group["id"] + "/pages/" + page["slug"], headers=outsider_headers)
    assert read.status_code == 403


def test_guest_needs_published_and_everyone_audience(client):
    admin_headers = _register_and_login(client, "cp-admin15@example.com")
    group = _make_group(client, admin_headers)
    page = _create_page(client, admin_headers, group["id"], audience="members").json()

    # Draft, audience=members: guest 404s.
    assert client.get("/guest/" + group["join_code"] + "/pages/" + page["slug"]).status_code == 404

    client.post("/groups/" + group["id"] + "/custom-pages/" + page["id"] + "/publish", headers=admin_headers)
    # Published, but audience is still members-only: guest still 404s.
    assert client.get("/guest/" + group["join_code"] + "/pages/" + page["slug"]).status_code == 404

    client.patch(
        "/groups/" + group["id"] + "/custom-pages/" + page["id"],
        json={"audience": "everyone"},
        headers=admin_headers,
    )
    ok = client.get("/guest/" + group["join_code"] + "/pages/" + page["slug"])
    assert ok.status_code == 200
    assert ok.json()["slug"] == page["slug"]


def test_guest_unknown_slug_404s(client):
    admin_headers = _register_and_login(client, "cp-admin16@example.com")
    group = _make_group(client, admin_headers)

    assert client.get("/guest/" + group["join_code"] + "/pages/does-not-exist").status_code == 404


def test_cross_group_page_id_404s(client):
    admin_headers = _register_and_login(client, "cp-admin17@example.com")
    group_a = _make_group(client, admin_headers, name="A17")
    group_b = _make_group(client, admin_headers, name="B17")
    page = _create_page(client, admin_headers, group_a["id"]).json()

    assert client.get(
        "/groups/" + group_b["id"] + "/custom-pages/" + page["id"], headers=admin_headers
    ).status_code == 404
    assert client.patch(
        "/groups/" + group_b["id"] + "/custom-pages/" + page["id"], json={"title": "X"}, headers=admin_headers
    ).status_code == 404
    assert client.delete(
        "/groups/" + group_b["id"] + "/custom-pages/" + page["id"], headers=admin_headers
    ).status_code == 404


def test_unknown_group_404s(client):
    admin_headers = _register_and_login(client, "cp-admin18@example.com")
    assert client.get("/groups/does-not-exist/custom-pages", headers=admin_headers).status_code == 404
    assert _create_page(client, admin_headers, "does-not-exist").status_code == 404


def test_no_arbitrary_html_field_on_the_model(client):
    """Structured fields only: nothing in `GroupCustomPageOut` accepts or
    renders a body/HTML blob for the template to interpret. An extra
    `body`/`html` field sent on create is simply ignored (pydantic drops
    unknown fields by default), not stored or reflected back anywhere."""
    admin_headers = _register_and_login(client, "cp-admin19@example.com")
    group = _make_group(client, admin_headers)

    created = _create_page(
        client, admin_headers, group["id"], body="<script>alert(1)</script>", html="<b>hi</b>"
    ).json()
    assert "body" not in created
    assert "html" not in created
    assert set(created.keys()) == {
        "id",
        "group_id",
        "title",
        "slug",
        "template_key",
        "status",
        "audience",
        "min_identity",
        "map_enabled",
        "created_by",
        "created_at",
        "updated_at",
    }


def test_require_saved_identity_gates_a_custom_page_row(db_session):
    """B23's write gate reuses `require_saved_identity` unchanged, just
    handed a `GroupCustomPage` row instead of a `GroupPage` enum member —
    exercised directly since B23 itself adds no write route on the page
    (that's B24's carpool events/posts)."""
    page = GroupCustomPage(
        group_id="g1",
        title="Carpool",
        slug="carpool",
        template_key="carpool_board",
        status=GroupCustomPageStatus.published,
        min_identity=PageMinIdentity.saved,
    )
    raised = False
    try:
        require_saved_identity("g1", page, db_session)
    except Exception as exc:  # HTTPException
        raised = True
        assert "SAVE_REQUIRED" in str(exc.detail)
    assert raised
