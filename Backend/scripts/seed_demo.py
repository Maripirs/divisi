#!/usr/bin/env python3
"""Seed the "Divisi Demo Choir" showcase group on a live backend.

This drives the real HTTP API exactly as a choir admin would from the
Frontend: register/login the dedicated `demo-admin` account, create the
group, upload + review + distribute a handful of public-domain motets, and
fill in the non-piece pages (homework, one weekly note, a responsibilities
schedule with a few dates). The point is a permanent, no-login demo any
visitor can reach at `<frontend>/join/DEMOSATB`.

Why an API-driven script and not a DB fixture / Alembic data migration:
the demo has to look and behave like a group a human actually built, and
the only way to guarantee that (review-state transitions, distribution
rows, page-settings seeding, object-storage uploads) is to go through the
same endpoints the app does. It also means this can run against prod from
a laptop without any DB credentials.

Usage:

    # Safe: prints the full plan, makes zero network calls.
    python Backend/scripts/seed_demo.py --dry-run

    # For real (needs DEMO_ADMIN_PASSWORD in the environment):
    DEMO_ADMIN_PASSWORD=... python Backend/scripts/seed_demo.py

    # Against a local backend:
    DEMO_ADMIN_PASSWORD=... python Backend/scripts/seed_demo.py \
        --base-url http://localhost:8000

Every step is idempotent: re-running after a partial failure re-uses the
account/group/pieces/content that already exist rather than duplicating
them, so it is safe to just run it again.

IMPORTANT: group creation always mints a *random* join code (see
`app/core/join_codes.py` and `create_group` in `app/api/routes/groups.py`),
and there is no API to set a chosen one. So the memorable `DEMOSATB` code
is not something this script can apply. It prints a one-line SQL statement
for a human to run against the prod Neon DB afterwards.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# httpx is a hard Backend dependency (see `Backend/pyproject.toml`), so it
# is always importable when the backend's own venv is active. The explicit
# message just saves a confusing traceback if someone runs this with a
# bare interpreter.
try:
    import httpx
except ModuleNotFoundError:  # pragma: no cover - environment sanity check
    sys.exit(
        "This script needs `httpx` (a Backend dependency). Run it with the "
        "backend venv active, or `pip install -e Backend` first."
    )


# --------------------------------------------------------------------------
# Fixed identity of the demo. These are deliberately hard-coded constants,
# not CLI flags: the demo is a single well-known thing, and letting them
# vary per-invocation would just make it easy to seed a second, subtly
# different "demo" by accident.
# --------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://divisi.onrender.com"
DEFAULT_JOIN_CODE = "DEMOSATB"  # what a human sets by hand afterwards (see module docstring)

DEMO_ADMIN_EMAIL = "demo-admin@divisi.maripi.net"
DEMO_ADMIN_NAME = "Divisi Demo"
DEMO_ADMIN_PASSWORD_ENV = "DEMO_ADMIN_PASSWORD"

DEMO_GROUP_NAME = "Divisi Demo Choir"

FRONTEND_BASE_URL = "https://divisi.maripi.net"

# Per-slug piece source files live here, one folder per slug. The user
# downloads CPDL editions into these folders; see `fixtures/demo/README.md`
# for the expected layout and licensing rules. A missing folder or missing
# music file just means "skip this piece" (warn and carry on) so the rest
# of the demo still seeds.
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "demo"

# Extensions we accept, most-preferred first within each kind. MIDI is
# preferred over MusicXML because the player synthesizes it directly; a
# PDF is optional (score-reference view) but nice to have for every piece.
MUSIC_EXTS = (".mid", ".midi", ".mxl", ".musicxml", ".xml")
PDF_EXTS = (".pdf",)

# Four movements of Mozart's Requiem, K. 626 (public domain: Mozart d. 1791,
# Sussmayr's completion d. 1803). Each fixture folder holds a `.mxl`
# (compressed MusicXML, SATB parts + a Piano reduction as backing) and a
# PDF; there is no MIDI, so the player uses its in-browser MusicXML path,
# same as the existing bundled pieces. `default_tempo_bpm` is the player's
# reset-to tempo, taken from each movement's opening `<sound tempo>`.
# `presentation` mirrors the API's allowed values (see `PiecePresentation`
# in `app/api/schemas/library.py`): None = let the player pick,
# "score_reference" = open on the PDF, "play_along" = open on the synth mix.
# `youtube_url` is the reference recording the player offers as an audio
# source: the matching movement from the "Mozart - Requiem (all parts)"
# playlist the human picked.
PIECES: list[dict[str, Any]] = [
    {
        "slug": "kyrie",
        "title": "Requiem: Kyrie",
        "composer": "W. A. Mozart, Requiem K. 626",
        "default_tempo_bpm": 80,
        "youtube_url": "https://www.youtube.com/watch?v=2C0DUrxm-Os",
    },
    {
        "slug": "domine-jesu",
        "title": "Requiem: Domine Jesu",
        "composer": "W. A. Mozart, Requiem K. 626",
        "default_tempo_bpm": 92,
        "youtube_url": "https://www.youtube.com/watch?v=dAFWHHstbJI",
    },
    {
        "slug": "lacrimosa",
        "title": "Requiem: Lacrimosa",
        "composer": "W. A. Mozart, Requiem K. 626",
        "default_tempo_bpm": 60,
        "youtube_url": "https://www.youtube.com/watch?v=2wGLDVEXK5M",
    },
    {
        "slug": "agnus-dei",
        "title": "Requiem: Agnus Dei",
        "composer": "W. A. Mozart, Requiem K. 626",
        "default_tempo_bpm": 50,
        "youtube_url": "https://www.youtube.com/watch?v=BZpFa7iDwBI",
    },
]


# --------------------------------------------------------------------------
# A thin API client. Every write goes through `_write`, which is the single
# place `--dry-run` short-circuits: in dry-run mode it prints the call and
# returns a synthetic response, so the rest of the script runs end to end
# with zero network I/O (and zero need for a password).
# --------------------------------------------------------------------------


class DryRunSkip(Exception):
    """Raised internally when a dry-run has no real response to return and
    the caller genuinely needs one (e.g. an id to keep going). Callers
    that can proceed on a synthetic value never see this."""


class ApiClient:
    def __init__(self, base_url: str, dry_run: bool) -> None:
        self.base_url = base_url.rstrip("/")
        self.dry_run = dry_run
        self.token: str | None = None
        # A single client so connections are pooled across the ~40 calls a
        # full seed makes. The generous timeout is for Render's free-tier
        # cold start: the first request can sit for ~30s while the instance
        # wakes (see `keepwarm/` and the backend cold-start memory note).
        self._client = httpx.Client(timeout=60.0)

    def close(self) -> None:
        self._client.close()

    # -- low level ---------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get(self, path: str) -> Any:
        """A read. Also short-circuited in dry-run (returns an empty list):
        we can't authenticate without a password there, and "nothing
        exists yet" makes the planner print the full create path."""
        if self.dry_run:
            print(f"  [dry-run] GET {path}")
            return []
        resp = self._client.get(self._url(path), headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def _write(
        self,
        method: str,
        path: str,
        *,
        ok_statuses: tuple[int, ...] = (200, 201),
        tolerated_conflict_markers: tuple[str, ...] = (),
        dry_result: Any = None,
        **kwargs: Any,
    ) -> Any:
        """A mutating call (POST/PUT/PATCH/DELETE).

        `tolerated_conflict_markers`: substrings of a 409 `detail` that
        mean "already in the desired state" and should be treated as
        success (e.g. "Already distributed", "already a member"). Returns
        the parsed JSON body, or `None` on a tolerated conflict / empty
        body.
        """
        summary = _summarize_request(kwargs)
        if self.dry_run:
            print(f"  [dry-run] {method} {path}{summary}")
            if dry_result is None:
                raise DryRunSkip
            return dry_result

        print(f"  {method} {path}{summary}")
        resp = self._client.request(method, self._url(path), headers=self._headers(), **kwargs)
        if resp.status_code == 409 and tolerated_conflict_markers:
            detail = _error_detail(resp)
            if any(marker.lower() in detail.lower() for marker in tolerated_conflict_markers):
                print(f"    -> 409 tolerated: {detail}")
                return None
        if resp.status_code not in ok_statuses:
            raise RuntimeError(
                f"{method} {path} -> {resp.status_code}: {_error_detail(resp)}"
            )
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # -- endpoints used by the seed --------------------------------------

    def register(self, email: str, name: str, password: str) -> None:
        # 409 "Email already registered" is the normal case on a re-run.
        self._write(
            "POST",
            "/auth/register",
            ok_statuses=(201,),
            tolerated_conflict_markers=("already registered",),
            dry_result={},
            json={"email": email, "name": name, "password": password},
        )

    def login(self, email: str, password: str) -> str:
        body = self._write(
            "POST",
            "/auth/login",
            ok_statuses=(200,),
            dry_result={"access_token": "<dry-run-token>"},
            json={"email": email, "password": password},
        )
        self.token = body["access_token"]
        return self.token


def _summarize_request(kwargs: dict[str, Any]) -> str:
    """A compact one-line echo of a request body for the console log —
    JSON keys, or multipart field names + file names, never the file
    bytes."""
    if "json" in kwargs:
        return f"  {kwargs['json']}"
    parts: list[str] = []
    for key, value in (kwargs.get("data") or {}).items():
        parts.append(f"{key}={value}")
    for key, spec in (kwargs.get("files") or {}).items():
        filename = spec[0] if isinstance(spec, (list, tuple)) else spec
        parts.append(f"{key}=<file {filename}>")
    return f"  {{{', '.join(parts)}}}" if parts else ""


def _error_detail(resp: httpx.Response) -> str:
    try:
        payload = resp.json()
    except ValueError:
        return resp.text.strip()
    if isinstance(payload, dict) and "detail" in payload:
        return str(payload["detail"])
    return str(payload)


# --------------------------------------------------------------------------
# Fixture discovery
# --------------------------------------------------------------------------


def _first_with_ext(folder: Path, exts: tuple[str, ...]) -> Path | None:
    """First file in `folder` whose extension is in `exts`, honouring the
    preference order of `exts` (all `.mid` before any `.mxl`, etc.).
    Filenames themselves don't matter, only extensions."""
    for ext in exts:
        matches = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ext)
        if matches:
            return matches[0]
    return None


def _content_type_for(path: Path) -> str:
    return {
        ".mid": "audio/midi",
        ".midi": "audio/midi",
        ".mxl": "application/vnd.recordare.musicxml",
        ".musicxml": "application/vnd.recordare.musicxml+xml",
        ".xml": "application/xml",
        ".pdf": "application/pdf",
    }.get(path.suffix.lower(), "application/octet-stream")


# --------------------------------------------------------------------------
# Seed steps
# --------------------------------------------------------------------------


def ensure_admin_and_login(api: ApiClient, password: str | None) -> None:
    print("\n== demo-admin account ==")
    if api.dry_run:
        print(f"  would register + login {DEMO_ADMIN_EMAIL} (name {DEMO_ADMIN_NAME!r})")
        api.register(DEMO_ADMIN_EMAIL, DEMO_ADMIN_NAME, "<dry-run>")
        api.login(DEMO_ADMIN_EMAIL, "<dry-run>")
        return
    assert password is not None  # guarded in main()
    api.register(DEMO_ADMIN_EMAIL, DEMO_ADMIN_NAME, password)
    api.login(DEMO_ADMIN_EMAIL, password)
    print("  logged in")


def ensure_group(api: ApiClient) -> dict[str, Any]:
    """Find the demo group by name, or create it. Returns the group dict
    (`id`, `name`, `join_code`, ...)."""
    print("\n== group ==")
    groups = api.get("/groups")
    existing = next((g for g in groups if g.get("name") == DEMO_GROUP_NAME), None)
    if existing is not None:
        print(f"  found existing group {existing['id']} (join_code {existing['join_code']})")
        return existing

    try:
        created = api._write(
            "POST",
            "/groups",
            ok_statuses=(201,),
            dry_result={"id": "<dry-run-group-id>", "name": DEMO_GROUP_NAME, "join_code": "<random>"},
            json={"name": DEMO_GROUP_NAME},
        )
    except DryRunSkip:
        created = {"id": "<dry-run-group-id>", "name": DEMO_GROUP_NAME, "join_code": "<random>"}
    print(f"  created group {created['id']} (join_code {created['join_code']})")
    return created


# Pages the demo opens to unauthenticated guests. `tracks` is already
# `everyone` by default (see `app/services/pages.py`'s `DEFAULT_AUDIENCE`);
# the rest default to `members`, which is why a fresh group's guest view
# 404s its homework / weekly notes / responsibilities. A public demo wants
# all of them visible, matching the "guests see what members see" principle.
GUEST_VISIBLE_PAGES = ("homework", "weekly_notes", "responsibilities", "about")


def seed_page_settings(api: ApiClient, group_id: str) -> None:
    """Flip the demo group's homework / weekly-notes / responsibilities /
    about pages to `audience=everyone` so the guest routes serve them. The
    endpoint is a partial update keyed by page, so re-running just re-sets
    the same four rows."""
    print("\n== page visibility ==")
    _tolerant_json_put(
        api,
        f"/groups/{group_id}/page-settings",
        {
            "pages": [
                {"page": page, "enabled": True, "audience": "everyone"}
                for page in GUEST_VISIBLE_PAGES
            ]
        },
    )
    print(f"  opened to guests: {', '.join(GUEST_VISIBLE_PAGES)}")


def seed_pieces(api: ApiClient, group_id: str) -> tuple[list[str], list[str]]:
    """Upload + submit + approve + distribute each manifest piece whose
    fixture folder is present. Returns (seeded_titles, skipped_titles)."""
    print("\n== pieces ==")
    library = api.get("/library/pieces")
    existing_by_title = {entry["title"]: entry for entry in library}

    seeded: list[str] = []
    skipped: list[str] = []

    for spec in PIECES:
        slug = spec["slug"]
        title = spec["title"]
        folder = FIXTURES_DIR / slug
        print(f"\n  - {title} ({slug})")

        if not folder.is_dir():
            print(f"    SKIP: no fixture folder at {folder}")
            skipped.append(title)
            continue
        music = _first_with_ext(folder, MUSIC_EXTS)
        pdf = _first_with_ext(folder, PDF_EXTS)
        if music is None:
            print(f"    SKIP: no music file ({'/'.join(MUSIC_EXTS)}) in {folder}")
            skipped.append(title)
            continue
        print(f"    music: {music.name}" + (f"  pdf: {pdf.name}" if pdf else "  (no pdf)"))

        already = existing_by_title.get(title)
        if already is not None:
            print(f"    piece already in library ({already['piece_id']}, status {already['version_status']})")
            _reconcile_details(api, already["piece_id"], spec)
            _ensure_distributed(api, already["piece_id"], already["version_id"])
            seeded.append(title)
            continue

        piece_id, version_id = _upload_piece(api, group_id, spec, music, pdf)
        _ensure_distributed(api, piece_id, version_id)
        seeded.append(title)

    return seeded, skipped


def _upload_piece(
    api: ApiClient,
    group_id: str,
    spec: dict[str, Any],
    music: Path,
    pdf: Path | None,
) -> tuple[str, str]:
    data: dict[str, Any] = {
        "title": spec["title"],
        "owner_type": "group",
        "group_id": group_id,
        "composer": spec["composer"],
    }
    if spec.get("default_tempo_bpm") is not None:
        data["default_tempo_bpm"] = str(spec["default_tempo_bpm"])
    if spec.get("presentation"):
        data["presentation"] = spec["presentation"]
    if spec.get("youtube_url"):
        data["youtube_url"] = spec["youtube_url"]

    # httpx closes these file handles when the request context ends; the
    # `with` keeps them open for exactly the one multipart POST.
    with music.open("rb") as music_fh:
        files: dict[str, Any] = {"file": (music.name, music_fh, _content_type_for(music))}
        pdf_fh = pdf.open("rb") if pdf is not None else None
        if pdf_fh is not None:
            files["pdf_file"] = (pdf.name, pdf_fh, _content_type_for(pdf))
        try:
            body = api._write(
                "POST",
                "/library/pieces",
                ok_statuses=(201,),
                dry_result={"piece": {"id": "<dry-run-piece-id>"}, "version": {"id": "<dry-run-version-id>"}},
                data=data,
                files=files,
            )
        except DryRunSkip:
            body = {"piece": {"id": "<dry-run-piece-id>"}, "version": {"id": "<dry-run-version-id>"}}
        finally:
            if pdf_fh is not None:
                pdf_fh.close()

    piece_id = body["piece"]["id"]
    version_id = body["version"]["id"]
    print(f"    uploaded piece {piece_id} version {version_id}")
    return piece_id, version_id


def _reconcile_details(api: ApiClient, piece_id: str, spec: dict[str, Any]) -> None:
    """Push the manifest's composer / tempo / reference recording onto a
    piece that already exists, so editing `PIECES` (e.g. swapping a
    YouTube link) and re-running actually updates the live piece rather
    than silently no-op'ing. `PATCH /library/pieces/{id}` takes the full
    `PieceDetailsUpdate` shape, so unset fields are sent as their cleared
    value (None) on purpose."""
    _tolerant_json_patch(
        api,
        f"/library/pieces/{piece_id}",
        {
            "title": spec["title"],
            "composer": spec["composer"],
            "youtube_url": spec.get("youtube_url"),
            "default_tempo_bpm": spec.get("default_tempo_bpm"),
            "presentation": spec.get("presentation"),
        },
    )
    print("    details reconciled (composer / tempo / reference recording)")


def _ensure_distributed(api: ApiClient, piece_id: str, version_id: str) -> None:
    """Walk the review lifecycle (draft -> submitted -> approved) and then
    distribute. Each step tolerates the 409 it raises when the version is
    already past that point, so this is safe to call on a piece that was
    fully seeded on a previous run."""
    # submit: 409 "not in draft status" once it is already submitted+.
    _tolerant_post(api, f"/library/versions/{version_id}/submit", ("not in draft",))
    _tolerant_post(api, f"/library/versions/{version_id}/approve", ("not pending review",))
    _tolerant_post(
        api,
        f"/library/pieces/{piece_id}/versions/{version_id}/distribute",
        ("already distributed",),
    )
    print("    submitted + approved + distributed")


def _tolerant_post(api: ApiClient, path: str, conflict_markers: tuple[str, ...]) -> None:
    try:
        api._write("POST", path, tolerated_conflict_markers=conflict_markers, dry_result={})
    except DryRunSkip:
        pass


def seed_homework(api: ApiClient, group_id: str, titles_to_piece: dict[str, str]) -> list[str]:
    """A few assignments, due a week or two out. One is linked to a seeded
    piece by `piece_id` when that piece made it in."""
    print("\n== homework ==")
    existing = {row["title"] for row in api.get(f"/groups/{group_id}/homework")}

    now = datetime.now(timezone.utc).replace(microsecond=0)
    plan = [
        {
            "title": "Kyrie: notes and rhythms",
            "range": "mm. 1-52",
            "instructions": "Learn your part's notes and rhythms for the double fugue. "
            "Slow, with the score, hands off the keyboard once the subject and "
            "countersubject are solid.",
            "due_date": (now + timedelta(days=10)).isoformat(),
            "piece_title": "Requiem: Kyrie",
        },
        {
            "title": "Lacrimosa: off book, mm. 1-8",
            "range": "mm. 1-8",
            "instructions": "Memorize the opening through the first climax. "
            "Be ready to sing it without music at the next rehearsal.",
            "due_date": (now + timedelta(days=14)).isoformat(),
            "piece_title": "Requiem: Lacrimosa",
        },
        {
            "title": "Domine Jesu: Latin diction",
            "range": "Full movement",
            "instructions": "Review the IPA sheet and speak the text in rhythm. "
            "No pitches needed yet, just clean vowels and final consonants.",
            "due_date": (now + timedelta(days=18)).isoformat(),
            "piece_title": None,
        },
    ]

    created: list[str] = []
    for item in plan:
        if item["title"] in existing:
            print(f"  skip (exists): {item['title']}")
            continue
        payload: dict[str, Any] = {
            "title": item["title"],
            "range": item["range"],
            "instructions": item["instructions"],
            "due_date": item["due_date"],
        }
        piece_id = titles_to_piece.get(item["piece_title"]) if item["piece_title"] else None
        if piece_id:
            payload["piece_id"] = piece_id
        _tolerant_json_post(api, f"/groups/{group_id}/homework", payload)
        created.append(item["title"])
        print(f"  created: {item['title']}")
    return created


def seed_weekly_note(api: ApiClient, group_id: str) -> list[str]:
    print("\n== weekly note ==")
    title = "Welcome to the demo choir"
    existing = {row["title"] for row in api.get(f"/groups/{group_id}/weekly-notes")}
    if title in existing:
        print(f"  skip (exists): {title}")
        return []
    now = datetime.now(timezone.utc).replace(microsecond=0)
    body = (
        "This is a read-only tour of what a Divisi choir page looks like. "
        "Open any piece to try the synced score and audio, switch which part you hear, "
        "and check the Homework and Responsibilities tabs to see how a real week is organized. "
        "Nothing here needs an account."
    )
    _tolerant_json_post(
        api,
        f"/groups/{group_id}/weekly-notes",
        {"title": title, "body": body, "note_date": now.isoformat()},
    )
    print(f"  created: {title}")
    return [title]


def seed_responsibilities(api: ApiClient, group_id: str) -> dict[str, Any]:
    """One "Rehearsal setup" schedule with a few roles, three upcoming
    dates, and the schedule attached to each date. Signups are left empty
    on purpose: an underfilled sheet is the more useful thing to show."""
    print("\n== responsibilities ==")
    schedule_name = "Rehearsal setup"
    roles_wanted = [
        {"name": "Chairs and stands", "needed_count": 2},
        {"name": "Sign-in desk", "needed_count": 1},
        {"name": "Refreshments", "needed_count": 1},
    ]

    schedules = api.get(f"/groups/{group_id}/responsibilities/schedules")
    schedule = next((s for s in schedules if s.get("name") == schedule_name), None)
    if schedule is not None:
        print(f"  found schedule {schedule['id']}")
    else:
        try:
            # Created with no roles here; roles are added one by one below
            # so a half-finished previous run can be topped up.
            schedule = api._write(
                "POST",
                f"/groups/{group_id}/responsibilities/schedules",
                ok_statuses=(201,),
                dry_result={"id": "<dry-run-schedule-id>", "name": schedule_name, "roles": []},
                json={"name": schedule_name, "roles": []},
            )
        except DryRunSkip:
            schedule = {"id": "<dry-run-schedule-id>", "name": schedule_name, "roles": []}
        print(f"  created schedule {schedule['id']}")

    schedule_id = schedule["id"]
    have_roles = {r["name"] for r in schedule.get("roles", [])}
    for role in roles_wanted:
        if role["name"] in have_roles:
            print(f"  skip role (exists): {role['name']}")
            continue
        _tolerant_json_post(api, f"/responsibilities/schedules/{schedule_id}/roles", role)
        print(f"  added role: {role['name']}")

    # Three dates spread across the next month. `date` is a datetime; the
    # API's `ResponsibilityDateCreate` also *requires* a non-empty
    # `schedule_ids`, so the date is born already attached to our schedule.
    now = datetime.now(timezone.utc).replace(microsecond=0, second=0, minute=0, hour=19)
    wanted_dates = [now + timedelta(days=offset) for offset in (7, 14, 28)]
    existing_dates = api.get(f"/groups/{group_id}/responsibilities/dates")
    existing_date_days = {row["date"][:10] for row in existing_dates}

    created_dates = 0
    for when in wanted_dates:
        if when.isoformat()[:10] in existing_date_days:
            print(f"  skip date (exists): {when.date()}")
            continue
        try:
            date_row = api._write(
                "POST",
                f"/groups/{group_id}/responsibilities/dates",
                ok_statuses=(201,),
                dry_result={"id": "<dry-run-date-id>"},
                json={
                    "date": when.isoformat(),
                    "notes": "Weekly rehearsal",
                    "schedule_ids": [schedule_id],
                },
            )
        except DryRunSkip:
            date_row = {"id": "<dry-run-date-id>"}
        # Explicit attach as well: it is a no-op 409 here (the date was
        # created with this schedule already attached), but it keeps the
        # step visible and covers the theoretical case of a date that
        # exists without our schedule.
        _tolerant_json_post(
            api,
            f"/responsibilities/dates/{date_row['id']}/schedules",
            {"schedule_id": schedule_id},
            conflict_markers=("already on this date",),
        )
        created_dates += 1
        print(f"  created date: {when.date()} (schedule attached)")

    return {"schedule_id": schedule_id, "dates_created": created_dates}


def _tolerant_json_post(
    api: ApiClient,
    path: str,
    payload: dict[str, Any],
    *,
    conflict_markers: tuple[str, ...] = (),
) -> None:
    try:
        api._write(
            "POST",
            path,
            ok_statuses=(200, 201),
            tolerated_conflict_markers=conflict_markers,
            dry_result={},
            json=payload,
        )
    except DryRunSkip:
        pass


def _tolerant_json_patch(api: ApiClient, path: str, payload: dict[str, Any]) -> None:
    try:
        api._write("PATCH", path, ok_statuses=(200,), dry_result={}, json=payload)
    except DryRunSkip:
        pass


def _tolerant_json_put(api: ApiClient, path: str, payload: dict[str, Any]) -> None:
    try:
        api._write("PUT", path, ok_statuses=(200,), dry_result={}, json=payload)
    except DryRunSkip:
        pass


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def _print_join_code_reminder(group: dict[str, Any], desired_code: str) -> None:
    current = group.get("join_code")
    print("\n== join code ==")
    if current == desired_code:
        print(f"  already {desired_code!r}, nothing to do")
        return
    print(
        f"  the group's join code is currently {current!r}, not {desired_code!r}.\n"
        "  There is no API to change it. Run this ONE statement against the prod\n"
        "  Neon database (psql or the Neon SQL editor) to set the memorable code:\n"
    )
    print(f"      UPDATE groups SET join_code = '{desired_code}' WHERE id = '{group['id']}';\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--join-code",
        default=DEFAULT_JOIN_CODE,
        help=(
            "Memorable join code the demo should end up with (default: "
            f"{DEFAULT_JOIN_CODE}). Used only for the printed SQL reminder and the "
            "final guest URL, never sent to the API (there is no endpoint for it)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the full plan and make zero network calls. No password needed.",
    )
    args = parser.parse_args()

    password = os.environ.get(DEMO_ADMIN_PASSWORD_ENV)
    if not args.dry_run and not password:
        sys.exit(
            f"Set {DEMO_ADMIN_PASSWORD_ENV} in the environment (the password for "
            f"{DEMO_ADMIN_EMAIL}), or pass --dry-run to preview without it."
        )

    print(f"Divisi demo seed  ->  {args.base_url}" + ("   [DRY RUN]" if args.dry_run else ""))
    if not FIXTURES_DIR.is_dir():
        print(f"NOTE: {FIXTURES_DIR} does not exist yet; all pieces will be skipped.")

    api = ApiClient(args.base_url, args.dry_run)
    try:
        ensure_admin_and_login(api, password)
        group = ensure_group(api)
        group_id = group["id"]

        seed_page_settings(api, group_id)
        seeded_pieces, skipped_pieces = seed_pieces(api, group_id)

        # Map title -> piece_id for the homework links, from the freshly
        # re-read library (covers both this run's uploads and prior runs').
        titles_to_piece = {
            entry["title"]: entry["piece_id"] for entry in api.get("/library/pieces")
        }
        homework = seed_homework(api, group_id, titles_to_piece)
        weekly = seed_weekly_note(api, group_id)
        responsibilities = seed_responsibilities(api, group_id)

        _print_join_code_reminder(group, args.join_code)

        print("\n== summary ==")
        print(f"  group id:        {group_id}")
        print(f"  join code:       current {group.get('join_code')!r}, target {args.join_code!r}")
        print(f"  pieces seeded:   {seeded_pieces or '(none)'}")
        print(f"  pieces skipped:  {skipped_pieces or '(none)'}")
        print(f"  homework added:  {homework or '(none new)'}")
        print(f"  weekly note:     {weekly or '(none new)'}")
        print(
            "  responsibilities: schedule "
            f"{responsibilities['schedule_id']}, {responsibilities['dates_created']} new date(s)"
        )
        print(f"\n  guest URL:       {FRONTEND_BASE_URL}/join/{args.join_code}")
        if args.dry_run:
            print("\n  (dry run: nothing above actually happened)")
    finally:
        api.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
