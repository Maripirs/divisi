"""B13: schedules/roles/dates/signups, and the guest coverage-only view."""


def _register_and_login(client, email, name="Name", password="hunter22"):
    client.post("/auth/register", json={"email": email, "name": name, "password": password})
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_group(client, admin_headers, name="G"):
    return client.post("/groups", json={"name": name}, headers=admin_headers).json()["id"]


def _add_member(client, admin_headers, group_id, email):
    client.post("/groups/" + group_id + "/members", json={"email": email}, headers=admin_headers)


def _make_schedule(client, admin_headers, group_id, roles=None, name="Sunday Service"):
    roles = roles if roles is not None else [{"name": "Cantor", "needed_count": 1}]
    return client.post(
        "/groups/" + group_id + "/responsibilities/schedules",
        json={"name": name, "roles": roles},
        headers=admin_headers,
    ).json()


def _make_date(client, admin_headers, schedule, date="2026-09-06T10:00:00Z", notes="", schedule_ids=None):
    """`schedule` is a schedule dict (as returned by `_make_schedule`); its
    `group_id` and `id` drive the new group-scoped, many-role-set create
    route. Pass `schedule_ids` explicitly to attach several role sets."""
    group_id = schedule["group_id"]
    ids = schedule_ids if schedule_ids is not None else [schedule["id"]]
    return client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": date, "notes": notes, "schedule_ids": ids},
        headers=admin_headers,
    ).json()


def test_admin_can_create_schedule_with_roles(client):
    admin_headers = _register_and_login(client, "resp-admin@example.com")
    group_id = _make_group(client, admin_headers)

    schedule = _make_schedule(
        client, admin_headers, group_id, roles=[{"name": "Cantor", "needed_count": 1}, {"name": "Lector", "needed_count": 2}]
    )
    assert schedule["name"] == "Sunday Service"
    assert {r["name"]: r["needed_count"] for r in schedule["roles"]} == {"Cantor": 1, "Lector": 2}


def test_member_cannot_create_schedule_or_date(client):
    admin_headers = _register_and_login(client, "resp-admin2@example.com")
    member_headers = _register_and_login(client, "resp-member2@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-member2@example.com")

    forbidden = client.post(
        "/groups/" + group_id + "/responsibilities/schedules",
        json={"name": "X", "roles": []},
        headers=member_headers,
    )
    assert forbidden.status_code == 403

    schedule = _make_schedule(client, admin_headers, group_id)
    forbidden_date = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [schedule["id"]]},
        headers=member_headers,
    )
    assert forbidden_date.status_code == 403


def test_admin_can_add_and_edit_roles(client):
    admin_headers = _register_and_login(client, "resp-admin3@example.com")
    group_id = _make_group(client, admin_headers)
    schedule = _make_schedule(client, admin_headers, group_id, roles=[])

    role = client.post(
        "/responsibilities/schedules/" + schedule["id"] + "/roles",
        json={"name": "Cantor", "needed_count": 1},
        headers=admin_headers,
    ).json()
    assert role["name"] == "Cantor"

    updated = client.patch(
        "/responsibilities/roles/" + role["id"], json={"needed_count": 3}, headers=admin_headers
    ).json()
    assert updated["needed_count"] == 3
    assert updated["name"] == "Cantor"  # untouched field stays as-is


def test_non_member_cannot_see_group_responsibilities(client):
    admin_headers = _register_and_login(client, "resp-admin4@example.com")
    outsider_headers = _register_and_login(client, "resp-outsider4@example.com")
    group_id = _make_group(client, admin_headers)
    _make_schedule(client, admin_headers, group_id)

    assert (
        client.get("/groups/" + group_id + "/responsibilities/dates", headers=outsider_headers).status_code == 403
    )
    assert (
        client.get("/groups/" + group_id + "/responsibilities/schedules", headers=outsider_headers).status_code
        == 403
    )


def test_member_self_signup_and_remove(client):
    admin_headers = _register_and_login(client, "resp-admin5@example.com")
    member_headers = _register_and_login(client, "resp-member5@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-member5@example.com")
    schedule = _make_schedule(client, admin_headers, group_id)
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]

    signup = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": role_id},
        headers=member_headers,
    )
    assert signup.status_code == 201
    signup_id = signup.json()["id"]

    listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=member_headers).json()
    role_out = listing[0]["schedules"][0]["roles"][0]
    assert role_out["active_count"] == 1
    assert role_out["status"] == "covered"
    assert [s["email"] for s in role_out["signups"]] == ["resp-member5@example.com"]

    remove = client.delete("/responsibilities/signups/" + signup_id, headers=member_headers)
    assert remove.status_code == 204

    listing_after = client.get("/groups/" + group_id + "/responsibilities/dates", headers=member_headers).json()
    assert listing_after[0]["schedules"][0]["roles"][0]["active_count"] == 0
    assert listing_after[0]["schedules"][0]["roles"][0]["status"] == "underfilled"


def test_member_cannot_remove_someone_elses_signup(client):
    admin_headers = _register_and_login(client, "resp-admin6@example.com")
    member_a = _register_and_login(client, "resp-a6@example.com")
    member_b = _register_and_login(client, "resp-b6@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-a6@example.com")
    _add_member(client, admin_headers, group_id, "resp-b6@example.com")
    schedule = _make_schedule(client, admin_headers, group_id)
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]

    signup = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_id}, headers=member_a
    ).json()

    forbidden = client.delete("/responsibilities/signups/" + signup["id"], headers=member_b)
    assert forbidden.status_code == 403


def test_locked_date_blocks_member_signup_and_removal_but_not_admin(client):
    admin_headers = _register_and_login(client, "resp-admin7@example.com")
    member_headers = _register_and_login(client, "resp-member7@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-member7@example.com")
    schedule = _make_schedule(client, admin_headers, group_id)
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]

    signup = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_id}, headers=member_headers
    ).json()

    lock = client.patch("/responsibilities/dates/" + date["id"], json={"locked": True}, headers=admin_headers)
    assert lock.status_code == 200
    assert lock.json()["locked"] is True

    blocked_remove = client.delete("/responsibilities/signups/" + signup["id"], headers=member_headers)
    assert blocked_remove.status_code == 409

    # member_headers already has a signup for this role; sign up for a
    # second role instead, so a 409 here can only mean "locked", not
    # "already signed up for this exact role".
    second_role = client.post(
        "/responsibilities/schedules/" + schedule["id"] + "/roles",
        json={"name": "Lector", "needed_count": 1},
        headers=admin_headers,
    ).json()
    blocked_new_signup = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": second_role["id"]},
        headers=member_headers,
    )
    assert blocked_new_signup.status_code == 409

    # Admin bypasses the lock for both directions.
    admin_remove = client.delete("/responsibilities/signups/" + signup["id"], headers=admin_headers)
    assert admin_remove.status_code == 204
    admin_assign = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": role_id, "user_id": None},
        headers=admin_headers,
    )
    assert admin_assign.status_code == 201


def test_admin_can_assign_and_remove_any_members_signup(client):
    admin_headers = _register_and_login(client, "resp-admin8@example.com")
    member_headers = _register_and_login(client, "resp-member8@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-member8@example.com")
    member_id = client.get("/groups/" + group_id + "/members", headers=admin_headers).json()
    member_user_id = next(m["user_id"] for m in member_id if m["email"] == "resp-member8@example.com")

    schedule = _make_schedule(client, admin_headers, group_id)
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]

    assign = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": role_id, "user_id": member_user_id},
        headers=admin_headers,
    )
    assert assign.status_code == 201
    assert assign.json()["user_id"] == member_user_id

    member_cannot_assign_others = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": role_id, "user_id": "someone-else"},
        headers=member_headers,
    )
    assert member_cannot_assign_others.status_code == 403


def test_coverage_status_underfilled_covered_overfilled(client):
    admin_headers = _register_and_login(client, "resp-admin9@example.com")
    member_headers = _register_and_login(client, "resp-member9@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-member9@example.com")
    schedule = _make_schedule(client, admin_headers, group_id, roles=[{"name": "Lector", "needed_count": 1}])
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]

    def status():
        listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=admin_headers).json()
        return listing[0]["schedules"][0]["roles"][0]["status"]

    assert status() == "underfilled"

    client.post("/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_id}, headers=member_headers)
    assert status() == "covered"

    client.post("/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_id}, headers=admin_headers)
    assert status() == "overfilled"


def test_guest_sees_coverage_but_not_signup_names(client):
    admin_headers = _register_and_login(client, "resp-admin10@example.com")
    member_headers = _register_and_login(client, "resp-member10@example.com")
    group = client.post("/groups", json={"name": "Guest Choir"}, headers=admin_headers).json()
    _add_member(client, admin_headers, group["id"], "resp-member10@example.com")
    client.put(
        "/groups/" + group["id"] + "/page-settings",
        json={"pages": [{"page": "responsibilities", "enabled": True, "audience": "everyone"}]},
        headers=admin_headers,
    )
    schedule = _make_schedule(client, admin_headers, group["id"])
    date = _make_date(client, admin_headers, schedule)
    role_id = schedule["roles"][0]["id"]
    client.post("/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_id}, headers=member_headers)

    response = client.get(f"/guest/{group['join_code']}/responsibilities/dates")
    assert response.status_code == 200
    body = response.json()
    assert body[0]["schedules"][0]["roles"][0]["active_count"] == 1
    assert body[0]["schedules"][0]["roles"][0]["status"] == "covered"
    assert "signups" not in body[0]["schedules"][0]["roles"][0]


def test_guest_responsibilities_hidden_by_default(client):
    admin_headers = _register_and_login(client, "resp-admin11@example.com")
    group = client.post("/groups", json={"name": "Default Choir"}, headers=admin_headers).json()
    _make_schedule(client, admin_headers, group["id"])

    response = client.get(f"/guest/{group['join_code']}/responsibilities/dates")
    assert response.status_code == 404


def test_guest_responsibilities_unknown_join_code_404s(client):
    response = client.get("/guest/NOTAREAL/responsibilities/dates")
    assert response.status_code == 404


def test_date_with_two_role_sets_rolls_up_per_group(client):
    admin_headers = _register_and_login(client, "resp-two1@example.com")
    member_headers = _register_and_login(client, "resp-two1m@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-two1m@example.com")
    sched_a = _make_schedule(
        client, admin_headers, group_id, name="Music", roles=[{"name": "Cantor", "needed_count": 1}]
    )
    sched_b = _make_schedule(
        client, admin_headers, group_id, name="Hospitality", roles=[{"name": "Usher", "needed_count": 2}]
    )

    date = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [sched_a["id"], sched_b["id"]]},
        headers=admin_headers,
    ).json()
    assert len(date["schedules"]) == 2
    by_name = {g["schedule_name"]: g for g in date["schedules"]}
    assert [r["role_name"] for r in by_name["Music"]["roles"]] == ["Cantor"]
    assert [r["role_name"] for r in by_name["Hospitality"]["roles"]] == ["Usher"]

    cantor_id = by_name["Music"]["roles"][0]["role_id"]
    usher_id = by_name["Hospitality"]["roles"][0]["role_id"]
    assert (
        client.post(
            "/responsibilities/dates/" + date["id"] + "/signups",
            json={"role_id": cantor_id},
            headers=member_headers,
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/responsibilities/dates/" + date["id"] + "/signups",
            json={"role_id": usher_id},
            headers=admin_headers,
        ).status_code
        == 201
    )

    listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=admin_headers).json()
    assert len(listing) == 1  # the date appears once despite two role sets
    groups_out = {g["schedule_name"]: g for g in listing[0]["schedules"]}
    assert groups_out["Music"]["roles"][0]["active_count"] == 1
    assert groups_out["Music"]["roles"][0]["status"] == "covered"
    assert groups_out["Hospitality"]["roles"][0]["active_count"] == 1
    assert groups_out["Hospitality"]["roles"][0]["status"] == "underfilled"  # needs 2


def test_create_date_rejects_empty_and_foreign_role_sets(client):
    admin_headers = _register_and_login(client, "resp-cd1@example.com")
    group_id = _make_group(client, admin_headers)
    other_group_id = _make_group(client, admin_headers, name="Other")
    sched = _make_schedule(client, admin_headers, group_id)
    foreign = _make_schedule(client, admin_headers, other_group_id, name="Foreign")

    empty = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": []},
        headers=admin_headers,
    )
    assert empty.status_code == 400

    cross = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [sched["id"], foreign["id"]]},
        headers=admin_headers,
    )
    assert cross.status_code == 404


def test_attach_and_detach_role_sets_on_date(client):
    admin_headers = _register_and_login(client, "resp-att1@example.com")
    member_headers = _register_and_login(client, "resp-att1m@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-att1m@example.com")
    sched_a = _make_schedule(client, admin_headers, group_id, name="A", roles=[{"name": "RoleA", "needed_count": 1}])
    sched_b = _make_schedule(client, admin_headers, group_id, name="B", roles=[{"name": "RoleB", "needed_count": 1}])
    sched_c = _make_schedule(client, admin_headers, group_id, name="C", roles=[{"name": "RoleC", "needed_count": 1}])

    date = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [sched_a["id"], sched_b["id"]]},
        headers=admin_headers,
    ).json()

    attached = client.post(
        "/responsibilities/dates/" + date["id"] + "/schedules",
        json={"schedule_id": sched_c["id"]},
        headers=admin_headers,
    )
    assert attached.status_code == 200
    assert {g["schedule_name"] for g in attached.json()["schedules"]} == {"A", "B", "C"}

    dup = client.post(
        "/responsibilities/dates/" + date["id"] + "/schedules",
        json={"schedule_id": sched_c["id"]},
        headers=admin_headers,
    )
    assert dup.status_code == 409

    role_a = sched_a["roles"][0]["id"]
    role_b = sched_b["roles"][0]["id"]
    client.post("/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_a}, headers=member_headers)
    client.post("/responsibilities/dates/" + date["id"] + "/signups", json={"role_id": role_b}, headers=member_headers)

    detached = client.delete(
        "/responsibilities/dates/" + date["id"] + "/schedules/" + sched_a["id"], headers=admin_headers
    )
    assert detached.status_code == 204

    listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=admin_headers).json()
    groups_out = {g["schedule_name"]: g for g in listing[0]["schedules"]}
    assert "A" not in groups_out
    assert groups_out["B"]["roles"][0]["active_count"] == 1  # B's signup untouched

    # re-attaching A brings it back with no signups (A's were deleted on detach)
    reattached = client.post(
        "/responsibilities/dates/" + date["id"] + "/schedules",
        json={"schedule_id": sched_a["id"]},
        headers=admin_headers,
    ).json()
    a_group = {g["schedule_name"]: g for g in reattached["schedules"]}["A"]
    assert a_group["roles"][0]["active_count"] == 0

    # detaching down to the last remaining role set is a 409
    client.delete("/responsibilities/dates/" + date["id"] + "/schedules/" + sched_a["id"], headers=admin_headers)
    client.delete("/responsibilities/dates/" + date["id"] + "/schedules/" + sched_b["id"], headers=admin_headers)
    last = client.delete(
        "/responsibilities/dates/" + date["id"] + "/schedules/" + sched_c["id"], headers=admin_headers
    )
    assert last.status_code == 409


def test_delete_role_set_keeps_shared_date(client):
    admin_headers = _register_and_login(client, "resp-del1@example.com")
    member_headers = _register_and_login(client, "resp-del1m@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-del1m@example.com")
    sched_a = _make_schedule(client, admin_headers, group_id, name="A", roles=[{"name": "RoleA", "needed_count": 1}])
    sched_b = _make_schedule(client, admin_headers, group_id, name="B", roles=[{"name": "RoleB", "needed_count": 1}])
    date = client.post(
        "/groups/" + group_id + "/responsibilities/dates",
        json={"date": "2026-09-06T10:00:00Z", "schedule_ids": [sched_a["id"], sched_b["id"]]},
        headers=admin_headers,
    ).json()
    client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": sched_b["roles"][0]["id"]},
        headers=member_headers,
    )

    assert client.delete("/responsibilities/schedules/" + sched_a["id"], headers=admin_headers).status_code == 204

    listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=admin_headers).json()
    assert len(listing) == 1  # the shared date survives
    assert [g["schedule_name"] for g in listing[0]["schedules"]] == ["B"]
    assert listing[0]["schedules"][0]["roles"][0]["active_count"] == 1  # B's signup intact


def test_delete_only_role_set_removes_the_date(client):
    admin_headers = _register_and_login(client, "resp-del2@example.com")
    group_id = _make_group(client, admin_headers)
    sched = _make_schedule(client, admin_headers, group_id, name="Solo")
    _make_date(client, admin_headers, sched)

    assert client.delete("/responsibilities/schedules/" + sched["id"], headers=admin_headers).status_code == 204
    listing = client.get("/groups/" + group_id + "/responsibilities/dates", headers=admin_headers).json()
    assert listing == []


def test_signup_with_role_from_unattached_role_set_404s(client):
    admin_headers = _register_and_login(client, "resp-un1@example.com")
    member_headers = _register_and_login(client, "resp-un1m@example.com")
    group_id = _make_group(client, admin_headers)
    _add_member(client, admin_headers, group_id, "resp-un1m@example.com")
    sched_a = _make_schedule(client, admin_headers, group_id, name="A", roles=[{"name": "RoleA", "needed_count": 1}])
    sched_b = _make_schedule(client, admin_headers, group_id, name="B", roles=[{"name": "RoleB", "needed_count": 1}])
    date = _make_date(client, admin_headers, sched_a)  # only A attached

    resp = client.post(
        "/responsibilities/dates/" + date["id"] + "/signups",
        json={"role_id": sched_b["roles"][0]["id"]},
        headers=member_headers,
    )
    assert resp.status_code == 404
