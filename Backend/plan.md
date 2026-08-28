# Project Plan: Divisi Backend

Separate from the root `plan.md` (owned by another session, tracking the iOS app's M-milestones). This plan tracks the backend service only. Milestones prefixed `B` to avoid confusion with the app's `M` milestones when discussed together.

**Current milestone:** none started yet. B12 (group page configuration)
approved 2026-08-28. B11 (deploy to hosting) still separately pending review
from the prior session. B6 done (approved via the human's join-code-format
call, see log); B7's and B8's Claude tasks are also done, still pending the
human's listening / engine-install sign-offs; B9 (Homework/assignments) and B10
(guest privacy controls) both pending review, added to unblock
`Frontend/plan.md`'s expanded F4.

**Current milestone:** none started yet — B13 (Responsibilities) approved
2026-08-28. No further B-milestones are scoped; see Backlog below for
candidates (B7/B8's human-only follow-through, Object Storage wiring, real
job queue, Responsibilities' deferred recurrence/notifications/swap/approval).

## Domain model (agreed, informs B3–B5 below)

```
User            id, email, name, auth
Group           id, name
GroupMembership User × Group, role (admin | member)      — m:n

Piece           id, title, owner_type (user|group), owner_id
PieceVersion    id, piece_id, created_by, created_at, source (original|modification),
                 status (draft|submitted|approved|rejected), reviewed_by, reviewed_at
                 — a member can work on a version and submit it; only an admin's approval
                 makes it distributable (draft/rejected versions are never pushed)
Distribution    piece_version_id, group_id, distributed_at  — admin-only push of an
                 approved version to group members

Annotation      id, user_id, piece_id, position, content   — private by default, attaches
                 to the logical Piece (not a specific PieceVersion) so it carries forward
                 across versions. Accepted risk: position can drift if a modification
                 changes the music at that point.
AnnotationShare annotation_id, shared_with_user_id          — explicit peer-to-peer grant

Homework        id, group_id, piece_id (nullable), title, range, instructions, due_date,
                 created_by, created_at  — a group admin's assignment to their members;
                 unrelated to Piece review/distribution status (B4)

GroupPageSettings group_id, page (homework|tracks|members|about|responsibilities),
                 enabled (bool), audience (members|everyone)  — per-group, per-page
                 visibility; replaces Group.guest_homework_visible (B10). `audience`
                 only matters while `enabled` is true; admins always see every page
                 regardless of either setting.

ResponsibilitySchedule id, group_id, title, description, created_by, status
                 (active|paused|archived), created_at  — a named volunteer program
                 inside a group (e.g. "Snack and rehearsal support"). One-off for
                 now: no recurrence_rule.
ResponsibilityRole     id, schedule_id, name, needed_count, sort_order
ResponsibilityDate     id, schedule_id, date, status (open|locked|cancelled|complete),
                 notes  — one concrete occurrence, admin-created directly (no lazy
                 generation, no signup_deadline)
ResponsibilitySignup   id, responsibility_date_id, responsibility_role_id, user_id,
                 assigned_by_user_id, source (self_signup|admin_assignment),
                 status (active|removed), created_at, removed_at  — soft-removed for
                 admin audit; coverage = needed_count - active signups, per role
```

Stack: Python/FastAPI, Postgres (SQLAlchemy + Alembic migrations), local-disk file storage
for MVP (swappable to S3 later), JWT auth, background-task-based OMR job tracking (not a
full queue yet), docker-compose for local dev.

## Milestones

### B1 — Backend scaffold [x]

**Acceptance criteria:**
- [x] `docker-compose up` starts the API + Postgres; `GET /health` returns 200
- [x] `alembic upgrade head` runs clean against the Postgres container (no real migrations yet — just the harness working)
- [x] `/auth`, `/omr`, `/library` routers are registered and reachable (stub responses), confirming the route structure holds together

**Tasks — Claude:**
- [x] Scaffold `Backend/` per the agreed layout: `app/main.py`, `app/api/routes/{auth,omr,library}.py`, `app/core/{config,security}.py`, `app/db/{session,models}.py` + `migrations/`, `app/omr/{audiveris,oemer,pipeline}.py`, `app/jobs/`, `app/storage/files.py`
- [x] `pyproject.toml` (FastAPI, uvicorn, SQLAlchemy, Alembic, psycopg2, python-jose, pydantic-settings)
- [x] `app/core/config.py`: pydantic `Settings` from env vars (DB URL, JWT secret)
- [x] `app/main.py`: app instance, `/health` endpoint, routers registered
- [x] Configure Alembic (`alembic.ini`, `env.py`) against `app/db/models.py` (empty for now)
- [x] `docker-compose.yml` (api + postgres services), `Dockerfile`, `.env.example`
- [x] `Backend/README.md`: local run instructions
- [x] Extend root `.gitignore` for Python (`.venv/`, `__pycache__/`, `.env`)
- [x] Verify: `docker-compose up` + hit `/health` + `/auth`, `/omr`, `/library` stubs + `alembic upgrade head`

**Tasks — Human:**
- [x] Start Docker Desktop locally (daemon wasn't running as of scaffold time) so the verification step above can run — done by Claude this round since it was just a launch, not a credential/account step

### B2 — Auth [x]

**Acceptance criteria:**
- [x] Register + login issue a working JWT; a protected route rejects requests without a valid token

**Tasks — Claude:**
- [x] `User` SQLAlchemy model + Alembic migration
- [x] `/auth/register`, `/auth/login` endpoints; password hashing; JWT issuance
- [x] Auth dependency for protecting routes (`/auth/me`)

### B3 — Group + membership [x]

**Acceptance criteria:**
- [x] A user can create a group, invite/add members, and only an admin can perform admin-only actions

**Tasks — Claude:**
- [x] `Group`, `GroupMembership` models + migration
- [x] CRUD endpoints: create group, add/remove member, list my groups, role enforcement

### B4 — Piece, versions, distribution, review [x]

**Acceptance criteria:**
- [x] A group admin can upload a piece and push a version to all members; a member sees it in their library
- [x] An individual can upload/own a piece independent of any group
- [x] A member can submit a worked-on version for review; an admin can approve (making it distributable) or reject it; members never receive draft/rejected versions

**Tasks — Claude:**
- [x] `Piece`, `PieceVersion`, `Distribution` models + migration
- [x] Upload endpoint (stores file via `app/storage/files.py`), version creation, group-push endpoint (admin-only), per-user library listing
- [x] Submit-for-review endpoint (member), approve/reject endpoints (admin-only), status transitions enforced server-side

### B5 — Annotations + sharing [x]

**Acceptance criteria:**
- [x] A user's annotation on a piece is invisible to others by default, and becomes visible to a specific peer once explicitly shared

**Tasks — Claude:**
- [x] `Annotation`, `AnnotationShare` models + migration
- [x] CRUD endpoints scoped to the owning user; share/unshare endpoint; visibility check on read

### B6 — Guest access (join links) [x]

Needed by the new `Frontend/` web player (see its `plan.md`) — the product pivoted to
guests joining a group's practice tracks via a shareable link, no login required
unless they want to save annotations. This is additive: existing member-authenticated
flows (B2–B5) are unaffected.

**Acceptance criteria:**
- [x] A group has a join code/link; resolving it with no `Authorization` header returns the group's distributed pieces
- [x] An invalid/unknown join code returns a clear 404 — no crash, no leaking other groups' data
- [x] A guest can fetch a specific distributed piece's file/notation data by id, but only if it's actually been distributed to that group (no guessing a piece id into arbitrary access)

**Tasks — Claude:**
- [x] Add a `join_code` field to `Group` (+ migration), generated at group creation
- [x] Public (unauthenticated) endpoint: resolve `join_code` → group name + its distributed pieces (title, version, file reference)
- [x] Public (unauthenticated) endpoint: fetch a specific distributed piece's file, scoped to that group's actual distributions
- [x] Decide (doesn't have to be a full implementation yet) how to harden the public endpoints against brute-forcing join codes

**Tasks — Human:**
- [x] Decide join-code format (short memorable code vs. opaque token) and how admins see/share it — chose short code (see log)

### B7 — MIDI → audio + notation rendering pipeline [ ]

Feeds `Frontend/plan.md`'s F2 (accurate synced playback) and F3 (notation
follow-along) — both need this to exist before they can do anything real. Ported
from the iOS app's proven design (`MIDIParser`'s voice-part heuristic,
`MusicXMLConverter`'s quantization/tie/measure logic), rewritten server-side since
that code was Swift/AudioToolbox.

**Acceptance criteria:**
- [x] Given a distributed `PieceVersion`'s MIDI file, produces one audio stem per SATB voice part plus a backing/accompaniment stem, all sample-accurately alignable (same start offset, same tempo) when played together
- [x] The same version also produces multi-part MusicXML (SATB clefs, fixed-grid quantization, ties/measures — matching the iOS design) for OSMD to render
- [x] Rendering is cached per `PieceVersion` and only re-runs if that version's file changes
- [x] A manifest endpoint returns stem URLs (labeled by part), the MusicXML URL, and the tempo/time-signature metadata the frontend's cursor math needs — reachable by both authenticated members and B6's guest path

**Tasks — Claude:**
- [x] Port MIDI parsing to Python (`mido`, already used in `Fixtures/generate.py`) — replicate `MIDIParser`'s track→voice-part heuristic (track-name matching + mean-pitch fallback)
- [x] Port `MusicXMLConverter`'s quantization/tie/measure-splitting logic to Python (or decide to do this step in a small Node/TS service instead, since OSMD's own ecosystem is JS-native — worth a real decision when this milestone starts, not an assumption)
- [x] Audio rendering: shell out to FluidSynth with a GM soundfont (reuse `TimGM6mb.sf2` from the iOS project) to render each voice part's MIDI to a stem; decide stem format (WAV for fidelity vs. compressed for download size)
- [x] Cache rendered output per `PieceVersion` via `app/storage/files.py`
- [x] Manifest endpoint combining stems + MusicXML + tempo metadata

**Tasks — Human:**
- [ ] Listen to a rendered stem set and confirm the GM soundfont's sound quality holds up for practice use

### B8 — OMR pipeline [ ]

**Acceptance criteria:**
- [ ] Uploading a scanned sheet-music PDF produces a job id; polling it eventually returns MusicXML/MIDI output for a real test PDF

**Tasks — Claude:**
- [x] `app/omr/audiveris.py` (subprocess wrapper), `app/omr/oemer.py` (subprocess wrapper, not the direct-import shape originally assumed — see log), `pipeline.py` (chooses/chains engine, normalizes to MusicXML)
- [x] Background-task job tracking (DB row: pending/running/done/failed + result path)
- [x] `/omr/jobs` POST (upload) + `/omr/jobs/{id}` GET (status/result) endpoints
- [x] Follow-up (flagged in this file after the first B8 pass): `POST /omr/jobs/{id}/import` turns a `done` job's result into a real `Piece`/`PieceVersion` — see log

**Tasks — Human:**
- [ ] Supply a real scanned sheet-music PDF to test the pipeline end-to-end
- [ ] Install Audiveris locally (or confirm container approach) — licensing/install path not yet decided

### B9 — Homework / assignments [?]

Added at the human's direction alongside `Frontend/plan.md`'s expanded F4 (login +
wiring groups/home/library to real data). F3's app-shell UI already has a Homework
tab, homework-detail screen, and admin "new homework" form, all built against fixture
data — this gives that concept a real backend home so F4 can wire them for real.

**Acceptance criteria:**
- [x] A group admin can create a homework assignment (piece, range, due date, instructions) for their group
- [x] Any member of the group can list and view that group's homework assignments
- [x] A non-member cannot list or view another group's homework (403, not a data leak)
- [x] An admin can delete an assignment

**Tasks — Claude:**
- [x] `Homework` model (`id, group_id, piece_id (nullable), title, range, instructions, due_date, created_by, created_at`) + migration
- [x] `POST /groups/{group_id}/homework` (admin-only create), `GET /groups/{group_id}/homework` (member list, ordered by `due_date`), `GET /homework/{id}` (member get), `DELETE /homework/{id}` (admin-only)
- [x] Tests covering create (admin ok / member 403), list + get (member ok / non-member 403), unknown-id 404, delete

### B10 — Guest privacy controls (password + homework visibility) [?]

Added at the human's direction while building F4's guest view — a leaked join-code
link alone shouldn't be enough to see a group's content, and homework specifically
should be an opt-in guest exposure, not automatic just because pieces are shared.

**Acceptance criteria:**
- [x] A group admin can set an optional guest password; when set, every `/guest/{join_code}` route requires it (401 without/with the wrong one)
- [x] Groups with no password set behave exactly as before (no breaking change)
- [x] A group admin can toggle whether guests (no login) can see that group's homework at all — off by default
- [x] An admin can change or clear the guest password and the visibility toggle later, not just at group creation

**Tasks — Claude:**
- [x] `Group.guest_password_hash` (nullable) + `guest_homework_visible` (bool, default false) + migration
- [x] `GroupCreate`/`GroupOut` schema updates (`guest_password` in, `has_guest_password`/`guest_homework_visible` out — never the hash/plaintext itself); `PUT /groups/{id}/guest-settings` (admin-only, full replace)
- [x] `app/api/routes/guest.py`: password check on all four guest routes (resolve, homework, manifest, render file); homework listing additionally 404s when `guest_homework_visible` is false
- [x] Tests: default-no-password groups unaffected, password required/wrong/right, settings update round-trip, non-admin can't change settings, homework hidden by default and visible once toggled on

### B11 — Deploy to hosting [?]

Gets a real, reachable URL for the Frontend to talk to (F2 needs this to move past the bundled fixture). Free-tier stack per the human's "as free as possible" call: Render (free web service, deploys the existing `Dockerfile` as-is via a root-level `render.yaml` blueprint) + Neon (free Postgres — chosen over Render's own free Postgres because Render's expires after 30 days and Neon's doesn't).

**Known limitation, accepted for now:** Render's free plan has no persistent disk, so `STORAGE_DIR` (user-uploaded piece source files + the B7 render cache) is wiped on every restart/redeploy. Update: the Neon project was created with its Object Storage service enabled (S3-compatible, free during beta, `us-east-2` — see the `neon`/`neon-postgres` agent skills installed into this worktree at `.agents/skills/`), so a real fix no longer needs a separate Cloudflare R2 setup — bucket + credentials already exist (`AWS_*` vars in `Backend/.env`, not committed). Still needs actual code (`app/storage/files.py` only writes to local disk today) — tracked as a new Backlog item, still open for genuinely new uploads.

**Partial fix landed for bundled/demo pieces specifically** (at the human's request — "have the music files in the repo, link to their path on the backend"): `app/core/config.py`'s new `fixtures_dir` setting + `app/storage/files.py`'s `resolve_source_path()` resolve any `PieceVersion.file_path` starting with `fixtures/` against a read-only, version-controlled directory instead of the writable `storage_dir`. First attempt moved the Docker build context to the repo root so the Dockerfile could reach the sibling `Fixtures/` directly — broke the real deploy (see Log: the live service has its own dashboard-set `rootDir: Backend`, which prefixes onto any `dockerContext` render.yaml declares, so "repo root" really meant "Backend/Backend/"). Fixed by not fighting that: `Backend/fixtures/` is a committed copy of the repo-root `Fixtures/` (minus the soundfont, already vendored separately at `app/rendering/resources/`), reachable from the existing `./Backend`-scoped build context with no Render config changes at all. Verified for real, not just locally: `docker compose up` (real Postgres) end-to-end — register → login → create group → seed a `fixtures/`-pointed `PieceVersion` (no API surface for this yet, direct model insert like the original SFCC seeding) → distribute → `GET /guest/{code}/pieces/{id}/manifest` actually ran the B7 render pipeline against the fixture file and returned real stem URLs → fetched `soprano.wav` back (32MB, valid RIFF/WAVE, not an error page) and `score.musicxml` (real MusicXML). Test data cleaned from the local DB after. `pytest` 75/75 throughout. Does **not** help genuinely new uploads (still `storage_dir`, still wiped) — only pieces deliberately seeded to point at a committed fixture file.

**Acceptance criteria:**
- [x] The backend is reachable at a public HTTPS URL, `/health` returns 200 — confirmed live at `https://divisi.onrender.com/health`
- [x] Migrations run automatically on deploy (no manual `alembic upgrade head` step) — Dockerfile's `alembic upgrade head` ran clean against Neon at deploy time
- [x] A real end-to-end smoke test against the deployed instance (register → login → create group → guest join-code fetch) passes — done directly against `https://divisi.onrender.com`: register → login → create group → seeded a `fixtures/`-pointed piece → distributed it → `GET /guest/{code}/pieces/{id}/manifest` ran the real B7 render pipeline on Render's own container and returned working URLs → fetched `soprano.wav` back for real (32MB valid RIFF/WAVE). Also confirmed CORS from the actual Frontend origin (`https://divisi.maripi.net`) works, and `/join/[code]` on the live Frontend returns a clean 200 instead of the earlier 500. Test data deleted from the live Neon DB after.

**Tasks — Claude:**
- [x] `Dockerfile` CMD now runs `alembic upgrade head` before starting `uvicorn`, and binds `$PORT` when the host assigns one dynamically
- [x] Root-level `render.yaml` blueprint (Docker runtime, free plan, `/health` check, `DATABASE_URL`/`JWT_SECRET`/`STORAGE_DIR` env wiring)
- [x] Push repo to a new private GitHub repo (no remote existed) so Render can deploy from it — `github.com/Maripirs/divisi`, `main` + `backend/deploy` both pushed, `main` set as default
- [x] Installed the Neon CLI + MCP server + `neon`/`neon-postgres` agent skills (`npx skills add neondatabase/agent-skills -s neon -s neon-postgres -y`, then `neon init -y`); authenticated via browser OAuth and `neon link`ed this worktree to the human's Neon project (`noisy-darkness-99816843`, org `org-shy-grass-28822737`, branch `production`) — `.neon` file (gitignored) records the link
- [x] Wrote `Backend/.env` from the linked project's pulled vars: `DATABASE_URL` (pooled, scheme changed to `postgresql+psycopg2://` for SQLAlchemy), `DATABASE_URL_UNPOOLED` (direct, for future migrations/dumps), plus the project's `AWS_*` Object Storage credentials for the future storage-backend work above. Verified for real: `alembic upgrade head` ran clean against the live Neon database (all 6 migrations), and a manual connectivity check confirmed the `users` table is reachable through `app.db.session.engine`.

**Tasks — Human:**
- [x] Create a Neon account/project, get its Postgres connection string — done via the deploy wizard + `neon link` above
- [x] Create a Render account, deploy from `render.yaml`, paste `Backend/.env`'s `DATABASE_URL` into Render's `DATABASE_URL` prompt — live at `divisi.onrender.com`
- [x] Confirm the deployed `/health` URL
- [x] Redeploy on Render once this merge (CORS + B9/B10) reaches `backend/deploy`, so the live instance actually has it — done via `render services update`/`render deploys list` (CLI); also fixed a `rootDir`/`dockerContext` misconfiguration surfaced along the way (see Log)

### B12 — Group page configuration [x]

Generalizes B10's ad-hoc `Group.guest_homework_visible` boolean into a per-page
enabled/audience setting, ahead of adding Responsibilities (B13) as a 5th page.
Backend only this pass — no Frontend wiring (the Frontend already references
the old `guest_homework_visible` field in a few places — `src/lib/server/backendTypes.ts`,
`src/lib/api/guest.ts`, `src/routes/groups/[id]/+page.*` — left untouched on
purpose, matching this milestone's explicit backend-only scope; a Frontend pass
will need to pick up the new `page-settings` endpoint instead).

**Acceptance criteria:**
- [x] Every group has a settings row for each of the 5 pages (homework, tracks, members, about, responsibilities), defaulting to match today's behavior so existing groups don't silently change
- [x] An admin can enable/disable a page and set its audience (members-only vs. everyone) independently, per page
- [x] A disabled page is unreachable via its member/guest endpoints (403/404, not just hidden by convention), regardless of audience
- [x] An enabled page with audience=members is reachable by authenticated members but not by the unauthenticated guest routes
- [x] Admins can always read every page's data regardless of its enabled/audience settings
- [x] `Group.guest_homework_visible` is removed; existing groups are backfilled to the equivalent `group_page_settings` row, no manual re-setup needed

**Tasks — Claude:**
- [x] `GroupPageSettings` model + migration, seeded per-group at group creation and backfilled for existing groups from `guest_homework_visible`
- [x] `GET/PUT /groups/{id}/page-settings` (admin-only read/write)
- [x] Wire the existing homework + guest routes to check `group_page_settings` instead of `guest_homework_visible`; add the same check anywhere tracks/members/about have a route
- [x] Drop `Group.guest_homework_visible` (migration)
- [x] Tests: default seeding, per-page enable/audience toggling (admin-only, member/guest 403), disabled page blocked for members and guests, members-only page blocked for guests but not members, admin always has access, backfill migration correctness

### B13 — Responsibilities [x]

Depends on B12 (registers as the `responsibilities` page). Scoped down from
`../BACKEND_PROPOSALS.md`'s full proposal: one-off dates only (no recurrence rule,
no lazy generation, no `signup_deadline`), no swapping, no signup-approval step, no
notifications/reminders — all deferred to Backlog below if actually needed later.

**Acceptance criteria:**
- [x] A group admin can create a `ResponsibilitySchedule` with named roles + headcounts, and add individual dates to it
- [x] Any member can list a group's responsibility dates and see per-role coverage (covered/underfilled/overfilled)
- [x] A member can sign up for an open slot and remove their own signup; both are blocked once the date is admin-locked
- [x] An admin can assign/remove any member's signup regardless of lock state, and can lock or cancel a date
- [x] A non-member cannot see or act on another group's responsibilities (403, no data leak)
- [x] Visibility (members-only vs. everyone) follows B12's page settings, same mechanism as homework/tracks

**Tasks — Claude:**
- [x] `ResponsibilitySchedule`, `ResponsibilityRole`, `ResponsibilityDate`, `ResponsibilitySignup` models + migration
- [x] Admin endpoints: create/edit schedule + roles, create/edit/lock/cancel dates, assign/remove any signup
- [x] Member endpoints: list a group's dates + coverage, self-signup, self-remove (blocked when locked)
- [x] Guest endpoint, gated by B12's `responsibilities` page audience=everyone, mirroring the homework guest route's shape
- [x] Coverage computed server-side (`needed_count - active_signup_count` per role), returned on the list endpoint
- [x] Tests: admin CRUD, member self-signup/remove + 403 for non-members, locked date blocks member writes but not admin, coverage math, guest route respects page settings

## Backlog

- Decide diff/patch vs. full-reupload semantics for what a group "modification" actually contains
- Group invite flow (email invite vs. join code) — not designed yet
- Wire `app/storage/files.py` to Neon's Object Storage (S3-compatible, already provisioned on the project — see B9's log) instead of local disk, to fix the free-tier ephemeral-disk gap. Credentials already sit in `Backend/.env` (`AWS_*`); this item is the actual code + `boto3` dependency work, not yet started.
- Real job queue (Celery/RQ) if background-task OMR processing proves too slow/blocking
- Responsibilities: recurrence rules + lazy date generation (needs a real scheduled-job runner, which doesn't exist yet — deferred out of B13, see `../BACKEND_PROPOSALS.md`)
- Responsibilities: notifications/reminders (no notification infra of any kind exists yet — in-app, email, and push are all unbuilt)
- Responsibilities: swap requests between members, and an admin-required-approval step for signups — both explicitly deferred out of B13 per the human's call

## Log

- 2026-08-28: B13 (Responsibilities) approved. No next B-milestone scoped yet — see Backlog for candidates.
- 2026-08-28: B13 built (Responsibilities) — `ResponsibilitySchedule`/`ResponsibilityRole`/`ResponsibilityDate`/`ResponsibilitySignup` models + migration (`a1c4e8f2b6d9`, chains off B12's `3d1749b04685`). New `app/services/responsibilities.py` (mirrors `services/pages.py`'s shape): `role_coverage`/`role_signups`, the one place coverage status (`underfilled`/`covered`/`overfilled`) is computed, shared between the member and guest routes so they can't drift. New `app/api/routes/responsibilities.py`: admin create/edit schedule+roles, create/edit/lock/cancel a date (one partial-patch `PATCH .../dates/{id}` covers edit+lock+cancel, same convention as B12's page-settings patch), member list-with-coverage, self-signup/self-remove; `POST .../signups` doubles as the admin-assign route — an explicit `user_id` in the body targets someone else and requires admin, which also bypasses the lock check (member self-signup/self-remove is blocked once `locked=True`, admin never is). Capacity is deliberately never enforced — "overfilled" is a real, reachable status, not just a hypothetical. New `GET /guest/{code}/responsibilities/dates` in `guest.py`, same no-auth/join-code/page-settings-gated shape as the homework guest route, but returns a distinct `ResponsibilityGuestRoleCoverageOut` (coverage numbers only, no `signups` list) — a guest link shouldn't hand out member names/emails the way the member view does. Verified for real, not just `pytest`: `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against a real Postgres container; ran the live app against that Postgres end-to-end (register two users → create group → enable `responsibilities` for guests → create schedule+role → create date → member self-signup → member listing shows the signup → guest listing shows coverage with no name/email → admin locks the date → member's own removal now 409s → admin's removal of the same signup still succeeds); test data deleted from Postgres after, container torn down. `pytest` — 92 passed (12 new: admin schedule/role CRUD, member-vs-admin 403s, non-member 403 on both list routes, self-signup/self-remove round trip, cross-member removal blocked, lock blocks member signup+removal but not admin, admin assign-to-another-member + non-admin blocked from doing the same, underfilled/covered/overfilled coverage math, guest sees coverage without signup identities, guest hidden by default and on an unknown join code).
- 2026-08-28: B12 approved. Moving to B13 (Responsibilities).
- 2026-08-28: B12 built (group page configuration) — new `GroupPage`/`PageAudience` enums + `GroupPageSettings` model (`id, group_id, page, enabled, audience, created_at`, unique on `(group_id, page)`) and migration: creates the table, backfills one row per page for every existing group (homework's `audience` carries forward its old `guest_homework_visible` value — `everyone` if it was `True`, else `members`; every other page defaults to whatever was already true unconditionally: `tracks` always `enabled=True`/`audience=everyone` since guests could see distributed pieces with no gate at all before this, `members`/`about`/`responsibilities` default `members`-audience since no guest route touches them), then drops `groups.guest_homework_visible`. `app/services/pages.py` (new, mirrors `services/pieces.py`'s shape): `seed_default_page_settings` (called once at group creation), `require_guest_page_access`/`require_member_page_access` (the actual gates — admin always passes on the member path, matching the acceptance criterion). New `GET/PUT /groups/{id}/page-settings` (admin-only; `PUT` is a partial per-page update, not full-replace, since every group already has all 5 rows). Rewired: `guest.py`'s `resolve_join_code` (this route *is* the guest-facing tracks page — a group's distributed pieces list, previously ungated entirely) plus its manifest/render-file routes all now gate on the `tracks` page; `list_guest_homework` swapped its `guest_homework_visible` check for the `homework` page gate; `homework.py`'s member list/get routes gate on the `homework` page (admin bypass via the same helper); `groups.py`'s `list_members` gates on the new `members` page. `about` and `responsibilities` have no live routes yet (the latter is B13's whole job) so nothing to wire there this pass — their settings rows exist and are inert until routes show up. `GroupCreate`/`GroupOut`/`GroupGuestSettingsUpdate` all dropped `guest_homework_visible` (superseded by the page-settings endpoint). Verified for real, not just `pytest`: `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against a real Postgres container; separately downgraded to pre-B12, hand-inserted two groups with `guest_homework_visible=true`/`false` directly via `psql`, re-ran `upgrade head`, and confirmed their backfilled `homework` rows came out `everyone`/`members` respectively — the actual backfill-correctness criterion, not just "the migration runs." Also ran the real app against that Postgres instance end-to-end (register → login → create group → confirm default page-settings → disable `tracks` via the new `PUT` → guest `/guest/{code}` now 404s). `pytest` — 80 passed (5 new: default seeding, admin-only read/write 403 for non-admins, per-page toggling round-trip including that untouched pages keep their prior settings, disabled `members` page blocks members but not admins, and guest 404 on both the join-code resolve and the piece manifest once `tracks` is disabled). Frontend still reads the old `guest_homework_visible` field in a few places (`backendTypes.ts`, `api/guest.ts`, the group detail page) — deliberately left alone, matching this milestone's explicit "backend only, no Frontend wiring" scope; noted here so it's not mistaken for an oversight when Frontend work picks this up.
- 2026-08-28: Seeded the human's real live group ("San Francisco City Chorus", created by them via the real `/login` → `/groups/new` flow — the app's first genuine end user) with all 7 pieces from `Frontend/static/fixtures/SFCC/`, at their request. Committed a copy under `Backend/fixtures/SFCC/` first (same `fixtures/` convention as B11), redeployed, then created the `Piece`/`PieceVersion`/`Distribution` rows directly (still no upload UI — same direct-model-insert approach as the original ad-hoc SFCC seeding and this session's smoke tests). These are MusicXML source files, not MIDI, so B7's render pipeline can't play them — 6 of the 7 titles exactly match a bundled Frontend registry entry, though, so those get a real working Practice button via the pre-existing `getPieceByTitle()` title-match path (client-side player, unrelated to this file's Backend location); "The Frost Myth" has no registry match and lists without a Practice button, a pre-existing gap. Verified live: `GET /guest/9CJM7VRU` returns all 7.
- 2026-08-28: Grilled the human on `../BACKEND_PROPOSALS.md` ("Group Responsibilities") before touching code. Landed on two new milestones, both backend-only for now (no Frontend wiring this session): **B12 (group page configuration)** — generalizes B10's single `guest_homework_visible` boolean into a `GroupPageSettings` row per (group, page) across all 5 pages (homework, tracks, members, about, responsibilities), each independently `enabled` + `audience` (members|everyone), admins always see everything regardless. **B13 (Responsibilities)** — scoped down hard from the original proposal: one-off dates only (no `recurrence_rule`, no lazy generation, since there's no scheduled-job runner in this backend yet), `Schedule`/`Role`/`Date`/`Signup` kept as separate entities so role definitions are still reusable across a schedule's dates, no swapping, no signup-approval step, no notifications (no notification infra exists at all yet). Explicitly sequenced ahead of resuming B7/B8's remaining items, per the human's direction — those are human-only follow-through at this point (listen to a stem, install Audiveris, test a real PDF), not blocking further Claude work, so this isn't actually a reprioritization away from in-progress Claude work. Deferred items (recurrence, notifications, swap, approval) logged to Backlog rather than dropped.
- 2026-08-27: Closed out B11, working autonomously while the human was away ("fix the backend, I'm afk"). Found and fixed a chain of real production issues, not just merged code: (1) the deployed instance predated the CORS/Homework/B10 work entirely — a leftover from the `backend/deploy` branch having only 2 commits past its fork point, while all of that work sat uncommitted in the working tree. Merged `backend/deploy` into `main` (one real conflict: `B9` had been independently claimed by both the Homework milestone here and this branch's "deploy to hosting" milestone — renumbered the latter to B11, no content lost), committed the uncommitted Backend work, pushed both `main` and `backend/deploy`. (2) First redeploy attempt (moving the Docker build context to the repo root so the Dockerfile could reach a sibling `Fixtures/` directory, per the human's separate "put the music files in the repo" request) broke the live build — `render deploys list` showed `build_failed`. Root cause, found via `render services -o json`: the live service has its own dashboard-set `rootDir: Backend`, which prefixes onto render.yaml's `dockerContext` — so "repo root" there actually meant "Backend/Backend/". Fixed by keeping the build context at `./Backend` and committing a copy of the fixtures under `Backend/fixtures/` instead of reaching across to the sibling directory — no Render config change needed at all. (3) Verified for real both locally (`docker compose up` against a real Postgres) and against the actual live `https://divisi.onrender.com`: registered a user, created a group, seeded a `fixtures/`-pointed `PieceVersion` (direct model insert — no API surface for this yet), distributed it, then called the real guest manifest endpoint and fetched a rendered stem back (32MB valid RIFF/WAVE, not an error page). Confirmed CORS works from the real Frontend origin and that `/join/[code]` on `divisi.maripi.net` now returns a clean response instead of the earlier 500. Test data deleted from the live Neon DB after each pass. `pytest` 75/75 throughout. Used the `render` CLI (`services`, `deploys list`, `services update`) for all of this — no dashboard access needed. B11 marked `[?]` pending the human's review.
- 2026-08-27: B10 built (guest privacy controls) — `Group.guest_password_hash` (nullable) + `guest_homework_visible` (bool, default false) + migration, verified `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against the real running Postgres container. `GroupCreate` takes an optional `guest_password` (hashed via the existing bcrypt `hash_password` helper, same as user passwords) and `guest_homework_visible`; `GroupOut` exposes only `has_guest_password`/`guest_homework_visible`, never the hash. New `PUT /groups/{id}/guest-settings` (admin-only, full replace — `guest_password: None` clears it) so these aren't creation-only. All four `/guest/*` routes now take an optional `password` query param and 401 (one generic message, missing or wrong) whenever the group has one set; the homework route additionally 404s when `guest_homework_visible` is false, independent of the password. Verified: `pytest` — 75 passed (9 new). Restarted the local dev `uvicorn` to pick up the new routes.
- 2026-08-27: B9 built (Homework/assignments) — new `Homework` model + migration (verified `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against the real running Postgres container), new `app/api/routes/homework.py`: `POST /groups/{group_id}/homework` (admin-only), `GET /groups/{group_id}/homework` (member list, ordered by `due_date` ascending with nulls last, then `created_at`), `GET /homework/{id}` and `DELETE /homework/{id}` (member/admin respectively, scoped via the homework row's own `group_id` so the URL doesn't need to repeat it). Reused `app/services/pieces.py`'s `group_role` helper for membership/admin checks rather than reimplementing `groups.py`'s local versions. `piece_id` is nullable — an assignment can exist before a piece is picked, matching the Frontend's own admin-form UX (piece is chosen from a dropdown, not required up front). Verified: `pytest` — 66 passed (7 new: admin create, member-cannot-create 403, member list+get, non-member 403 on both, unknown-id 404, admin delete + member-cannot-delete 403, due-date ordering with a null-due-date entry sorting last). Restarted the local dev `uvicorn` (no `--reload`) to pick up the new router; confirmed live via `/openapi.json`. Done to unblock `Frontend/plan.md`'s F4, which is being built in the same session right after this.
- 2026-08-27: Added CORS support (`CORSMiddleware` in `app/main.py`, a new `cors_origins` setting in `app/core/config.py`, defaulting to the SvelteKit dev origins + the deployed Cloudflare domain) — no cross-origin allowance existed at all before this, so a browser page on the Frontend's origin couldn't call this API. Prompted by `Frontend/plan.md`'s F2 (guest join-code route) wiring up against a real local Backend for the first time; verified with a real preflight (`OPTIONS` + `Origin` header) against the running dev server, not just a code read.
- 2026-08-27: OMR → library wiring (B8 follow-up, same day as the B8 pass below) — new `POST /omr/jobs/{id}/import`: turns a `done` `OmrJob` into a real `Piece`/`PieceVersion`, either as a brand-new piece (`title` + `owner_type`[+`group_id`], same shape as `/library/pieces`) or a new version of an existing one (`piece_id`, same shape as `/library/pieces/{id}/versions`) — exactly one of the two must be given. Imports the job's derived `.mid`, not its `.musicxml`: the library's manifest endpoint (B7) only knows how to render a MIDI source, so this is what lets an OMR'd piece flow through the same stem/notation pipeline as any other version. Copies the job's result into its own stored file rather than pointing the new version straight at the job's `result_midi_path`, so a future job-cleanup pass can never orphan a distributed piece. Factored `Piece`/`PieceVersion` creation and access-control (`get_piece_or_404`, `require_piece_access`, `resolve_new_piece_owner_id`, `create_piece_with_version`, `add_version`) out of `app/api/routes/library.py` into a new `app/services/pieces.py`, so the import endpoint reuses the library's exact rules instead of reimplementing (and risking drifting from) them; `library.py`'s own upload endpoints now call the same shared functions. Verified: `pytest` — 59 passed (7 new: import creates a new piece, import adds a version to an existing piece, rejects neither/both of `piece_id`/`title`, 409s on a job with no result yet, 404s on someone else's job id) plus all existing library/OMR tests still passing unchanged after the refactor.
- 2026-08-27: B8 built (Claude tasks) — `OmrJob` model + migration (`id, user_id, status (pending|running|done|failed), source_file_path, result_musicxml_path, result_midi_path, error_message, created_at, updated_at`), `app/omr/audiveris.py` (subprocess wrapper, batch-mode PDF export to `.mxl`), `app/omr/oemer.py`, `app/omr/pipeline.py` (tries the configured engine first — default `audiveris`, since it handles multi-page PDFs natively as one "book" where oemer only processes a single image — and falls through to the other engine only on `OmrEngineUnavailable` (binary missing), never on a real `OmrEngineError` from a bad scan, so a genuine parse failure is never silently masked by retrying with a worse engine; normalizes both engines' output to plain `.musicxml`, then derives a `.mid` via `music21` so an OMR'd piece can flow through the exact same B7 MIDI-based rendering/stem pipeline as any other version instead of needing a separate MusicXML playback path). `app/jobs/omr_jobs.py`: background-task runner (FastAPI `BackgroundTasks`, per the plan's "not a full queue yet") — opens its own DB session via `app.db.session.SessionLocal` looked up at call time rather than imported directly, specifically so tests can monkeypatch it to the in-memory test DB (a real gap the B7 session didn't have to deal with, since its background work was file-only, no DB). New endpoints on `app/api/routes/omr.py`: `POST /omr/jobs` (upload, auth-required, kicks off the background task), `GET /omr/jobs/{id}` (status/result URLs, 404 for both unknown and not-your-job ids — same non-disclosure stance as B6's guest routes), `GET /omr/jobs/{id}/result/{musicxml|midi}`. Deviation from the B1 scaffold's original file-layout note: `oemer.py` shells out to the `oemer` CLI instead of doing a "direct import" — oemer's only documented, stable entry point is its CLI, so a direct-import wrapper would have been guessing at unstable internals; this matches the same subprocess pattern already used for Audiveris and B7's FluidSynth wrapper. Added `pymupdf` (PDF/image page rasterization for oemer's single-page path) and `music21` (MusicXML->MIDI) as real dependencies — both pip-install cleanly with no system binaries required, confirmed in this sandbox. Neither Audiveris nor oemer itself is installed here (that's still the open human task below), so the two engine wrappers' subprocess-construction and error handling are real and tested, but "the engine actually transcribes a real scanned score correctly" is unverified until the human's two tasks below land. Verified: `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against a real Postgres container; `pytest` — 53 passed (16 new: MusicXML normalization incl. `.mxl` zip-extraction, real `music21` MusicXML->MIDI conversion, real `PyMuPDF` page rasterization, engine-chaining/fallback logic with engine calls mocked, a real "no engine installed" `OmrEngineUnavailable` path since that's genuinely true in this sandbox, unknown-engine-name rejection, and the `/omr/jobs` endpoints end-to-end including a real run through to `status: failed` with the actual "not found on PATH" error surfaced through the API, auth requirement, empty-file rejection, and not-your-job/unknown-job 404s). Didn't fold OMR output into the library/`PieceVersion` flow (e.g. as a new version's source file) — B8's acceptance criteria only asks for job-id-in, MusicXML/MIDI-out; wiring it into "OMR result becomes a piece a group can distribute" is a natural follow-up but wasn't scoped here, noting it so it doesn't get lost. Milestone header stays unchecked pending the two human tasks below, per this file's own convention (B1–B7 above).
- 2026-08-27: B6 built (after B7, in the same session) — human chose short join codes over an opaque token (8 chars, a 32-symbol alphabet excluding visually/aurally ambiguous characters `0/O 1/I/L`, generated in `app/core/join_codes.py`), meant to be typed/read aloud or embedded in a shareable `<frontend>/join/{code}` link; they also confirmed liking the share-link framing generally. Added `Group.join_code` (unique, indexed) via a new migration that backfills existing groups with generated codes before making the column required; `POST /groups` now generates one at creation with a small retry-on-`IntegrityError` loop (collision odds are ~1/32^8, this is belt-and-suspenders) and `GroupOut` surfaces it to admins. New `app/api/routes/guest.py`, mounted with no `get_current_user` dependency anywhere: `GET /guest/{join_code}` (group name + its currently-distributed pieces, most-recent version per piece — same de-dup logic as `library.py`'s per-user library listing), `GET /guest/{join_code}/pieces/{id}/manifest` and `.../renders/{filename}` (same B7 `render_manifest`/`render_file_path` pipeline the authenticated route uses, per that milestone's plan — scoped by resolving the *group's own* distributed version for that piece id server-side, never trusting a client-supplied version, so a guest can't guess their way into an undistributed piece). Unknown join codes and pieces-not-distributed-to-this-group both return the same generic 404 message, so a guest can't distinguish "wrong code" from "right code, no such piece" — deliberately not leaking which case it is. Brute-force hardening (the plan's open decision): a simple in-process fixed-window rate limiter (`app/core/rate_limit.py`, 20 req/min per client IP) on the whole `/guest` router — logged as an explicit MVP tradeoff, not a real distributed limiter, since a single-instance deployment doesn't need one yet. Verified: `alembic upgrade head`/`downgrade -1`/`upgrade head` clean against a real Postgres container; `pytest` — 38 passed (7 new: join-code presence, distributed-pieces listing, empty-group listing, unknown-code 404, guest manifest+stem fetch via a real end-to-end render, not-distributed-to-this-group 404, and the rate limiter actually tripping at the configured threshold).
- 2026-08-27: B7 built — picked up ahead of B6 (still not started) per the human's explicit choice, running in a separate session in parallel with another session driving `Frontend/plan.md`'s F1. New `app/rendering/` package: `midi_parser.py` (ports `MIDIParser.swift` to `mido` — track-name + mean-pitch-fallback voice-part heuristic, tempo-map-aware tick→ms conversion honoring mid-file tempo changes, SMF format-0-vs-1 channel-splitting, key-signature-name→fifths lookup; also collects unassigned-track notes into a new `backing_notes` field with no Swift equivalent, needed for the backing/accompaniment stem), `musicxml_converter.py` (straight port of `MusicXMLConverter.swift`'s fixed-grid quantization/tie/measure-splitting/pitch-spelling logic, verified byte-for-byte equivalent in behavior against the same fixture), `synth.py` (shells out to the `fluidsynth` CLI — not the `pyfluidsynth` binding, since only the CLI binary was worth depending on here — rendering each SATB part plus a backing stem to WAV via a per-part MIDI file built with `mido`, padded with a trailing marker event so every stem covers the same nominal duration and stays aligned when mixed), `pipeline.py` (orchestrates parse→stems→MusicXML, caching per `piece_version_id` under `storage_dir/renders/` since a version's `file_path` is immutable once created — cache-hit is just "manifest.json exists", no content hashing needed). Vendored `TimGM6mb.sf2` into `app/rendering/resources/` (same soundfont as the iOS app) rather than depending on `Fixtures/`, and added it to `pyproject.toml`'s `package-data` so it survives a real wheel build; Dockerfile now `apt-get install`s the `fluidsynth` binary (a system dependency `mido` alone doesn't provide). New endpoints on the existing `library` router: `GET /library/versions/{id}/manifest` (stems + MusicXML URLs + tempo/time-sig/key metadata, gated by the existing `_require_piece_access` check — B6's guest path will call `render_manifest`/`render_file_path` directly once it exists, scoped to that group's distributions, rather than reusing this authenticated route) and `GET /library/versions/{id}/renders/{filename}` (serves one stem/MusicXML file, same access gate, path-traversal-guarded). Verified: `pytest` — 31 passed, including new parser/converter unit tests against the existing `requiem-satb-*.mid` fixtures (copied into `Backend/tests/fixtures/`) and a real end-to-end API test that uploads a MIDI fixture, hits the manifest endpoint (real `fluidsynth` subprocess calls, not mocked), downloads a stem (checked its RIFF/WAV header) and the MusicXML, and confirms a second manifest call is served from cache. Manually cross-checked all 4 SATB stems from `requiem-satb-accompanied.mid` render to exactly the same sample count (verified via `wave.getnframes()`), confirming stem alignment; the `backing` stem's trailing release tail runs slightly longer, which is the accompaniment patch's own decay envelope, not a sync bug. Human task (listen to a rendered stem set for soundfont quality) still open — didn't mark this milestone's header `[x]` for that reason, following this file's own convention (see B1–B5 above, header only flips once every task including human ones is checked).
- 2026-08-27: Added B7 (MIDI → audio + notation rendering pipeline), needed by the Frontend's F2/F3, renumbering the old B7 (OMR) to B8 — same reasoning as B6 vs. the old B6/OMR renumber: this is now on the critical path for the top-priority web player, OMR stays real but lower-urgency backlog-ish work.
- 2026-08-27: Product pivot on the app side (see root `plan.md`'s log) — Divisi's iOS app paused in favor of a new web player (`Frontend/plan.md`), which needs unauthenticated guest access to a group's distributed pieces. Added B6 (Guest access / join links) to cover it, renumbering the old B6 (OMR) to B7 — OMR was always lower-priority backlog-ish work, guest access is now genuinely blocking the new top-priority effort. Didn't touch B1–B5 or reorder "Current milestone" (still B5, pending whoever's actually driving this plan to approve it) — this is additive scope, not a reprioritization of in-flight work.
- 2026-08-26: Backend plan created, split from the root `plan.md` to stay out of the other session's way (which owns M4 on the iOS app). Domain model for users/choirs/pieces/annotations agreed with the human. Starting B1 (scaffold).
- 2026-08-26: B1 scaffold built and verified — `docker compose up --build` brought up api+postgres clean, `/health` + all three route stubs returned 200, `alembic upgrade head` ran clean against the containerized Postgres (no real migrations yet). Containers torn down after verification. All three B1 acceptance criteria pass; ready for approval.
- 2026-08-26: Domain model extended — a member can submit a worked-on `PieceVersion` for admin review before it's distributable (`status: draft|submitted|approved|rejected` on `PieceVersion`, replacing plain create-and-push). Folded into B4.
- 2026-08-26: B1 approved. Moving to B2 (auth).
- 2026-08-26: B2 built — `User` model + Alembic migration (verified upgrade/downgrade/re-upgrade against Postgres), `/auth/register`, `/auth/login`, `/auth/me`. Hit a real passlib/bcrypt≥4.1 incompatibility (`AttributeError: module 'bcrypt' has no attribute '__about__'`) — dropped passlib for direct `bcrypt` calls rather than pinning an old bcrypt. 7 tests pass (SQLite in-memory via dependency override) plus a manual end-to-end smoke test against the real containers (register → login → /auth/me with token → 401 without). Pending review.
- 2026-08-26: B2 approved. Moving to B3 (choir + membership).
- 2026-08-26: Renamed the "Choir" concept to "Group" throughout the domain model, code, and this plan (human call, before B3 code existed) — `Choir`/`ChoirMembership` → `Group`/`GroupMembership`, `/choirs` → `/groups`, `choir_id` → `group_id`.
- 2026-08-26: B3 built — `Group`/`GroupMembership` models + migration (verified upgrade/downgrade/re-upgrade against Postgres), `/groups` (create, list mine), `/groups/{id}/members` (list, add — admin-only, remove — admin-only, blocks removing the last admin). 7 new tests pass (14 total) plus a manual end-to-end smoke test against the real containers (create group → add member → list → outsider gets 403 → remove member → removing last admin gets 409). Pending review.
- 2026-08-26: B3 approved. Moving to B4 (Piece, versions, distribution, review).
- 2026-08-26: B4 built — `Piece`/`PieceVersion`/`Distribution` models + migration (verified upgrade/downgrade/re-upgrade against Postgres); `/library/pieces` (upload, create piece+initial version), `/library/pieces/{id}/versions` (add a version), `/library/versions/{id}/submit|approve|reject` (status transitions enforced server-side — draft→submitted→approved/rejected, review authority = group admin or individual owner), `/library/pieces/{id}/versions/{id}/distribute` (admin-only push to group, requires approved status, 409 on double-push), `/library/pieces` GET (per-user library: owned pieces + latest distributed version per group piece). 4 new tests pass (18 total) plus a manual end-to-end smoke test against the real containers (upload group piece → distribute blocked pre-approval (409) → submit → member-approve blocked (403) → admin approves → distribute (201) → double-distribute blocked (409) → member sees it in their library). All three B4 acceptance criteria pass; ready for approval.
- 2026-08-26: B4 approved. Moving to B5 (annotations + sharing).
- 2026-08-26: B5 built — `Annotation`/`AnnotationShare` models + migration (verified upgrade/downgrade/re-upgrade against Postgres); `/annotations` router: create (requires access to the piece), piece-scoped list (own + shared-with-me), get/update/delete (owner-only for write), `/annotations/{id}/share` and `.../share/{user_id}` unshare (owner-only, share is 409 on duplicate, 400 on self-share). 3 new tests pass (21 total) covering default privacy, share-grants/unshare-revokes visibility (plus peer can't edit/unshare), and owner update/delete. Note: B4's code was still uncommitted in the working tree when this started — committed separately just before this. Pending review.
