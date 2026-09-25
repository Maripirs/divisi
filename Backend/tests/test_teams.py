"""Teams: a group's standing list of teams/committees, each with one or
more roles. A role's own `mode` is `interest` (member self-signup, the
default) or `roster` (admin-maintained list of names, no self-signup)."""


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _enable_guest_teams(client, admin_headers, group_id):
    client.put(
        "/groups/" + group_id + "/page-settings",
        json={"pages": [{"page": "teams", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )


def _make_team(client, admin_headers, group_id, **overrides):
    payload = {
        "name": "Publicity Team",
        "description": "Get the word out",
        "contact_name": "Pat",
        "contact_email": "pat@example.com",
        "contact_phone": "555-1234",
        "contact_show_email": False,
        "contact_show_phone": False,
    }
    payload.update(overrides)
    return client.post("/groups/" + group_id + "/teams", json=payload, headers=admin_headers).json()


def _add_role(client, admin_headers, team_id, name="Submit to media outlets", has_text_field=False, **overrides):
    payload = {"name": name, "has_text_field": has_text_field}
    payload.update(overrides)
    return client.post(
        "/teams/" + team_id + "/roles",
        json=payload,
        headers=admin_headers,
    ).json()


def test_admin_can_create_team_with_contact_and_roles(client):
    admin_headers = _register_and_login(client, "team-admin1@example.com")
    group = _make_group(client, admin_headers)

    team = _make_team(client, admin_headers, group["id"], contact_show_email=True)
    assert team["name"] == "Publicity Team"
    assert team["contact_email"] == "pat@example.com"  # admin sees raw value regardless of show flag
    assert team["contact_show_email"] is True
    assert team["contact_show_phone"] is False

    role = _add_role(client, admin_headers, team["id"], name="Submit to media outlets")
    other_role = _add_role(client, admin_headers, team["id"], name="Other, tell us more", has_text_field=True)
    assert role["has_text_field"] is False
    assert other_role["has_text_field"] is True


def test_group_creation_seeds_teams_page_settings(client):
    admin_headers = _register_and_login(client, "team-admin2@example.com")
    group = _make_group(client, admin_headers)

    settings = client.get("/groups/" + group["id"] + "/page-settings", headers=admin_headers).json()
    teams_setting = next(p for p in settings if p["page"] == "teams")
    assert teams_setting["enabled"] is True
    assert teams_setting["audience"] == "members"


def test_member_self_signup_with_text_value_and_idempotent(client):
    admin_headers = _register_and_login(client, "team-admin3@example.com")
    member_headers = _register_and_login(client, "team-member3@example.com", name="Member Three")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member3@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], name="Other", has_text_field=True)

    signup = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"text_value": "I can help with flyers"},
        headers=member_headers,
    )
    assert signup.status_code == 201
    body = signup.json()
    assert body["name"] == "Member Three"
    assert body["text_value"] == "I can help with flyers"

    # Re-signing up is a no-op collision, not a duplicate row.
    again = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"text_value": "I can help with flyers"},
        headers=member_headers,
    )
    assert again.status_code == 409


def test_signup_text_value_rejected_when_role_has_no_text_field(client):
    admin_headers = _register_and_login(client, "team-admin4@example.com")
    member_headers = _register_and_login(client, "team-member4@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member4@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], has_text_field=False)

    response = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"text_value": "shouldn't be allowed"},
        headers=member_headers,
    )
    assert response.status_code == 400


def test_member_sees_only_own_signup_admin_sees_full_roster(client):
    admin_headers = _register_and_login(client, "team-admin5@example.com")
    member_a = _register_and_login(client, "team-a5@example.com", name="Alice")
    member_b = _register_and_login(client, "team-b5@example.com", name="Bob")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-a5@example.com")
    _add_member(client, admin_headers, group["id"], "team-b5@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"])

    client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_a)
    client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_b)

    # Alice's own view: sees her own signup, never Bob's, never raw contact.
    alice_view = client.get("/groups/" + group["id"] + "/teams", headers=member_a).json()
    alice_role = alice_view[0]["roles"][0]
    assert alice_role["signup_count"] == 2
    assert alice_role["my_signup"]["name"] == "Alice"
    assert alice_role["signups"] == []
    assert "contact_show_email" not in alice_view[0]

    # Admin's view: full roster, raw contact fields.
    admin_view = client.get("/groups/" + group["id"] + "/teams", headers=admin_headers).json()
    admin_role = admin_view[0]["roles"][0]
    assert admin_role["signup_count"] == 2
    names = {s["name"] for s in admin_role["signups"]}
    assert names == {"Alice", "Bob"}
    assert admin_view[0]["contact_show_email"] is False


def test_contact_visibility_gated_by_show_flags(client):
    admin_headers = _register_and_login(client, "team-admin6@example.com")
    member_headers = _register_and_login(client, "team-member6@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member6@example.com")
    _make_team(client, admin_headers, group["id"], contact_show_email=False, contact_show_phone=False)

    hidden = client.get("/groups/" + group["id"] + "/teams", headers=member_headers).json()[0]
    assert hidden["contact_email"] is None
    assert hidden["contact_phone"] is None
    assert hidden["contact_name"] == "Pat"  # name isn't gated, only email/phone

    admin_group = _make_group(client, admin_headers, name="G2")
    _add_member(client, admin_headers, admin_group["id"], "team-member6@example.com")
    _make_team(client, admin_headers, admin_group["id"], contact_show_email=True, contact_show_phone=True)
    shown = client.get("/groups/" + admin_group["id"] + "/teams", headers=member_headers).json()[0]
    assert shown["contact_email"] == "pat@example.com"
    assert shown["contact_phone"] == "555-1234"


def test_delete_team_cascades_roles_and_signups(client):
    admin_headers = _register_and_login(client, "team-admin7@example.com")
    member_headers = _register_and_login(client, "team-member7@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member7@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"])
    signup = client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_headers).json()

    delete = client.delete("/teams/" + team["id"], headers=admin_headers)
    assert delete.status_code == 204

    listing = client.get("/groups/" + group["id"] + "/teams", headers=admin_headers).json()
    assert listing == []

    # The signup and role are gone too, not just orphaned.
    withdraw = client.delete("/teams/signups/" + signup["id"], headers=member_headers)
    assert withdraw.status_code == 404


def test_delete_role_cascades_signups(client):
    admin_headers = _register_and_login(client, "team-admin8@example.com")
    member_headers = _register_and_login(client, "team-member8@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member8@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"])
    signup = client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_headers).json()

    delete = client.delete("/teams/roles/" + role["id"], headers=admin_headers)
    assert delete.status_code == 204

    withdraw = client.delete("/teams/signups/" + signup["id"], headers=member_headers)
    assert withdraw.status_code == 404


def test_toggling_has_text_field_off_nulls_existing_text_values(client):
    admin_headers = _register_and_login(client, "team-admin9@example.com")
    member_headers = _register_and_login(client, "team-member9@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member9@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], has_text_field=True)
    client.post(
        "/teams/roles/" + role["id"] + "/signups", json={"text_value": "some notes"}, headers=member_headers
    )

    client.patch("/teams/roles/" + role["id"], json={"has_text_field": False}, headers=admin_headers)

    listing = client.get("/groups/" + group["id"] + "/teams", headers=admin_headers).json()
    role_out = listing[0]["roles"][0]
    assert role_out["has_text_field"] is False
    assert role_out["signups"][0]["text_value"] is None


def test_member_cannot_manage_teams(client):
    admin_headers = _register_and_login(client, "team-admin10@example.com")
    member_headers = _register_and_login(client, "team-member10@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member10@example.com")

    forbidden = client.post(
        "/groups/" + group["id"] + "/teams",
        json={"name": "X", "description": ""},
        headers=member_headers,
    )
    assert forbidden.status_code == 403


def test_guest_can_list_teams_and_self_signup(client):
    admin_headers = _register_and_login(client, "team-guest-admin1@example.com")
    group = _make_group(client, admin_headers)
    _enable_guest_teams(client, admin_headers, group["id"])
    team = _make_team(client, admin_headers, group["id"], contact_show_email=True)
    role = _add_role(client, admin_headers, team["id"])

    listing = client.get(f"/guest/{group['join_code']}/teams")
    assert listing.status_code == 200
    body = listing.json()
    assert body[0]["contact_email"] == "pat@example.com"
    assert "contact_show_email" not in body[0]
    assert body[0]["roles"][0]["signups"] == []
    assert body[0]["roles"][0]["my_signup"] is None

    client.base_url = "https://testserver"
    client.cookies.clear()
    signup = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"local_id": "dev-team-guest", "display_name": "Guest One"},
    )
    assert signup.status_code == 201
    assert "divisi_participant" in signup.headers.get("set-cookie", "")

    # The `divisi_participant` cookie set by the signup response persists on
    # `client`, same as a real browser, so this same guest's own signup
    # shows up as `my_signup` on their next read.
    listing_after = client.get(f"/guest/{group['join_code']}/teams").json()
    assert listing_after[0]["roles"][0]["signup_count"] == 1
    assert listing_after[0]["roles"][0]["my_signup"]["name"] == "Guest One"
    assert listing_after[0]["roles"][0]["signups"] == []


def test_guest_teams_hidden_by_default(client):
    admin_headers = _register_and_login(client, "team-guest-admin2@example.com")
    group = _make_group(client, admin_headers)
    _make_team(client, admin_headers, group["id"])

    response = client.get(f"/guest/{group['join_code']}/teams")
    assert response.status_code == 404


def test_role_defaults_to_interest_mode(client):
    admin_headers = _register_and_login(client, "team-admin11@example.com")
    group = _make_group(client, admin_headers)
    team = _make_team(client, admin_headers, group["id"])

    role = _add_role(client, admin_headers, team["id"])
    assert role["mode"] == "interest"
    assert role["roster_visible_to_members"] is False


def test_self_signup_on_interest_role_still_works(client):
    admin_headers = _register_and_login(client, "team-admin12@example.com")
    member_headers = _register_and_login(client, "team-member12@example.com", name="Member Twelve")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member12@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="interest")

    signup = client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_headers)
    assert signup.status_code == 201
    assert signup.json()["name"] == "Member Twelve"


def test_self_signup_rejected_on_roster_role(client):
    admin_headers = _register_and_login(client, "team-admin13@example.com")
    member_headers = _register_and_login(client, "team-member13@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member13@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="roster")

    response = client.post("/teams/roles/" + role["id"] + "/signups", json={}, headers=member_headers)
    assert response.status_code == 400


def test_admin_can_add_guest_name_only_roster_entry(client):
    admin_headers = _register_and_login(client, "team-admin14@example.com")
    group = _make_group(client, admin_headers)
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], name="President", mode="roster")

    entry = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"name": "Jane Doe", "contact": "jane@example.org"},
        headers=admin_headers,
    )
    assert entry.status_code == 201
    body = entry.json()
    assert body["user_id"] is None
    assert body["name"] == "Jane Doe"
    assert body["contact"] == "jane@example.org"


def test_admin_can_add_real_member_to_roster_role(client):
    admin_headers = _register_and_login(client, "team-admin15@example.com")
    member_headers = _register_and_login(client, "team-member15@example.com", name="Member Fifteen")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member15@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="roster")

    member = client.get("/groups/" + group["id"] + "/members", headers=admin_headers).json()
    member_id = next(m["user_id"] for m in member if m["email"] == "team-member15@example.com")

    entry = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"user_id": member_id},
        headers=admin_headers,
    )
    assert entry.status_code == 201
    body = entry.json()
    assert body["user_id"] == member_id
    assert body["name"] == "Member Fifteen"


def test_non_admin_cannot_use_admin_assignment_shape(client):
    admin_headers = _register_and_login(client, "team-admin16@example.com")
    member_headers = _register_and_login(client, "team-member16@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member16@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="roster")

    response = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"name": "Some Volunteer"},
        headers=member_headers,
    )
    assert response.status_code == 403


def test_admin_assignment_rejected_on_interest_role(client):
    admin_headers = _register_and_login(client, "team-admin17@example.com")
    group = _make_group(client, admin_headers)
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="interest")

    response = client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"name": "Some Volunteer"},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_roster_role_visible_to_members_when_flag_set(client):
    admin_headers = _register_and_login(client, "team-admin18@example.com")
    member_headers = _register_and_login(client, "team-member18@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member18@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(
        client, admin_headers, team["id"], name="President", mode="roster", roster_visible_to_members=True
    )
    client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"name": "Jane Doe", "contact": "jane@example.org"},
        headers=admin_headers,
    )

    member_view = client.get("/groups/" + group["id"] + "/teams", headers=member_headers).json()
    member_role = member_view[0]["roles"][0]
    assert member_role["roster_visible_to_members"] is True
    assert len(member_role["signups"]) == 1
    assert member_role["signups"][0]["name"] == "Jane Doe"
    assert member_role["signups"][0]["contact"] == "jane@example.org"


def test_roster_role_hidden_from_members_when_flag_unset(client):
    admin_headers = _register_and_login(client, "team-admin19@example.com")
    member_headers = _register_and_login(client, "team-member19@example.com")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member19@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(
        client, admin_headers, team["id"], name="President", mode="roster", roster_visible_to_members=False
    )
    client.post(
        "/teams/roles/" + role["id"] + "/signups",
        json={"name": "Jane Doe"},
        headers=admin_headers,
    )

    member_view = client.get("/groups/" + group["id"] + "/teams", headers=member_headers).json()
    member_role = member_view[0]["roles"][0]
    assert member_role["roster_visible_to_members"] is False
    # The Backend just answers with an empty roster here; skipping the role
    # entirely in the member view is the Frontend's job.
    assert member_role["signups"] == []
    assert member_role["signup_count"] == 1


def test_member_can_self_remove_own_roster_entry_admin_only_removes_guest_name_entry(client):
    """Matches `responsibilities.delete_signup`'s exact precedent: ownership
    is decided solely by `signup.user_id == actor.id`, regardless of who
    created the row. So a member can self-remove a roster entry an admin
    assigned to them by `user_id`, but a `guest_name`-only entry (no `user_id`
    at all) can only ever be removed by an admin, since there's no "self" to
    match."""
    admin_headers = _register_and_login(client, "team-admin20@example.com")
    member_headers = _register_and_login(client, "team-member20@example.com", name="Member Twenty")
    group = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group["id"], "team-member20@example.com")
    team = _make_team(client, admin_headers, group["id"])
    role = _add_role(client, admin_headers, team["id"], mode="roster")

    members = client.get("/groups/" + group["id"] + "/members", headers=admin_headers).json()
    member_id = next(m["user_id"] for m in members if m["email"] == "team-member20@example.com")

    member_entry = client.post(
        "/teams/roles/" + role["id"] + "/signups", json={"user_id": member_id}, headers=admin_headers
    ).json()
    guest_entry = client.post(
        "/teams/roles/" + role["id"] + "/signups", json={"name": "Unenrolled Volunteer"}, headers=admin_headers
    ).json()

    # The member can remove their own admin-assigned roster entry.
    self_remove = client.delete("/teams/signups/" + member_entry["id"], headers=member_headers)
    assert self_remove.status_code == 204

    # But the member cannot remove the guest_name-only entry: there's no
    # "self" for a member to match against a null user_id.
    forbidden = client.delete("/teams/signups/" + guest_entry["id"], headers=member_headers)
    assert forbidden.status_code == 403

    # The admin can remove it.
    admin_remove = client.delete("/teams/signups/" + guest_entry["id"], headers=admin_headers)
    assert admin_remove.status_code == 204
