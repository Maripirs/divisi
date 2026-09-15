# Divisi — Historical Plan Archive

Superseded 2026-09-14 by the root `PLAN.md`, which tracks current state and
future work. This file is the frozen historical record of how the project
got here: milestone-by-milestone acceptance criteria, task lists, and log
entries for the Backend, Frontend, and OMR/notation-editor tracks. Nothing
here is edited going forward; new work is tracked in `PLAN.md`.

## Backend (formerly `Backend/plan.md`)

Separate from the native iOS app's own plan (paused 2026-08-27, condensed into `Frontend/plan.md`'s "iOS app" section during 2026-08-28's repo cleanup). This plan tracks the backend service only. Milestones prefixed `B` to avoid confusion with the app's `M` milestones when discussed together.

**Status:** B1–B15 shipped (a couple of the earlier ones got informal follow-up expansions afterward — real piece uploads under B4, a rehearsal-schedule addition under B13). B11's long-standing ephemeral-disk gap is now closed in code: `app/storage/files.py` writes uploads to Neon Object Storage (committed 9d7ef53), with a remaining human step to set the `AWS_*` env vars on Render (see Backlog). Other open threads, none Claude-blocking: B7 has one human-only task left (see its section); B14's email-provider and OAuth-consent-publish steps are in Backlog. **B15 shipped** (its migrations `e4a8c2f6b1d9` / `b6e2d9f4a7c1` reached prod when `c1f7a4d2e8b6` was cherry-picked to `main` on 2026-08-31 — see Log). The OMR pipeline and the in-app notation editor moved to `OMR_EDITOR_PLAN.md` (milestones E1–E10) on 2026-09-01; their still-pending migrations (`d2f8a6c4e1b9`, `e7b1c9d3a2f4`) reach production only by merging `feat/generate-track-from-pdf` to `main`, never by a local `alembic upgrade` against prod.

The web frontend is the active product; the OMR pipeline and the notation editor now have their own plan, `OMR_EDITOR_PLAN.md`. See `Frontend/plan.md` and the repo-root `README.md`.

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

PieceRehearsalNote id, group_id, piece_id, kind (pronunciation|rhythm|breath|
                 dynamics|entrance|page_turn|other), title (nullable), body,
                 page_number (nullable), measure_label (nullable), part_scope
                 (nullable, free text — choir part naming varies too much per
                 group for an enum), created_by, created_at  — a durable,
                 group-wide rehearsal reminder shown in a piece's "Rehearsal
                 Notes" section; outlives the weekly note it may have started
                 as. Distinct from Annotation/PieceMarkupMark (marks drawn on
                 the PDF) and from WeeklyNote (a dated bulletin). (B16)

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

GroupCustomPage id, group_id, title, slug, template_key (carpool_board),
                 status (draft|published|archived), audience (members|everyone),
                 min_identity (anyone|saved), created_by, created_at, updated_at
                 — an admin-created page distinct from the built-in GroupPage
                 enum; reuses PageAudience/PageMinIdentity rather than new
                 enums. No generic GroupPageBlock: one template doesn't
                 justify a block system yet. (B23)
CarpoolEvent    id, page_id, title, starts_at, destination_label,
                 status (open|locked|archived), created_by, created_at,
                 updated_at  — one dated carpool occurrence on a
                 GroupCustomPage. No lat/lng: MVP is label-only, no map. (B24)
CarpoolPost     id, event_id, user_id, display_name, kind (driver|rider),
                 status (open|hidden|cancelled), origin_label, seats_total,
                 seats_available, leave_time_text, notes, created_at,
                 updated_at  — a member's ride offer/request; free-text
                 origin_label only, no coordinates until a map milestone
                 justifies storing them. (B24) seats_available becomes a
                 computed value once CarpoolSeatClaim exists (B27), not a
                 client-set field any more.
CarpoolSeatClaim id, driver_post_id, user_id, display_name,
                 status (active|removed), created_at, removed_at  — a
                 rider (or anyone, no rider post of their own required)
                 claiming one seat on a specific driver's post, first-come
                 first-served, no admin/driver approval step. Same soft-
                 removal-for-audit shape as ResponsibilitySignup. One
                 active claim per (driver_post_id, user_id). (B27)
```

Stack: Python/FastAPI, Postgres (SQLAlchemy + Alembic migrations), file storage via Neon
Object Storage (S3-compatible) with a local-disk fallback, JWT auth, background-task-based
OMR job tracking (not a full queue yet), docker-compose for local dev.

## Milestones

| # | Milestone | Status |
|---|---|---|
| B1 | Backend scaffold | ✅ Done |
| B2 | Auth | ✅ Done |
| B3 | Group + membership | ✅ Done |
| B4 | Piece, versions, distribution, review (+ real uploads: MIDI/MusicXML/PDF/audio) | ✅ Done |
| B5 | Annotations + sharing | ✅ Done |
| B6 | Guest access (join links) | ✅ Done |
| B7 | MIDI → audio + notation rendering pipeline | ⏳ Claude tasks done; waiting on human to listen to a rendered stem |
| — | OMR pipeline + notation editor | Moved to `OMR_EDITOR_PLAN.md` (milestones E1–E10) |
| B9 | Homework / assignments | ✅ Done |
| B10 | Guest privacy controls (password + homework visibility) | ✅ Done |
| B11 | Deploy to hosting | ✅ Live at `divisi.onrender.com`; ephemeral-disk gap closed by the Neon Object Storage swap (9d7ef53) |
| B12 | Group page configuration | ✅ Done |
| B13 | Responsibilities (+ regular rehearsal schedule) | ✅ Done |
| B14 | Account security (password reset, OAuth scaffold) | ✅ Done (Google OAuth built but hidden pending consent-screen publish; Apple honestly unimplemented) |
| B15 | Piece markup: freehand pen strokes + stamps | ✅ Built + live on prod (Neon at head `f9d4c1a7b2e8`) |
| B16 | Piece rehearsal notes (durable per-piece reminders) | ✅ Built (`f08c969`); migration `d7e3a9c1f6b4` live on prod (Neon at head `f9d4c1a7b2e8`) — frontend is `Frontend/plan.md`'s F20 |
| B17 | Group markup layer (shared, admin-co-edited) | ⏳ Built 2026-09-02 (`e75f79c`), migration `b1c3d5e7f9a2`, pytest 229 green; not pushed/deployed |
| B18 | PDF cue points (time anchors on `PieceMarkupMark`) | ⏳ Built 2026-09-02, migration `c3e5a7b9d1f4` (`down_revision = b1c3d5e7f9a2`), single linear head; pytest 240 green; not pushed/deployed |
| B19 | Progressive accounts: anonymous participants + "Save across devices" | ⏳ Built 2026-09-09, migration `d4a9f2c7e1b8` (`down_revision = a2f6c1e4d9b7`), single linear head; pytest 271 green. Not pushed/deployed |
| B20 | Demo "Preview Admin" (public, read-only) | ⏳ Built 2026-09-11, no migration; pytest 275 green. Not pushed/deployed |
| B23 | Custom Group Pages foundation (carpool template only) | ✅ Built 2026-09-11, migration `33efd3092bff`; pytest 299 green |
| B24 | Carpool board: events + posts, list only, no map | ✅ Built 2026-09-11, migration `48a30562ab06`; pytest 319 green |
| B25 | Guest carpool access: read + write, via existing anonymous-participant flow | ✅ Built 2026-09-12, no migration; pytest 334 green |
| B26 | Carpool: a standing (non-dated) board by default, dated events stay for exceptions | ✅ Built 2026-09-12, migration `a1c9e6f2b7d4`; pytest 343 green |
| B27 | Carpool: claim a seat in a driver's post | ✅ Built 2026-09-12, migration `b3d7f1a9c6e2`; pytest 357 green |
| B28 | Guests can remove their own responsibility signup | ✅ Built 2026-09-12, no migration; pytest 361 green |
| B29 | Carpool Map: destination/origin coordinates + admin map_enabled toggle | ✅ Built 2026-09-12, migration `9d09d03dff42`; pytest 372 green |
| B31 | Promote Carpool to a built-in tab, drop the generic Custom Pages system | ✅ Built 2026-09-14, migration `a5f3d8c1e6b4`; pytest 374 green |
| B32 | Carpool direction: there / back / round trip | ✅ Built 2026-09-14, migration `b7e2f4a9c3d8`; pytest 374 green |
| B33 | Guest access to the About/Info page, honoring its existing `audience` setting | ✅ Built 2026-09-14, no migration; pytest 379 green |

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

**Expanded 2026-08-29 (real piece uploads — MIDI/MusicXML + PDF + reference audio, per `Frontend/plan.md`'s F5):**
- [x] `Piece.composer`/`youtube_url`, `PieceVersion.pdf_file_path` + widened `file_path` to nullable (a version can be PDF-only) — migration `a3f7c1e9b5d2`
- [x] `upload_piece`/`upload_version` accept `file`/`pdf_file` independently (either or both — 400 if neither), plus `composer`/`youtube_url`/`default_tempo_bpm` form fields
- [x] `GET /library/versions/{id}/file` and `.../pdf` (F5-scoped raw-file routes), plus their guest counterparts `GET /guest/{code}/pieces/{id}/file`/`.../pdf` — same access gates as the existing manifest routes, 404 cleanly when that half doesn't exist for a version
- [x] `LibraryEntryOut`/`PieceOut` gain `composer`/`youtube_url`/`has_music`/`has_pdf` (computed booleans, never a raw storage path)
- [x] Tests: music-only/PDF-only/both/neither upload combinations, metadata round-trip, new file routes (200/404/access-gated) — `tests/test_library.py`, `tests/test_guest.py`
- Verified: migrations clean up/down/up; `pytest` 133/135 (2 pre-existing failures are the known local FluidSynth-not-installed gap); a live curl round trip covering all four upload combinations plus the full group upload → submit → approve → distribute → authenticated-and-guest-file/pdf-route chain
- Durable storage (Neon Object Storage swap) was deferred here and landed later — done 2026-08-31, committed 9d7ef53; see B11 and Backlog

### B5 — Annotations + sharing [x]

**Acceptance criteria:**
- [x] A user's annotation on a piece is invisible to others by default, and becomes visible to a specific peer once explicitly shared

**Tasks — Claude:**
- [x] `Annotation`, `AnnotationShare` models + migration
- [x] CRUD endpoints scoped to the owning user; share/unshare endpoint; visibility check on read

**Expanded 2026-08-29 (while wiring Frontend F4's real annotation UI):**
`share`/`unshare` existed but nothing let an owner see who an annotation was
*currently* shared with — the Frontend's share/unshare UI needs that to
render a "shared with: X, Y" list at all. Added `GET
/annotations/{id}/shares` (owner-only, same as every other management
action). `pytest` 4/4 in `test_annotations.py` (full suite: 138 passed, 2
pre-existing failures in `test_guest.py`/`test_rendering_api.py` — both
`fluidsynth` not being on this Windows machine's `PATH`, unrelated to this
change, tracked under B7).

### B6 — Guest access (join links) [x]

Needed by the new `Frontend/` web player — the product pivoted to guests joining a group's
practice tracks via a shareable link, no login required unless they want to save
annotations. Additive: existing member-authenticated flows (B2–B5) are unaffected.

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

Feeds `Frontend/plan.md`'s F2 (accurate synced playback) and F3 (notation follow-along).
Ported from the iOS app's proven design (`MIDIParser`'s voice-part heuristic,
`MusicXMLConverter`'s quantization/tie/measure logic), rewritten server-side since that
code was Swift/AudioToolbox.

**Acceptance criteria:**
- [x] Given a distributed `PieceVersion`'s MIDI file, produces one audio stem per SATB voice part plus a backing/accompaniment stem, all sample-accurately alignable (same start offset, same tempo) when played together
- [x] The same version also produces multi-part MusicXML (SATB clefs, fixed-grid quantization, ties/measures — matching the iOS design) for OSMD to render
- [x] Rendering is cached per `PieceVersion` and only re-runs if that version's file changes
- [x] A manifest endpoint returns stem URLs (labeled by part), the MusicXML URL, and the tempo/time-signature metadata the frontend's cursor math needs — reachable by both authenticated members and B6's guest path

**Tasks — Claude:**
- [x] Port MIDI parsing to Python (`mido`) — replicate `MIDIParser`'s track→voice-part heuristic (track-name matching + mean-pitch fallback)
- [x] Port `MusicXMLConverter`'s quantization/tie/measure-splitting logic to Python
- [x] Audio rendering: shell out to FluidSynth with a GM soundfont (`TimGM6mb.sf2`, reused from the iOS project) to render each voice part's MIDI to a stem
- [x] Cache rendered output per `PieceVersion` via `app/storage/files.py`
- [x] Manifest endpoint combining stems + MusicXML + tempo metadata

**Tasks — Human:**
- [ ] Listen to a rendered stem set and confirm the GM soundfont's sound quality holds up for practice use

### B9 — Homework / assignments [x]

Added alongside `Frontend/plan.md`'s expanded F4 — F3's app-shell UI already had a Homework
tab, homework-detail screen, and admin "new homework" form built against fixture data; this
gives that concept a real backend home.

**Acceptance criteria:**
- [x] A group admin can create a homework assignment (piece, range, due date, instructions) for their group
- [x] Any member of the group can list and view that group's homework assignments
- [x] A non-member cannot list or view another group's homework (403, not a data leak)
- [x] An admin can delete an assignment

**Tasks — Claude:**
- [x] `Homework` model + migration
- [x] `POST /groups/{group_id}/homework` (admin-only create), `GET /groups/{group_id}/homework` (member list, ordered by `due_date`), `GET /homework/{id}` (member get), `DELETE /homework/{id}` (admin-only)
- [x] Tests covering create (admin ok / member 403), list + get (member ok / non-member 403), unknown-id 404, delete

### B10 — Guest privacy controls (password + homework visibility) [x]

Added while building F4's guest view — a leaked join-code link alone shouldn't be enough to
see a group's content, and homework specifically should be an opt-in guest exposure.

**Acceptance criteria:**
- [x] A group admin can set an optional guest password; when set, every `/guest/{join_code}` route requires it (401 without/with the wrong one)
- [x] Groups with no password set behave exactly as before (no breaking change)
- [x] A group admin can toggle whether guests (no login) can see that group's homework at all — off by default
- [x] An admin can change or clear the guest password and the visibility toggle later, not just at group creation

**Tasks — Claude:**
- [x] `Group.guest_password_hash` (nullable) + `guest_homework_visible` (bool, default false) + migration
- [x] `GroupCreate`/`GroupOut` schema updates (`guest_password` in, `has_guest_password`/`guest_homework_visible` out — never the hash/plaintext itself); `PUT /groups/{id}/guest-settings` (admin-only, full replace)
- [x] `app/api/routes/guest.py`: password check on all four guest routes; homework listing additionally 404s when `guest_homework_visible` is false
- [x] Tests: default-no-password groups unaffected, password required/wrong/right, settings update round-trip, non-admin can't change settings, homework hidden by default and visible once toggled on

### B11 — Deploy to hosting [x]

Gets a real, reachable URL for the Frontend to talk to. Free-tier stack: Render (free web
service, deploys the existing `Dockerfile` via a root-level `render.yaml`) + Neon (free
Postgres — chosen over Render's own since Render's expires after 30 days, Neon's doesn't).

**Storage (was a known limitation, now resolved in code):** Render's free plan has no
persistent disk, so `STORAGE_DIR` is wiped on every restart/redeploy. As of 2026-08-31
(committed 9d7ef53) `app/storage/files.py` writes uploaded piece files to Neon Object
Storage (S3-compatible, `uploads` bucket) when the `AWS_*` env vars are set, falling back
to local disk otherwise; the render cache / OMR scratch stay local and are fine to lose.
Remaining human step: set `AWS_*` (+ `S3_BUCKET`) on Render and re-upload the files lost
to earlier disk wipes — see Backlog.

**Partial fix landed for bundled/demo pieces specifically** (not new uploads): a committed,
read-only `Backend/fixtures/` directory (copy of the repo-root `Fixtures/`) that
`resolve_source_path()` resolves any `file_path` starting with `fixtures/` against, instead
of the writable storage dir. Not a build-context change — Render's dashboard-set
`rootDir: Backend` prefixes onto `render.yaml`'s `dockerContext`, so an earlier attempt to
reach the sibling `Fixtures/` directly by moving the build context to the repo root broke
the live build ("repo root" really meant `Backend/Backend/`). Verified end-to-end against
both a local Postgres and the real live service: seed → distribute → guest manifest fetch
→ real rendered stem returned, not an error page.

**Acceptance criteria:**
- [x] The backend is reachable at a public HTTPS URL, `/health` returns 200 — live at `https://divisi.onrender.com/health`
- [x] Migrations run automatically on deploy (Dockerfile's CMD runs `alembic upgrade head` before `uvicorn`)
- [x] Uploaded files survive a redeploy — via the Neon Object Storage swap (9d7ef53); needs `AWS_*` set on Render
- [x] A real end-to-end smoke test against the deployed instance (register → login → create group → guest join-code fetch) passes, confirmed against the real live service including CORS from the real Frontend origin (`https://divisi.maripi.net`)

**Tasks — Claude:**
- [x] Dockerfile CMD runs migrations before starting `uvicorn`, binds `$PORT` dynamically
- [x] Root-level `render.yaml` blueprint (Docker runtime, free plan, `/health` check, env wiring)
- [x] Pushed repo to a new private GitHub repo (`github.com/Maripirs/divisi`, `main` + `backend/deploy`)
- [x] Installed the Neon CLI + MCP server + agent skills, linked this worktree to the human's Neon project
- [x] Wrote `Backend/.env` from the linked project's pulled vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AWS_*` Object Storage credentials); verified `alembic upgrade head` against the live Neon database

**Tasks — Human:**
- [x] Created the Neon account/project, got its Postgres connection string
- [x] Created the Render account, deployed from `render.yaml` — live at `divisi.onrender.com`
- [x] Confirmed the deployed `/health` URL
- [x] Redeployed on Render once the CORS/B9/B10 merge reached `backend/deploy`

### B12 — Group page configuration [x]

Generalizes B10's ad-hoc `Group.guest_homework_visible` boolean into a per-page
enabled/audience setting, ahead of adding Responsibilities (B13) as a 5th page.
Backend only this pass — the Frontend still referenced the old field in a few places
until F6 picked it up.

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
- [x] Wired the existing homework + guest routes to check `group_page_settings` instead of `guest_homework_visible`
- [x] Dropped `Group.guest_homework_visible` (migration)
- [x] Tests: default seeding, per-page enable/audience toggling (admin-only, member/guest 403), disabled page blocked for members and guests, members-only page blocked for guests but not members, admin always has access, backfill migration correctness

### B13 — Responsibilities [x]

Depends on B12 (registers as the `responsibilities` page). Scoped down from the original
proposal doc (deleted 2026-08-28): one-off dates only (no recurrence rule, no lazy
generation, no `signup_deadline`), no swapping, no signup-approval step, no
notifications/reminders — all deferred to Backlog if actually needed later.

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
- [x] Guest endpoint, gated by B12's `responsibilities` page audience=everyone
- [x] Coverage computed server-side (`needed_count - active_signup_count` per role), returned on the list endpoint
- [x] Tests: admin CRUD, member self-signup/remove + 403 for non-members, locked date blocks member writes but not admin, coverage math, guest route respects page settings

**Expanded 2026-08-29 (regular rehearsal schedule):** `Group.rehearsal_weekday`/`rehearsal_time`
(no timezone stored — "next occurrence" is computed client-side against the browser's local
clock) + migration `d8b3f5a1c7e4`; admin-only `PUT /groups/{id}/rehearsal-schedule` (full
replace, both fields together). Built after investigating a report of responsibility-date
times "not storing right" — a live curl round trip showed the stored value was exactly
correct, so this ships the requested "Next rehearsal" anchor instead of a fix for a bug
that didn't reproduce. `pytest` 137/139 (2 known FluidSynth gaps).

### B14 — Account security (password strength/reset, OAuth scaffold) [x]

Built autonomously overnight, per the human's explicit direction before bed: "make account
setup more robust/secure, consider incorporating google/apple log in. If not, require the
password to be entered twice and match, plus a path to recovery." Two judgment calls made
in their absence:

1. **No email provider exists in this backend.** Password reset needs to put a link
   somewhere reachable — asked before they logged off; they chose "build the flow, log the
   link server-side for now" over skipping recovery. `/auth/forgot-password` is fully real
   (token generation, expiry, single-use); the "send" step is `logger.warning(...)`,
   readable via Render's log viewer, not a real email. **Still needed:** pick a
   transactional email provider (Resend/Postmark) — tracked in Backlog.
2. **OAuth needs real app credentials** only the human can create. Asked; they chose
   "scaffold it anyway." Google got a complete, real implementation
   (`app/services/oauth.py`) — untestable until real credentials exist, and
   `oauth_configured: False` keeps its routes 501/inert and the Frontend button hidden
   until then. Apple was **not** scaffolded the same way — its real requirements
   (JWT-signed client secret from a `.p8` key, POST/`form_post` callback) go beyond a
   static secret, so a naive implementation would be wrong, not just untested; its routes
   always 501 honestly.

**Acceptance criteria:**
- [x] Registration requires a password of at least 8 characters; the Frontend's register form requires typing it twice and matching before it'll even submit
- [x] A user can request a password reset by email; a single-use, 1-hour-expiring token lets them set a new password without knowing the old one; the response is identical whether or not the email has an account (no user-enumeration oracle)
- [x] `GET /auth/oauth/providers` reports which sign-in providers are actually configured; a "Continue with Google/Apple" button only appears on the Frontend when its provider is
- [x] Google Sign-In's authorization-code flow (start → Google consent → callback → account creation/linking → session) is fully implemented, gated entirely behind real credentials existing
- [x] None of this breaks an existing user's ability to log in — the length check only applies to registration/reset, never to login itself

**Tasks — Claude:**
- [x] `UserCreate.password`/`ResetPasswordRequest.new_password` Pydantic validator, 8-char floor (`MIN_PASSWORD_LENGTH`, shared constant)
- [x] `PasswordResetToken` model + migration (`e9c3b1a7d5f2`) — `token_hash` only (SHA-256), never the raw token; `expires_at`/`used_at` enforced on every reset attempt (no cleanup job exists, an accepted gap)
- [x] `POST /auth/forgot-password` (generates + logs the link, generic response), `POST /auth/reset-password` (validates, single-use, updates `hashed_password`)
- [x] `OAuthAccount` model linking a `User` to a provider identity — additive to password auth, not exclusive
- [x] `Settings.google_client_id`/`*_secret`/`apple_*` (empty by default) + `oauth_configured` property; `GET /auth/oauth/providers`, `GET /auth/oauth/{provider}/start` (redirect + `state` cookie CSRF guard), `GET /auth/oauth/{provider}/callback` (code exchange, account upsert linking by email, issues the same JWT `/auth/login` does)
- [x] `app/services/oauth.py`: real Google authorization-URL builder + code-exchange/userinfo fetch; Apple deliberately not implemented
- [x] Frontend: confirm-password field (register), `/forgot-password` + `/reset-password?token=...` pages, `/login/oauth-callback`, conditional OAuth buttons on `/login`
- [x] Tests: password-too-short rejected, forgot-password's generic response for an unknown email, full reset round-trip, single-use enforcement, unknown-token rejected, `oauth/providers` reporting unconfigured, Google/Apple 501ing correctly, unknown-provider 404
- [x] Bumped every test fixture's password from 7 to 8 chars across the whole suite
- [x] **Added 2026-08-28 (follow-up):** `PUT /auth/me/password` — password change for an already-logged-in user, distinct from `reset_password`'s token flow (requires `current_password` + `new_password`; a valid session alone isn't proof enough on its own)
- [x] Real bug caught by the new tests: comparing `PasswordResetToken.expires_at` (naive when round-tripped through SQLite, the test DB) against `datetime.now(timezone.utc)` (always aware) raised `TypeError` — Postgres wouldn't have hit this; fixed with a `_as_utc()` normalizing helper, correct either way

**Tasks — Human:**
- [x] Set `FRONTEND_BASE_URL=https://divisi.maripi.net` on Render — verified 2026-08-28, OAuth callback redirects to the real site now
- [ ] Pick a transactional email provider and wire it in place of `forgot_password`'s `logger.warning(...)` — still entirely unbuilt
- [x] Google Sign-In: created the OAuth app in Google Cloud Console (project `divisi-506916`), set credentials locally and on Render. Verified end-to-end 2026-08-28 with a real browser round trip (a prior "verified" claim had only ever curled the API) — confirmed redirect URIs registered and `FRONTEND_BASE_URL` correct, then the human logged in via Google on the real site and confirmed password+Google account linking on the same email.
- [x] **Hidden again, deliberately, 2026-08-28**, right after verifying — the OAuth consent screen is still in Testing status (only listed test users can sign in), so the credentials were pulled from Render (deleting an env var via the API doesn't auto-redeploy, so the service was also restarted) rather than just commented out locally (the earlier half-fix). Confirmed `oauth/providers` reports `google: false` again. **To re-enable:** publish the consent screen out of Testing in Cloud Console, re-add the two keys on Render, restart the service.

### B15 — Piece markup: freehand pen strokes + stamps [x]

Feeds `Frontend/plan.md`'s F11 — a piaScore-style drawing layer on a piece's PDF
pages, additive alongside B5's `Annotation` (a single text note at a score
position), not a replacement for it. Personal-only: every mark is scoped to its
creator, no share/unshare like B5 has — a group-published layer is a planned
fast-follow (see Backlog), deliberately not built this pass.

**Acceptance criteria:**
- [x] A user can save a pen stroke (color, width, an ordered point path) or a stamp (a fixed symbol type + one position) against a piece's specific PDF page
- [x] Only the piece's owner/group members can create marks on it; only a mark's own creator can see or delete it — no sharing
- [x] Deleting a mark works for both "erase" (remove one specific mark) and "undo" (remove the most recently created one) — no separate undo endpoint needed

**Tasks — Claude:**
- [x] `PieceMarkupMark` model (JSON `points` column for strokes; `x`/`y`/`stamp_type` for stamps) + migration (`e4a8c2f6b1d9`)
- [x] `POST`/`GET /piece-markup`, `DELETE /piece-markup/{id}` — same access-gate helper shape as `annotations.py`, kept as its own local copy per this codebase's small-self-contained-route-module convention
- [x] Tests: create both kinds, Pydantic validation (a stroke needs points+width, a stamp needs type+position), personal-only listing, cross-user access denial, owner-only delete. `pytest` 5/5 in `test_piece_markup.py`, 143/145 full suite (2 pre-existing FluidSynth-on-PATH gaps, unrelated)

**Tasks — Human:**
- [x] Deploy this to production — done. `main` is pushed, Render redeployed, prod Neon is at head `f9d4c1a7b2e8`, so B15's markup migrations are live.

### B16 — Piece rehearsal notes (durable per-piece reminders) [x]

**Built 2026-09-01 (`f08c969`), 14 tests, full suite green (174).** Both
build-time decisions below went as written: list gated on
`GroupPage.weekly_notes`, `part_scope` free-text. Migration `d7e3a9c1f6b4`
(`down_revision = c1f7a4d2e8b6`); during the `feat/generate-track-from-pdf`
merge the OMR migration `d2f8a6c4e1b9` was rebased to chain *after* it, so
the chain is linear with a single head. Not on production — reaches prod
only when `main` is pushed (Render then runs it). Frontend counterpart:
`Frontend/plan.md`'s **F20** (piece-page Rehearsal Notes panel).

Scoped down from the Codex "Divisi Weekly Notes Backend Proposal"
(`~/Documents/Codex/2026-08-30/on/outputs/divisi-weekly-notes-backend-proposal.md`).
That doc proposes three things at once: `weekly_note_sections` +
`weekly_note_items` (a normalized section/item tree under a weekly note),
`piece_rehearsal_notes` (durable per-piece reminders), and
`group_resources` (stable group links). This milestone builds **only
`piece_rehearsal_notes`** — the actual product win (piece-specific
knowledge that today is trapped in dated posts becomes reusable and
searchable on the piece). The other two are deferred to Backlog: the
section/item tree is the expensive, least-proven part (2 tables + ~6 CRUD
endpoints + ordering) and a JSONB column on `weekly_notes` would get most
of its value if structure is ever actually wanted; `group_resources` is
cheap and useful but independent.

Standalone: new table + new route module, no change to any existing
table, endpoint, or the `WeeklyNote.body` free-text flow.

**Two decisions to confirm at build time:**
1. **List page-access gate.** Reuse `GroupPage.weekly_notes` for the
   `GET` list (these notes are conceptually the durable half of weekly
   notes), rather than adding a dedicated `GroupPage` value — a new page
   would mean a `group_page_settings` seed + backfill in the migration.
   Split it out later only if an admin wants to toggle it independently.
2. **`part_scope` is free-text `str`, not an enum** — SSAATTBB, divisi,
   "low altos", "everyone" all need to fit; matches `Homework.range`
   being a plain string.
No `source_weekly_note_id` column yet — it only earns its place once
"promote a weekly note into a piece note" ships (Backlog).

**Acceptance criteria:**
- [x] A group admin can create a rehearsal note against a piece that
  belongs to their group (kind, optional title, body, optional
  page_number / measure_label / part_scope)
- [x] Any member of the group can list a piece's rehearsal notes; a
  non-member / guest cannot (403, no data leak)
- [x] Creating a note for a piece that isn't this group's piece is
  rejected (400/404, not a cross-group write)
- [x] An admin can edit (full replace) and delete a note; a member cannot
- [x] Unknown group / piece / note id returns 404
- [x] Disabling the gating page hides the list for members but not admins
  (same mechanism as homework)

**Tasks — Claude:**
- [x] `PieceRehearsalNote` model + `PieceRehearsalNoteKind` enum in
  `app/db/models.py`, following the `Homework` pattern; `kind` stored as
  plain `String`, validated by the Pydantic enum at the API layer
- [x] Alembic migration `d7e3a9c1f6b4` (`down_revision = c1f7a4d2e8b6`);
  `op.create_table` with FKs to `groups.id` / `pieces.id` / `users.id`, no
  `group_page_settings` seeding
- [x] `app/api/schemas/piece_rehearsal_notes.py` (`...Create` / `...Update`
  full-replace / `...Out`), re-exported from `schemas/__init__.py`
- [x] `app/api/routes/piece_rehearsal_notes.py`, two-prefix router:
  `POST/GET /groups/{group_id}/pieces/{piece_id}/rehearsal-notes`,
  `PUT/DELETE /piece-rehearsal-notes/{note_id}`. Reuses `get_group_or_404`,
  `require_admin`, `require_member`, `get_piece_or_404`, `get_or_404`,
  `require_member_page_access(..., GroupPage.weekly_notes, ...)`; a private
  `_require_group_piece()` factors the group + piece + piece-in-group
  check. Registered in `app/main.py`
- [x] `tests/test_piece_rehearsal_notes.py` — 14 tests covering every
  acceptance criterion above

**Tasks — Human:**
- [x] Deploy: push `main` — done. Prod Neon is at head `f9d4c1a7b2e8`
  (`alembic current` via `Backend/.env`), so `d7e3a9c1f6b4` is live.

**Expansion 2026-09-02 (guest access to director notes) — built 2026-09-02,
not pushed/deployed.** A guest viewing a group's piece sees the "From the
director" rehearsal notes read-only (the frontend ask is `Frontend/plan.md`'s
F20 "Expanded" note; principle: guest UX matches member UX minus privacy /
per-user storage). Personal notes have no guest path.
- [x] Guest endpoint in `app/api/routes/guest.py`:
  `GET /guest/{join_code}/pieces/{piece_id}/rehearsal-notes`. Guest
  password check (same as the other guest routes); the piece must be
  distributed to that group (`_latest_distributed_version` -> 404);
  returns the piece's `PieceRehearsalNote` list read-only, filtered to
  `group_id == group.id`, oldest first (matches the member list).
- [x] Gate: the group's **`tracks` `GroupPage`** must be `enabled` and
  `audience == everyone` (the human's call, 2026-09-02) — reuses
  `require_guest_page_access(..., GroupPage.tracks, ...)`. Deliberate
  asymmetry: the member list still gates on `GroupPage.weekly_notes`
  (B16, unchanged). Unify later if it grates.
- [x] Tests: guest sees notes when `tracks` is public, 404 when it's
  disabled or members-only, wrong/absent guest password rejected, a piece
  not distributed to the group 404s. `tests/test_guest.py` +5, suite 240
  green.

### B17 — Group markup layer (shared, admin-co-edited) [x]

(`B17`/`B18` were also used on the `omr-editor` branch for paged-OMR work,
see `OMR_EDITOR_PLAN.md`; on `main`, `B17` is this.)

Supersedes the "B15 fast-follow — group-published markup layer" Backlog
item. That item (and F11's matching note) described a per-author *publish*
step with a `published_at` flag. What we're building instead: the group
markup is **its own scope**, owned by the group, not by the admin who drew
each mark. Any admin of the owning group can add / move / edit / delete any
mark in it; members see it read-only. No publish action.

Note: an earlier partial `scope=group` in `piece_markup.py` returned *every
member's* personal marks on a group piece with no opt-in — that's the
behavior this milestone replaces (the human flagged it as wrong, 2026-09-02).

**Acceptance criteria:**
- [x] `piece_markup_marks.scope` (`personal` | `group`, default `personal`);
  existing rows backfill to `personal`. `user_id` stays NOT NULL and now
  means creator / last editor (audit only for group-scoped marks).
- [x] `GET /piece-markup?scope=group` returns the group layer for a
  group-owned piece to any member of that group; `[]` for a personal piece.
  `scope=personal` (the default) is unchanged — still only the caller's own.
- [x] `POST /piece-markup` accepts `scope` (default `personal`). `scope=group`
  is rejected (403) unless the piece is group-owned **and** the caller is an
  admin of that group.
- [x] `PATCH` / `DELETE /piece-markup/{id}`: a `personal` mark stays
  creator-only; a `group` mark is editable/deletable by any admin of the
  owning group (not just whoever created it).
- [x] A non-member gets 403 on any scope for that piece; nothing leaks.

**Tasks — Claude:**
- [x] Alembic migration: add `scope` column, backfill `personal`.
- [x] `MarkupMarkCreate.scope`; scope-aware access checks in
  `piece_markup.py` (reuse the group-admin helper shape from
  `piece_rehearsal_notes.py` / `services/groups.py`).
- [x] `tests/test_piece_markup.py`: admin A edits/deletes a group mark admin
  B created; member reads the group layer but 403s writing it; non-member
  403; personal scope regression-covered.

**Built 2026-09-02 (`e75f79c`, not pushed).** Migration `b1c3d5e7f9a2`
(`down_revision = f9d4c1a7b2e8`), one linear head. pytest 229 passed.
`scope` column with `server_default='personal'` (backfills existing rows).
`_is_owning_group_admin()` local helper gates `scope=group` writes;
`_require_edit_access()` routes personal→creator, group→owning-group admin;
a group `PATCH` also stamps `user_id` = the editing admin (last-editor
audit). `scope=personal` list now also filters `scope == 'personal'` so an
admin's own group mark can't leak into their personal list. Reaches prod
on the next `main` push.

### B18 — PDF cue points (time anchors on `PieceMarkupMark`) [x]

Depends on B17. Feeds `Frontend/plan.md`'s **F22** — tap a marker on the
PDF to jump the reference recording to a timestamp. A PDF has no inherent
timing, so each cue is a hand-placed `(page, x, y) → time` anchor against
the reference recording's own timeline.

(`B17`/`B18` were also used on the `omr-editor` branch for paged-OMR work;
on `main`, `B18` is this.)

Frontend note (2026-09-02): F22 was tightened so the frontend only ever
creates `scope='group'` cues (Director-layer only). The schema here still
permits a cue at any scope; nothing sends a personal one. No backend code
or migration change.

Guest cues endpoint (2026-09-03): F22 was changed again so cue glyphs
always render in the PDF player for every viewer, including not-logged-in
join-link guests. Added `GET /guest/{join_code}/pieces/{piece_id}/cues`
(`response_model=list[MarkupMarkOut]`), cue-only on purpose: the director
pen/stamp/text ink on the same `scope='group'` layer has no guest path and
stays members-only, but a cue is a "jump the recording here" navigation aid
that rides along with the guest PDF. Same `tracks` page gate (enabled +
`audience == everyone`) and join-code/password/distribution scoping as the
guest PDF and rehearsal-notes routes; mirrors `list_guest_piece_rehearsal_notes`.
No schema or migration change. `tests/test_guest.py` +4.

**Built 2026-09-02, not pushed/deployed.** Migration `c3e5a7b9d1f4`
(`down_revision = b1c3d5e7f9a2`), one linear head. `time_ms` nullable int,
no server_default (only a `cue` ever sets it). `MarkupMarkUpdate` also
grew a `time_ms >= 0` validator; the route's `model_dump(exclude_unset=True)`
loop flows it through, B17's scope-aware `_require_edit_access` unchanged.
`tests/test_piece_markup.py` +6, full suite 240 green.

**Acceptance criteria:**
- [x] `piece_markup_marks.time_ms` (nullable int, milliseconds into the
  reference recording). Set only for `kind='cue'`.
- [x] New `kind` value `cue`. Pydantic validation: a `cue` requires
  `time_ms` (>= 0) plus `x`/`y`/`page_number` (positioned like a stamp);
  a non-`cue` kind must leave `time_ms` null.
- [x] `time_ms` is on `MarkupMarkCreate` / `MarkupMarkUpdate` /
  `MarkupMarkOut`. Editing a cue's `time_ms` follows B17's per-scope edit
  rules (personal → creator, group → any owning-group admin).
- [x] `list_marks` returns cues alongside strokes/stamps/text, no query
  change; both `scope`s carry cues.
- [x] 2026-09-03: `GET /guest/{join_code}/pieces/{piece_id}/cues` — cue-only
  guest read of the group layer, `tracks` page enabled + `audience ==
  everyone`, mirrors the guest rehearsal-notes route. `tests/test_guest.py`
  +4 (public read; 404 when tracks members-only/disabled; 404 when the piece
  isn't distributed; password group needs a valid token).

**Tasks — Claude:**
- [x] Migration: add `time_ms` nullable int to `piece_markup_marks`.
- [x] `MarkKind` gains `cue`; `MarkupMarkCreate`/`...Update`/`...Out` gain
  `time_ms`; extend the existing `model_validator` for the cue field rules.
- [x] `tests/test_piece_markup.py`: create a personal cue + an admin group
  cue; `time_ms` required for `cue` / rejected for `stroke`; a member reads
  a group cue but can't create/edit one; edit a cue's time.

**Tasks — Human:**
- [ ] Deploy: push `main` (Render runs the migration).

### B19 Progressive accounts: anonymous participants + "Save across devices" [x]

*Superseded in part by B21 (2026-09-11): "Save across devices"'s name+PIN
mechanism described below was dropped entirely (no real users had ever hit
it) in favor of a lighter group-scoped guest name match. Everything else
here — the anonymous participant itself, mint-on-first-shared-action,
`merge_participant`, `min_identity`, the roster badge, the sweep — stands
unchanged; B21 just replaces how a merge gets triggered.*

Lowers the account barrier for the singer path. A member who joins via a
link can already read everything (guest routes, B6/B10/B12); the wall is
the first *stateful* action: signing up for a responsibility slot, saving
an annotation, showing up on a roster. Today that means "go register",
which is a hard stop mid-flow. Brainstormed with the human 2026-09-09. The
conductor authoring path (create a group, upload a score) is deliberately
untouched: a full account is still required there.

Design: identity starts client-side (Frontend F23 owns the local profile).
The Backend only gets involved when a local-only singer performs a shared
action, at which point it mints a durable *anonymous participant* bound to
that client's local id. "Save across devices" later attaches a real
credential to that same row in place, so nothing the singer already did is
lost. This is the pattern the OAuth code already uses (`app/api/routes/
auth.py`'s callback: a `User` row whose password is a value nobody knows,
unlocked by another mechanism), except the mechanism here is a signed
device token (same primitive as `create_guest_token`), not a password.

**Two build-time decisions (settled 2026-09-09):**
1. **Anonymous participant = a `User` row with `is_anonymous = true` plus a
   `GroupMembership` flagged `is_guest = true`.** Confirmed the lean over a
   separate `participants` table: signups / annotations already FK to
   `users.id`, promotion is an in-place field flip with no row copy, and
   existing membership / roster queries pick it up for free. The guest tier
   lives on `GroupMembership.is_guest` (bool) rather than a third
   `GroupRole` value, because `GroupRole` feeds dozens of `== admin` /
   `!= admin` checks a new enum value would all have to be re-audited;
   `is_guest` is a clean audit signal that touches nothing existing.
2. **"Require a saved account" gate = a new
   `GroupPageSettings.min_identity` (`anyone` | `saved`) column.** Confirmed
   over overloading `audience`: `audience` (members | everyone) is about
   login state, this is about credential state, and a conductor may want
   "everyone can see it, but you must Save before you claim a slot".

**Design (settled 2026-09-09):**
- **Schema (one migration, `down_revision = a2f6c1e4d9b7`, the current
  single head):** `users.is_anonymous` (bool, NOT NULL, server_default
  `false`); `users.anonymous_local_id` (varchar, nullable, indexed, a
  fallback resolver when the device cookie is lost but localStorage
  survives); `users.pin_hash` (varchar, nullable, set only by a PIN Save,
  distinct from `hashed_password` so a PIN account can never collide with a
  real email/password account); `group_memberships.is_guest` (bool, NOT
  NULL, server_default `false`); `group_page_settings.min_identity`
  (`SAEnum(PageMinIdentity, native_enum=False)`, NOT NULL, server_default
  `anyone`, mirroring the sibling `audience` column's DDL from migration
  `3d1749b04685`). Backfill is entirely via server_defaults.
- **Device token:** `create_participant_token(user_id, local_id)` /
  `decode_participant_token` in `app/core/security.py` next to the guest
  helpers. Distinct `scope = "participant"` claim, `psub` = user id, `lid`
  = local id, one-year life (`participant_token_expire_minutes`, new
  setting): it is the singer's only identity until they Save, so a short
  expiry would silently orphan their work. Carried in a `divisi_participant`
  httpOnly cookie, `secure=True`, `samesite="none"` (the API is a
  cross-site origin from the Frontend), `path="/"`. F23 forwards the
  backend's `Set-Cookie` through its proxy layer, same as it already does
  for the guest token.
- **`get_optional_participant`** dependency in `app/api/deps.py`: resolves
  that cookie to its `User` (anonymous or since-promoted) or `None`, never
  raises. Plus `get_current_user_optional` (bearer, `auto_error=False`) so
  one route can accept "real member, or participant, or neither".
- **`app/services/participants.py`** (new, same shape as `services/
  groups.py`): `mint_anonymous_participant` (synthetic unique
  `anon-<uuid>@participants.divisi.invalid` email, `name` from the lazily
  collected display name or `"Guest"`, unguessable random password nobody
  knows exactly like the OAuth callback, `is_anonymous = True`),
  `resolve_participant` (cookie user, else `anonymous_local_id` lookup, else
  `None`), `ensure_guest_membership` (`role = member`, `is_guest =
  user.is_anonymous`), `set_participant_cookie`, and `merge_participant`
  (below).
- **Mint-on-first-shared-action, wired into `create_signup`
  (`app/api/routes/responsibilities.py`) first:** the self-signup branch
  (no `payload.user_id` / `payload.name`) resolves an actor as bearer user
  -> participant cookie -> `local_id` lookup -> mint. `ResponsibilitySignupCreate`
  gains `local_id` / `display_name` (ignored for authenticated or
  admin-assignment calls). An anonymous actor is gated by
  `require_guest_page_access(group_id, responsibilities, db)` (the page must
  be `audience = everyone` for a local-only singer to act, a deliberate
  constraint: a local-only client is effectively a guest) plus
  `require_saved_identity` (the `min_identity` check, raises 403 whose
  detail starts `SAVE_REQUIRED:` for the Frontend to match), then
  `ensure_guest_membership`, then the cookie is set on the response. The
  admin-assignment branches (`user_id` / `name`) stay bearer-only,
  unchanged. Factored so a future annotation route calls the same
  resolve-or-mint helper.
- **`POST /auth/save` (name + PIN):** PIN is 4-8 digits, numeric only
  (Pydantic validator), hashed with `hash_password` into `pin_hash`.
  Resolve-or-mint the caller's anonymous row; 409 if it is already saved.
  If a saved user exists with the same normalized (`lower`, trimmed) name
  and a `pin_hash` that verifies, `merge_participant` folds the caller into
  it and returns that account's session `Token`; otherwise promote in place
  (`is_anonymous = False`, store `pin_hash` + name, clear `is_guest` on
  every membership) and return its `Token`. The participant cookie is
  deleted on the response. This same endpoint is therefore also how a
  second device "signs in": it mints a local row there, then merges. Login
  by name + PIN is a deliberate launch-only compromise (a global "Sarah" +
  "1234" collision would merge two unrelated people); the email-magic-link
  fast-follow in Backlog is the more robust cross-device path. A PIN
  account keeps its synthetic email and cannot use `POST /auth/login`.
- **`merge_participant(db, source, target)`:** annotations reconcile
  last-writer-wins per `piece_id` (newer `created_at` wins, loser deleted
  with its shares); `GroupMembership` unions per group (repoint if target
  has none, else drop source's; `is_guest` cleared on the survivors);
  `ResponsibilitySignup` repoints, dropping a source row that would collide
  on `(date_id, role_id, user_id)`; personal `PieceMarkupMark` rows
  repoint; then `source` is deleted.
- **OAuth callback:** deliberately untouched. Third-party sign-in is not a
  Save method for a participant (decided 2026-09-09); the callback keeps
  its B14 behavior of always creating / linking a plain `User`. A
  participant who later signs in with a real credential just ends up with a
  second account, same as any other returning user, until the email
  magic-link fast-follow gives them a real merge path.
- **Roster badge:** `GroupMemberOut.is_anonymous` (default `False`),
  populated in `list_members`.
- **`min_identity` admin read/write:** `GroupPageSettingOut.min_identity`
  (always present) and `GroupPageSettingUpdate.min_identity`
  (`PageMinIdentity | None = None`, applied only when sent, so F6's
  existing PUT payloads that omit it are undisturbed), on the existing
  `GET/PUT /groups/{id}/page-settings`.
- **Sweep:** `Backend/scripts/prune_anonymous_participants.py`, a manual
  command (`python Backend/scripts/prune_anonymous_participants.py --days N
  [--dry-run]`), mirroring `seed_demo.py`'s bootstrap. Deletes
  `is_anonymous` users older than N days with zero `ResponsibilitySignup`
  and zero `Annotation` rows (their memberships / personal markup go too).
  No scheduled runner exists (Backlog).

**Acceptance criteria:**
- [x] A shared action from a local-only client (first one wired:
  responsibility self-signup) mints exactly one anonymous `User` bound to
  the client's local id, with a guest-tier `GroupMembership` in the acting
  group, and the signup FKs to it. A second shared action from the same
  client reuses that row.
- [x] "Save across devices" attaches a credential (name + PIN) to the
  existing anonymous row, sets `is_anonymous = false`, and every signup /
  annotation already attached carries over with no data migration.
- [x] Saving from a second device with the same credential folds into the
  one account: annotations reconcile last-writer-wins per `piece_id`, group
  memberships union, the duplicate anonymous row is deleted.
- [x] An anonymous participant appears in the group's member list flagged
  unverified; a conductor can tell it apart from a real account at a glance.
- [x] A conductor can set a page to `min_identity = saved`; a local-only
  client is refused the write on that page with a distinct error the
  Frontend can act on ("Save your account first"), but still reads it per
  the normal `audience` rules.
- [x] Deleting an anonymous participant with no signups and no annotations
  is safe and lossless; one with either is kept.
- [x] No change to the existing authenticated flows, the guest read routes,
  or `/join`.

**Tasks — Claude:**
- [x] `User.is_anonymous` (bool, default false) + a guest-tier membership
  role (new `GroupRole` value or a membership flag) + migration; backfill
  existing users `false`. (Shipped as `GroupMembership.is_guest`; also
  `users.anonymous_local_id` + `users.pin_hash`, migration `d4a9f2c7e1b8`.)
- [x] Device-token issue / verify in `app/core/security.py` next to the
  guest-token helpers: signed, carries the client local id, set as an
  httpOnly cookie. A `get_optional_participant` dependency resolving it to
  a `User` or `None`. (Also `get_current_user_optional` for the one route
  that accepts member-or-participant-or-neither.)
- [x] Mint-on-first-shared-action helper: no session and no participant
  cookie on a shared-action route creates the anonymous `User` +
  `GroupMembership`, sets the cookie, then proceeds. Wired into the
  responsibility self-signup route first; factored (`app/services/
  participants.py`) so annotations can call it next.
- [x] `POST /auth/save` (name + PIN): promotes the caller's anonymous row
  in place. PIN hashed via `hash_password`; `is_anonymous = false`. Reject
  if the row is already saved.
- Dropped: OAuth-callback promote/merge of the anonymous row. Third-party
  sign-in is not a Save method for a participant (decided 2026-09-09); the
  callback keeps its plain B14 behavior.
- [x] Merge-on-save: when the credential already maps to a saved `User`,
  fold the anonymous row into it (annotations last-writer-wins per
  `piece_id`, `GroupMembership` union, `ResponsibilitySignup` /
  `PieceMarkupMark` repoint, delete the anonymous row).
- [x] `GroupPageSettings.min_identity` (`anyone` | `saved`) column +
  migration (default `anyone`, nothing changes for existing groups) +
  admin read / write on the existing page-settings endpoint; enforced in
  the shared-action routes (`require_saved_identity`).
- [x] Surface `is_anonymous` on the member-list schema for the roster badge.
- [x] Sweep: a `scripts/` management command deleting anonymous users with
  no signups / annotations older than N days. No scheduled-job runner
  exists (Backlog), so it is manual / host cron for now
  (`scripts/prune_anonymous_participants.py`, core factored to a
  test-callable `prune_anonymous_participants(db, days, dry_run)`).
- [x] Tests: mint on first signup, reuse on second (cookie + `local_id`
  fallback), promote via PIN, merge from a second device (annotation
  conflict, membership union, anon row gone), roster badge, `min_identity
  = saved` refuses a local-only write but not a read, `audience = members`
  gives a 404, sweep keeps a participant that has a signup. `tests/
  test_participants.py` (+13), `tests/test_auth.py` (+3), `tests/
  test_guest.py` (+1).

**Tasks — Human:**
- [ ] Decide N (anonymous-row retention window) for the sweep.

### B20 — Demo "Preview Admin" (public, read-only) [x]

Requested by the human 2026-09-11 while testing B19/F23 locally, alongside
moving F23's "browsing as a guest" banner into Settings (Frontend-only, see
`Frontend/plan.md`'s F24). The ask: let a visitor to the public demo choir
(`DEMO_SETUP.md`) see what the Admin/conductor experience looks like,
without any risk of a stranger actually changing the shared public demo
data. Scoped to the demo group only, not every guest on every group
(confirmed with the human): a real conductor's group never offers this.

**Design:** rather than building a second, fake-write "mock admin" UI,
the demo group's real admin gets a genuine, but read-only, session. A new
token type carries the real demo-admin's `sub` (so every existing
admin-only screen renders exactly as it would for them, zero new
Frontend admin UI needed) plus a `scope = "admin_preview"` marker a single
process-wide middleware checks: any request that isn't
GET/HEAD/OPTIONS and carries that scope is rejected before it reaches its
handler, regardless of which route. A normal member/admin token has no
`scope` claim at all (see `create_access_token`), so this can never affect
a real session.

No new table, no migration: which group (if any) offers this is a single
`Settings.demo_join_code` env var, empty by default (feature off
everywhere). Set on Render only once the demo group's join code is
hand-set.

**Acceptance criteria:**
- [x] `Settings.demo_join_code` unset (default): `GET
  /guest/{any_code}/admin-preview` 404s for every join code, real or not.
- [x] Set to a real group's join code: `GET /guest/{code}/admin-preview`
  returns a token that resolves (`GET /auth/me`, and every other
  admin-only read) as that group's real admin account.
- [x] Any non-GET/HEAD/OPTIONS request carrying that token, on any route,
  is rejected with a 403 whose `detail` starts `PREVIEW_READ_ONLY:` —
  verified against both a plain field update and a resource-create route,
  not just the one the feature was built for.
- [x] A real admin/member session sitting alongside a preview session is
  completely unaffected; nothing the preview session did persists.
- [x] `GuestGroupOut.admin_preview_available` reports whether the
  currently-viewed guest group is the one `demo_join_code` names, so the
  Frontend never needs its own copy of that code.
- [x] A join code that happens to equal `demo_join_code` but doesn't
  belong to any group (not yet seeded, typo'd env var) fails closed: a
  plain 404, not a 500.

**Tasks — Claude:**
- [x] `Settings.demo_join_code` (`app/core/config.py`).
- [x] `create_admin_preview_token` / `decode_token_scope` in
  `app/core/security.py`, next to the guest/participant token helpers.
- [x] `app.main`'s `block_admin_preview_writes` middleware: the single
  process-wide guard, so no future admin-only endpoint can forget it.
- [x] `GET /guest/{join_code}/admin-preview` (`app/api/routes/guest.py`):
  404 unless `join_code` matches `demo_join_code` *and* a real group with
  a real admin membership exists for it; else mints the token for that
  admin's user id.
- [x] `GuestGroupOut.admin_preview_available`, computed in
  `resolve_join_code`.
- [x] Tests (`tests/test_guest.py`, +5): unset always 404s, a non-demo
  real code 404s, the full preview-session round trip (reads resolve as
  the real admin, two different non-GET routes both reject with the
  `PREVIEW_READ_ONLY:` detail, the real admin's own session is untouched
  and a real write from it still lands), and a `demo_join_code` naming no
  real group failing closed. `pytest` 275 green (was 271).

**Tasks — Human:**
- [ ] Set `DEMO_JOIN_CODE=DEMOSATB` on Render once the demo group's join
  code is set, then restart the service.

### B21 — Drop PIN save, add group-scoped guest name matching [x]

Supersedes B19's "Save across devices" PIN mechanism. Decided with the
human 2026-09-11 (no real users have ever used it, safe to drop cleanly):
a name + numeric PIN never felt like the right shape for a singer who
just wants their name recognized on a second device, and a global
name+PIN namespace (any "Sarah" + "1234" merging with any other) was
always a launch-only compromise, not a real cross-device story. The
replacement leans on friction that already exists: a group's join code is
the real gatekeeper (B6), so once someone has it, matching a typed name
against another guest already in that same group is enough to offer a
reconnect, no credential needed at all.

**Design:** `find_guest_matches(db, group_id, name)`
(`app/services/participants.py`) is the entire feature — a case-
insensitive, trimmed name lookup joined through `GroupMembership`,
filtered to `group_id` *and* `is_guest.is_(True)`. That one filter is also
the whole safety boundary: it can never return a real member/admin
account (no `is_guest` row for one), and it can never return a guest of a
different group. A new `GET /guest/{join_code}/name-matches?name=...`
(same no-auth, rate-limited stance as every other guest route) exposes it
read-only for the join page to check before submitting a signup, and
`ResponsibilitySignupCreate.claim_user_id` lets the actual self-signup
call confirm one: the route re-validates the claim against
`find_guest_matches` itself (never trusts the client's confirmation
blind), then reuses B19's existing `merge_participant` to fold the
freshly-minted-or-resolved caller into the matched row — same
reconciliation as always (annotations last-writer-wins per piece,
memberships union, signups repoint, source row deleted), just triggered
by a name match instead of a PIN.

No promotion-in-place survives this change: an anonymous participant no
longer has any path to flip `is_anonymous` to `false` on its own row.
"Becoming a real account" now only happens by registering a separate,
ordinary `User` row (unrelated to the guest identity); the guest's local
continuity story is entirely the name-match reconnect, group by group.

**Schema:** one migration (`e5c1a9f3b7d2`, `down_revision = d4a9f2c7e1b8`,
the current head) drops `users.pin_hash`. Clean drop, no backfill: the
column was never populated in production.

**Acceptance criteria:**
- [x] No trace of PIN / `pin_hash` / `SaveAccountRequest` / `POST
  /auth/save` left in route, schema, service, or test code.
- [x] A guest typing a name that matches another guest already in that
  specific group gets offered a merge (`GET .../name-matches` lists it);
  confirming it (`claim_user_id`) reconciles exactly the way
  `merge_participant` already did for B19's PIN merge.
- [x] The match never includes a real (non-guest) account, even on an
  exact name hit, in this group or any other group; never a guest of a
  different group either.
- [x] A brand-new name (or a declined match) mints a fresh participant
  exactly as before, unaffected.
- [x] Claiming an id that doesn't actually resolve as a guest match for
  the given name in this group is rejected (400), not merged.

**Tasks — Claude:**
- [x] Migration `e5c1a9f3b7d2`: drop `users.pin_hash`.
- [x] Removed `POST /auth/save`, `SaveAccountRequest`, and every PIN
  branch of the old merge-on-save flow (`app/api/routes/auth.py`,
  `app/api/schemas/auth.py` + its `schemas/__init__.py` re-export).
- [x] `find_guest_matches` (`app/services/participants.py`), next to
  `mint_anonymous_participant` / `resolve_participant` / `merge_participant`.
- [x] `GET /guest/{join_code}/name-matches` (`app/api/routes/guest.py`) +
  `GuestNameMatchOut` (`app/api/schemas/library.py`, next to the other
  Guest* shapes): candidates as `{user_id, title, joined_at}`.
- [x] `ResponsibilitySignupCreate.claim_user_id` (optional, ignored for an
  authenticated or admin-assignment call, same as `local_id`/
  `display_name`); wired into `create_signup`'s self-signup branch
  (`app/api/routes/responsibilities.py`) — re-validates the claim, then
  `merge_participant`s into it instead of proceeding with a fresh mint.
- [x] Tests: `find_guest_matches` scoping (this group only, guests only —
  not other groups, not real accounts even on a name hit),
  the name-matches endpoint (candidates + empty list), claim-and-merge
  (two devices folding into one guest row, annotation conflict resolution
  reusing B19's last-writer-wins assertions), a rejected claim (a real
  account's id, and a genuine guest's id from a different group). Removed
  the PIN-save/PIN-merge tests from `tests/test_auth.py` /
  `tests/test_participants.py` (6 removed across both files, 5 new B21
  ones added). `pytest` 274 green (was 275).

**Tasks — Human:**
- [ ] None.

### B23 — Custom Group Pages foundation (carpool template only) [x]

Requested by the choir board via `GROUP_PAGES_CARPOOL_PLAN.md` (2026-09-11):
lightweight, admin-created pages for group-specific coordination — carpool
is the first concrete need, but the underlying request is a reusable page
system rather than a one-off carpool table. That plan's own milestone
numbers (B20-B23) collided with B20-B22, which shipped in the meantime;
renumbered here to B23/B24.

**Design:** `GroupCustomPage` extends the pattern `GroupPageSettings` (B12)
already established for the five built-in pages — same `PageAudience`/
`PageMinIdentity` enums, same `enabled`-then-`audience`-then-`min_identity`
gate order in `app/services/pages.py` — but as its own dynamic row per
page instead of a fixed enum member. `template_key` is a real enum with
exactly one value (`carpool_board`) for now; adding a second template
later is a migration, not a schema redesign. No `GroupPageBlock` / generic
block system: that's speculative CMS scope for a system with one
consumer, explicitly deferred until a second template actually needs it
(see `GROUP_PAGES_CARPOOL_PLAN.md`'s own scope-creep risk note).

Slugs are unique per group (not globally), generated from title on create
and immutable after.

**Design notes (where this deviated from the plan text above):** there's no
dedicated `/unpublish` route — "unpublish" is just `PATCH .../custom-pages/
{id}` with `{"status": "draft"}`, since the generic partial-update route
already accepts `status` and a third single-purpose route for one enum
transition wasn't worth adding. The access-check helpers were extended
directly in `app/services/pages.py` (a `PageLike = GroupPage |
GroupCustomPage` union threaded through `require_guest_page_access` /
`require_member_page_access` / `require_saved_identity`) rather than added
as separate wrappers in `custom_pages.py`, per that module's own
parenthetical ("extend those to accept a `GroupCustomPage` row"); the
label shown in a 403/404 for a custom page is the generic "This page" /
"Page not found", not the page's real title, so a draft or archived page's
title never leaks to a caller who isn't supposed to know it exists yet.

**Acceptance criteria:**
- [x] Admin can create a custom page (`template_key=carpool_board` only),
  set title/audience/min_identity, and publish/unpublish/archive it.
- [x] Custom pages respect the same `audience`/`min_identity` gates as
  built-in pages: guest read only when `enabled` and `audience=everyone`;
  member read whenever `enabled` (admins bypass); write gates check
  `min_identity` via the existing `require_saved_identity` helper.
- [x] Member route `GET /groups/{group_id}/pages/{slug}` and guest route
  `GET /guest/{join_code}/pages/{slug}` share the same access-check
  helpers as the built-in pages, not a parallel implementation.
- [x] Draft pages are invisible to members and guests; only the owning
  group's admins can see/manage drafts.
- [x] Slug collisions within a group are rejected (409); a page's own
  slug can't collide with itself on update.
- [x] No arbitrary HTML accepted anywhere in `GroupCustomPage`.
- [x] `pytest` green with new tests covering access gates and slug
  uniqueness, same shape as B12's.

**Tasks — Claude:**
- [x] `GroupCustomPage` model (`app/db/models.py`) + migration.
- [x] `GroupCustomPageTemplate` enum: `carpool_board` only for now.
- [x] `app/services/custom_pages.py`: slug generation/uniqueness, and
  access-check helpers that delegate to the same shape as
  `app/services/pages.py`'s `require_guest_page_access` /
  `require_member_page_access` / `require_saved_identity` (extend those
  to accept a `GroupCustomPage` row rather than forking a parallel set).
- [x] Admin CRUD routes: `POST/GET/PATCH/DELETE
  /groups/{group_id}/custom-pages[/{page_id}]`, plus `.../publish` and
  `.../archive`.
- [x] Member read route `GET /groups/{group_id}/pages/{slug}`.
- [x] Guest read route `GET /guest/{join_code}/pages/{slug}`.
- [x] Schemas: `GroupCustomPageOut`, `GroupCustomPageCreate`,
  `GroupCustomPageUpdate`.
- [x] Tests: admin CRUD, publish/archive transitions, slug uniqueness
  (same group + cross-group), guest/member/draft access gates.

**Tasks — Human:**
- [ ] None expected.

**Fast-follow (2026-09-11, same day):** B23 deliberately shipped with no
member-facing "list all custom pages" route (the plan called it out of
scope: a member reaches one page by its slug). F27 then built the Pages
tab's member view expecting exactly that list to exist, so it always
rendered empty for a real (non-admin) member with no way to discover a
page at all. Added `GET /groups/{group_id}/pages` (member-gated,
published-only) right after F27 landed, and pointed the Frontend's group
load at it for non-admin viewers instead of the admin management list
(`app/api/routes/custom_pages.py`'s `list_member_custom_pages`, +2 tests,
`pytest` 321 green).

### B24 — Carpool board: events + posts, list only, no map [x]

Starts once B23 lands. Scope intentionally cut down from
`GROUP_PAGES_CARPOOL_PLAN.md`'s fuller carpool spec: no coordinates, no
map, no route sketches, no `CarpoolMatch` — those stay in that doc as
later milestones (B25+) until list-based carpool sees real use.
Auto-archival is a manual admin action, not a scheduled sweep: a real job
runner is already backlogged for Responsibilities' recurrence/reminders
and B19's anonymous-participant sweep, and this shouldn't be the third
place that gets reinvented ad hoc.

**Acceptance criteria:**
- [x] Admin can create/edit/archive a `CarpoolEvent` on a carpool-template
  page (title, date, destination label).
- [x] Members can add a driver or rider `CarpoolPost` (free-text origin
  label, no coordinates) to an open event.
- [x] A member can edit/delete only their own post; admins can hide/
  delete any post and lock/archive the event.
- [x] Locked/archived events reject new posts.
- [x] `pytest` green with ownership + admin-moderation tests.

**Tasks — Claude:**
- [x] `CarpoolEvent` + `CarpoolPost` models + migration (both scoped to a
  `GroupCustomPage`, `template_key=carpool_board`).
- [x] Routes for events/posts per `GROUP_PAGES_CARPOOL_PLAN.md`'s API
  section, minus anything coordinate-related.
- [x] Ownership checks on post edit/delete; admin moderation actions.
- [x] Tests: ownership, admin moderation, locked/archived event rejects
  new posts.

**Deviations from this section as originally scoped:**
- No `CarpoolEvent` delete route: the acceptance criteria only ever say
  "create/edit/archive", so archive (a status flip, kept alongside lock in
  one `PATCH /carpool/events/{id}`, following `ResponsibilityDate`'s
  precedent rather than `GroupCustomPage`'s separate `/publish`/`/archive`
  actions) covers it; a hard delete wasn't asked for.
- "Locked/archived events reject new posts" was extended to *edits* of an
  existing post too (a non-admin can't `PATCH` content on a post once its
  event is locked/archived), but deliberately *not* to deleting your own
  post: a member can always withdraw their own post regardless of event
  state, since being stuck with a stale post because an admin locked the
  event later seemed worse than the inconsistency.
- No guest/anonymous-participant carpool routes at all (`GROUP_PAGES_
  CARPOOL_PLAN.md` itself defers this: "Guest carpool writes should be
  deferred until the privacy rules are proven"). Every carpool route
  requires a real bearer-authenticated member; `CarpoolPost.user_id` is
  non-nullable, unlike `ResponsibilitySignup`'s guest-name carve-out.
- Non-admin members only ever see `status=open` posts in the list
  (hidden/cancelled are filtered out); an admin sees every status. Not
  explicit in the acceptance criteria but implied by "hide" being a
  moderation action at all.

**Tasks — Human:**
- [ ] None expected.

### B25 — Guest carpool access: read + write, via existing anonymous-participant flow [x]

Decided with the human 2026-09-12, answering one of `GROUP_PAGES_CARPOOL_PLAN.md`'s
own open questions ("should carpool pages ever be visible to join-link
guests?") and one made in this session (guests get full write parity with
members, not read-only): an admin's existing "Everyone with join link"
audience setting on a carpool page (built in B23/F27, already settable
today) currently does nothing useful for carpool specifically. B24 shipped
with an explicit "no guest routes here" (`app/api/routes/carpool.py`'s own
comment) and F28 confirmed the guest page route still renders
`CustomPageView`'s empty placeholder, never `CarpoolBoard`, with no guest
discovery list either (same by-slug-only gap the B23 fast-follow closed
for members, still open for guests). This closes both.

**Design:** don't invent new guest-identity plumbing. B19/B21 already
solved "an unauthenticated caller can act as a real, if anonymous, group
participant": `mint_anonymous_participant` / `resolve_participant` /
`find_guest_matches` / `merge_participant` (`app/services/participants.py`),
`ensure_guest_membership`, and the `divisi_participant` cookie. B23 already
made `require_guest_page_access` / `require_member_page_access` /
`require_saved_identity` generic over `GroupCustomPage` rows. `CarpoolPost`
already stores a real `user_id`, and an anonymous participant *is* a real
`User` row (just `is_anonymous`), so no `CarpoolPost` schema change is
needed at all. This milestone is almost entirely wiring, not new
mechanism: reuse `create_signup`'s exact actor-resolution shape
(`app/api/routes/responsibilities.py`, search "Self-signup: a real member,
an existing anonymous participant") for carpool post creation, and add
the guest-read mirror routes every other page type already has under
`app/api/routes/guest.py`.

**Acceptance criteria:**
- [x] `GET /guest/{join_code}/pages/{slug}/carpool/events` and
  `GET /guest/{join_code}/carpool/events/{event_id}/posts` work exactly
  when the page is published + `audience=everyone`, same gate
  `get_guest_custom_page` already uses; 404 otherwise (no leaking whether
  a page exists at all to an unauthorized join code, same stance as every
  other guest 404 in this codebase).
- [x] `GET /guest/{join_code}/pages` (published + `audience=everyone`
  only) exists so a guest can discover the page without a shared slug
  link, mirroring the member list added in the B23/F27 fast-follow.
- [x] `POST /carpool/events/{event_id}/posts` accepts an unauthenticated
  caller with no bearer token: mints or resolves an anonymous participant
  exactly like `create_signup`'s self-signup branch, gated by
  `require_guest_page_access` + `require_saved_identity` against the
  post's `GroupCustomPage`, with `ensure_guest_membership` run before the
  post is created.
- [x] `PATCH`/`DELETE /carpool/posts/{post_id}` resolve the caller the
  same way, so an anonymous participant can edit/delete their own post
  exactly like a member can (ownership check unchanged: `user_id` must
  match the resolved actor, admin bypasses).
- [x] A page with `min_identity=saved` rejects an unsaved anonymous
  caller's post with the existing `SAVE_REQUIRED:`-prefixed 403, not a
  generic error.
- [x] A page with `audience=members` still 404s every guest route above,
  regardless of `min_identity`.
- [x] `pytest` green with new tests mirroring `test_responsibilities.py`'s
  guest-signup coverage (mint-on-demand, cookie set, `min_identity` gate,
  own-post edit/delete) plus `test_carpool.py`'s existing
  member/admin/ownership tests re-run against a guest actor.

**Tasks — Claude:**
- [x] Guest read routes in `app/api/routes/guest.py`: events list, posts
  list (per-event), and the published+everyone pages list.
- [x] Rework `POST /carpool/events/{event_id}/posts` (and the
  `PATCH`/`DELETE /carpool/posts/{post_id}` pair) in
  `app/api/routes/carpool.py` to take `maybe_user`/`maybe_participant`
  optional-auth dependencies instead of a bearer-only `current_user`,
  following `create_signup`'s branch structure.
- [x] Schemas: add `local_id`/`display_name` to `CarpoolPostCreate` (same
  fields `ResponsibilitySignupCreate` carries for the same reason).
- [x] Tests per the acceptance criteria above.

**Deviations from this section as originally scoped:**
- `PATCH`/`DELETE /carpool/posts/{post_id}` take `local_id` as an optional
  query parameter, not a body field: neither route had a reason to grow a
  body just to carry it (`DELETE` had no body at all before), and it's
  only ever a fallback for a lost cookie, same role it plays in
  `ResponsibilitySignupCreate`. `CarpoolPostUpdate` itself is unchanged.
- Added one extra event-ownership 401 test
  (`test_no_actor_resolves_gives_401_on_edit_or_delete`) not explicitly
  in the acceptance criteria: a caller with no bearer token, no
  participant cookie, and no matching `local_id` now hits
  `PATCH`/`DELETE /carpool/posts/{id}` with nobody to resolve, which is
  a genuinely new case now that those routes accept anonymous callers.
  It 401s (matching `create_signup`'s own "no actor at all" branch)
  rather than the ownership 403, since there's no identity to compare
  the post's `user_id` against yet.
- No existing `test_carpool.py` assertions changed or removed: every
  prior bearer-only test still passes unmodified against the reworked
  `maybe_user`/`maybe_participant` dependencies, since a valid bearer
  token still resolves `maybe_user` exactly as `get_current_user` did.

**Tasks — Human:**
- [ ] None expected.

### B26 — Carpool: a standing (non-dated) board by default, dated events stay for exceptions [x]

Human feedback 2026-09-12: carpool should be an ongoing thing for
rehearsals, not a one-time thing, i.e. not something that forces an admin
to create a fresh dated `CarpoolEvent` every single week just to have
somewhere for "I drive from Mission most weeks" to live. Presented three
shapes; the human picked the middle ground: **a standing board that's
always there for regular rehearsals, plus the ability to still create a
one-off dated event for something like a concert call.**

**Design:** don't introduce a new post-less/event-less concept.
`CarpoolPost.event_id` stays exactly as it is (no schema change to
`CarpoolPost` at all): every post still belongs to *some* `CarpoolEvent`,
it's `CarpoolEvent` itself that gains a second shape. A new
`CarpoolEvent.is_standing` boolean marks the one, page-scoped, non-dated
board (`starts_at = NULL`); everything an admin creates through the
existing `create_event` route stays a normal dated one
(`is_standing = False`, `starts_at` required, exactly today's behavior,
this is the "occasional dated exception" path). The standing event isn't
admin-created at all: it's lazily get-or-created the first time anyone
(admin, member, or guest) lists a carpool page's events, so a
brand-new carpool page has its standing board from the very first view,
with zero admin setup step. One shared helper
(`app/services/carpool.py`, new, small) does the get-or-create so the
member (`list_events` in `carpool.py`) and guest (`guest.py`) read paths
can't drift out of sync on this.

Invariants once created: `is_standing` never flips after creation (not
in `CarpoolEventUpdate`'s field set at all), a standing event can't be
archived (its whole point is that it doesn't go away) though it *can*
still be locked/unlocked (temporarily pause new posts, e.g. over a
break) and have its title/destination edited like any event. `starts_at`
can't be set on a standing event via update either, keeping "standing"
and "dated" from drifting into a half-state.

**Acceptance criteria:**
- [x] A carpool page's very first `GET .../carpool/events` call (admin,
  member, or guest) returns a standing event even though nobody created
  one; a second call returns the same row, not a duplicate.
- [x] `CarpoolEvent.starts_at` and `destination_label` are nullable at
  the schema level (the standing event has neither by default) but
  `CarpoolEventCreate` (the admin-facing dated-event creation payload)
  still requires both, unchanged, so creating a dated exception works
  exactly as it does today.
- [x] `PATCH /carpool/events/{id}` rejects `status=archived` for a
  standing event (400) but still allows `status=locked`/`open` and
  title/destination edits; `starts_at` and `is_standing` are not
  patchable fields at all.
- [x] Listing events orders the standing one first, then dated events by
  `starts_at` ascending (a `NULL starts_at` naturally sorts oddly, so
  order explicitly rather than relying on that).
- [x] Guest reads (`guest.py`) get the same standing-event bootstrap and
  ordering as the member route; guest writes (B25's post create/edit/
  delete) work unchanged against either kind of event.
- [x] Existing B24/B25 tests for dated events still pass unmodified
  (dated-event behavior doesn't change at all); new tests cover the
  standing-event bootstrap, idempotency, ordering, and the
  archive-rejected/lock-allowed distinction.
- [x] `pytest` green.

**Tasks — Claude:**
- [x] Migration: `carpool_events.starts_at` and `destination_label`
  become nullable; add `carpool_events.is_standing` (boolean, not null,
  default false).
- [x] `app/services/carpool.py` (new): `get_or_create_standing_event(page_id, db)`.
- [x] Wire that helper into `list_events` (`carpool.py`) and the guest
  events-list route (`guest.py`); both should return the standing event
  plus any dated ones, standing first.
- [x] `update_event`: reject `status=archived` when `event.is_standing`;
  drop `starts_at` from what's patchable on a standing event (or reject
  the attempt outright, whichever reads cleaner in the actual diff).
- [x] Tests per the acceptance criteria above.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-12, migration `a1c9e6f2b7d4` (`down_revision =
48a30562ab06`), single linear head. Verified up/down/up against the local
docker-compose Postgres, never prod (`.env`'s `DATABASE_URL` untouched).
`pytest` 343 green (was 334; +9 new).**

`app/services/carpool.py` also grew a second small helper,
`list_events_ordered(page_id, db)`, beyond the one the plan named
(`get_or_create_standing_event`): it bootstraps the standing event *and*
returns `[standing, *dated_by_starts_at_asc]` in one call, so
`list_events` (`carpool.py`) and `list_guest_carpool_events` (`guest.py`)
both call one function instead of independently re-deriving the same
ordering.

Default title landed as `"Ongoing carpool"` (`STANDING_EVENT_TITLE` in
`app/services/carpool.py`).

On the "silently ignore vs. reject" question for `starts_at` on a standing
event: picked reject (400, `"starts_at can't be set on the standing
carpool event"`), matching this file's existing seat-validation reasoning
in `schemas/carpool.py` ("a confused client finds out immediately instead
of shipping data nobody reads"). Same 400 for the archive attempt,
detail `"The standing carpool event can't be archived"`. `is_standing`
itself was never added to `CarpoolEventUpdate`, so there's no reject/
ignore question for it at all.

Two existing B24/B25 tests needed a one-line change, not zero:
`test_member_can_list_published_events` and
`test_guest_can_list_carpool_events_and_posts` both asserted an exact
event-listing count/id-list, which the standing event's presence in every
listing unavoidably changes (this is the acceptance criterion working as
designed, not a regression). Both now filter to `is_standing == False`
before asserting on the dated event, preserving the original intent. No
other B24/B25 test touches listing contents, so no other test needed a
change.

**Fast-follow (2026-09-12, same day): guest tab strip was tripping the
rate limiter.** F31 gave `/join/[code]/pages/[slug]` its own copy of the
tab-visibility fan-out (`listGuestHomework`/`listGuestWeeklyNotes`/
`listGuestResponsibilityDates`, each called only to check whether it
404s, plus `listGuestCustomPages`) so it could render the shared tab
strip. That quadrupled the guest requests a single carpool page view
cost, and since `rate_limit_guest` (`app/core/rate_limit.py`) counts by
IP with a 60-second fixed window, a real user clicking between a few
tabs (and behind Docker Desktop's NAT locally, every local request looks
like the same IP) could trip it during entirely ordinary navigation,
surfacing as "the backend stopped working."

Added `GET /guest/{join_code}/tabs` (`GuestTabsOut`,
`app/api/routes/guest.py` + `app/api/schemas/custom_pages.py`): the same
three booleans via `require_guest_page_access`'s existing gate check
(no `Homework`/`WeeklyNote`/`ResponsibilityDate` query at all, cheaper
server-side too, not just fewer round trips) plus the custom pages list,
one call. The by-slug route now calls this instead of the four
individual list endpoints. Also raised `_MAX_REQUESTS_PER_WINDOW` from
20 to 60: B6's original figure predates B23-F31's guest surface
entirely, and 60/minute is still tight enough to make join-code/password
brute-forcing impractical, this limiter's actual job. Tests:
`test_guest_tabs_reports_visibility_and_custom_pages`,
`test_guest_tabs_unknown_join_code_404s`. `pytest` 345 green (was 343).

### B27 — Carpool: claim a seat in a driver's post [x]

Human feedback 2026-09-12: riders should be able to "claim" a seat in a
specific driver's post, not just see two disconnected lists and
coordinate entirely off-app. This is `GROUP_PAGES_CARPOOL_PLAN.md`'s own
deferred `CarpoolMatch` concept, scoped down per the human's call: an
immediate, first-come-first-served claim, not a request/driver-approves
workflow. No `CarpoolMatch` status lifecycle (requested/accepted/
declined) needed for that simpler shape.

**Design:** `CarpoolSeatClaim` is a new, small table, not a repurposing
of `CarpoolPost`: claiming a seat shouldn't require the claimant to have
posted their own "I need a ride" first (someone might just want a ride
with no notes/origin of their own to share), so it's its own row linking
a user directly to a driver's post. Soft-removed for audit
(`status: active|removed`), matching `ResponsibilitySignup`'s exact
shape rather than a hard delete, so a released seat leaves a trace the
same way a removed signup does.

**`seats_available` stops being a field the driver sets.** Today
(`CarpoolPostCreate`/`Update`) it's a plain number a driver types in
alongside `seats_total`, no relationship to anything real. Once claims
exist, that's a lie waiting to happen (the driver says "2 open" while 3
people have actually claimed). `seats_available` becomes a computed
response value (`seats_total - active claim count`) on `CarpoolPostOut`;
`CarpoolPostCreate`/`Update` drop it entirely; `seats_total` is the only
number a driver still sets, and lowering it below the current active
claim count is rejected (400) rather than silently going negative.

Claiming reuses B25's exact actor-resolution shape (`create_signup`'s
self-signup branch, `mint_anonymous_participant`/`resolve_participant`,
`require_guest_page_access`/`require_saved_identity`/
`ensure_guest_membership` for an anonymous actor) — a guest can claim a
seat exactly like a member can, no separate write path.

**Acceptance criteria:**
- [x] `POST /carpool/posts/{driver_post_id}/claims` claims one seat:
  rejects (400) if the target post isn't `kind=driver`, if it's full
  (active claims == `seats_total`), if the caller already has an active
  claim on that same post, or if the event is locked/archived and the
  caller isn't admin. Works for a member (bearer) or an anonymous
  participant (mint-or-resolve), same as `create_post`.
- [x] `DELETE /carpool/claims/{claim_id}` releases a seat: the claimant,
  the driver post's own owner, or an admin can do this; anyone else gets
  403.
- [x] `CarpoolPostOut` for a driver post includes its active claims
  (`id`, `user_id`, `display_name`, `created_at`) and a computed
  `seats_available`; a rider post's claims field is empty/irrelevant (it
  isn't a driver post, it can't be claimed).
- [x] `CarpoolPostCreate`/`CarpoolPostUpdate` no longer accept
  `seats_available` at all; existing `seats_total`-only behavior for a
  driver post, and the rider "don't set seat fields" validation, are
  unchanged.
- [x] `min_identity=saved` and `audience=members` gates apply to claiming
  exactly like they do to posting.
- [x] Guest reads (`guest.py`'s carpool posts list) include the same
  claims/computed-`seats_available` shape as the member route.
- [x] `pytest` green: claim/release, double-claim rejected, full-post
  rejected, `seats_total` can't drop below active claims, guest claim
  parity, existing B24-B26 carpool tests updated for the
  `seats_available` schema change wherever they touched it (updated, not
  weakened, note anywhere a test's intent had to be preserved through a
  different assertion).

**Tasks — Claude:**
- [x] `CarpoolSeatClaim` model + migration.
- [x] `app/services/carpool.py`: `seats_available_for(post, db)` (or
  similar), reused by both the create/list routes and `CarpoolPostOut`
  serialization so member and guest reads can't compute it differently.
- [x] `POST /carpool/posts/{driver_post_id}/claims`,
  `DELETE /carpool/claims/{claim_id}` in `app/api/routes/carpool.py`.
- [x] Drop `seats_available` from `CarpoolPostCreate`/`CarpoolPostUpdate`;
  add `claims: list[CarpoolSeatClaimOut]` and a computed
  `seats_available` to `CarpoolPostOut`.
- [x] Update `list_guest_carpool_posts` (`guest.py`) to serialize the
  same shape.
- [x] Tests per acceptance criteria; audit existing carpool tests that
  construct/assert on `seats_available` and update them for the schema
  change.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-12**, migration `b3d7f1a9c6e2` (chained off B26's
`a1c9e6f2b7d4`), pytest 357 green (was 345; +12 new). Migration verified
up/down/up against the local docker-compose Postgres, never prod
(`docker compose restart api` to apply, since `alembic upgrade head` only
runs once at container startup).

**Deviations from the plan text:**
- **Locked/archived event status code.** The plan's acceptance-criteria
  paragraph lists the locked/archived rejection alongside the other "400"
  cases, but `create_post` (B25) already uses 409 for "this event is
  locked or archived", reserving 400 for payload-shape problems. Kept that
  existing convention: `create_claim` rejects wrong-kind/full/
  already-claimed with 400, and locked/archived (non-admin) with 409, so
  claiming and posting return the same status code for the same condition.
- **`ResponsibilitySignup` doesn't actually have a `status`/`removed_at`
  soft-removal shape.** The plan's Design section says `CarpoolSeatClaim`
  matches "`ResponsibilitySignup`'s exact shape"; the live model only has
  `id`/`date_id`/`role_id`/`user_id`/`guest_name`/`created_at` and
  `delete_signup` hard-deletes. Built `CarpoolSeatClaim`'s
  `status`/`removed_at` exactly as the plan's own acceptance criteria and
  task list specify regardless (that part is unambiguous), just noting the
  cited precedent doesn't exist in this codebase today.
- **`seats_available` dropped from the `CarpoolPost` DB column, not just
  the API schema.** The plan only says the `Create`/`Update` schemas drop
  it; since nothing writes to the column any more once that happens, kept
  it dead data instead of shipping unused columns: the migration also
  drops `carpool_posts.seats_available` (`op.drop_column`), reversible on
  downgrade (re-added nullable, no data recoverable, same convention as
  `e5c1a9f3b7d2`'s `pin_hash` drop).
- **`CarpoolSeatClaim` uniqueness is app-layer, not a DB constraint.** A
  released claim stays around as a `removed` row, so a plain
  `UniqueConstraint` on `(driver_post_id, user_id)` would block ever
  re-claiming the same post. "Already has an active claim" is checked in
  `create_claim` against `status == active` only, same general shape as
  this codebase's other soft-removal checks.
- **A released claim 404s on a second release attempt**, rather than
  204-no-op or some other idempotent shape (not specified by the plan):
  `_get_claim_or_404` treats a `removed` claim as gone, matching the
  "repeat delete 404s" behavior a hard delete would already give elsewhere
  in this router.
- **11 existing carpool tests needed no change**; only one assertion in
  `test_member_can_create_driver_and_rider_posts` (`seats_available == 3`)
  touched the schema change, and it still holds true under the new
  computed value (no claims yet), so the assertion itself didn't move,
  only its comment (from "defaults to seats_total when omitted" to
  "computed: no claims yet") and two new `claims == []` assertions
  alongside it.

### B28 — Guests can remove their own responsibility signup [x]

Human feedback 2026-09-12: a guest who self-signs up for a responsibility
(B19's anonymous-participant flow) has no way to undo it. The Backend
route already supports self-removal in principle,
`DELETE /responsibilities/signups/{signup_id}` already checks
`signup.user_id != current_user.id` and lets the owner (or an admin)
through, exactly the right rule, it's just bearer-only
(`current_user: User = Depends(get_current_user)`), so an anonymous
participant (who has no bearer token at all) can never reach it. This is
the same gap B25 already closed once for carpool posts
(`update_post`/`delete_post`); closing it here is the identical move,
not a new design.

**Design:** swap `get_current_user` for the same `maybe_user`/
`maybe_participant`/`local_id`-query-param optional-auth shape B25's
`carpool.py` uses, resolve via `resolve_participant` (401 if nothing
resolves, matching carpool's `_resolve_actor`), then run the exact same
ownership/lock checks the route already has, just against the resolved
actor instead of a guaranteed bearer user. No schema change (there's no
request body on a DELETE), no migration (`ResponsibilitySignup.user_id`
already accepts an anonymous participant's id today, same fact as
`CarpoolPost.user_id`).

Deliberately duplicates a small local resolve-actor helper in
`responsibilities.py` rather than promoting `carpool.py`'s `_resolve_actor`
into a shared `app/services/participants.py` function: B27 is
concurrently in flight against `carpool.py` as this is written, so
touching that file here would risk a collision. Fine to unify the two
identical helpers into one shared one later, as a small follow-up
cleanup, not blocking this.

**Acceptance criteria:**
- [x] An anonymous participant who self-signed up for a role can call
  `DELETE /responsibilities/signups/{signup_id}` (with the
  `divisi_participant` cookie or a `local_id` query param, same
  resolution B25 uses) and have it succeed.
- [x] The same 403 ("Can only remove your own signup") still applies
  when the resolved actor doesn't own the signup, guest or member either
  way.
- [x] The same 409 (date locked) still applies to a non-admin guest
  exactly as it already does to a non-admin member. No change to that
  rule, just who can now reach it.
- [x] A request with no bearer token and no resolvable participant
  (no cookie, no matching `local_id`) 401s, same "not even a guest yet"
  shape B25's `_resolve_actor` uses.
- [x] Existing member-only `delete_signup` tests still pass unmodified.
- [x] `pytest` green with new tests covering the guest self-removal path
  and its 403/409/401 edges.

**Tasks — Claude:**
- [x] Rework `delete_signup` (`app/api/routes/responsibilities.py`):
  optional-auth dependencies, a small local resolve-actor helper, ownership
  and lock checks unchanged otherwise.
- [x] Tests: guest self-removal succeeds, wrong-guest 403, locked-date
  409 for a guest same as a member, no-actor-at-all 401.

**Tasks — Human:**
- [ ] None expected.

### B31 — Promote Carpool to a built-in tab, drop the generic Custom Pages system [x]

Carpool (B23-B30) was built as the one template on a generic
`GroupCustomPage` system, on the plan that other templates (potluck, event
logistics, section resources) would follow. None have; carpool is still the
only one, and the generic layer (per-group dynamic pages, slugs, a template
picker, a draft/publish/archive lifecycle) now just adds indirection without
earning it. Drop `GroupCustomPage` entirely and make carpool the sixth
built-in `GroupPage`, gated by `GroupPageSettings` exactly like
Homework/Members/Responsibilities/Weekly Notes/About.

Acceptance criteria:
- [x] `GroupPage` enum gains `carpool`; `GroupPageSettings` seeding (new
  groups) and a migration backfill (existing groups) both cover it.
- [x] Every group's pre-existing `group_custom_pages` row (template_key
  `carpool_board`, if any) has its effective enabled/audience/min_identity
  state carried over onto the new `GroupPageSettings(page=carpool)` row
  before the table is dropped: `draft`/`archived` status both map to
  `enabled=False`, `published` maps to that page's own `audience`/
  `min_identity`, not the built-in defaults. A group with no such row yet
  gets carpool's own sensible default (members-only, matches
  `GROUP_PAGES_CARPOOL_PLAN.md`'s privacy stance), same shape as every other
  built-in page's `DEFAULT_AUDIENCE` entry.
- [x] `carpool_events.group_id` (nullable at first, backfilled from
  `group_custom_pages.group_id` via the old `page_id`, then not-null)
  replaces `page_id`; `page_id` column and the `group_custom_pages` table
  are dropped in the same migration chain, in that order, in a way that
  survives a real prod run (no dropped data if a step fails partway).
- [x] `GroupCustomPage`, `GroupCustomPageTemplate`, `GroupCustomPageStatus`
  models, `app/services/custom_pages.py`, `app/api/routes/custom_pages.py`,
  `app/api/schemas/custom_pages.py` all removed. The custom-page branch in
  `app/services/pages.py`'s gate functions removed (`PageLike` back down to
  plain `GroupPage`), and the custom-page reads in `app/api/routes/guest.py`
  removed.
- [x] Carpool routes move to being directly group-scoped (drop the
  `custom-pages/{page_id}` segment from the current URLs in
  `app/api/routes/carpool.py`), gated via `require_member_page_access` /
  `require_guest_page_access` / `require_saved_identity` with
  `GroupPage.carpool`, same call shape as any other built-in.
- [x] `app/services/carpool.py`'s `get_or_create_standing_event` takes
  `group_id` instead of `page_id`.
- [x] Existing carpool/seat-claim/rider-interest tests updated for the new
  URL shape and green; migration up/down both checked against the local
  test DB, never against `Backend/.env`'s prod connection.
- [x] No group loses existing carpool data (events, posts, seat claims,
  rider interest, contact phone) in the migration; only the page's own
  settings row and the `carpool_events.page_id` → `group_id` linkage
  change.

**Built 2026-09-14**, migration `a5f3d8c1e6b4` (chained off B30's
`c4e8a2b0d7f3`), pytest 374 green. Verified live: `docker compose up -d
postgres`, fixture rows for a draft/published/archived `group_custom_pages`
carpool row (plus one group with none at all) and a `carpool_events`/
`carpool_posts` row hanging off the published one, `alembic upgrade head`,
inspected the backfilled `carpool_events.group_id` and the resulting
`group_page_settings` rows, `alembic downgrade -1` twice (back to
`c4e8a2b0d7f3`), then `alembic upgrade head` again to confirm a rollback
can be reapplied, before `docker compose down`.

**Deviations from the plan text:**
- **Migration idempotency on re-upgrade after a downgrade.** Not spelled
  out in the acceptance criteria, but the live verification pass surfaced
  it directly: `downgrade()` deliberately leaves the seeded
  `group_page_settings(page=carpool)` rows in place (reconstructing them
  isn't worth it, per the plan's own downgrade guidance), so a bare
  re-`upgrade()` afterward would re-insert the same `(group_id, 'carpool')`
  row and crash on `uq_group_page_settings`. `upgrade()` now skips seeding
  any group that already has a carpool settings row, making an
  upgrade -> downgrade -> upgrade cycle (a rollback, then reapplying) safe.
- **Winner-picking logic factored into `app/services/pages.py`, not the
  migration file.** The brief allowed either location; `app.services.
  pages.resolve_carpool_page_settings_from_custom_pages(candidates)` is a
  pure function (`(status, audience, min_identity, created_at)` tuples in,
  `(enabled, audience, min_identity)` out) imported by the migration and
  unit-tested directly in `tests/test_carpool.py`, since pytest never runs
  Alembic against its SQLite test DB. Multiple `published` rows (never
  actually created by the product, but never blocked by a DB constraint
  either) resolve to the earliest-created one, for determinism.
- **`GuestTabsOut` moved to `app/api/schemas/library.py`**, alongside the
  other `Guest*Out` shapes there, since `app/api/schemas/custom_pages.py`
  (its previous home) no longer exists. `custom_pages` field replaced with
  `carpool_visible`, computed the same `require_guest_page_access` way the
  other three booleans already were.
- **Old page-scoped carpool URLs are gone, not redirected.** `POST
  /groups/{id}/pages/{page_id}/carpool/events` and
  `GET /guest/{join_code}/pages/{slug}/carpool/events` 404 now (no route
  matches); no compatibility shim, since B31 explicitly drops the generic
  pages system these URLs were shaped around and no frontend work happens
  in this milestone.

### B32 — Carpool direction: there / back / round trip [x]

Starts once B31 lands (new URL shape). A driver or rider post today doesn't
distinguish "I'm driving to rehearsal" from "I can bring people home after."
Concerts and evening rehearsals are exactly where those diverge: someone
drives over and catches a ride home with someone else. Add a direction to
`CarpoolPost`.

Acceptance criteria:
- [x] `CarpoolPost.direction: there | back | round_trip`; migration
  backfills every existing row to `round_trip` (the closest match to
  today's undifferentiated single-post behavior).
- [x] Post create/update schemas accept `direction`, defaulting to
  `round_trip` so an old client that doesn't send it keeps working.
- [x] The member/guest post-list views can be split into "on the way
  there" / "on the way back," with a round-trip post appearing in both
  (server-side filter param or client-side split, whichever fits
  `CarpoolPostOut`'s current shape with less churn).
- [x] Seat claims and rider interest are unaffected by direction, still
  keyed to the post itself.
- [x] Tests cover the backfill default and each `direction` value
  round-tripping through create/read.

**Built 2026-09-14**, migration `b7e2f4a9c3d8` (chained off B31's
`a5f3d8c1e6b4`), pytest 374 green. `server_default='round_trip'` covers
every pre-existing row on its own, no Python-loop backfill needed.

**Deviations from the plan text:**
- **Server-side filter param, not a client-side split.** Went with the
  plan's first option: an optional `direction` query param on both
  `GET /carpool/events/{id}/posts` (member) and the guest posts listing
  route. Omitted, it's unfiltered (unchanged behavior); given `there` or
  `back`, the query matches that exact direction plus `round_trip` (a
  round-trip post appears in both filtered views, as the acceptance
  criteria calls for), via `CarpoolPost.direction.in_([direction,
  CarpoolPostDirection.round_trip])`.
- **`direction` is otherwise a plain content field.** No new gate, no new
  service function: `create_post` sets it, `update_post` patches it
  through the same `model_fields_set` block as `leave_time_text`/`notes`,
  and `serialize_post` passes it straight through to `CarpoolPostOut`,
  same pattern every other post field already follows.

### B33 — Guest access to the About/Info page, honoring its existing `audience` setting [x]

`GroupPage.about` has been in `GroupPageSettings`/`DEFAULT_AUDIENCE` since B12,
and Settings' Page Visibility UI has always let an admin set its audience to
`everyone`, same as every other built-in page. But no guest route or guest
tab entry for `about` was ever actually built (`homework`/`weekly_notes`/
`responsibilities`/`carpool` all got one over B12-B31; `about` and `members`
did not), so that setting is silently a no-op today: a group configured for
guest-visible About still shows nothing to a logged-out join-link visitor.
Per product decision 2026-09-14: build the real guest page for `about`
(guest parity principle: strip only privacy/per-user-storage bits, and
About's content, a group's description plus its regular-rehearsal schedule,
carries neither). `members` (the roster) is out of scope here and stays
guest-unreachable; its content is exactly the kind of thing guest parity
should NOT extend to.

Acceptance criteria:
- [x] A guest route (mirroring `homework`/`weekly_notes`'s shape in
  `app/api/routes/guest.py`) returns the group's `description`,
  `rehearsal_weekday`, `rehearsal_time`, gated by
  `require_guest_page_access(group_id, GroupPage.about, db)` exactly like
  every other guest-readable built-in.
- [x] `GuestTabsOut` gains `about_visible: bool`, computed the same way as
  `homework_visible`/`weekly_notes_visible`/`carpool_visible` in
  `get_guest_tabs`'s `_visible()` closure.
- [x] No write access: About has no guest-writable fields today (the admin
  editors for description/rehearsal schedule stay member/admin-only), so
  this is read-only, same restraint as `tracks`' guest route.
- [x] Existing member-facing `about`/settings behavior is unchanged; this
  only adds a new unauthenticated read path.
- [x] Tests cover: guest 404 when `about` is disabled or `audience=members`
  (matching every other guest-gate test's shape), guest 200 with the right
  fields when `audience=everyone`, `about_visible` correctness in
  `get_guest_tabs`.

**Deviations from the plan:** none of substance. New response schema is
`GuestAboutOut` (`app/api/schemas/library.py`, alongside the other
`Guest*Out` subset schemas like `GuestGroupOut`/`GuestPieceOut`), a trimmed
view of `GroupOut` (`groups.py`) with the same field names/types, since no
existing schema already exposed just those three fields to an
unauthenticated caller.

## Backlog

- **B16 fast-follow — promote a weekly note into a piece note**: an admin
  turns weekly-note text into a durable `PieceRehearsalNote`. Adds a
  `source_weekly_note_id` (nullable) column + a `POST` action endpoint.
- **B16 fast-follow — `group_resources`**: stable group links (YouTube
  playlist, member portal, shared doc, Divisi join link) as a small table
  + CRUD, so they don't get retyped into every weekly note. From the same
  Codex proposal.
- **Weekly note structured sections/items**: the Codex proposal's
  `weekly_note_sections` + `weekly_note_items` tree. Deferred pending
  evidence admins will author structured notes rather than prose; a JSONB
  `structured` column on `weekly_notes` is the cheaper first step if so.
- **Markdown links in the Frontend weekly-note renderer** (`[text](url)`)
  — frontend-only, no backend change; tracked here so it isn't lost.
- ~~**B15 fast-follow — group-published markup layer**~~ **→ promoted to B17** (2026-09-02), redesigned: no per-author publish / `published_at`, instead a group-owned `scope` any admin co-edits. See B17.
- Decide diff/patch vs. full-reupload semantics for what a group "modification" actually contains
- Group invite flow (email invite vs. join code) — not designed yet
- ~~Wire `app/storage/files.py` to Neon's Object Storage~~ **DONE 2026-08-31** (committed 9d7ef53; credential verified 8bc2e31). `save_file` → `uploads` bucket (`obj/…` keys) when `AWS_*` set, else local disk; `resolve_source_path` materializes via a local cache; serving routes 404 (not 500) on missing bytes. **Remaining human step:** set `AWS_ENDPOINT_URL_S3` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `S3_BUCKET` on Render, redeploy, then re-upload the 6 lost modification-version PDFs.
- Object-storage orphans: `delete_piece` leaves `obj/…` files in the bucket. Add a sweep-by-prefix cleanup (or delete-on-piece-delete).
- Responsibilities: recurrence rules + lazy date generation (needs a real scheduled-job runner, which doesn't exist yet)
- Responsibilities: notifications/reminders (no notification infra of any kind exists yet)
- Responsibilities: swap requests between members, and an admin-required-approval step for signups — both explicitly deferred out of B13
- Responsibilities: whether roles/schedules should be reusable *templates* shared across groups — an open question, never decided
- No `pytest` coverage yet for `PUT /groups/{id}/description`, `PUT /groups/{id}/members/{user_id}/role`, or `DELETE /responsibilities/schedules/{id}`/`.../roles/{id}` (added post-B13, live in production)
- Pick a transactional email provider so password-reset links actually work for someone who isn't reading server logs (`FRONTEND_BASE_URL` itself is already set on Render — see B14)
- Re-enable Google Sign-In for real users: publish the OAuth consent screen out of Testing status in Cloud Console (project `divisi-506916`, non-sensitive scopes so this shouldn't need Google's full verification review), then re-add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on Render and restart the service
- ~~B19 fast-follow: email magic link as a second Save method~~ — moot: B21 (2026-09-11) dropped the PIN Save mechanism this would have been a second method *for*. A future "real account" story, if wanted, would be its own design, not a Save fast-follow.
- **B19: scheduled runner for the anonymous-participant sweep.** Ships as a manual `scripts/` command; wants the same real job runner the Responsibilities recurrence / reminders items need. Unaffected by B21 — the sweep logic never touched the PIN.

## Log

*Condensed 2026-08-29, again 2026-09-02 (entries tightened to 1-3 sentences, superseded runs collapsed to markers). See each milestone's own section above for full acceptance-criteria/task detail; this is a chronological breadcrumb, not a re-narration.*

- 2026-09-14: Built B33 (guest access to the About/Info page). `GET /guest/{join_code}/about` (`app/api/routes/guest.py`) returns a new `GuestAboutOut` (`app/api/schemas/library.py`: `description`/`rehearsal_weekday`/`rehearsal_time`, a trimmed `GroupOut`), gated by `require_guest_page_access(group_id, GroupPage.about, db)` same as every other guest built-in; `GuestTabsOut` gained `about_visible`. Read-only, no write route, no migration (no new DB fields, `about`'s `audience` setting has existed since B12). `pytest` 379 green (was 374; +5 new: 200-with-fields, 404-disabled, 404-audience=members, and `about_visible` both ways in `/tabs`).
- 2026-09-14: Built B31 (promote Carpool to a built-in `GroupPage`, drop the generic Custom Pages system) and B32 (carpool post `direction`: there/back/round_trip). `GroupCustomPage`/`GroupCustomPageTemplate`/`GroupCustomPageStatus`, `app/services/custom_pages.py`, and `app/api/routes/custom_pages.py` are gone; `CarpoolEvent.page_id` became `group_id`, backfilled per group by a winner-picking rule (`app.services.pages.resolve_carpool_page_settings_from_custom_pages`) over each group's old `carpool_board` pages. Carpool routes are now flat (`/groups/{id}/carpool/events`, no more `/pages/{page_id}/`); `GuestTabsOut` moved to `app/api/schemas/library.py` with `carpool_visible` replacing `custom_pages`. `CarpoolPost.direction` defaults/backfills to `round_trip`; an optional `direction` query param on both the member and guest post-list routes filters to that direction plus `round_trip`. `pytest` 374 green (was 388: -22 from deleting `tests/test_custom_pages.py` outright, +8 net in the `tests/test_carpool.py` rewrite after retiring/renaming the old custom-pages-shaped tests and adding new B31/B32 coverage). Both migrations (`a5f3d8c1e6b4`, `b7e2f4a9c3d8`) verified live against the local docker-compose Postgres with fixture rows in each `group_custom_pages` status, including an upgrade -> downgrade -> upgrade cycle (surfaced and fixed a re-seeding idempotency bug on that path). Not pushed/deployed.

- 2026-09-12: Built B26 (carpool: a standing, non-dated board by default, dated events stay for exceptions). `CarpoolEvent.starts_at`/`destination_label` went nullable, plus a new `is_standing` boolean (migration `a1c9e6f2b7d4`, chained off B25's `48a30562ab06`); no `CarpoolPost` change. `app/services/carpool.py` (new): `get_or_create_standing_event` bootstraps the one page-scoped standing row (title `"Ongoing carpool"`, `starts_at`/`destination_label` both `None`) lazily on first listing rather than admin-created, and `list_events_ordered` wraps it plus dated-by-`starts_at`-ascending ordering so `list_events` (`carpool.py`) and the guest events route (`guest.py`) share one call. `update_event` rejects (400) `status=archived` and any `starts_at` patch on a standing event; lock/unlock and title/destination edits still work. Two existing B24/B25 listing-count tests needed a one-line filter (`is_standing == False`) since the standing event now rides along in every listing, by design; no other B24/B25 test changed. `pytest` 343 green (was 334; +9 new). Migration verified up/down/up against the local docker-compose Postgres, never prod. Not pushed/deployed.
- 2026-09-12: Built B25 (guest carpool access: read + write, via existing anonymous-participant flow). No new mechanism, all wiring: `POST /carpool/events/{id}/posts` and `PATCH`/`DELETE /carpool/posts/{id}` (`app/api/routes/carpool.py`) now take `maybe_user`/`maybe_participant` optional-auth dependencies and resolve the caller exactly like `create_signup`'s self-signup branch (mint-on-demand, `require_guest_page_access` + `require_saved_identity`, `ensure_guest_membership`, `divisi_participant` cookie). Three new guest reads in `app/api/routes/guest.py`: `GET /guest/{join_code}/pages` (published + `audience=everyone`), `.../pages/{slug}/carpool/events`, `.../carpool/events/{event_id}/posts`, all 404ing the same generic way `get_guest_custom_page` does. `CarpoolPostCreate` gained `local_id`/`display_name`; no `CarpoolPost` schema/column change (an anonymous participant is already a real `User` row). `pytest` 334 green (was 321; +13 new). Not pushed/deployed.
- 2026-09-11: Built B24 (carpool board: events + posts, list only, no map). `CarpoolEvent`/`CarpoolPost` (migration `48a30562ab06`, chained off B23's `33efd3092bff`) scope to a carpool-template `GroupCustomPage` and reuse its `require_member_page_access` gate unchanged. New router `app/api/routes/carpool.py`: admin create/edit/lock/archive an event (one `PATCH` covers all three, following `ResponsibilityDate`'s precedent over `GroupCustomPage`'s separate publish/archive actions); a member posts driver/rider offers on an open event, edits/deletes only their own, and an admin can hide/delete any post regardless of event state. `CarpoolPost.user_id` is non-nullable (no guest/anonymous carpool writes at all, per `GROUP_PAGES_CARPOOL_PLAN.md`'s own deferral). Deliberate asymmetry: a locked/archived event blocks new posts *and* edits, but a member can always delete their own post. `pytest` 319 green (was 299; +20 new). Migration verified up/down/up against the local docker-compose Postgres, never prod. Not pushed/deployed.
- 2026-09-11: Built B23 (Custom Group Pages foundation, carpool template only). `GroupCustomPage` (migration `33efd3092bff`) is a dynamic per-group row rather than a fixed `GroupPage` enum member, reusing `PageAudience`/`PageMinIdentity` and a new one-value `GroupCustomPageTemplate` (`carpool_board`). `app/services/pages.py`'s three gate functions were extended in place (`PageLike = GroupPage | GroupCustomPage`) rather than forked, so the new admin CRUD router (`app/api/routes/custom_pages.py`: create/list/get/patch/delete plus `/publish` and `/archive`), the member route `GET /groups/{id}/pages/{slug}`, and the guest route `GET /guest/{join_code}/pages/{slug}` all share the exact same access checks built-in pages use. Slugs are generated from title, unique per group, immutable after create, and rejected with 409 on collision (no auto-suffixing). No `GroupPageBlock`, no HTML field anywhere on the model. `pytest` 299 green (was 279 on top of pre-existing uncommitted work; +20 new). Not pushed/deployed.

- 2026-09-11: Built B21 (drop PIN save, add group-scoped guest name matching). Decided with the human that B19's name+PIN "Save across devices" never fit right and no real user had ever hit it, so dropped it entirely: migration `e5c1a9f3b7d2` drops `users.pin_hash`, `POST /auth/save` and `SaveAccountRequest` are gone. Replacement is much lighter: `find_guest_matches` (case-insensitive name lookup scoped to `GroupMembership.is_guest == True` in one specific group) backs a new `GET /guest/{join_code}/name-matches` read and a `claim_user_id` on the self-signup payload; a confirmed claim re-validates server-side and reuses B19's existing `merge_participant` unchanged. No more in-place promotion path — a guest's only way to a real account is now a separate registration, unrelated to the guest row. `pytest` 274 green (was 275: -6 old PIN tests, +5 new). Not pushed/deployed.

- 2026-09-11: Built B20 (demo "Preview Admin", read-only). While testing B19/F23 locally end to end (docker compose + a seeded test group + a real Playwright walkthrough with two simulated devices), the human asked to let the public demo choir show what the Admin view looks like without risking a stranger changing the shared demo data. No mock UI: a new `admin_preview` JWT scope resolves as the demo's real admin for every read, and a single process-wide middleware rejects every non-GET request carrying it. Gated entirely by `Settings.demo_join_code` (env var, empty by default, no schema change). `pytest` 275 green (was 271); the local B19/F23 walkthrough itself surfaced no defects, only a pre-existing B6 rate-limiter artifact from hammering two "devices" through the same local proxy IP. Not pushed/deployed.

- 2026-09-09: Built B19 (progressive accounts). Migration `d4a9f2c7e1b8` adds `users.is_anonymous` / `anonymous_local_id` / `pin_hash`, `group_memberships.is_guest`, and `group_page_settings.min_identity` (`anyone` | `saved`), all backfilled by server defaults. A local-only singer's first responsibility self-signup mints an anonymous `User` + guest-tier membership and sets a one-year `divisi_participant` cookie (`app/services/participants.py`, new `create_participant_token` + `get_optional_participant`); `POST /auth/save` (name + numeric PIN) promotes that row in place or `merge_participant`s it into a matching saved account (annotations last-writer-wins per piece, memberships union, signups/markup repoint). `min_identity = saved` refuses a local-only write with a `SAVE_REQUIRED:` 403 but leaves reads and real-member writes alone; roster carries `is_anonymous`; `scripts/prune_anonymous_participants.py` sweeps bare anonymous rows. Google as a Save method was dropped (decided 2026-09-09): the OAuth callback keeps its plain B14 behavior, name + PIN is the only Save method, email magic link is the fast-follow. pytest 271 green; migration up/down/up verified on a throwaway SQLite. Not pushed/deployed.

- 2026-09-09: Brainstormed lowering the account barrier (chat only, no code). Guests already read everything via a join code, so the real wall is the singer's first stateful action (a responsibility signup, an annotation, roster presence). Agreed a progressive-account design: client-side local profile, the Backend mints an anonymous participant on the first shared action, "Save across devices" in Settings promotes that row in place (name + PIN, email magic link later; Google was considered and dropped 2026-09-09); merge is last-writer-wins per piece. Roster shows anon participants badged; a per-page `min_identity` lets a conductor require a saved account for high-trust pages. Captured as Backend B19 / Frontend F23. Conductor authoring path out of scope.

- 2026-09-03: B18 follow-up — added `GET /guest/{join_code}/pieces/{piece_id}/cues` so F22 cue glyphs can render for not-logged-in join-link guests. Cue-only read of the `scope='group'` markup layer (director pen/stamp/text ink has no guest path, stays members-only); same `tracks` page enabled + `audience == everyone` gate and join-code/password/distribution scoping as the guest rehearsal-notes route it mirrors. No schema or migration change. `tests/test_guest.py` +4; `pytest` 250 green.

- 2026-09-03: Added `Piece.presentation` (nullable `score_reference` / `play_along`, null = automatic), an admin-set hint for how a piece first presents to a viewer who has never opened it. Mirrors `default_tempo_bpm` end to end: migration `a2f6c1e4d9b7` (add nullable column), exposed on `PieceOut` / `LibraryEntryOut` / `GuestPieceOut`, accepted (and value-validated) by `PATCH /library/pieces/{id}` and the piece-upload form. `pytest` 245/245; migration up/down SQL verified offline (not run against prod, which Render does on deploy).

- 2026-09-01: Scoped Backend B16 (piece rehearsal notes) off the Codex "Weekly Notes Backend Proposal". Took only `piece_rehearsal_notes` (durable per-piece reminders); pushed the proposal's `weekly_note_sections`/`_items` tree and `group_resources` to Backlog. Not built yet.

- 2026-08-31 – 09-01: **Paged OMR + working-draft API (B16 paged-OMR, B17, B18) built to feed the in-app editor, now on the `omr-editor` branch (see `OMR_EDITOR_PLAN.md`).** ~7 log entries condensed here. B16 added `app/omr/paged.py` (per-page Audiveris split, part-count segmentation, force-merge, provisional whole-score merge, `OmrJob.paged`/`needs_review`/`paged_report_path` + `GET /omr/jobs/{id}/paged-report`); B17 added the working-draft slot (`working_draft` / `get_or_create_working_draft` copy-on-edit, `PUT /versions/{id}/file`, `POST /versions/{id}/publish`, per-page `rerun` + progress counters); B18 added per-page `start_measure`/`measure_count` to the paged report. Migrations `d2f8a6c4e1b9` and `e7b1c9d3a2f4`. The Backend OMR code stays on `main`, dormant and UI-unreachable (not deleted); detail lives in git history and the `omr-editor` branch.

- 2026-08-31: **Production outage: backend crash-loop from a stray migration on prod.** A `feat/generate-track-from-pdf` migration `c1f7a4d2e8b6` had been run against the production Neon DB from the feature branch, so `main`'s boot `alembic upgrade head` crash-looped on the missing revision and `uvicorn` never started, until the migration was cherry-picked onto `main` (commit `55cf46a`) where it now no-ops. Origin of the standing rule (now in `README.md` / `.env`): migrations reach prod only by merge to `main`; do local schema work against a disposable DB.

- 2026-08-31: B8 follow-up: added `GET /omr/jobs` (the caller's own OMR jobs, newest first, capped at 20) to back a header "generate finished" alert; the alert UI later moved to `omr-editor`, the endpoint stays on `main`. Factored the pending-generated-draft lookup into `pieces.pending_generated_version_id()`.

- 2026-08-31: Closed out B8 (OMR): installed both engines locally and ran a real 4-part choral PDF through each end to end. Audiveris needed `sheetStepTimeOut` raised for dense scores (now always passed by `audiveris.py`, 1800s default) and Tesseract `eng.traineddata` for lyrics; oemer 0.1.8 needed two source workarounds (a CoreML/onnxruntime crash, an OpenCV `HoughLinesP` shape mismatch). Audiveris recovers separate SATB parts + OCR'd lyrics; oemer flattens to one chord-stacked part, confirming the existing engine-priority order. Install recipe + oemer patches are in `Backend/README.md`.

- 2026-08-31: Wired `app/storage/files.py` to Neon Object Storage, closing the long-standing B11 ephemeral-disk gap (prompted by a production 500 on a piece PDF whose bytes were lost to a disk wipe). `save_file` writes to the `uploads` bucket when `AWS_*` is set (else local disk unchanged), `obj/…` keys serve via a local materialize-cache, and raw-file routes now 404 rather than 500 on missing bytes. Added `boto3`; committed 9d7ef53, storage credential verified 8bc2e31. Remaining human step: set `AWS_*` on Render and re-upload the 6 modification-version PDFs nulled in the prod DB.

- 2026-08-29: Built B15 (piece markup: pen strokes + stamps) to feed Frontend F11, after the human tried F4's annotations and asked for something closer to piaScore's drawing tool. Additive, not a replacement. Not deployed; migration not yet run against production. `pytest` green.

- 2026-08-29: Added `GET /annotations/{id}/shares` (owner-only; lists who an annotation is currently shared with, which share/unshare alone never exposed) while wiring Frontend F4. `pytest` green.
- 2026-08-29: Fixed a guest-path gap: `GuestPieceOut` was missing `composer`/`youtube_url`/`has_music`/`has_pdf`, leaving new Backend-uploaded pieces unreachable by guests. Added the 4 fields to `guest.py`'s `resolve_join_code`; pushed to the stale `backend/deploy` and to production, verified live. `pytest` 139/139.
- 2026-08-29: Added `Group.rehearsal_weekday`/`rehearsal_time` + `PUT /groups/{id}/rehearsal-schedule` (see B13's "Expanded" note above). `pytest` green.
- 2026-08-29: Built real piece uploads (MIDI/MusicXML + PDF + reference audio, see B4's "Expanded" note) from a fresh Windows worktree with a portable Postgres+venv setup. Migration `a3f7c1e9b5d2` verified up/down/up; all 4 upload combos curl-verified end to end. Not deployed this session.
- 2026-08-28: Added `PUT /auth/me/password`; deployed to production with the matching Frontend Settings UI, verified via a local Playwright round trip. `pytest` 124/124.
- 2026-08-28: Google Sign-In verified for real (a prior "verified" claim had only ever curled the API). B14 marked `[x]`.
- 2026-08-28: Deployed `PUT`/`DELETE /auth/me` (edit name; delete account with cascade that nulls `created_by` on group-owned content rather than orphan-deleting it, and blocks deletion if the account is a group's sole admin) and admin per-piece default tempo. Migrations `a7e2c9f4b3d8`, `f1a9d3c7b2e6`. Hid Google OAuth again (credentials existed but weren't yet human-tested). `pytest` 109/109.
- 2026-08-28: Repo cleanup: split `app/api/schemas.py` (445 lines) into `app/api/schemas/` by domain, zero-edit for route files (re-exported via `__init__.py`). Deleted the stale root `plan.md` and `BACKEND_PROPOSALS.md` (content folded into the two active plans first). Left the Frontend's equivalent untouched (no way to visually verify a live-`$state` refactor unsupervised; flagged in Frontend's Backlog). `pytest` 103/103.
- 2026-08-28: Built B14 (account security) overnight per explicit human direction. `pytest` 103/103 (11 new), plus a real bug the new tests caught: a naive/aware datetime comparison that broke under the SQLite test DB (fixed with a normalizing helper, Postgres-safe either way).
- 2026-08-28: Deployed `ResponsibilitySignup.user_id` (now nullable) + `guest_name` (cover a role with a non-account guest by name only; coverage queries switched to an outer join) and `GroupMembership.title`. `pytest` 92/92 beforehand.
- 2026-08-28: Deployed `Group.description` + its `PUT` endpoint, `PUT .../members/{user_id}/role`, and `DELETE` for a responsibility schedule/role (added while wiring Frontend F6). Not yet covered by `pytest` (tracked in Backlog).
- 2026-08-28: B13 (Responsibilities) approved.
- 2026-08-28: B13 built: `services/responsibilities.py` computes coverage in one shared place so member/guest routes can't drift; one `PATCH .../dates/{id}` covers edit/lock/cancel; capacity intentionally unenforced (overfilled is a real, reachable status); the guest route returns coverage only, never signup identities. `pytest` 92/92 (12 new), verified live against a real Postgres.
- 2026-08-28: B12 approved, moving to B13.
- 2026-08-28: B12 built: backfill migration preserved homework's old `guest_homework_visible` value into its `audience`; `tracks` defaults enabled/everyone (no gate before this); `members`/`about`/`responsibilities` default members-only. Backfill correctness verified by hand-inserting pre-migration rows, not just running the migration. `pytest` 80/80 (5 new); Frontend left on the old field this pass (backend-only scope).
- 2026-08-28: Seeded the human's real group ("San Francisco City Chorus") with all 7 fixture pieces via direct model insert (no upload UI yet at the time; see F5 for the eventual real path).
- 2026-08-28: Scoped B12+B13 with the human off the now-deleted proposal doc, deliberately narrowed (no recurrence, no notifications, no swap/approval; see Backlog).
- 2026-08-27: Closed out B11 (deploy) while the human was away, fixing two real production issues: a stale `backend/deploy` branch (missing CORS/Homework/B10) had been merged into `main`, and a redeploy broke on Render's `rootDir: Backend` prefixing onto `render.yaml`'s `dockerContext` (see B11's note). Verified live end to end. `pytest` 75/75.
- 2026-08-27: Built B6–B10 in sequence: B6 guest join codes (short 8-char, generic 404 with no oracle, in-process rate limiter); B7 rendering pipeline (`app/rendering/` ports the Swift `MIDIParser`/`MusicXMLConverter`, byte-equivalent against fixtures); B8 OMR (engine wrappers + job tracking + `/omr/jobs/{id}/import`, transcription quality unverified with no engine installed here); B9 Homework; B10 guest privacy controls. Added CORS middleware (none existed before). Milestone renumbering from the product pivot: the old OMR B6 became B8 after guest (B6) and rendering (B7) were inserted ahead of it.
- 2026-08-26: Backend plan split from the root `plan.md`; domain model agreed. **B1–B5 built and approved** (scaffold, auth, groups, pieces/versions/distribution/review, annotations+sharing). Gotchas worth keeping: a `passlib`/`bcrypt`≥4.1 incompatibility in B2 (dropped `passlib` for direct `bcrypt`); renamed the domain's "Choir" concept to "Group" before B3. Each milestone verified via a real Postgres migrate up/down/up plus a manual smoke test.

## Frontend (formerly `Frontend/plan.md`)

Separate from `Backend/plan.md` (the API/data model this talks to) and the native
iOS app — **paused/backlogged** as of 2026-08-27 in favor of this web player; see
the condensed "iOS app" section below.  Milestones prefixed `F` to avoid clashing
with the Backend's `B`-prefixed and the iOS app's `M`-prefixed milestones.

**Why a website first:** the earliest useful version of Divisi is choir members
listening to customizable practice tracks in the background, joining a group's
tracks as unauthenticated guests (no login needed unless saving annotations). Top
priority is a genuinely accurate, easy-to-use synced player — explicitly benchmarked
against PlayScore, whose UI is weak and whose audio/visual sync is often off. A
website also sidesteps a real pain point the iOS app hit: OpenSheetMusicDisplay is a
JS library that had to be wrapped in a `WKWebView` bridge there (source of real
cursor-sync and zoom bugs) — on an actual website it runs natively with direct
access to the audio clock.

**Sequencing call (2026-08-27):** prove the player itself out — entirely
frontend-only, against a bundled fixture MIDI file, no Backend/account wiring at
all — before spending any effort connecting it to real groups or logins.

**Stack:** SvelteKit — lean/compiles-away runtime, good fit for a UI that's mostly
live audio/animation state, small bundle matters for a page choir members open on
their phones.

**Status:** F1, F6, F7, F9, F10 done and approved. F2–F5, F8, F11–F13 are built and
`check`/`build`-clean but each still has at least one open "human confirms in a real
browser / on a real touchscreen" item — much of this Frontend's recent work was built
on a machine with no browser/Playwright available, so that's the recurring blocker
across the board, not a code gap. (Backend B15 and B16 migrations are now live on
prod — Neon is at head `f9d4c1a7b2e8` — so F11 and F20 are no longer deploy-blocked;
the live Frontend Worker was redeployed from `main` on 2026-09-02.) The in-app notation
editor and the OMR-review milestones live in their own plan, `OMR_EDITOR_PLAN.md`
(E1–E10), and now only on the `omr-editor` branch — the frontend surface of that
work was deleted from `main` as unverified WIP (the Backend OMR code stays, dormant
and UI-unreachable). See the status table under Milestones.

The web app is the active product; the native iOS app is paused (see the "iOS app"
section below and the repo-root `README.md`).

## UI/UX conventions

Condensed 2026-08-28 from the now-deleted `UX_WIREFRAME.md` — these are the
*standing rules* worth keeping as a reference, since several log entries cite
them by name.

**Navigation and brand:**
- Divisi is persistent app chrome (top-left `AppHeader` brand), never a
  repeated centered page title
- Global account/settings access lives top-right as the gear button
  (`Settings`) — a drawer (see F6)
- Page titles name the current place: Home, Library, a specific group's
  name, Settings — not the app name again
- Bottom nav: Home | Library only (no "Me" — its contents live under
  Settings; no standalone Groups tab — "My groups" lives on Home)
- The practice player uses its own focused chrome (back button, piece
  title, Practice Setup button) — no `AppHeader`/`BottomNav`

**Naming:**
- "Settings" = global account/app defaults. "Practice Setup" = choices
  scoped to the current piece/track/assignment — never call the player's
  drawer "Settings"
- "Group Settings" = admin-only group configuration
- "Viewing as Member"/"Viewing as Admin" for the role switcher
- Singer-facing practice labels: Everyone / My part / My part + others /
  My part + accomp / Custom (not the underlying `DisplayMode`/`MixMode`
  values)

**Redundancy:** don't repeat "Divisi" as a page title; don't duplicate a
control in two places (e.g. theme picker only in Settings, not also in
Practice Setup); don't show "Join a group" once the user already belongs
to one; don't show a sparse empty section with no explanation of the next
action; Library (finding practice material) and Groups (membership/admin/
context) stay conceptually distinct even though they share underlying data.

**Still-open questions** (never decided, carried over in case they matter
later): should annotations default to shared-with-director rather than
fully private? Should personal calendar export of responsibility dates be
supported? Should roles/responsibility templates be reusable across groups?

## Milestones

| # | Milestone | Status |
|---|---|---|
| F1 | Standalone playback + notation prototype | ✅ Approved — reads as more accurate/pleasant than PlayScore |
| F2 | Guest access to real pieces via the Backend | ✅ Join flow confirmed in a real browser, incl. a password-protected group (2026-09-02) |
| F3 | App-shell UI screens (fixture data) | ✅ Screens confirmed in a real browser, light + dark (2026-09-02) |
| F4 | Login + wire groups/home/library to the real Backend | ✅ Confirmed in a real browser (2026-09-02): login/redirectTo, real groups/home/library data, homework read+write, score-position annotations create/edit/delete |
| F5 | Wire the player to real Backend pieces (+ real uploads: MIDI/PDF/YouTube) | ⏳ Built and curl/check-verified; nobody has clicked through the actual upload/practice flow yet (no browser on the build machine) |
| F6 | Group page settings + Responsibilities | ✅ Live-app walkthrough done (2026-09-02): page-settings grid, Responsibilities admin/member/guest incl. the 2026-09-01/02 rework, About-tab rehearsal editor |
| F7 | Weekly Notes tab + guest sign-in banner | ✅ Done — Playwright-verified live |
| F8 | Spanish localization (`/es`) | ✅ Clicked through the Spanish UI in a real browser (2026-09-02): nav/drawer/screens, forms + validation, branded 404, language switcher round-trip |
| F9 | Graceful error handling app-wide | ✅ Done — live-verified including a real Backend-down/recovered cycle |
| F10 | Lock down bundled pieces (security fix) | ✅ Done — closed a real hole where 5+ real choir pieces were publicly fetchable with no auth |
| F11 | PDF markup: freehand pen + stamps (piaScore-style) | ⏳ Built, `check`/`build`-clean; Backend not yet deployed to production (new migration), so unusable on the preview until that lands |
| F12 | PDF markup: top-level Annotation mode on/off toggle | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it on a real touchscreen |
| F13 | Audio-only reference recording, driving the bottom bar in PDF view | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it in a real browser |
| — | In-app notation editor + OMR review | Lives on the `omr-editor` branch only (`OMR_EDITOR_PLAN.md`, milestones E1–E10); frontend surface deleted from `main` as unverified WIP |
| F20 | Piece Notes panel — director + personal notes (frontend for Backend B16 + B5) | ⏳ Built (2 sources on the piece page + an expandable Rehearsal Tracks card); guest expansion 2026-09-02 adds a director-only read-only mode on the guest piece page + guest Tracks cards; `check`/`build`/vitest 79 green; no real-browser pass yet |
| F21 | Group markup layer (frontend for Backend B17) | ⏳ Built 2026-09-02 (`e75f79c`), check/build/vitest 70 green; not deployed; no touchscreen pass |
| F22 | PDF cue points — tap to jump the reference recording (frontend for Backend B18) | ⏳ Built 2026-09-02: cue tool + glyph, tap-to-jump, mm:ss edit in the toolbar, hidden under "My mix"; `check` 0 errors, `build` clean, vitest 79 green; not deployed; no touchscreen pass. Tightened 2026-09-02 (human's request): cue tool is Director-layer only (owning-group admin + draw target = Director); personal-cue path dropped, every cue saves `scope='group'`. 2026-09-03 (human's request): cue glyphs now always render in the PDF player for every viewer (members and not-logged-in join-link guests) whenever the audio source is the reference recording, independent of the "Show director markup" toggle; guests read them via a new `GET /guest/{code}/pieces/{id}/cues` (cue-only). Editing unchanged. `check`/`build` clean, vitest 82 |
| F23 | Local profile + "Save across devices" (frontend for Backend B19) | ⏳ Built 2026-09-09: silent local profile, lazy name prompt on guest responsibility self-signup, Settings "Save across devices" (name + PIN), one-time post-signup banner, roster "Unverified" badge, `SAVE_REQUIRED:` inline prompt. `check` 0 errors, `build` clean, vitest 114. Verified 2026-09-11 end to end (signup, save, cross-device merge, the `min_identity` gate) in a real local browser; still no human/phone pass. |
| F24 | Guest chrome cleanup + demo "Preview Admin" entry point | ⏳ Built 2026-09-11: banner removal (`0e47174`) plus the Settings "Preview Admin" entry point (frontend for Backend B20): `demoPreview.ts` store, `/join/[code]/admin-preview` proxy, `divisi_demo_preview` marker cookie, persistent banner + "Exit preview". `check`/`build` clean, vitest 126. Verified end to end locally (docker compose + Playwright); no human pass against the deployed demo yet |
| F27 | Pages tab: custom group pages foundation (frontend for Backend B23) | ⏳ Built 2026-09-11: Pages tab (admin create/publish/unpublish/archive/delete + edit, member/guest read-only), by-slug view routes for member and guest, `carpool_board` renderer shell. `check`/`build` clean, vitest 125. |
| F28 | Carpool board UI (frontend for Backend B24) | ⏳ Built 2026-09-11: event selector, driver/rider lists, owner edit/delete, admin moderation + event create/edit/lock/archive. `check`/`build` clean, vitest 132. Not deployed; no real-browser pass yet. |
| F29 | Guest carpool board: real content + posting (frontend for Backend B25) | ⏳ Built 2026-09-12: `/join/[code]/pages/[slug]` renders real `CarpoolBoard` content for a guest (events/posts via B25's guest reads), `/join/[code]` "Pages" tab discovery, `/join/[code]/carpool/...` proxy routes for guest post create/edit/delete (name prompt, `SAVE_REQUIRED:` inline, cookie round-trip). `check` 0 errors, `build` clean, vitest 138 green (was 132; +6 new). Not deployed; no real-browser pass yet. |
| F30 | Move custom-page create + visibility into Settings, alongside built-in Page Visibility | ✅ Built 2026-09-12, corrected same day: custom-page rows now live inside the same Page Visibility card as siblings of the built-in rows (not a separate "Custom pages" card); "Create page" stays its own card below. `check` 0 errors, `build` clean, vitest 138 green (unchanged). |
| F31 | Custom pages as siblings in the main tab bar, not a "Pages" tab | ⏳ Built 2026-09-12: `PagesTab.svelte` deleted; a new `+layout.server.ts` under `/groups/[id]` shares the group/role/custom-pages/built-in-enabled-flags data between the main page and `pages/[slug]`, and a pure `groupTabs.ts` (`joinTabs.ts` on the guest side) computes the ordered/filtered/labeled tab list both routes render. Built-in tabs stay local `$state` buttons on the main page; every custom-page tab, and every tab at all from a custom page's own route, is a real link. `check` 0 errors (13 pre-existing warnings, unrelated), `build` clean, vitest 146 green (was 138; +8 new, `groupTabs.test.ts`/`joinTabs.test.ts`). Not deployed; no real-browser pass yet. |
| F32 | Carpool: standing board by default, dated events for exceptions (frontend for Backend B26) | ✅ Built 2026-09-12; `npm run check` 0 errors, `npm run build` clean, vitest 151 passed (was 146; +5 new) |
| F33 | Carpool: claim a seat in a driver's post (frontend for Backend B27) | ✅ Built 2026-09-12; check 0 errors, build clean, vitest 155 green |
| F34 | Guests can remove their own responsibility signup (frontend for Backend B28) | ✅ Built 2026-09-12; check 0 errors, build clean, vitest 161 green (was 155; +6 new, `responsibilitySignupOwnership.test.ts`) |
| F35 | Carpool Map: Google Maps pins for driver/rider/destination (frontend for Backend B29) | ✅ Built 2026-09-12: lazy-loading `googleMaps.ts` loader (singleton, mockable, resolves `null` for "unavailable" with no key configured/script blocked); `CarpoolMap.svelte` (Advanced Markers, colored pins per category, skips rendering with no pins yet); `googlePlaces.ts` Autocomplete action wired onto the origin/destination inputs; admin `map_enabled` toggle in Settings' Page Visibility card; List/Map toggle (mobile) / side-by-side layout (desktop, within the existing 640px `.shell`) in `CarpoolBoard.svelte`. Whole feature no-ops to today's list-only board with zero Google Maps configured (the real state right now). `check` 0 errors, `build` clean, vitest 175 green (was 167; +8 new `carpool.test.ts` cases, +6 new `googleMaps.test.ts`). Not deployed; no real-browser/real-API-key pass yet. |
| F36 | Carpool as a built-in tab, drop generic Custom Pages (frontend for Backend B31) | ✅ Built 2026-09-14: carpool promoted to a plain sixth built-in tab (`groupTabs.ts`/`joinTabs.ts`); the generic Custom Pages system (`pages/[slug]` routes on both `groups/[id]` and `join/[code]`, `actions/customPages.ts`, `CustomPageView.svelte`, `AboutTab.svelte`'s custom-page section) deleted; new `tabs/CarpoolTab.svelte` (member/admin) renders the unchanged `CarpoolBoard.svelte`, and the guest join page now renders it too straight off `guestJoin.ts`'s resolved carpool data, no more slug route. Settings' Page Visibility card gets a plain `carpool` row like every other built-in page. `check` 0 errors, `build` clean, vitest 188 green. |
| F37 | Carpool direction: there / back / round trip (frontend for Backend B32) | ✅ Built 2026-09-14: post create/edit forms (member + guest, `CarpoolBoard.svelte`) gained a There/Back/Round trip `<select>`, defaulting to Round trip, wired into `actions/carpool.ts` and the `/join/[code]/carpool/...` guest proxy routes; the "On the way there/back" viewing toggle (built alongside F35, `postMatchesDirection`) was already filtering by it. `check` 0 errors, `build` clean, vitest 188 green. |
| F38 | Group tab strip: single row, scrolls sideways on mobile | ✅ Built 2026-09-14: new `.tab-strip` modifier in `shell.css` (`flex-wrap: nowrap`, `overflow-x: auto`, `flex-shrink: 0` per tab) applied alongside `.tabs` on just the member (`groups/[id]/+page.svelte`) and guest (`join/[code]/+page.svelte`) main nav strips; `.tabs`' own base rule (and its other users — the carpool direction toggle, the login tab switcher) untouched. `check` 0 errors, `build` clean, vitest 188 green. |
| F39 | Guest About/Info tab (frontend for Backend B33) | ✅ Built 2026-09-14: `about` joined `joinTabs.ts`'s `GuestBuiltinTabKey`, gated on a new `aboutVisible` flag (unlike the member side's unconditional `about`); `$lib/api/guest.ts` gained `listGuestAbout`/`GuestAbout` plus `about_visible` on `getGuestTabs`'s (currently-unused) response type, threaded through `guestJoin.ts`'s fan-out the same optional-page way as weekly notes/carpool. `join/[code]/+page.svelte` renders a read-only About section (description + `formatRehearsalSchedule`, reused from `../groups/[id]/rehearsalSchedule`) with no editors/leave-group/join-link controls — reused existing `groups_about_tab_title`/`groups_rehearsals`/`groups_no_description` keys, no new ones needed. `check` 0 errors, `build` clean, vitest 189 green. |
| F40 | Carpool direction: grouped legs instead of an exclusive toggle | ⚠️ Built 2026-09-14, superseded same day by F41: dropped the "On the way there/back" toggle from `CarpoolBoard.svelte`; new `carpoolPostsNeedDirectionGrouping` (`carpool.ts`) decides flat vs. "Getting there"/"Getting home" grouping per card (Drivers/Riders independently); reworded direction `<select>` options and added the two group-heading i18n strings (`en.json`/`es.json`). `check` 0 errors, `build` clean, vitest 194 green (was 189; +5 new). Human feedback after using it: the auto-collapsing split read as inconsistent; wanted an explicit toggle back. |
| F41 | Carpool direction: bring the toggle back, extend it to the map | ✅ Built 2026-09-14: reverted F40's per-card grouping in `CarpoolBoard.svelte` back to F37's explicit "On the way there"/"On the way home" toggle (`directionFilter`, `postMatchesDirection`), placed above the map so `drivers`/`riders` are filtered before `CarpoolMap` reads them too, fixing the gap F37 never covered (F40 accidentally fixed it as a side effect, F41 makes it deliberate). Reused `carpool_leg_there`/`carpool_leg_back` as the tab labels ("On the way there"/"On the way home") instead of F40's group-heading text; removed `carpoolPostsNeedDirectionGrouping` (`carpool.ts`), its 5 tests, the `directionGroupedPosts` snippet, and `.carpool-leg-heading`. `check` 0 errors, `build` clean, vitest 189 green (was 194; -5 from the removed grouping tests). Same-day follow-up (human's request): `directionFilter` now defaults to `'back'`, not `'there'` — the ride-home leg is the one people actually open the board to check. |
| F42 | Piece list cards: show what's available (interactive player / recording / PDF) | ✅ Built 2026-09-14: member track card and guest join-page card each show a present-only "what's available" line (player/reference/PDF, `·`-separated), derived from the Backend flags plus the bundled-registry fallback so demo pieces show correctly; reworded `groups_track_has_music` to "Interactive player" for the present-only phrasing, admin's ✓/– badge row untouched. |
| F43 | Sort member/guest piece lists by resource count, most populated first | ✅ Built 2026-09-14: extracted F42's per-piece player/reference/PDF availability into a shared `$lib/pieces/availability.ts` (`pieceAvailability`, `resourceCount`), used by both files' F42 display line and new F43 stable descending sort. Admin's list stays server order, unchanged. |

### F1 — Standalone playback + notation prototype [x]

No backend, no accounts — everything driven from a bundled MIDI fixture file, so the
core "is this actually accurate and pleasant to use" bet gets proven before any
wiring work. Audio approach for *this milestone only*: client-side MIDI parsing +
in-browser synthesis via the Web Audio API (a WASM soundfont synth) — not the
server-rendered stems originally planned for production (see Backend `B7`). That was
the right call for accuracy at scale, but it requires a backend, which this milestone
deliberately has none of.

**Acceptance criteria:**
- [x] Given a bundled fixture MIDI file, the app parses it client-side and plays it back audibly, all SATB parts + any accompaniment synthesized in-browser
- [x] All parts start in sample-accurate sync and stay in sync for the full piece length — no audible drift by the end
- [x] Play/pause/seek are immediate and accurate, driven off `AudioContext.currentTime` — no polled position readout in the critical path
- [x] Real engraved notation (OSMD) renders with a moving cursor tracking that same clock, no perceptible lag
- [x] Flat/highlighted/solo display modes, switchable without ever restarting or repositioning audio
- [x] The score scrolls for pieces longer than one screen, and genuinely zooms in/out (verified by hand in a real browser)
- [x] A balance slider per SATB part adjusts that part's volume live during playback
- [x] Audio keeps playing when the browser tab is backgrounded or the phone screen locks — confirmed on a real phone after routing playback through a real `<audio>` element
- [x] Human confirms it reads as more accurate/pleasant than PlayScore on the same piece, before any Backend/account wiring is invested

**Tasks — Claude:**
- [x] Scaffold SvelteKit project under `Frontend/`
- [x] Port MIDI parsing to TS (`src/lib/midi/parser.ts`, `midi-file` npm package) — replicates the iOS `MIDIParser`'s track→voice-part heuristic; verified against all 4 real `Fixtures/*.mid` files
- [x] Port `MusicXMLConverter`'s quantization/tie/measure-splitting logic to TS (`src/lib/midi/musicXmlConverter.ts`)
- [x] Client-side synthesis: `js-synthesizer` (WASM FluidSynth) + `TimGM6mb.sf2`
- [x] Web Audio API player (`src/lib/audio/player.ts`) — architecture changed from the original plan: the whole piece is fed to a single FluidSynth player instance, live per-part balance is a MIDI CC7 message sent to that part's channel (channel numbers assigned by `playbackMidiBuilder.ts`, since the project's own synthetic dev fixtures put every track on channel 0)
- [x] Embed OSMD directly in `ScoreView.svelte`, drive the cursor off the shared clock via `requestAnimationFrame` — required disabling SSR for this route and dynamically `import()`ing OSMD
- [x] Flat/highlighted/solo display-mode picker
- [x] Media Session API integration for background/lock-screen playback controls
- [x] Scrolling/zoom controls on `ScoreView.svelte` (0.5×–2×)
- [x] `Frontend/README.md` with local-run instructions
- [x] Visual polish pass: card shell, light/dark design tokens, segmented pickers, circular play/pause, filled seek scrubber, collapsible "Mix" balance panel
- [x] `Piece` registry (`src/lib/pieces/{types,registry}.ts`): a `{id, title, composer, load()}` contract
- [x] MusicXML importer (`src/lib/musicxml/parser.ts`) for pieces whose only clean source is a score export

**Tasks — Human:**
- [x] Try it end-to-end and compare directly against PlayScore on the same piece; sign off before Backend wiring starts

### F2 — Guest access to real pieces via the Backend [x]

**Depends on Backend B6** (join code + public guest endpoints). Swaps F1's bundled
fixture for a real group's actual distributed pieces, reached via a shareable join
link, still no login required. Scope narrowed 2026-08-27 to just the join-code
listing route — wiring F1's player to Backend-rendered pieces is F5. Extended
2026-08-27 alongside F4: guests also see a group's homework (when opted in via
Backend B10), and a password-protected group prompts for it.

**Acceptance criteria:**
- [x] Visiting a valid join-code URL shows that group's distributed pieces, with no login
- [x] An invalid/unknown join code shows a clear "not found" state, not a crash
- [x] A password-protected group prompts for the password and retries, rather than showing a raw error
- [x] Homework only appears in the guest view for groups that opted into `guest_homework_visible`
- [x] Human confirms the join flow (including a password-protected group) in a real browser (2026-09-02)

**Tasks — Claude:**
- [x] `$lib/api/guest.ts`: `listGuestHomework`, password param threaded through `resolveJoinCode`
- [x] `/join/[code]`: password-prompt state on 401, tabbed Homework/Rehearsal Tracks view
- [x] Backend: CORS middleware — no cross-origin allowance existed before this
- [x] Frontend: `PUBLIC_API_BASE_URL` env var, `src/lib/api/guest.ts` typed client
- [x] Routes: `/join` (code-entry form) and `/join/[code]` (resolves the code server-side)
- [x] Wired `/groups`' dead "Join a group with a code" button to `/join`
- [x] Verified against a real local Backend: registered a user, created a group, uploaded/approved/distributed a piece, confirmed the join code resolves correctly for both a valid code and an unknown one via a real SSR network call

**Tasks — Human:**
- [x] Look over `/join` and `/join/[code]` in a real browser — confirmed 2026-09-02

### F3 — App-shell UI screens (fixture data) [x]

Built every screen from `UX_WIREFRAME.md` other than the already-approved practice
player, as real routes against local fixture data — same "prove the UI before wiring
a backend milestone" call F1 made for the player. Started from a low-fidelity
wireframe artifact covering all ten screens, reviewed by the human, before any code
was written.

**Acceptance criteria:**
- [x] Every UX_WIREFRAME.md screen besides the practice player has a real route, styled with the same design tokens as the rest of the app, reachable via the bottom nav / in-page links, not just a direct URL
- [x] All new routes read from local fixture data only (`lib/fixtures/appData.ts`) — no Backend calls added, consistent with F2 not being wired yet
- [x] `npm run check` and `npm run build` both clean
- [x] Human confirms the screens read as intended in a real browser, light and dark (2026-09-02)

**Tasks — Claude:**
- [x] Recolored the flat-black `divisi-logo` source into a CSS-mask asset painted via `background-color: var(--accent)`, so it tracks the live accent token
- [x] `lib/fixtures/appData.ts`: Groups/Homework/Members/Annotations/Settings fixture data
- [x] `lib/styles/shell.css`: shared card/button/tab/list/field/bottom-nav classes
- [x] Routes: `/welcome`, `/home`, `/groups`, `/groups/[id]` (tabbed Homework / Rehearsal Tracks / Members / Info), `/groups/[id]/homework/[hwId]`, `/groups/[id]/admin`, `/groups/[id]/admin/new-homework`, `/settings`
- [x] `AnnotationModal.svelte`: reusable add-annotation sheet, wired from Homework Detail
- [x] `BottomNav.svelte` shared across Home/Library/Groups/Me

**Tasks — Human:**
- [x] Look over the new screens in a real browser (light + dark) — confirmed 2026-09-02, no changes flagged

### F4 — Login + wire groups/home/library to the real Backend [x]

Scope expanded 2026-08-27 beyond "login + annotations": also replaces F3's fixture
data with real Backend calls for groups, membership/info, homework (Backend B9), and
"my library" listings. Depends on Backend B2 (auth) and B9 (homework).

**Explicitly still out of scope:** actually *practicing* a real Backend-sourced
piece — that's F5, a different loading path entirely (the player's registry only
loaded bundled files until F5). Real Backend pieces show up for real in group/
library listings now, just without a working Practice button until F5. Home's
"Continue practice" card also stays on its existing bundled-demo behavior — no
backend concept for "last opened piece" exists (see Backlog).

**Acceptance criteria:**
- [x] A guest can register/log in without losing their place — `redirectTo` carries through `/login` back to wherever a protected page bounced them
- [x] Session stored via an httpOnly cookie through a SvelteKit server route, not `localStorage`
- [x] `/groups`, `/groups/[id]`, `/groups/[id]/admin`, and `/home`'s "My groups"/"Due soon" sections read real data from the Backend
- [x] Homework tab, homework detail, and "+ Add homework" read/write real data via Backend B9
- [x] The root library (`/`) shows each group's real distributed pieces (title + review status) alongside the existing bundled demo pieces
- [x] Browsing, playback, and customization of the existing bundled/demo pieces remain fully guest-accessible — login is opt-in, never a gate
- [x] A logged-in user can add an annotation at a position in the score; it's private by default and shareable with a specific peer, matching Backend B5's semantics
- [x] Human confirms login, group browsing, and homework in a real browser (2026-09-02)

**Tasks — Claude:**
- [x] Login/register UI (`/login`) against Backend B2's endpoints; session via an httpOnly cookie set by a SvelteKit server route, read in `hooks.server.ts` for every authenticated `load`
- [x] `src/lib/server/backend.ts`: authenticated server-side fetch helper
- [x] Rewired `/groups`, `/groups/[id]`, `/groups/[id]/admin`, `/home`'s groups/due-soon sections
- [x] Rewired Homework tab, homework detail, and "+ Add homework"
- [x] Rewired `/`'s per-group sections off real `/library/pieces`, shown read-only until F5 lands
- [x] `/settings`: real logged-in user (name/email) and a real logout
- [x] Annotation UI: create/view at a score position, respecting B5's private-by-default + explicit-share model
- [x] Share/unshare UI against B5's existing endpoints

**Expanded 2026-08-29 (annotations rendered in the player, at the human's
request — "mark a breath somewhere").** Built against the real B5 endpoints
(plus one new one — see the Backend plan's B5 note), not fixture data;
**not** `check`/`build`-verified this pass — this session's environment had
no `node`/`npm` on `PATH` at all (a step further than the usual "no browser"
gap the rest of this file's recent entries flag), so nothing below has been
compiled or run, only hand-reviewed. Treat as more provisional than this
file's usual "check/build-clean, pending a human's look" entries until a
session with real tooling confirms it compiles.

- [x] `$lib/api/annotations.ts`: typed client for `routes/piece/[id]/annotations/**`'s proxy routes (list/create/update/delete/share/list-shares/unshare)
- [x] `routes/piece/[id]/annotations/**`: authenticated proxy routes mirroring `../file`/`../pdf`'s pattern — `locals.token` attached server-side, never reaches client JS
- [x] `ScoreView.svelte`: renders one marker per annotation via OSMD's native multi-cursor support (`cursorsOptions`/`osmd.cursors`, `CursorType.ShortThinTopLeft`) — a short mark above the note, distinct from the playback cursor; `annotateMode` prop makes a score tap place a new marker (`onAnnotationPlace`) instead of seeking; clicking an existing marker calls `onAnnotationMarkerClick`
- [x] `AnnotationSheet.svelte` (new): create/view/edit sheet, owner-only edit/delete/share/unshare, matching B5's real semantics (not the fixture-era `AnnotationModal.svelte`'s broadcast-style visibility options, which the Backend never implemented — that component is still unused/dead)
- [x] `piece/[id]/+page.svelte`: wires an "add annotation" toggle (bottom bar, only for a real Backend piece + logged-in user — no guest path, B5 requires a session) and the sheet's create/view/edit/delete/share/unshare handlers
- [x] Position stored as `String(positionWholeNotes)` (same tempo-independent unit the playback cursor/click-to-seek already use) on B5's opaque `Annotation.position` string; displayed as "Measure N" (derived from the piece's time signature)

**Tasks — Human:**
- [x] Run a real `npm run check`/`build` — done 2026-09-02, 0 errors / build clean
- [x] Open a real Backend piece, place a marker, click through create/edit/delete in a real browser — confirmed 2026-09-02. Share/unshare not explicitly re-confirmed this pass (needs a 2nd account); the underlying endpoints were curl-verified earlier.

### F5 — Wire the player to real Backend pieces (client-side, same pipeline as the bundled demo) [~]

**Rewritten 2026-08-28**, replacing the original stems/manifest design, after the
human questioned the premise directly: do we actually need a "better" (server-
rendered) player at all? F1's own in-browser soundfont synth already sounds good —
shipped and approved on that basis — so B7's server-rendered stems were never
actually needed for quality. The real gap is that the existing client-side player
only knew how to load a bundled static file, never anything from the Backend.

**Scope:** teach the existing player to fetch a real piece's raw source file (MIDI
or MusicXML) from the Backend and run it through the exact same parse/synth/render
pipeline already used for every bundled piece — no new audio engine, no stems, no
manifest. `MidiPlayer`, `ScoreView`, the mixer/display-mode UI, and per-piece
`localStorage` persistence all stay completely untouched; only *where the bytes come
from* changes. B7's rendering pipeline isn't deleted — just no longer something the
Frontend wires up to. Guest parity: a guest's experience is identical to a member's
(guest preferences already never reach the Backend — `playerDefaults.ts` is
`localStorage`-only for everyone).

**Shape:** a new `Piece` implementation whose `load()` fetches the raw-file URL,
sniffs MIDI vs. MusicXML by magic bytes (`MThd` → MIDI, else MusicXML text), and
calls the existing parsers. The guest path fetches straight from the Backend's
public origin (CORS already proven working); the authenticated path goes through a
same-origin proxy route (`/piece/[id]/file/+server.ts`) that attaches `locals.token`
server-side, so the session token never reaches client JS.

**Acceptance criteria:**
- [ ] A logged-in group member can open a real Backend-distributed piece from `/groups/[id]`'s Rehearsal Tracks tab or `/`'s per-group section and hear it play, in sync, for the whole piece's length — same accuracy bar as the bundled demo, because it's the same player
- [ ] The same piece's notation renders with a moving cursor, using the existing `musicXmlConverter`/`ScoreView` path unchanged
- [ ] The existing per-part balance/mute controls, display modes, and tempo slider all work against a real Backend piece exactly like they do against the bundled demo
- [x] A guest who joined via `/join/[code]` can open and fully practice any of that group's distributed pieces the same way, with no login — including a password-protected group's pieces (2026-09-03: closed by the signed httpOnly guest-token cookie, commit `62c2e58`; the token is minted on `/join/[code]/auth` and forwarded by the piece proxy routes, and a cold piece link now shows a password/login gate instead of 404ing)
- [ ] A real Backend piece whose title happens to match a bundled registry entry still resolves to the bundled asset, not a redundant Backend fetch
- [ ] `npm run check` and `npm run build` both clean
- [ ] Human confirms a real distributed piece sounds and looks right, played both as a logged-in member and as a guest via a join code

**Tasks — Claude:**
- [ ] Backend: `GET /library/versions/{id}/file` and `GET /guest/{join_code}/pieces/{piece_id}/file` — raw source file, same access gates as the existing manifest routes, no rendering
- [ ] `src/lib/pieces/types.ts`: widen `pdfUrl` to optional, extend `collection` for a real-Backend-piece case
- [ ] New `Piece` factory (`src/lib/pieces/remotePiece.ts`) whose `load()` fetches raw bytes, sniffs MIDI vs. MusicXML, parses with the existing parsers
- [ ] `/piece/[id]/file/+server.ts` (new): authenticated proxy — attaches `locals.token`, streams the Backend response back
- [ ] `/piece/[id]/+page.server.ts` (new): resolves bundled-registry vs. real Backend piece (via `/library/pieces`) — constructs a remote `Piece` when neither the bundled title nor a bundled id matches
- [ ] New guest route `/join/[code]/piece/[id]`: resolves a remote `Piece` from the guest raw-file endpoint directly (client-side fetch, no proxy needed), reuses the existing player UI
- [ ] Wire real "Play" links on `/groups/[id]`'s Rehearsal Tracks tab, `/`'s per-group sections, and `/join/[code]`'s Rehearsal Tracks tab
- [ ] Verify against the real live Backend (`divisi.onrender.com`, not mocked): open a real distributed piece both as the owning member and as a guest via its join code

**Tasks — Human:**
- [ ] Listen to a real distributed piece played through this path (both as a member and as a guest) and confirm it sounds right

**Expanded 2026-08-29 (real piece uploads — MIDI/MusicXML + PDF + reference audio),
built on a Windows machine with no browser/Playwright available** — everything below
is `npm run check`/`build`-verified and Backend-curl-verified end to end, but the
actual in-app interaction (upload form, player/PDF toggle, YouTube embed) has **not**
been clicked through by a human or Playwright yet.

- [x] `src/lib/pieces/types.ts`: `pdfUrl`/`load` both optional now, `collection` gained `'group'`, added `youtubeUrl`
- [x] `src/lib/pieces/remotePiece.ts`: builds a `Piece` from Backend metadata — `pdfUrl` only when `has_pdf`, `load` only when `has_music`
- [x] `/piece/[id]/file/+server.ts` and `.../pdf/+server.ts`: authenticated proxies, resolve the piece's current version via `/library/pieces` first
- [x] `/piece/[id]/+page.server.ts`: resolves bundled-registry vs. real Backend piece; returns `remote: null` for a guest with no session (this route is also reached via join-code links)
- [x] `/piece/[id]/+page.svelte`: player/PDF panes and the View-mode toggle are now conditional on `hasPlayer`/`hasPdfPane`; YouTube embed shows whenever `youtubeUrl` is set
- [x] `/groups/[id]/+page.svelte` + `+page.server.ts`: admin-only click-to-reveal upload form (Name/Author/Music file/PDF/Default tempo/YouTube); a track's Practice link now works for any track with `has_music`/`has_pdf`, not just bundled-title matches
- [ ] Guest-side wiring for genuinely-new real pieces via join code — deliberately not built this pass, closed in the follow-up entry logged below
- [ ] A human (or Playwright) actually clicking through: upload a track, open it as a member, confirm the right view(s) show, confirm the YouTube embed renders
- Storage stays local-disk this pass — same already-documented ephemeral-disk limitation as every other upload

### F6 — Group page settings + Responsibilities [x]

Backend-driven — the Backend's B12 (per-page group settings) and B13
(Responsibilities) shipped with no Frontend wiring at all. Brings both over.

**Acceptance criteria:**
- [x] Group admin's Settings tab shows all 5 pages (Homework, Rehearsal Tracks, Members, About, Responsibilities) with independent enabled/audience controls, replacing the old single "show homework to guests" checkbox
- [x] A member whose group has a page disabled just doesn't see that tab, instead of the whole group page (or Home) failing
- [x] A group's Responsibilities tab lets a member see upcoming dates with per-role coverage and sign up/remove their own signup; an admin can additionally create schedules + roles, add dates, lock/cancel dates, and assign/remove any member's signup
- [x] Guests (via `/join/[code]`) see a read-only Responsibilities tab when a group's admin opted it into `audience: everyone`
- [x] `npm run check` and `npm run build` both clean

**Tasks — Claude:**
- [x] `backendTypes.ts`: dropped `GroupOut.guest_homework_visible`; added `GroupPage`/`PageAudience`/`GroupPageSettingOut` and the `Responsibility*` types
- [x] `$lib/api/guest.ts`: `listGuestResponsibilityDates()`
- [x] `/groups/[id]/+page.server.ts`: `fetchPageOrDisabled()` wraps homework/members/responsibilities fetches so a disabled page just hides its tab; new page-settings/responsibility actions
- [x] `/groups/[id]/+page.svelte`: 5th "Responsibilities" tab; admin Settings tab's page-visibility grid
- [x] `/home/+page.server.ts`: same disabled-page guard as the group page
- [x] `/join/[code]`: guest Responsibilities tab (read-only coverage, no sign-up)
- [x] Ad hoc fixes from a live look: Rehearsal Tracks uses the same circle-play icon as the personal Library, hides version status from members; personal Library hides tracks with no practice file wired up instead of listing them as a dead card

**Tasks — Human:**
- [x] Look at the built pages (page-settings grid, Responsibilities tab as member/admin/guest) and confirm the UI reads right — live-app walkthrough done 2026-09-02, including the 2026-09-01/02 Responsibilities rework (chip strip + selected-date panel, datetime-local UTC fix, week stepper, coverage meter)

**Expanded 2026-08-29 (regular rehearsal schedule):** admin-editable "Regular
rehearsals" card on the Info/About tab (day + time), shown read-only to
members/guests. The Responsibilities "Add a date"/"Edit date" forms gain a
"Use next rehearsal" button that computes the next upcoming occurrence entirely
client-side. `check`/`build` clean; the weekday math verified with a standalone
script — not clicked through in an actual browser.

- [x] Human: confirm the "Use next rehearsal" button and the About-tab editor look/behave right in a real browser — confirmed 2026-09-02

### F7 — Weekly Notes tab + guest sign-in banner [x]

Two asks direct from the human: a 6th group page ("Weekly Notes" — dated bulletin
entries admins post, members read, with full history) and a dismissible banner on
`/join/[code]` nudging anonymous guests to sign in. Reuses B12's per-page machinery
exactly.

**Acceptance criteria:**
- [x] Group admin can post/edit/delete dated notes from a new "Weekly Notes" tab; members see them read-only, newest first
- [x] The new page shows up in the admin Settings page-visibility grid
- [x] Guests see a read-only Weekly Notes tab only when the admin opted it into `audience: everyone`
- [x] `/join/[code]` shows a dismissible banner (guests only) pointing at `/login?redirectTo=...`; dismissal doesn't persist (reappears each visit, per the human's call)
- [x] `npm run check`/`build` clean; verified live via Playwright (human was away and explicitly authorized it for this session — not this project's default)

**Tasks — Claude:**
- [x] Backend: `WeeklyNote` model + migration, guest route, mirrors `homework.py`'s shape. 120/120 `pytest`; live curl round trip.
- [x] Frontend: 6th tab, three new actions, guest tab + sign-in banner
- [x] Two real bugs caught live via Playwright, neither would have been caught by type-checking:
  1. Page-visibility toggles visually "reset" after saving — a second, independent cause beyond one a prior session already fixed: `use:enhance`'s default `update()` calls a native `form.reset()`, snapping checkboxes back without going through Svelte's reactivity (the saved data was never wrong, only the display). Fixed with `update({ reset: false })`.
  2. `note_date` displayed a day early in any UTC-behind timezone (local-time formatting on a date-only UTC-midnight value). New `formatNoteDate` pins the display to UTC.
- [x] Local dev fix: `Frontend/.env`'s `PUBLIC_API_BASE_URL` was HTTP while the local Backend is HTTPS-only — fixed to `https://localhost:8000`

### F8 — Spanish localization (`/es`) [x]

At the human's direct request: a full Spanish version of the app under `/es`
(English stays unprefixed), covering every route. Built with Paraglide JS (inlang)
rather than hand-duplicated route files.

**Mechanism:** `project.inlang/settings.json` declares `en` (base, unprefixed) and
`es` (prefixed) locales via `messages/{locale}.json`. `vite.config.ts`'s
`paraglideVitePlugin` generates typed `m.*()` message functions plus `urlPatterns`
mapping every path to its localized form. `src/hooks.ts`'s `reroute` de-localizes
incoming URLs before route matching; `src/hooks.server.ts` composes
`paraglideMiddleware` with the existing session-cookie handle. A `<LanguageSwitcher>`
links between locales via `localizeHref`.

**The real gotcha:** Paraglide does **not** auto-localize plain `<a href>`/`goto()`/
`redirect()` — only inbound URL matching is automatic. `$lib/i18n.ts`'s `lh()`
(a thin `localizeHref` re-export) wraps every internal `href`/`goto`/`redirect` site
across the app so links don't silently drop the `/es` prefix on the next click.

**Acceptance criteria:**
- [x] Every route reachable both unprefixed (English) and under `/es` (Spanish), with correct `<html lang>`/`dir` and translated content
- [x] A language switcher lets a visitor move between locales from any page, preserving the current path
- [x] Every internal navigation stays within the currently-chosen locale — verified live via curl
- [x] `npm run check`/`build` both clean
- [x] Human click-through of the Spanish UI (menus, forms, the player's Practice Setup drawer, a branded 404, language-switcher round-trip) — done 2026-09-02

**Tasks — Claude:**
- [x] Installed `@inlang/paraglide-js`; `project.inlang/settings.json`, `messages/en.json`/`es.json` (~350 keys)
- [x] `vite.config.ts`, `src/hooks.ts` (new, `reroute`), `src/hooks.server.ts` (composed via `sequence()`), `src/app.html`, `tsconfig.json` (`types: ["node"]` — Paraglide's generated `server.js` needs `async_hooks`)
- [x] New `$lib/i18n.ts` (`lh` helper) and `$lib/components/LanguageSwitcher.svelte`
- [x] Every `.svelte`/`+page.server.ts` (~30 route files + shared components) converted to `m.*()` calls, every internal `href`/`goto`/`redirect` wrapped in `lh(...)`
- [x] Deliberately left untranslated: stored/persisted content an admin types (e.g. a homework `range`'s literal default) — translating those would make content language-dependent at write time
- [x] Verified live via curl against both `build` output and `dev`

**Tasks — Human:**
- [x] Click through the Spanish UI for real (forms, the player drawer, error states) — done 2026-09-02

### F9 — Graceful error handling app-wide [x]

At the human's direct request: every error path shows something reasonable instead
of crashing or silently misbehaving. Two threads: (1) no branded `+error.svelte`
existed, so any thrown `error(status, ...)` rendered SvelteKit's bare default page;
(2) a genuine network failure (Backend unreachable) wasn't distinguished from a real
HTTP error at several call sites.

**Mechanism:**
- New root `src/routes/+error.svelte` — branded, localized, status-aware (404/403/401/503/generic)
- `$lib/server/backend.ts`'s `backendFetch` now wraps its `fetchFn(...)` call in try/catch, converting a genuine network failure into the same `BackendApiError` shape a resolved non-2xx response already produces — every existing catch site gets this for free. `$lib/api/guest.ts` got the equivalent (`guestFetch`).
- Every raw `fetch()` call site not already guarded got the same try/catch treatment individually (login, register, reset-password, `uploadTrack`, the guest resolver, both file/pdf proxy routes)
- Deliberately **not** changed: the root `+layout.server.ts`'s fail-open behavior (any `/auth/me` failure quietly resolves to `user: null`). Tried making it throw for non-401 failures first, reverted after realizing this load runs for every route including fully public ones — throwing there would block pages needing no user at all over a transient blip.

**Acceptance criteria:**
- [x] Every thrown `error(status, ...)` renders a branded, localized page instead of SvelteKit's default
- [x] A genuine Backend-unreachable failure shows a friendly, translated message at every call site
- [x] A session survives a transient Backend outage — no forced re-login
- [x] `npm run check`/`build` both clean
- [x] Verified live: registered/logged in, killed the local Backend mid-session, confirmed graceful failure + no false-positive login, confirmed the guest path degrades gracefully in both locales, confirmed a nonexistent group renders the branded 404, restarted the Backend, confirmed the same session cookie resolves normally again

**Tasks — Claude:**
- [x] `src/routes/+error.svelte` (new) + 6 new message keys
- [x] `backendFetch`, `guestFetch` helper
- [x] Guarded every previously-unguarded raw `fetch()`
- [x] Live-verified via curl against the real local dev server + Postgres, including a real Backend-down/recovered cycle

### F10 — Lock down `$lib/pieces/registry.ts`'s bundled pieces [x]

At the human's direct request ("some of them might have restricted privileges... let's
keep challenge of thor the way it's routed as an example, but let's protect the rest
under their owners and invite links"). The real hole: `registry.ts`'s bundled `PIECES`
array held 5 real SFCC choir pieces as static files, fetchable by anyone with zero
auth by direct URL — and `piece/[id]/+page.svelte` checked this bundled registry
*before* the already-correctly-gated Backend `remote` piece, so the Backend-side
gating (member session or guest join code, confirmed still correct) was never even
reached.

**Mechanism:**
- `registry.ts`'s `PIECES` pruned from 7 entries to 2: Lacrymosa (not owned by any real group, kept public per the human's choice) and Challenge of Thor (kept exactly as before, as a worked example of this direct-URL/no-auth path)
- Deleted the other 5 pieces' PDF/MusicXML files from `static/fixtures/SFCC/` outright — pruning the registry alone wasn't enough, since Cloudflare's asset binding serves anything under `static/` regardless of routing. Also deleted an 8th real SFCC piece (`The-Frost-Myth`) that had no registry entry at all but sat in the same public directory.
- No routing/gating logic changed anywhere — once the registry only has 2 entries, everything else falls through to the real gated path automatically
- Found and fixed a real regression this would otherwise have caused: `/`'s personal-library section only ever rendered a piece via a bundled-registry title match, with no `has_music`/`has_pdf` fallback (unlike the group Tracks tab and guest join page). Fixed by building a `Piece` via `remotePiece.ts`'s `buildRemotePiece()` for any library entry with no bundled match.
- The 5 migrated pieces lost their registry `tempoOverrideBPM` (their MusicXML exports carry no tempo data). The Backend's `Piece.default_tempo_bpm` is the real replacement — left for the human to fill in via the Tracks tab (Der Abend 58, Proserpine 80, Les djinns 138, Eglamore 141, The Fay's Song 100, same values as the removed overrides)

**Acceptance criteria:**
- [x] Only Lacrymosa and Challenge of Thor remain reachable with no login and no invite code, by direct URL or otherwise
- [x] The other 5 registry pieces + The Frost Myth have no public static file left to fetch directly
- [x] A group member still sees their group's full distributed repertoire on `/`, `/groups/[id]`, and the player — via the real Backend piece now
- [x] A guest with a valid join code (and group password, if set) still gets the same access as before
- [x] `npm run check`/`build` both clean

**Tasks — Claude:**
- [x] Pruned `registry.ts`'s `PIECES` to Lacrymosa + Challenge of Thor
- [x] Deleted the other 5 pieces' + The Frost Myth's public static files
- [x] Fixed `/`'s personal-library section to fall back to a real Backend piece via `buildRemotePiece()`
- [x] `check`/`build` clean

**Tasks — Human:**
- [ ] Set the 5 migrated pieces' default tempo via the group's Tracks tab (values above) — nothing plays at the wrong tempo until this is done, it just falls back to the player's own default

### F11 — PDF markup: freehand pen + stamps [~]

At the human's direct request, after trying F4's score-position text annotations and
being unimpressed ("The current annotation system is not useless [but] we can
improve on it") — modeled on piaScore's real annotation tool (pens + stamps drawn
directly on the page), not F4's pin-and-sheet approach. **Additive, not a
replacement** — F4's annotations stay as they are.

**Why the PDF pane, not the notation player:** freehand ink only makes sense on a
fixed page image. The OSMD player pane reflows constantly (zoom, display mode,
mute/solo all trigger a full re-render), so a stroke drawn there would drift off
the note it was meant to mark the moment anything changed. The PDF pane's pages
are geometrically stable, so this only works for pieces with an uploaded PDF.

**Mechanism:** points stored as fractions of the page's own rendered *width* for
*both* x and y (not width/height respectively) — keeps a stroke's thickness and a
stamp's size undistorted regardless of the page's aspect ratio, and correctly
positioned across zoom levels with no conversion. An SVG overlay per page
(`viewBox="0 0 1 {aspectRatio}"`) sits on top of each PDF canvas; pointer events on
it draw/erase depending on the active tool.

**Acceptance criteria:**
- [x] A logged-in user viewing a real Backend piece's PDF can draw a freehand pen stroke (color/width choice) directly on the page
- [x] The same user can place one of 6 stamps (breath mark, accent, fermata, staccato, circle, star) at a tap
- [x] An eraser tool removes a stroke/stamp it's dragged over; a separate Undo removes the most recently created mark
- [x] Marks persist per-piece per-page and reappear on reload, personal to their creator only (no sharing — see Backlog for the planned group layer)
- [x] `npm run check`/`build` both clean
- [ ] Human confirms drawing/erasing/undo actually feels right on a touchscreen (built without one) and that a stroke stays visually anchored to its note across zoom

**Tasks — Claude:**
- [x] Backend: `PieceMarkupMark` model + migration, `POST`/`GET /piece-markup`, `DELETE /piece-markup/{id}` (owner-only, personal — no share/unshare, unlike B5's `Annotation`)
- [x] `$lib/api/pieceMarkup.ts`: typed client for the new proxy routes
- [x] `routes/piece/[id]/markup/**`: authenticated proxies, same `locals.token`-server-side pattern as every other piece-scoped route
- [x] `PdfView.svelte`: per-page SVG drawing overlay, pointer-driven stroke capture, tap-to-place stamps, eraser (segment-distance hit-testing), session-local undo stack, a floating toolbar (tool/color/width/stamp pickers)
- [x] `piece/[id]/+page.svelte`: passes `pieceId`/`canMarkup` (same gate as F4's annotations — logged in + a real Backend piece) into `PdfView`

**Tasks — Human:**
- [x] Deploy the Backend — done (prod Neon at head `f9d4c1a7b2e8`); markup saves/loads against prod now
- [ ] Click through pen/stamp/eraser/undo on a real device and confirm it reads right

### F12 — PDF markup: top-level Annotation mode on/off toggle [~]

At the human's direct request, following a first look at F11. Today, `canMarkup`
unconditionally renders both the marks overlay and the floating pen/stamp/eraser
toolbar for a logged-in user on a real Backend piece's PDF — there's no way to get
back to a plain, uncluttered PDF. The per-tool behavior already added in F11 (arming
pen/stamp/eraser hands `touch-action` fully to drawing so a one-finger drag draws
instead of scrolling; deselecting the tool restores `pan-x pan-y`) is correct and
**stays as-is** — this milestone doesn't touch it.

**Scope:** one master toggle, off by default (matching F4's annotate toggle also
defaulting off), that gates the whole markup layer rather than one tool at a time:

- **Off:** no toolbar, no marks rendered, full normal pan/pinch-zoom — same as
  viewing a PDF with no markup feature at all
- **On:** F11's existing toolbar + marks + per-tool draw/pan-disable behavior,
  unchanged

**Acceptance criteria:**
- [x] A logged-in user viewing a real Backend piece's PDF sees an explicit
      Annotation-mode on/off control, off by default each visit (session-local
      state, not persisted — matching F4's `annotateMode`)
- [x] With the mode off: no toolbar, no existing marks drawn on the page, and
      one-finger drag always pans/scrolls the PDF — never arms a tool by accident
- [x] Turning the mode on restores exactly F11's current behavior with no
      regressions: marks visible, toolbar visible, picking pen/stamp/eraser still
      hands pan over to drawing, deselecting still restores it
- [x] Turning the mode back off, mid-tool-selection, clears the armed tool and
      returns to plain full-pan viewing (no stuck `touch-action: none`)
- [x] `npm run check`/`build` both clean
- [ ] Human confirms on a real touchscreen: mode off never accidentally draws,
      mode on behaves exactly like today's F11

**Tasks — Claude:**
- [x] `PdfView.svelte`: new `annotationMode` state (default `false`); gates the
      `marks` overlay render and the floating `.markup-toolbar` on it
- [x] `toggleAnnotationMode()`: flipping off also resets `tool`/`activeStroke`/
      `activeStrokePage`, so no stale armed tool or in-flight stroke survives
      into the next time it's turned back on
- [x] New `.annotation-mode-toggle` floating button, top-left corner (clear of
      `.zoom-controls` bottom-right and `.markup-toolbar` bottom-left, the
      latter only present once the mode is on) — always visible whenever
      `canMarkup`, even while off, so there's a way back in
- [x] `handleMarkupPointerDown` also gates on `annotationMode`, matching the
      template's overlay gate (belt-and-suspenders — the overlay isn't even
      mounted while off, but `tool` is also forced `null` at that point)
- [x] New `messages/en.json`/`es.json` keys (`markup_mode_on`/`markup_mode_off`)
      for the toggle's `aria-label`
- [x] No prop threading needed — `annotationMode` is fully internal to
      `PdfView.svelte`, `piece/[id]/+page.svelte` is unchanged
- [x] `npm run check` (0 errors, pre-existing unrelated warnings only) and
      `npm run build` both clean

**Tasks — Human:**
- [ ] Confirm on a real device that mode-off never lets a stray tap/drag start a
      mark, and mode-on is unchanged from today's F11 behavior

### F13 — Audio-only reference recording, driving the bottom bar in PDF view [~]

At the human's direct request, following up on F12: F5's reference-recording
YouTube link showed as a video, embedded in an always-visible top disclosure,
regardless of which pane (score/PDF) was open — the human wanted it audio-only
and controlled from the same bottom bar the synthesized player already uses.
Clarified scope: the choice belongs specifically to PDF view, between the
synthesized mix and the real reference recording's audio — not a second,
independent player running alongside the existing one.

**Mechanism:** new `$lib/audio/youtubeAudioPlayer.ts` wraps Google's YouTube
IFrame Player API in the same `create()`/`play()`/`pause()`/`seek()`/
`positionMs`/`duration`/`isPlaying` shape `MidiPlayer` already exposes, so
`piece/[id]/+page.svelte`'s bottom bar can treat either as an interchangeable
"whatever `audioSource` currently is." The iframe itself is created but never
shown — parked off-screen (not `display: none`, which risks some browsers
pausing background video decode) so only its audio is ever heard.

**Acceptance criteria:**
- [x] While viewing a real Backend piece's PDF, if it has both a music file
      and a reference recording, an "Audio source" control in Practice Setup
      lets the human pick "My mix" (today's synthesized player) or "Reference
      recording" (the real YouTube audio) — either one drives the same
      play/pause button and scrubber
- [x] That control sits directly under the View section, appearing the moment
      PDF is picked there (both live in the drawer's `viewMode === 'pdf'`
      branch) — not tucked away somewhere unrelated
- [x] Switching source always pauses whichever one is being left, so the two
      are never audible at once
- [x] Leaving the PDF pane always reverts to "My mix" — the reference choice
      only makes sense there, since the notation cursor stays synced to the
      synthesized clock, not a recording
- [x] Picking the reference recording hides the Mix section entirely — a
      per-part balance mixer has nothing to balance against a single audio
      track. Tempo and "Your part" are likewise hidden whenever there's no
      music file at all (a PDF-only piece) — both are meaningless with no
      synthesized clock to apply to
- [x] The Practice Setup gear button is enabled for a PDF-only piece too, not
      just a piece with a music file — this drawer no longer requires a real
      player just to open
- [x] The Audio-source section itself always appears in PDF view as long as
      *some* audio exists for the piece — a piece with no reference recording
      still sees the section, just with "Reference recording" disabled rather
      than the section vanishing outright; a PDF-only piece sees "My mix"
      disabled instead
- [x] A PDF-only piece (no music file) with a reference recording gets a
      working bottom bar too — forced to the reference recording, since
      there's no "mix" to speak of
- [x] A piece with a reference recording but **no PDF at all** keeps the old
      video disclosure unchanged — the new picker has no PDF pane to live in
      for that shape
- [x] `npm run check`/`build` both clean
- [ ] Human confirms in a real browser: switching source mid-playback, a
      PDF-only+reference piece's bottom bar and drawer, and that the reference
      audio is genuinely inaudible-as-video (no visible player, just sound)

**Tasks — Claude:**
- [x] Real bug found live-testing this milestone: `getPieceByTitle()` (F10)
      was preferred unconditionally over a real Backend piece's own content
      everywhere it's used — a track sharing a bundled fixture's title (e.g.
      "Lacrymosa") always played/showed the bundled asset even after an admin
      uploaded their own music file/PDF/YouTube link to it, so this
      milestone's picker looked broken (always disabled) for such a piece.
      Fixed in `/`, the group Tracks tab, and the guest join page: the
      bundled match is now only used when the real piece has neither
      `has_music` nor `has_pdf` of its own
- [x] `$lib/audio/youtubeAudioPlayer.ts` (new): `YoutubeAudioPlayer` class
      wrapping the YouTube IFrame API (loaded as a vendor `<script>`, same
      pattern `audio/player.ts` uses for js-synthesizer) — off-screen host
      element, `extractYoutubeVideoId()` helper for the three URL shapes the
      upload form accepts
- [x] `piece/[id]/+page.svelte`: `audioSource` state (`'mix' | 'reference'`),
      `ensureReferencePlayer()` (lazy — only loads the YouTube API/video once
      `'reference'` is actually reachable), `setAudioSource()`, `tick()`/
      `togglePlay()`/`seek()` all branch on it
- [x] Two `$effect`s: force `audioSource = 'reference'` for a PDF-only piece
      with a reference recording (and preload it, so the scrubber has a real
      duration before the first play tap); lazily create the reference player
      whenever `audioSource` is `'reference'` and it doesn't exist yet —
      guarded on `referencePlayerError` so a failed load doesn't retry in a
      loop (an explicit Play tap still retries deliberately)
- [x] `setViewMode()`: leaving `'pdf'` while `audioSource === 'reference'`
      pauses it and reverts to `'mix'`
- [x] New "Audio source" Practice Setup section, directly under View, shown
      whenever `viewMode === 'pdf' && (hasPlayer || piece?.youtubeUrl)` — a
      segmented picker with each button individually `disabled` for whichever
      source this piece doesn't actually have (`!hasPlayer`/no
      `youtubeUrl`), rather than hiding the whole section
- [x] Practice Setup's gear button enabled for `loadState.kind === 'pdfOnly'`
      too, not just the music-file-driven kinds
- [x] Tempo and "Your part" sections gated on `hasPlayer` (meaningless with no
      synthesized clock); Mix section additionally gated on
      `audioSource !== 'reference'` (meaningless balancing a single audio
      track) — all three used to render unconditionally, harmless before this
      milestone since the drawer was unreachable for any piece they wouldn't
      apply to
- [x] Footer (`bottom-bar`) now also renders for a `pdfOnly` piece that has a
      reference recording, not just the music-file-driven `loadState` kinds
- [x] Old top video disclosure narrowed to `piece?.youtubeUrl && !hasPdfPane`
      (a music file + reference recording, no PDF — the one shape the new
      picker can't cover, since it has no PDF pane to live in)
- [x] New `messages/en.json`/`es.json` keys: `piece_audio_source(_mix|_reference)`,
      `piece_reference_loading`, `piece_reference_unavailable`
- [x] `npm run check` (0 errors, same pre-existing unrelated warnings) and
      `npm run build` both clean

**Tasks — Human:**
- [ ] Confirm in a real browser: source switching, the PDF-only+reference
      bottom bar, and that the reference recording is genuinely audio-only
      (nothing visible, just sound) on a real device

### F20 — Piece Notes panel (frontend for Backend B16, + a personal source) [~]

Backend **B16** (`f08c969`, committed but not yet pushed/deployed) shipped
`PieceRehearsalNote` — a group admin's durable, group-wide reminders pinned
to a piece. It landed with **no frontend at all** and no `F` milestone;
the endpoints existed but nothing in the app called them. This wires it in
as **"Piece Notes"** (the human's preferred name), and sets up a second,
per-member **personal** source alongside the admin one.

**Deliberately plain (per the human, 2026-09-02):** a piece note is just a
short line of text. B16's optional kind / title / page / measure / part
fields are **not** surfaced; they stay at their Backend defaults.

**Two sources, kept visually distinct** (per the human, 2026-09-02):
- **From the director** — group-wide, admin-authored (B16). Members read-only.
  Solid accent left-edge; section label in the accent colour.
- **My notes** — the signed-in member's own private note. Stored as a
  Backend **B5 `Annotation`** with the reserved sentinel position `-1`
  ("not pinned to a spot in the score"), so no new Backend work and it
  syncs across devices. `ScoreView`'s marker layer filters position `-1`
  out (`loadAnnotations` now keeps only `positionWholeNotes >= 0`). Dashed
  muted left-edge; muted section label. Always editable by its owner.

Each note shows its **timestamp** (`formatDateTime` — both sources already
persist `created_at`).

Numbered **F20** on purpose — `F14`–`F19` are the editor milestones now in
`OMR_EDITOR_PLAN.md` (E2–E10), referenced all through that plan's log.

**Where it shows:**
- Piece page (`/piece/[id]`), a collapsible panel under the top bar
  (`PieceNotesPanel`, default `chrome="details"`). Starts **collapsed**
  with a rotating chevron; when open its body is capped at
  `min(45vh, 14rem)` and scrolls, so it never pushes the score/PDF down.
- Group **Rehearsal Tracks** tab (`groups/[id]`), each track card gains an
  expandable "Piece Notes" disclosure (chevron + label) rendering the same
  panel with `chrome="bare"`. Lazy — nothing fetches until a card is
  expanded.

**Layout:** notes flow in a responsive grid (`auto-fill`,
`minmax(min(100%, 15rem), 1fr)`) so they sit side by side when there's
width and stack when narrow. A long body is clamped to 4 lines with a
per-note "Show more" (so one long note can't stretch its row and strand
the short notes beside it); an expanded or editing card spans the full
row. Cards are compact — body, then a footer line with the timestamp and
edit/delete. Adding is a small `+` next to each section heading (no
full-width "Add note" bar). All component classes are `pn-`-prefixed after
a bare `.note` collided with a centered global in `shell.css`.

If the group's Weekly Notes page is disabled for members (B16 gates the
list on `GroupPage.weekly_notes`, 403/404), just the director section is
hidden — the personal section still works.

**Access shape:** director notes — members with Weekly Notes page access
list them, only a group admin writes. Personal notes — any signed-in
member, always their own. No guest path (both sources need a session).

**Acceptance criteria:**
- [x] The piece page shows a "Piece Notes" disclosure for a logged-in user
      viewing a real group-owned Backend piece; a personal piece, a guest,
      or a bundled fixture never shows it
- [x] A group admin can add a director note (one text field), edit it, and
      delete it (click-to-confirm); a non-admin member sees it read-only
- [x] Any signed-in member can add / edit / delete their own personal notes
      on the piece; another member never sees them
- [x] Director vs. personal notes are visually distinct — solid accent edge
      + accent label vs. dashed muted edge + muted label, plus the two
      section headings
- [x] Notes render through the small shared note-markdown renderer; each
      note shows its stored timestamp
- [x] Personal notes never appear as score markers (`ScoreView` filters
      position `-1`)
- [x] On the player the panel body is height-capped and scrolls
- [x] The Rehearsal Tracks tab lets you expand any track card to read (and
      manage) that piece's notes without opening the player; nothing fetches
      until expand
- [x] The director section degrades quietly on a 403/404; the personal
      section keeps working
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 107 green
- [ ] Human clicks through it in a real browser (admin + plain member, both
      surfaces, both notes kinds), against a local Backend with B16

**Tasks — Claude:**
- [x] `$lib/api/pieceNotes.ts` — typed client, two sources: `group` (B16
      `rehearsal-notes` proxy) and `personal` (B5 `annotations` proxy with
      the reserved position `-1`). `{ body }` in/out; `PieceNoteSource`
      discriminator on the returned `PieceNote`
- [x] `routes/piece/[id]/notes/{,[noteId]}/+server.ts` — authenticated
      proxies onto B16's `rehearsal-notes` endpoints (the personal source
      reuses the existing `annotations` proxies unchanged)
- [x] `RemotePieceMeta.groupId` added; `resolve/+server.ts` populates it and
      a `canManagePieceNotes` flag (admin of the owning group)
- [x] `PieceNotesPanel.svelte` — `chrome` prop (`'details'` | `'bare'`),
      two sections with distinct edges/labels, per-note `formatDateTime`
      timestamp, `42vh` scroll cap in `details` mode, `ConfirmButton`
      delete, `renderNoteMarkdown` body, section-aware edit/add state
- [x] `piece/[id]/+page.svelte` — mounts the panel under the top bar;
      `loadAnnotations` filters to `positionWholeNotes >= 0` so personal
      notes aren't drawn as score markers
- [x] `groups/[id]/+page.svelte` — track card restructured to a column
      (`.track-card-row` + a `<Disclosure variant="inline">`; 2026-09-02
      cleanup replaced the hand-rolled `.track-notes` `<details>`);
      lazy-mounts the panel on expand
- [x] en/es keys (`piece_notes_*`)

**Tasks — Human:**
- [ ] With B16 available locally: on the piece page and on a track card, as
      an admin add a couple of director notes and a couple of personal
      notes, edit/delete one of each, confirm the timestamps and the
      visual distinction; then as a plain member confirm the director notes
      are read-only and personal notes are their own. Check `/` and `/es`,
      and that the player panel scrolls rather than shoving the score down.

**Expanded 2026-09-02 (guest access to director notes) — built 2026-09-02,
not deployed.** From a guest-vs-member screenshot: guest Rehearsal Tracks
cards had no Piece Notes disclosure at all, while member cards do. Guests
now get the same disclosure with the **From the director** section,
read-only, and the **My notes** section fully omitted (no `+`, no "no notes
yet" line) — a guest has no session for per-member B5 annotations. Same on
the guest piece page: there is no `/join/[code]/piece/[id]` route — the
guest player is `/piece/[id]?guest=1&code=<code>`, so the panel mounts
there in the same `{#if remoteMeta}` block as the member mount.
- [x] `listGuestPieceRehearsalNotes(code, pieceId, { password })` in
  `$lib/api/guest.ts` + a `listGuestGroupNotes` adapter in
  `$lib/api/pieceNotes.ts` that shapes the result as `PieceNote`s
  (`source: 'group'`). Gated Backend-side on the group's `tracks` page
  being `audience: everyone`.
- [x] `PieceNotesPanel` gains a `directorLoader` prop: read-only,
  director-only mode (no add / edit / delete, no My-notes section),
  sourced from the loader not the authenticated client. Mounted on the
  guest track cards (`join/[code]/+page.svelte`, lazy on `<Disclosure>`
  expand) and the guest piece page.
- [x] en/es keys: none new (all reused).
- [ ] Human: guest browser pass — director notes visible + read-only on a
  public-Tracks group, absent otherwise.

### F21 — Group markup layer (frontend for Backend B17) [ ]

Frontend for B17's group-owned markup `scope`. Replaces the stale "F11
fast-follow — group-published markup layer" Backlog item, redesigned: no
publish step, the group layer is shared and any owning-group admin
co-edits it; members see it read-only.

**Restructures F11/F12's visibility control.** Today the PDF markup
"Annotation visibility" segmented picker in Practice Setup is None / Mine /
Group and is *exclusive* — you can't show your own marks and a shared
layer at once, which this needs. And its "Group" option currently loads
*every member's* personal marks (the B17 note explains why that's wrong).

**New shape:**
- Two **independent, session-local** toggles in Practice Setup (PDF view),
  both default off: **Show my markup**, **Show director markup**. Additive.
- The floating pencil (F12 annotation mode) stays. Arming it turns on
  "Show my markup" if it was off.
- When annotation mode is on **and** the user is an admin of the owning
  group, a **Drawing into: My markup / Director markup** segmented control
  appears, defaulting to **My markup** (so an admin never scribbles on the
  shared layer by accident).
- While the draw target is **Director markup**, a **persistent, always-
  visible reminder** (a coloured bar / pill near the toolbar, not a
  dismissible toast) states that edits go to the shared group layer that
  everyone sees. It stays up the whole time that target is active.
- Group-layer marks render in F20's director treatment (muted / dashed
  edge), non-interactive for a member; interactive only for an admin whose
  draw target is Director markup.

**Acceptance criteria:**
- [x] A member on a real group-owned piece's PDF can turn on "Show director
      markup" and see the shared layer read-only, on top of / beside their
      own marks, both toggles working independently
- [x] An owning-group admin can pick "Director markup" as the draw target
      and add / move / edit / delete marks in the shared layer, including
      marks another admin made
- [x] The persistent "editing the shared layer" reminder is visible the
      entire time the draw target is Director markup, and gone otherwise
- [x] A non-admin never sees the draw-target control or a way to write the
      group layer; a personal piece never shows "Show director markup"
- [x] `npm run check` / `npm run build` clean; vitest green
- [ ] Human confirms on a real touchscreen: the two toggles, the admin
      draw-target switch + reminder, and that a member can't edit the
      shared layer

**Tasks — Claude:**
- [x] `$lib/api/pieceMarkup.ts`: `scope` on create; keep `listMarks(pieceId,
      scope)`; drop the dead `MarkupScope = 'mine' | 'group'` exclusivity
      assumptions where they leak into the UI
- [x] `routes/piece/[id]/markup/**`: thread `scope` on POST
- [x] `pdfMarkup.svelte.ts` / `PdfView.svelte` / `PdfMarkupPanel.svelte`:
      replace `markupVisibility` (`none|mine|group`) with `showMine` /
      `showDirector` booleans + `drawTarget` (`mine|director`); load both
      mark sets when their toggle is on; gate `drawTarget` on
      `isOwningGroupAdmin`
- [x] Persistent draw-target reminder element
- [x] `resolve/+server.ts`: generalize F20's `canManagePieceNotes` to an
      `isOwningGroupAdmin` flag (or add alongside) for the piece route
- [x] en/es keys for the toggles, the draw-target control, the reminder
- [x] vitest for the new load/permission branches where practical

**Tasks — Human:**
- [ ] Touchscreen pass per the last acceptance box, against a Backend with
      B17 (needs `main` pushed so B17's migration is live, then a Frontend
      redeploy)

**Built 2026-09-02 (`e75f79c`, not deployed).** `npm run check` 0 errors,
`build` clean, `vitest run` 70 passed. `markupVisibility` replaced by
`showMine` / `showDirector` / `drawTarget`; new pure `markInteractivity` /
`scopeForDrawTarget` helpers (unit-tested); persistent reminder + the
draw-target segmented live in `PdfMarkupPanel`; `resolve/+server.ts`
returns `isOwningGroupAdmin` (alias of `canManagePieceNotes`, so F20 is
untouched). A hidden layer's marks stay in memory and re-show on toggle
with no refetch.

### F22 — PDF cue points: tap to jump the reference recording (frontend for Backend B18) [x]

At the human's request (2026-09-02): while viewing a PDF with a reference
recording, drop "play from here" markers on the page that seek the
reference audio to a timestamp. Different from the score-view cursor (that
is auto-synced to the synth clock); a PDF has no timing, so each cue is a
hand-placed anchor. Depends on **B18** (the `time_ms` column + `kind='cue'`)
and **F21** (scopes, draw-target). Reference-recording-only: a cue's
timestamp is meaningless against "My mix".

**Shape:**
- A **cue** tool in the markup toolbar, Director-layer only: present only
  when the piece has a reference recording (`youtubeUrl`), the audio source
  is the reference, the caller is an owning-group admin, **and** the draw
  target is Director. On "mine" the button is simply hidden (no
  auto-switch). Armed + tap the page = drop a cue at `(page, x, y)`
  capturing the reference player's current `positionMs`, always saved with
  `scope='group'`.
- Render: a small ▶-in-circle at the cue's `(page, x, y)`. **Always visible**
  in PDF view whenever the audio source is the reference recording, for every
  viewer (logged-in members and not-logged-in join-link guests), independent
  of the "Show director markup" toggle. Hidden under "My mix" and in score
  view (a cue's timestamp is meaningless there).
- **Tap a cue** (no annotation mode needed) → the reference player
  `seek(time_ms)` then `play()`. Unchanged for everyone.
- **Edit** a cue's time (mm:ss field) or delete it → needs annotation mode
  + owning-group admin + draw target = Director (F21 group-mark rules).
  Personal cues are no longer a thing on the frontend.

**Built 2026-09-02, not deployed.** Tightened same day at the human's
request: the cue tool is Director-layer only. `cuePlacementAllowed()` in
`pdfMarkupController` gates the toolbar button (via the `canPlaceCue`
getter), `placeCue`, and clears a stuck `tool === 'cue'` from
`setDrawTarget('mine')` / `syncAnnotationModeWithVisibility`. The
`scopeForDrawTarget` / `markInteractivity` pure helpers were left as-is
(a group cue's re-time/delete gate was already admin + annotation mode +
Director). `check` 0 errors, `build` clean, `vitest run` 79 passed. New
controller deps `getReferencePositionMs` /
`canPlaceCue` / `audioSourceIsReference` / `onCueTap`, threaded
`piece/[id]/+page.svelte` -> `PdfView` -> `createPdfMarkupController`. A
null reference playhead saves the cue at `0` (editable afterward) rather
than blocking placement. The cue edit-time UI (an `m:ss` text input + a
delete `×`) lives in `PdfMarkupPanel`'s toolbar, shown only while a cue is
selected in annotation mode and editable by the caller. Cue glyphs opt
back into pointer events (`.cue-mark { pointer-events: auto }`) so a tap
jumps the recording even with annotation mode off. `marksForPage` filters
out cues whenever the audio source isn't the reference recording. The
`markup/**` proxy routes already pass the body through generically, so
`time_ms` flows both ways with no change there.

**Always-visible cues + guest path — 2026-09-03 (human's request).** Cue
glyphs previously only rendered when a viewer manually enabled "Show
director markup" (per-viewer, default off, and unavailable to guests).
Now they render for everyone whenever the bottom-bar audio source is the
reference recording, decoupled from the toggle. A new controller dep
`cueLoader` returns a loader fn (real group piece + reference recording,
member or guest) or `null` (fixture / no reference recording);
`syncCues` loads the cue subset of the group layer into `marks` once,
independent of `syncMarksForVisibility` (which stays gated on
`canMarkup`). `marksForPage`'s per-mark rule moved to a pure
`markVisibleOnPage(mark, {showMine, showDirector, showCues})` helper
(unit-tested): a `cue` is gated only by `showCues`, every other kind
still follows its layer toggle. `PdfMarkupLayer` mounts its SVG when
`markup.cuesVisible` even for a cue-only viewer where `canMarkup` is
false. Editing cues is unchanged (owning-group admin + annotation mode +
Director draw target). Director pen/stamp/text ink is untouched: still
behind the toggle, still members-only. Guests read cues via a new
Backend `GET /guest/{join_code}/pieces/{piece_id}/cues` (cue-only,
`tracks` page enabled + `audience == everyone`, mirrors the guest
rehearsal-notes route); `piece/[id]/markup/+server.ts`'s GET gained a
guest branch (`?code=` + `scope=group`, guest token injected server-side)
matching `notes/+server.ts`. New client fn `listGroupCues(pieceId,
guestCode?)`. `check`/`build` clean, vitest 82.

**Acceptance criteria:**
- [x] On a real group-owned piece's PDF with a reference recording, an
      owning-group admin with draw target = Director can drop a cue
      (`scope='group'`) and tapping it jumps + plays the reference audio
      from that point; the button is hidden on "mine" and for non-admins
- [x] Members / guests tap group cues read-only, can't create/edit
- [x] Cue glyphs render for every viewer (members + not-logged-in join-link
      guests) whenever the audio source is the reference recording,
      independent of the "Show director markup" toggle; guests read them via
      `GET /guest/{code}/pieces/{id}/cues` (cue-only). Director pen/stamp/text
      ink stays behind the toggle and members-only
- [x] Cues are hidden when the audio source is "My mix" and in score view
- [x] Editing a cue's time (mm:ss) requires annotation mode; the value
      round-trips
- [x] `npm run check` / `npm run build` clean; vitest green
- [ ] Human touchscreen pass: as an owning-group admin drop Director cues,
      tap to jump, edit a time, confirm the button is gone on "mine" and
      the cues vanish under "My mix"

**Tasks — Claude:**
- [x] `$lib/api/pieceMarkup.ts`: `kind: 'cue'`, `timeMs` field, carried on
      create (`createCue`); `MarkupMarkPatch.timeMs` -> `time_ms`.
- [x] `routes/piece/[id]/markup/**`: `time_ms` passes through the generic
      proxy body in both directions, no code change needed.
- [x] Cue tool in `PdfMarkupPanel`, gated on `canPlaceCue()` = reference
      recording is the audio source **and** owning-group admin **and** draw
      target = Director; captures the reference player's `positionMs` on
      place.
- [x] `PdfMarkupLayer`: renders the ▶-in-circle glyph; tap handler routes
      to `onCueTap` (a callback from `piece/[id]/+page.svelte`, which owns
      the reference player) for a seek + play.
- [x] Edit-time UI (mm:ss `msToMinSec` / `parseMinSec` helpers, unit-tested).
- [x] en/es keys: `markup_tool_cue`, `markup_cue_jump`, `markup_cue_hint`,
      `markup_cue_time_label`, `markup_cue_time_placeholder`.
- [x] vitest for the format helpers + cue interactivity gating.
- [x] 2026-09-03: always-visible cues + guest path. `cueLoader` dep +
      `syncCues` in `pdfMarkup.svelte.ts`; `markVisibleOnPage` pure helper
      (cue gated only on `showCues`); `PdfMarkupLayer` mounts on
      `markup.cuesVisible`; `listGroupCues` + the `markup/+server.ts` GET
      guest branch; `cueLoader` wired `piece/[id]/+page.svelte` -> `PdfView`.
      vitest +3 for `markVisibleOnPage`.

**Tasks — Human:**
- [ ] Touchscreen pass per the last acceptance box (now also: open the piece
      as a plain member with "Show director markup" off, and as a join-link
      guest, and confirm cue glyphs still show + jump when the reference
      recording is the audio source).

### F23 Local profile + "Save across devices" (frontend for Backend B19) [ ]

*Superseded in part by F25 (2026-09-11, frontend for Backend B21): the
"Save across devices" PIN form described below (Settings, the
name+PIN section) is gone — dropped entirely, no fast-follow. Everything
else here — the local profile itself, the lazy name prompt, the one-time
post-signup banner, the roster badge — stands unchanged; F25 replaces
*how* a returning guest reconnects on a new device (typing the same name,
not a credential) and trims the Settings copy accordingly.*

The account barrier a singer actually hits: they open a join link, can
already play and read everything, then try to save an annotation, check off
homework, or sign up for a responsibility slot, and get bounced to
register. Brainstormed with the human 2026-09-09. Fix: everyone gets a
local profile from the first visit with no prompt, and "Save across
devices" (Settings) is how that becomes a real cross-device account.
Backend counterpart: B19. The conductor authoring path is out of scope
(still a full account).

**Shape:**
- On first visit, generate a local profile: `{ localId (uuid), displayName
  (empty) }` in localStorage. Annotation / homework state and prefs live in
  the client store guests already use; this gives them an owner key and
  makes them durable per device.
- `displayName` is prompted lazily, only at the first action other people
  see (a responsibility signup, or landing on a roster), never up front.
- A shared action sends `localId` to the Backend, which mints the shadow
  participant (B19) and sets its device cookie. Purely local actions
  (annotations, homework checkmarks) never hit the Backend and need no name.
- Settings drawer gains a **Save across devices** section: "You're only on
  this device." plus a Save action. Save = set a name + PIN (email magic
  link is the planned second method; Google was considered and dropped
  2026-09-09), then push the local annotation / homework state up. From
  then on the device is a normal logged-in session.
- One dismissible banner, shown once after the first responsibility signup
  (not on every page, not a modal), linking to that Settings section:
  until they Save, a cache clear wipes their name, annotations, and
  homework progress.

**Two things to confirm at build time:**
1. Where the local annotation / homework store lives today and whether it
   already survives a reload (localStorage vs. in-memory). If in-memory,
   that move is part of this milestone.
   **Resolved 2026-09-09:** there is no guest annotation / homework *write*
   store. Annotations are Backend-only and gated on `canAnnotate`
   (logged-in members); guest homework and PDF markup are read-only views.
   The client stores a guest does touch (`playerDefaults`, per-piece
   `player/persistence`) are already `localStorage`-backed and already
   survive a reload. So nothing in-memory needed migrating; `localProfile`
   just contributes the `localId` owner key for a future guest write path.
2. PIN input UX (length, numeric-only) and whether "name + PIN" reads
   clearly as a credential to a non-technical singer or needs a one-line
   "so you can sign back in on your phone" explanation.
   **Resolved 2026-09-09:** PIN field is `inputmode="numeric"`
   `pattern="[0-9]*"` `minlength=4` `maxlength=8`, client-validated against
   `/^[0-9]{4,8}$/` (matches the Backend's 422 rule), submit disabled until
   valid. Copy spells out the credential: section lead "You're only on this
   device. Add a name and a PIN so you can sign back in on your phone or
   another browser…" plus a help line "4 to 8 digits. You'll enter your
   name and this PIN to sign back in on another device, so pick something
   you'll remember." Final wording still open for the human's browser pass.

**Acceptance criteria:**
- [ ] A brand-new visitor with no session gets a local profile silently;
  annotations and homework checkmarks they make survive a page reload on
  that device with no account.
- [ ] The first responsibility signup prompts for a display name, then
  completes; the name is reused for later shared actions without re-asking.
- [ ] Settings shows "Save across devices" for a local-only profile; after
  Save via the PIN path, the same local annotations / homework are readable
  on a second browser after signing in there with the same name + PIN.
- [ ] The "you're only on this device" banner appears once after the first
  signup, is dismissible, and does not reappear once dismissed or once the
  profile is Saved.
- [ ] A profile that has already been Saved shows a normal account section
  in Settings, not the Save prompt.
- [ ] A shared action on a `min_identity = saved` page surfaces B19's
  "Save your account first" as an inline prompt to Save, not a generic
  failure.
- [x] `npm run check` / `npm run build` clean; vitest green. (`check` 0
  errors, `build` clean, vitest 114 — 2026-09-09.)
- [x] Confirmed 2026-09-11 by Claude, real browser (headless Chromium via
  Playwright, not a human/phone pass): a local docker-compose Backend +
  `npm run dev`, two separate browser contexts simulating two devices.
  Lazy name prompt on first signup, the one-time banner, Save via PIN
  (promote in place), and a second device signing up + saving with the
  *same* name+PIN correctly merging into the first (verified against the
  API, not just the UI: the second device's signup repointed to the
  merged account, its anonymous row deleted). `min_identity = saved` also
  confirmed: a fresh guest's signup attempt surfaced the inline "needs a
  saved account" prompt, reads stayed unaffected. No console/page errors.
  Still open: an actual human pass on a real phone/second physical
  browser (touch input, real network conditions).

**Tasks — Claude:**
- [x] `$lib/localProfile.ts` (plain `.ts`, `svelte/store`-backed like
  `theme.ts` so it stays unit-testable): `localId` + `displayName` +
  `saved`/`signedUp`/`bannerDismissed` flags in `localStorage`
  (`divisi:localProfile`), `setDisplayName`, `ensureLocalId`, `needsName`,
  `shouldShowSignupBanner`, and the mutators, plus pure `parseStoredProfile`.
- [x] Persist the guest annotation / homework store to localStorage keyed
  by `localId` (confirm-at-build item 1). **Finding: there is no guest
  annotation / homework write store to migrate.** Annotations are
  Backend-only and members-only (`canAnnotate`); guest homework and PDF
  markup are read-only. The stores a guest actually uses today
  (`playerDefaults`, per-piece `player/persistence`) are already
  `localStorage`-backed and already survive a reload. Nothing in-memory
  needed moving; the local profile just adds the owner key for when a
  guest write path is built.
- [x] Thread `localId` onto the responsibility self-signup call; add the
  lazy name-prompt step in that flow. New guest signup UI on the
  `/join/[code]` Responsibilities tab (per-role "Sign me up" in
  `ResponsibilityDateCard`'s `roleExtra` slot) → new proxy
  `POST /join/[code]/responsibilities/signups` that mints via B19 and
  threads the `divisi_participant` cookie first-party
  (`$lib/server/participantSession.ts`). Name prompted only when
  `needsName`, then reused silently.
- [x] Settings drawer: "Save across devices" section, name + PIN form
  calling B19's `POST /auth/save` via `/settings?/saveAcrossDevices`
  (forwards the participant cookie, stores the returned bearer token as
  the session, retires the participant cookie).
- [x] On Save, upload the local annotation / homework state (B19 owns the
  merge); on success store the returned session token and drop the local
  profile's "unsaved" state. (Token stored + `markProfileSaved()` +
  `invalidateAll()`; no local write store to push — B19's
  `merge_participant` folds the anon row's server-side annotations /
  signups.)
- [x] The one-time post-signup banner (persist "dismissed" + "saved" flags
  in the same local store).
- [x] Roster / member list: render B19's unverified badge for anonymous
  participants (`MembersTab.svelte`, `GroupMemberOut.is_anonymous`).
- [x] Handle B19's "this page needs a saved account" error on a gated
  shared action as an inline Save prompt (proxy maps the `SAVE_REQUIRED:`
  403 to `{ error: 'save-required' }`; the tab shows an inline "needs a
  saved account" line linking to the Settings Save section).
- [x] en / es keys for the name prompt, the Save section, the banner, the
  badge, the gated-action prompt.
- [x] vitest for the local-profile lifecycle and the `needsName` / gating
  branches (`localProfile.test.ts`, `server/participantSession.test.ts`;
  +32 tests).

**Tasks — Human:**
- [ ] Real-browser pass per the last acceptance box.
- [ ] Decide the PIN UX details (confirm-at-build item 2).

### F24 Guest chrome cleanup + demo "Preview Admin" entry point [x] (human real-browser pass against the deployed demo still pending)

Two asks from the human 2026-09-11 while reviewing the B19/F23 local
walkthrough, bundled since both touch the guest join page's chrome:

1. **Hide the "browsing as a guest" banner.** Done (`0e47174`): removed
   the on-page card entirely. `SettingsDrawer.svelte` already carried the
   same ground for a guest (`settings_guest_note` plus Save across
   devices / Log in / Create account, built for F23) — the banner was a
   second, louder copy of it. The gear icon into Settings is the one way
   in now.
2. **Let the public demo show what Admin looks like, without writing
   anything to the Backend.** Backend half is B20 (built, not deployed):
   `GET /guest/{code}/admin-preview` mints a real session for the demo's
   actual admin account, but a process-wide middleware rejects every
   non-GET request that session makes. No mock admin UI needed on this
   side either — the existing `/groups/[id]` admin screens render as-is
   once the session is set; a failed write just needs to read clearly
   given the Backend's `PREVIEW_READ_ONLY:`-prefixed 403 (most of this
   codebase's actions already forward `BackendApiError.message` straight
   into their visible error slot, so this should mostly show up for free).
   Scoped to the demo group only (confirmed with the human) — a real
   conductor's group never offers this.

**Shape (Preview Admin half):**
- `GuestGroupOut.adminPreviewAvailable` (via `resolve join code` /
  `join/[code]/data`) says whether the group currently being viewed is
  the demo. Thread it into a small store (e.g. `$lib/demoPreview.ts`) the
  globally-mounted `SettingsDrawer` can read, set/cleared by the join
  page as that data resolves.
- Settings drawer, guest section: when the store says the current guest
  group offers it, a distinct "Preview Admin" block (short explainer —
  "See what the conductor's view looks like. Nothing you do here is
  saved." — plus a button), separate from the Save-across-devices form.
- New proxy route (e.g. `/join/[code]/admin-preview/+server.ts`): calls
  the Backend endpoint, gets `{ access_token, group_id }`
  (`AdminPreviewOut`), sets the *normal* session cookie
  (`$lib/server/session.ts`, same as `/auth/save` and the OAuth callback
  do) plus a plain first-party marker cookie (e.g. `divisi_demo_preview`,
  value = the join code, not httpOnly — the app reads it, not just the
  server) so the rest of the app can tell this session apart from a real
  login. Frontend then navigates to `/groups/{group_id}`.
- `hooks.server.ts`: read that marker cookie into `event.locals` alongside
  the existing token resolution, threaded down through the root
  `+layout.server.ts` into `PageData`.
- A slim, persistent, dismiss-proof banner (root layout, only when the
  marker is set): "Demo preview: read-only, nothing you do here is
  saved." plus an "Exit preview" action that clears both cookies and
  redirects to `/join/{code}` (the code comes back out of the marker
  cookie's value).
- Spot-check (not a rebuild) that a `PREVIEW_READ_ONLY:` 403 reads
  acceptably on the highest-visibility admin actions: creating homework,
  a responsibilities admin action (lock/assign), and the group
  page-settings toggle. Patch only the ones where the existing error
  display swallows or mangles the Backend's message.

**Acceptance criteria:**
- [x] The on-page "browsing as a guest" banner is gone from `/join/[code]`;
  Settings still offers Sign in / Create account / Save across devices
  for a guest.
- [x] Settings offers "Preview Admin" only when viewing the one guest
  group the Backend flags as the demo; never for any other group.
- [x] Clicking it lands on that group's real `/groups/{id}` admin view,
  fully populated, indistinguishable from a real admin session for every
  read.
- [x] A persistent banner makes clear this is a read-only preview, with a
  working "Exit preview" back to the guest join page.
- [x] Attempting any write (create/edit/delete anywhere in the admin
  view) fails with a legible message, not a silent no-op or a raw/ugly
  error, and nothing it attempted actually changed (spot-checked against
  the Backend directly, not just "the UI didn't complain").
- [x] `npm run check` / `npm run build` clean; vitest green.
- [ ] Human confirms in a real browser against the deployed demo once
  `DEMO_JOIN_CODE` is set on Render.

**Tasks — Claude:**
- [x] Remove the on-page guest banner, its state, and the two orphaned
  message keys.
- [x] `adminPreviewAvailable` plumbed from the guest data fan-out into a
  small store; Settings drawer's "Preview Admin" block, gated on it.
- [x] `/join/[code]/admin-preview` proxy route: mints the session +
  marker cookie, returns the `group_id` to navigate to.
- [x] `hooks.server.ts` / root `+layout.server.ts`: surface the preview
  marker as `PageData`.
- [x] Persistent preview banner + "Exit preview" action (clears both
  cookies, redirects to `/join/{code}`).
- [x] en / es keys for the explainer, the button, the banner, and "Exit
  preview".
- [x] vitest for the store's gating logic and the marker-cookie
  read/clear helpers.
- [x] Spot-check the three admin flows named above against a locally
  seeded demo-shaped group; patch only where the error display needs it.

**Tasks — Human:**
- [ ] Once satisfied, set `DEMO_JOIN_CODE` on Render (see
  `Backend/plan.md`'s B20) and do a real-browser pass against the live
  demo.

### F25 Drop "Save across devices" PIN form, add "is this you?" name-match reconnect (frontend for Backend B21) [x]

Frontend counterpart to Backend B21, decided with the human 2026-09-11: no
real user has ever hit F23's PIN "Save across devices" form, and a group's
join code is already the real gatekeeper, so a typed-name match against
another guest already in that same group is enough friction on its own.
Drops the PIN mechanism entirely rather than reworking it.

**Shape:**
- Settings drawer's guest-state Account section loses the entire name+PIN
  form (state, effect, markup) and shrinks to one line — this device's
  guest identity is local, and joining the same group again elsewhere with
  the same name will offer to reconnect it — plus the unchanged "Create an
  account" / "Log in" buttons. Directly addresses the earlier "this seems
  like too much" feedback on this section.
- The join page's lazy name prompt (`confirmName`, right after a visitor
  types their name for the first shared action) now also calls the new
  `GET /join/[code]/name-matches?name=...` proxy before firing the signup.
  A hit shows an inline "is this you?" step — each candidate by the typed
  name plus its `title` if set else its joined date (mirrors
  `MembersTab.svelte`'s `member.title` convention) — with a "that's not
  me" decline. Confirming threads `claimUserId` into the signup call so
  the Backend folds this device into that existing guest row
  (`merge_participant`, re-validated server-side) instead of minting a
  duplicate; declining (or no match at all) proceeds exactly as before.
  Only checked once, at the first name entry — later signups from the same
  browser already resolve to the right row via the participant cookie.
- `localProfile.ts` drops `saved`/`markProfileSaved()` — there is no
  longer a distinct client-side "saved" state to track. A real
  cross-device account is a separate, ordinary registration, already
  reflected server-side by `user` being non-null after `/auth/me`.
- The one-time post-signup banner keeps its shape (still gated on
  `signedUp && !bannerDismissed`) but drops its "Save across devices"
  button and copy — dismiss is now its only action.
- The `min_identity = saved` inline prompt (unrelated B12/B19 mechanism,
  untouched by B21 itself) now points at registering a real account
  (`settings_create_account`) instead of opening a Settings Save form that
  no longer exists.

**Acceptance criteria:**
- [x] No PIN form anywhere in the UI; Settings' guest-state Account
  section is materially shorter than before.
- [x] A guest typing a name that matches another guest already in that
  specific group is offered "is this you?"; confirming reconnects to that
  row (verified against the Backend: the signup lands on the matched
  user id, the freshly-minted row is gone).
- [x] A brand-new name (or a declined match) signs up exactly as before,
  unaffected.
- [x] `npm run check` / vitest green.

**Tasks — Claude:**
- [x] `localProfile.ts`: removed `saved` from `LocalProfile`,
  `markProfileSaved()`, and `saved`'s part of `shouldShowSignupBanner`;
  `parseStoredProfile` now just drops a stale pre-B21 `saved` field rather
  than surfacing it. `localProfile.test.ts` updated to match.
- [x] `SettingsDrawer.svelte`: removed the `saveName`/`savePin`/
  `savingProfile`/`saveError`/`savePinValid` state, the name-prefill
  `$effect`, and the whole PIN form; guest-state section now just
  `settings_guest_local_note` + the existing account buttons.
- [x] `settings/+page.server.ts`: removed the `saveAcrossDevices` action
  and its now-unused imports.
- [x] New `join/[code]/name-matches/+server.ts` proxy (thin pass-through,
  no cookie involved — mirrors `responsibilities/signups/+server.ts`'s
  `{ ok, ... }` verdict convention).
- [x] `join/[code]/responsibilities/signups/+server.ts`: threads an
  optional `claimUserId` through to the Backend's `claim_user_id`.
- [x] `join/[code]/+page.svelte`: `confirmName` now checks name-matches
  before signing up; new `matchKey`/`matchCandidates`/`pendingSignup`
  state and `confirmMatch`/`declineMatch` handlers; the one-time banner
  and the `min_identity = saved` prompt both stopped referencing the
  removed Save flow.
- [x] en / es: removed `save_action`, `save_only_this_device`,
  `save_name_label`, `save_pin_label`, `save_pin_help`, `save_pin_invalid`,
  `save_done_note`, `save_failed`, `save_enter_name`; added
  `settings_guest_local_note`, `name_match_title`, `name_match_joined`,
  `name_match_confirm`, `name_match_decline`; reworded
  `local_only_banner_body`.
- [x] `npm run check` (0 errors) and vitest (125 passed) both green.

**Tasks — Human:**
- [ ] None.

### F27 — Pages tab: custom group pages foundation (frontend for Backend B23) [x]

Frontend half of B23. Adds a "Pages" tab to the group shell
(`src/routes/groups/[id]/+page.svelte`'s `tabsInOrder`), gated the same
way `responsibilities`/`weeklyNotes` already are — an enabled flag off
`data`, not just a conditionally-imported component.

**Acceptance criteria:**
- [ ] Members see a "Pages" tab listing published custom pages the group
  currently has (empty state when there are none — most groups won't
  have any until F28/carpool ships). **Caveat, see deviations below:**
  the tab and its empty state are wired correctly, but a real (non-admin)
  member can't populate that list yet, since the Backend has no
  member-facing "list" route.
- [x] Admins additionally see drafts, and a "Create page" flow: for now
  the template picker offers exactly one option (Carpool board), plus
  title, visibility (audience/min_identity), and publish/unpublish/
  archive controls — same UI language as the existing group page-
  settings grid (F6), not a new pattern.
- [ ] Guests see published `audience=everyone` pages under the same join
  flow as other guest-visible pages. **Caveat, see deviations below:**
  built as a direct by-slug route instead, since there's no guest list
  route either.
- [x] A read-only page renderer exists but is functionally empty until
  F28 gives `carpool_board` real content — this milestone just needs it
  to render something sane (title + an empty state).
- [x] i18n keys added for every new string, Spanish included (F8).
- [x] `npm run check` / `npm run build` clean; vitest green.

**Tasks — Claude:**
- [x] Add `pages` to the group tab set + nav, gated on whether the group
  has any custom pages to show for the current viewer.
- [x] Admin page list + create-from-template flow (one template option).
- [x] Visibility controls (audience/min_identity), reusing the existing
  group page-settings component rather than a new one.
- [x] Read-only page renderer shell for `carpool_board` (empty state only).
- [x] Guest page route/rendering.
- [x] i18n keys, `/es` included.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-11.** `PagesTab.svelte` (admin create/edit/publish/
unpublish/archive/delete, member/guest read-only list), `CustomPageView.svelte`
(the shared `carpool_board` renderer shell), `actions/customPages.ts`, and
by-slug view routes at `groups/[id]/pages/[slug]` (member, bypassed for
admins same as the Backend's own gate) and `join/[code]/pages/[slug]`
(guest). `+page.server.ts` fetches the admin management list
(`GET .../custom-pages`) for everyone via the existing `fetchPageOrDisabled`
helper, same as `weeklyNotes`/`responsibilities`: it 200s with every status
for an admin and 403s (folded into an empty list) for anyone else.

**Deviations from the spec above:** B23's own admin-only `GET
.../custom-pages` is the *only* list route that exists, there's no
member- or guest-facing "list every published custom page" route, only
the by-slug reads (`GET /groups/{id}/pages/{slug}` and `GET
/guest/{code}/pages/{slug}`), per that route module's own comment ("a
member reaches a specific page by its slug, e.g. from a link an admin
shares"). Two consequences, both flagged as caveats above rather than
silently glossed over:
- A real (non-admin) member's Pages tab reuses the same 403-as-disabled
  fallback every other gated tab already uses, which is architecturally
  correct but means it always renders empty today, regardless of what's
  actually published, until a member-facing list route exists.
- Guest access is a direct route (`/join/[code]/pages/[slug]`) reached by
  a shared link, not a tab inside the main `/join/[code]` view: there's
  nothing there to list from either.

Both gaps are pre-existing in the already-committed Backend (B23), not
something introduced here, and the fix in either case is a small new
Backend route (a published-only list, gated the same way the by-slug
routes already are): reasonable scope for a B24/F28 fast-follow rather
than this milestone, which was told not to touch `Backend/` at all.

The visibility form also includes a `min_identity` control (Anyone, or
Saved accounts only) even though nothing in F27 writes to a custom page
yet: included now per the spec's explicit ask, ready for F28's write gate
to actually enforce it.

**Fast-follow (2026-09-11, same day):** closed the first gap above —
Backend B23's plan.md now has `GET /groups/{group_id}/pages`
(member-gated, published-only). `+page.server.ts` fetches the admin
management list for an admin and this new route for everyone else, so a
real member's Pages tab now actually lists published pages instead of
always rendering empty. The guest-discovery gap (no listing inside
`/join/[code]`, by-slug link only) is unchanged, still a real gap, left
for a future milestone since a guest's join view has no admin to hand it
a slug link in the first place. `npm run check`/`build` clean, vitest 125
green (unchanged count: no new components, just a load-path fix).

### F28 — Carpool board UI (frontend for Backend B24) [x]

Starts once F27 + B24 land.

**Acceptance criteria:**
- [x] Carpool page shows an event selector, driver list, rider list.
- [x] "I can drive" / "I need a ride" forms (name, origin label, seats/
  notes as applicable), no map, no pin picker.
- [x] A member can edit/delete their own post from the list.
- [x] Admin sees moderation actions (hide/delete any post, lock/archive
  event) inline in the same list.
- [x] Usable on mobile at the widths the rest of the group pages already
  target.
- [x] `npm run check` / `npm run build` clean; vitest green.

**Tasks — Claude:**
- [x] Carpool template renderer: event selector + driver/rider lists.
- [x] Post forms (driver/rider), owner edit/delete.
- [x] Admin moderation controls.
- [x] Unit tests for form validation; mobile layout pass.

**Tasks — Human:**
- [ ] Manual browser pass once deployed.

**Deviations / friction against the real B24 API:**
- No "name" field on either post form: `CarpoolPostCreate` has no such
  field at all, `display_name` is always `current_user.name` captured
  server-side at post time. The plan's own acceptance-criteria wording
  ("name, origin label, seats/notes") predates reading the real schema.
- `CarpoolBoard.svelte` (a new `$lib` component) is rendered directly by
  `routes/groups/[id]/pages/[slug]/+page.svelte` in place of
  `CustomPageView.svelte` once `template_key === 'carpool_board'`, rather
  than teaching `CustomPageView` itself the real content: the guest
  counterpart (`/join/[code]/pages/[slug]`) has no Backend carpool routes
  to call at all (reads or writes), so it keeps `CustomPageView`'s
  placeholder unchanged and untouched.
- `CarpoolPostUpdate` (unlike `CarpoolPostCreate`) has no seat-count
  validator, so a driver editing `seats_total` down below their current
  `seats_available` is accepted as-is by the Backend with no consistency
  check; not worked around client-side since it wasn't asked for.
- A post an admin hides disappears from its own owner's list too: the
  Backend's non-admin branch of `GET /carpool/events/{id}/posts` filters
  to `status=open` with no owner-scoped exception on read (only on direct
  edit/delete by id, per that route's own docstring). A member has no way
  to discover or un-hide their own hidden post through this UI as a
  result; flagged here rather than routed around.
- Event lock/unlock/archive: the Backend's one `PATCH` endpoint would also
  accept reopening an archived event, but the UI only ever offers Lock/
  Unlock and a one-way Archive button, matching the acceptance criteria's
  literal "lock/archive" wording rather than exposing every state
  transition the endpoint technically allows.
- `npm run check` 0 errors, `npm run build` clean, vitest 132 (was 125,
  +7 new in `$lib/utils/carpool.test.ts`). Not deployed; no real-browser
  pass yet (Human task above).

### F29 — Guest carpool board: real content + posting (frontend for Backend B25) [x]

Frontend half of B25. The guest page route (`/join/[code]/pages/[slug]`)
currently always renders `CustomPageView`'s empty placeholder for
`carpool_board`, since no guest carpool data or write path existed before
B25. This wires it to the real thing, reusing F23/F25's existing local-
profile/anonymous-participant plumbing rather than building a second one:
`$lib/localProfile.ts`, `$lib/server/participantSession.ts`, the
`divisi_participant` cookie flow, and the pattern
`/join/[code]/responsibilities/signups/+server.ts` already established
for proxying a guest write through to a mint-or-resolve Backend endpoint.

**Acceptance criteria:**
- [x] `/join/[code]/pages/[slug]` renders `CarpoolBoard` (or a guest-
  appropriate variant of it) with real events and driver/rider lists when
  the page is a published, `audience=everyone` carpool page, not the
  placeholder.
- [x] `/join/[code]` (or wherever a guest currently reaches other guest-
  visible pages from) lists this page too, using B25's new guest pages
  list route, so a guest doesn't need a slug link to find it.
- [x] A guest can submit "I can drive" / "I need a ride" the same way a
  member does: same forms, same validation
  (`$lib/utils/carpool.ts`'s existing `driverOfferError`/
  `riderRequestError`), routed through a new
  `/join/[code]/carpool/...` proxy analogous to the existing
  responsibilities-signup one, carrying the local profile's name via
  `display_name`/`local_id` the same way that proxy already does.
- [x] A guest can edit/delete their own post across a page reload (the
  `divisi_participant` cookie round-trips the same way it already does
  for responsibility signups).
- [x] A `min_identity=saved` carpool page shows the existing
  `SAVE_REQUIRED:` inline prompt for a guest attempting to post, not a
  raw error.
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained.

**Tasks — Claude:**
- [x] `/join/[code]/pages/[slug]/+page.server.ts` + `+page.svelte`: load
  real carpool data via the new guest read routes, render `CarpoolBoard`
  instead of `CustomPageView` for `template_key=carpool_board`.
- [x] `/join/[code]/pages/+server.ts` (or wherever the join page's own
  data fan-out lives): add the guest pages list to whatever the join page
  already surfaces as available pages/tabs.
- [x] New proxy route(s) under `/join/[code]/carpool/...` for post
  create/edit/delete, following the responsibilities-signup proxy's
  shape (local profile name, participant cookie, `SAVE_REQUIRED:`
  passthrough).
- [x] Reuse `CarpoolBoard.svelte`'s existing form markup rather than a
  second copy; branch only where the guest path genuinely differs
  (no admin moderation controls, different submit endpoint).

**Tasks — Human:**
- [ ] Manual browser pass once deployed (guest posting flow specifically,
  since B25/F29 is the first place carpool touches unauthenticated
  writes).

**Deviations from this section as originally scoped:**
- No `/join/[code]/pages/+server.ts` was added — the guest pages list is
  fetched from `guestJoin.ts`'s existing fan-out (`loadGuestJoin`, run by
  `/join/[code]/data/+server.ts`) alongside homework/responsibilities/
  weekly notes, and surfaced as a new "Pages" tab on `/join/[code]`
  itself, following that file's existing pattern rather than adding a
  second endpoint.
- `CarpoolBoard.svelte` stays one component (no second copy), but a guest
  render's write controls could not literally reuse the member path's
  `use:enhance`/`?/actionName` form actions: those depend on SvelteKit's
  own action-invocation machinery (a `+page.server.ts` `actions` export),
  which a `+server.ts` proxy route doesn't provide, and is the reason the
  guest responsibility self-signup (F23) isn't a form action either. The
  component instead takes an optional `guest` prop; when set, the same
  markup/CSS renders but each write posts via a plain `fetch` against the
  new proxy routes, with a lazy name prompt and inline `SAVE_REQUIRED`
  notice reusing the join page's existing patterns/copy. Ownership of a
  guest's own post (for showing Edit/Delete) is tracked client-side, by
  remembering each post id this browser successfully created
  (`$lib/utils/carpoolOwnership.ts`, localStorage-backed like
  `localProfile.ts`) — the Backend has no "is this mine" flag on a read,
  and the guest's resolved participant id isn't known until their first
  successful write.
- Two small new i18n keys not enumerated in the plan text:
  `carpool_save_required` and `carpool_guest_action_failed` (a guest-path
  generic retry message covering create/edit/delete alike).

### F30 — Move custom-page create + visibility into Settings, alongside built-in Page Visibility [x]

Human feedback 2026-09-12, looking at the Settings screen's existing
"Page Visibility" card (`AboutTab.svelte`, admin mode: a checkbox +
audience dropdown per built-in page, one shared "Save page settings"
form): custom pages (carpool, and whatever templates follow it) should
live there too, not in a separate admin flow inside the Pages tab. And
"Create page" should move there as well, not stay a Pages-tab-only form.

**Design:** purely a frontend move, no Backend change. `PagesTab.svelte`'s
"Create page" form and per-page admin controls (edit/publish/unpublish/
archive/delete, `EditableCard`) already call actions
(`createCustomPage`, `updateCustomPage`, `publishCustomPage`,
`unpublishCustomPage`, `archiveCustomPage`, `deleteCustomPage`) that are
registered once on the shared `/groups/[id]/+page.server.ts` (`...customPageActions`
spread into `export const actions`), not per-tab, so relocating the
markup from `PagesTab.svelte` into `AboutTab.svelte` needs no server-side
rewiring, both components already receive the same `data`/`form` props.

`PagesTab.svelte` becomes a pure list after the move (same for member and
admin: title, status label for admin, a "View" link), matching how a
built-in page's own tab (Homework, Responsibilities, ...) never carries
its own visibility controls either, those live in Settings only.

The built-in grid's checkbox is a plain boolean; a custom page has three
states (draft/published/archived). Map the checkbox to
draft<->published (checked = published) via the existing publish/
unpublish actions, and keep Archive as a separate explicit action per
row (not foldable into the checkbox) since it's a more final state than
"currently off," matching the distinction `PagesTab.svelte` already drew
between "unpublish" and "archive."

**Acceptance criteria:**
- [x] The Settings screen's Page Visibility area lists custom pages
  alongside the six built-in ones (or in a clearly-labeled adjacent
  section if mixing them into one literal list/form is awkward given the
  different action-per-row vs. one-shared-form shape), each with a
  published/draft toggle and an audience dropdown.
- [x] "Create page" (template picker, title, audience, min_identity) is
  reachable from Settings, not from the Pages tab.
- [x] Archive and delete remain available per custom page, from Settings.
- [x] The Pages tab still shows the list of pages (drafts included for an
  admin, published-only for a member/guest) with a working "View" link,
  but no create/edit/publish/archive/delete controls.
- [x] No Backend route or schema changes.
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained (reuse existing `pages_*`/`groups_page_visibility*`
  keys where the copy still fits, add new ones only where it doesn't).

**Tasks — Claude:**
- [x] Move the create-page form from `PagesTab.svelte` into
  `AboutTab.svelte`'s admin section.
- [x] Add a per-custom-page visibility row (published/draft toggle,
  audience dropdown, archive/delete) to the same area, reusing
  `EditableCard`/existing action wiring rather than a new pattern.
- [x] Strip `PagesTab.svelte` down to a read-only list.
- [x] i18n: audit which existing keys still read correctly in the new
  location vs. need a Settings-specific variant.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-12; corrected same day (human feedback: "custom pages
should be siblings of the normal pages, not their own section").** First
pass put custom pages in a separate "Custom pages" card below the
built-in Page Visibility card. Folded that into the same card instead:
the custom-page rows now render directly inside the existing "Page
Visibility" section, right after the built-in `<form>` closes, using the
same `.page-setting-row` styling so they read as one continuous list
under one heading, not two sections. The one thing that couldn't be
literally unified is the `<form>` itself: the built-in rows share one
batch-save form (a single "Save page settings" button), while each
custom page acts through its own per-row action call
(publish/unpublish/archive/update/delete via `requestSubmit()` on
change, no separate Save button) since HTML forbids nesting a `<form>`
inside another. Visually and structurally (one card, one list, one
heading) they're siblings; only the submit mechanics differ, same as
they always had to. "Create page" stays its own card below, unchanged
from the first pass since the feedback was specifically about the
visibility list, not page creation.

Removed the now-orphaned `pages_custom_pages`/`pages_custom_pages_note`/
`pages_no_pages_admin` i18n keys added in the first pass (the separate
heading/note/empty-state they backed no longer exist); kept
`pages_no_pages_admin_tab` (still used by the Pages tab's own empty
state). en/es key counts both 623, in parity.

Verification: `npm run check` 0 errors (13 pre-existing warnings,
unrelated), `npm run build` clean, vitest 138 passed (unchanged, no
tests target this UI directly). Not browser-exercised (standing
blocker); no human pass yet.

### F31 — Custom pages as siblings in the main tab bar, not a "Pages" tab [x]

Human feedback 2026-09-12, same session as F30's correction and pointing
at the same underlying instinct: no standalone "Pages" list at all,
neither as its own tab nor as its own settings section. Each custom page
(carpool, and whatever templates follow it) should be its own tab in the
group's main nav, a sibling of the built-in ones, in this exact order:
**Homework, Rehearsal Tracks, Weekly Notes, Members, Responsibilities,
[custom pages], Info.** That's actually the *same slot* `'pages'`
already occupies in `+page.svelte`'s `tabsInOrder` today (`['primary',
'tracks', 'weeklyNotes', 'members', 'responsibilities', 'pages',
'about']`), so no reordering is needed, only expanding that one
list-tab into N per-page sibling tabs. `PagesTab.svelte` (the list
component) goes away entirely.

Same fix applies to the guest join page (`/join/[code]/+page.svelte`),
which has the identical "pages" list-tab from F29 in the identical
relative slot (after `responsibilities`). Guest parity principle: don't
leave the guest side with the exact pattern just rejected on the member
side.

**Design constraint driving the approach:** a custom page's content
(`CarpoolBoard`, currently) is loaded by its own route,
`/groups/[id]/pages/[slug]/+page.server.ts` (`/join/[code]/pages/[slug]`
for guests), including a soft-nav-on-`?event=` pattern for switching
which event's posts show. The six built-in tabs, by contrast, are pure
client-side `$state` with zero navigation, one big load up front,
switching instantly. Folding a custom page's tab into that same
zero-navigation model would mean the main page's load fetching every
custom page's carpool events (and picking a default event's posts) on
every single load regardless of whether that tab is ever opened, the
opposite of B24/F28's lazy-load-carpool-only-when-visible cost stance.
So: keep custom pages as real routes, and make the tab bar itself work
across both routes, a real (but still SvelteKit-client-routed, not a
hard reload) navigation when a custom page tab is involved, while the
six built-in tabs keep switching with zero navigation exactly as today
when you're already on the main page.

Recommended shape (implementer has latitude on the exact SvelteKit
mechanism, a `+layout.svelte` for the `/groups/[id]` subtree covering
both `+page.svelte` and `pages/[slug]/+page.svelte` is probably the
idiomatic fit, but pick whatever's cleanest): a small shared helper that
computes the ordered, filtered, labeled tab list (built-ins plus one
entry per visible custom page, admin sees every status, member/guest see
published only) from `data`, consumed by both routes so the strip renders
identically and consistently on either. Built-in tab entries stay
`<button>`s with local-state switching *only* when rendered from the
main page (unchanged today); custom-page entries are always `<a href>`
to their own route. From a custom page's own route, every tab (including
the built-in ones) is a plain link back to the main page, since there's
no local tab state to switch there anyway.

**Acceptance criteria:**
- [x] No "Pages" tab and no `PagesTab.svelte` list exists anywhere
  (member group page, admin group page, or guest join page).
- [x] The group's tab strip shows, in order: Homework, Rehearsal Tracks,
  Weekly Notes, Members, Responsibilities, then one tab per visible
  custom page (published for a member, every status for an admin), then
  Info/Settings.
- [x] Clicking a custom page's tab shows its real content (`CarpoolBoard`
  for a carpool page) with the same tab strip still visible above it,
  correctly highlighting that tab as active.
- [x] From a custom page's tab, clicking any other tab (built-in or
  another custom page) navigates there correctly, preserving admin/member
  `view` mode.
- [x] Switching between the six built-in tabs while already on the main
  group page still has zero navigation (no regression from today's
  instant client-state switching).
- [x] The guest join page shows the identical pattern: no "Pages" list
  tab, each guest-visible custom page is its own sibling tab in the same
  relative slot (after Responsibilities).
- [x] No Backend changes.
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained (drop now-orphaned Pages-tab-list copy, e.g.
  `pages_tab_title` if nothing else uses it).

**Tasks — Claude:**
- [x] Design and implement the shared tab-list computation (order,
  visibility, labels) used by both the main group page and a custom
  page's own route.
- [x] Update `/groups/[id]/+page.svelte`: remove the `'pages'` tab type/
  branch, render one sibling tab per custom page in its place.
- [x] Update `/groups/[id]/pages/[slug]/+page.svelte` (+ its
  `+page.server.ts` if it needs more data to render the full strip): show
  the same tab strip, active tab highlighted correctly.
- [x] Delete `PagesTab.svelte` (and its now-unused actions/i18n, if any
  become orphaned).
- [x] Apply the identical change to `/join/[code]/+page.svelte` and
  `/join/[code]/pages/[slug]/+page.svelte`.
- [x] i18n cleanup: remove any key that only existed for the removed
  list.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-12.** Landed on the plan's recommended shape almost
exactly, with the layout split one level more granular than "a
`+layout.svelte` covering both routes": a `+layout.server.ts` under
`/groups/[id]` (data only, no matching `+layout.svelte` — the two routes'
chrome differs too much, admin banner + created-group banner on the main
page, none of that on a custom page's, to share a layout component, and a
`+layout.server.ts` alone is a normal no-op pass-through for markup) now
loads the group, its role, the four built-in pages' lists + enabled flags,
and the custom pages list once; `+page.server.ts` and
`pages/[slug]/+page.server.ts` both pull that back out via `parent()`
instead of duplicating the fetch. A pure `groupTabs.ts`
(`computeGroupTabs`) computes the ordered/filtered/labeled tab list from
that shared shape plus a `mode`; both `+page.svelte` files render from it,
built-ins as `<button>`s with local `$state` on the main page and as
`<a href>` back to `/groups/[id]?tab=X` from a custom page's own route,
custom-page entries always `<a href>`. The guest side got its own parallel
`joinTabs.ts` (`computeGuestTabs`) rather than reusing `groupTabs.ts`
directly — the guest built-in tab set is smaller and differently ordered
(Tracks leads; no Members or Info tab at all) and carries no admin/member
`mode`, so a shared type would have needed as much branching as two small
files avoid.

Deviations from the plan text: (1) the plan floated a `+layout.svelte`;
landed on `+layout.server.ts` alone, since only the *data* is shared, not
markup — see above. (2) The plan's design-constraint note worried about
the main page's load fetching "every custom page's carpool events" if
custom pages were folded into the zero-navigation model; the layout split
here avoids that (carpool content stays on `pages/[slug]`'s own load,
never fetched from the main page or from another custom page's route),
but does add the four built-in pages' list-fetches to every custom page's
load too, which it didn't pay before — a small, fixed cost independent of
how many custom pages exist, unlike the carpool-events concern the plan
called out, and the trade accepted to make the tab strip's built-in-tab
visibility actually correct from either route. (3) The standalone "Back"
link (`pages_back`) on both by-slug routes was dropped rather than kept
alongside the new strip — the built-in tabs are themselves links back to
the main page now, so a separate back link was pure duplication; its i18n
key (plus `pages_view`, `pages_no_pages_admin_tab`, `pages_no_pages_member`
from the deleted list, and `pages_tab_title`) came out with it. (4) Added
`groupTabs.test.ts`/`joinTabs.test.ts` (not asked for explicitly, but the
extracted functions are pure and the repo already unit-tests this kind of
helper, e.g. `groupCards.test.ts`).

Verification: `npm run check` 0 errors (13 pre-existing warnings,
unrelated — same count/lines F30 already flagged), `npm run build` clean,
vitest 146 passed (was 138; +8 new). Traced (read-through, no browser) the
five required scenarios: (a) built-in tabs on the main page still switch
via local `tab` `$state`, zero navigation; (b) a carpool page tab is a
real `<a>` to `pages/[slug]`, which renders the same strip above
`CarpoolBoard`; (c) that route's built-in tab links carry `?tab=X` back to
the main page, whose `tab` `$state` initializer reads it; (d) admin mode
(`?view=admin`, from the role switcher or a direct link) makes
`computeGroupTabs` show every custom-page status and carries `?view=admin`
through every link it renders, both directions; (e) the guest join page's
built-ins stay buttons, its custom-page tabs are links to
`/join/[code]/pages/[slug]`, and that route's own load now fetches the
same three visibility flags + discovery list to render its own strip.
Not deployed; no real-browser pass yet (standing blocker).

### F32 — Carpool: standing board by default, dated events for exceptions (frontend for Backend B26) [x]

Frontend half of B26. `CarpoolBoard.svelte`'s event chip strip and
default-selection logic assumed every event is dated (sorted/labeled by
`starts_at`); now the list always includes exactly one non-dated
standing event too (`is_standing`, `starts_at: null`).

**Acceptance criteria:**
- [x] The standing event is the default selected/shown event on first
  load (not "soonest `starts_at`", which no longer makes sense once a
  `null` is in the mix).
- [x] Its chip (when the strip shows at all, i.e. ≥2 events exist) reads
  as an ongoing label (e.g. "Ongoing"), not a formatted date, since it
  has none.
- [x] With only the standing event and no dated ones yet, the chip strip
  doesn't show at all (matches today's "only show the selector past one
  event" rule) and the board's content renders directly.
- [x] Admin's event-creation form is relabeled to make clear it's for a
  one-off exception (e.g. "Add a one-time event"), not the thing that
  creates the ongoing board (which the admin never explicitly creates).
- [x] The standing event's admin controls never show an Archive action
  (Backend rejects it anyway; don't offer a button that 400s); Lock/
  Unlock and Edit (title/destination) still show.
- [x] Guest carpool view gets the identical treatment (default to
  standing, same chip label, same hidden Archive).
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained.

**Tasks — Claude:**
- [x] Update default-event-selection logic (member and guest load paths)
  to prefer `is_standing` over "first by `starts_at`".
- [x] Chip label: standing renders an "Ongoing"-style string; dated
  events render their existing formatted date, unchanged.
- [x] Relabel the admin create-event form/button.
- [x] Hide Archive for a standing event in the moderation controls
  (member and guest views both use `CarpoolBoard.svelte`, so this should
  be one change, not two).
- [x] i18n: new "Ongoing" label and updated create-event copy, en/es.

**Tasks — Human:**
- [x] None expected.

**Built 2026-09-12.** `npm run check` 0 errors, `npm run build` clean,
`npx vitest run` 151 passed (was 146; +5 new, all in a new
`selectDefaultCarpoolEventId` describe block in `carpool.test.ts`). i18n
key parity held (619/619 en/es).

`CarpoolEventOut.starts_at`/`destination_label` widened to `string | null`
and gained `is_standing: boolean`, mirrored in the guest-side
`GuestCarpoolEvent` (`$lib/api/guest.ts`) since both feed
`CarpoolBoard.svelte` directly. Default-selection logic pulled out into a
shared pure helper, `selectDefaultCarpoolEventId` (`$lib/utils/carpool.ts`),
used by both `+page.server.ts` loads instead of duplicating the same
`.find()` chain twice — it prefers a requested `?event=` id, then the
standing event, then falls back to `events[0]` (defensive; the Backend
never actually omits the standing event). `CarpoolBoard`'s own
`eventTimeLabel(ev)` picks the "Ongoing" string whenever `starts_at` is
`null` rather than checking `is_standing` directly, since only the standing
event ever lacks one; `is_standing` itself still gates the Archive button
and the edit form's "when" field, since those are correctness constraints
tied to the Backend's actual rule, not just a null check.

One thing the plan text didn't call out: `CarpoolBoard`'s edit-event panel
is a single real `<form>` (`EditableCard`) that submits every rendered
field regardless of whether it changed. Leaving a `startsAt` input in that
form for the standing event, even prefilled with its own unchanged value,
would still submit `starts_at` and hit the Backend's 400 (the route checks
`form.has('startsAt')`, not whether the value differs). So the "when"
field is conditionally omitted from the DOM entirely for a standing event,
not just visually hidden or disabled, the same reasoning as the Archive
button itself.

**Fast-follow (2026-09-12, same day): the guest tab strip was making 4x
the requests it needed to.** F31 gave `/join/[code]/pages/[slug]` its own
copy of the tab-visibility fan-out (call each of
`listGuestHomework`/`listGuestWeeklyNotes`/`listGuestResponsibilityDates`,
keep only whether it 404s, plus `listGuestCustomPages`), which the human
hit directly: enough guest requests per page view to trip
`rate_limit_guest`'s 60-second window during normal tab clicking, seen
locally as "the backend stopped working" (compounded by Docker Desktop's
NAT making every local request look like one IP). Backend fast-follow
(`Backend/plan.md`'s B26 section) added `GET /guest/{join_code}/tabs`,
one call for the same three booleans plus the custom pages list. `guest.ts`
gained `getGuestTabs`; the by-slug route calls it instead of the four
individual list endpoints. `/join/[code]`'s own load (`guestJoin.ts`) is
unchanged, it needs each list's actual data, not just whether it's
visible, so the individual calls there are real work, not waste. `check`
0 errors, `build` clean, vitest 151 green (unchanged, no new test surface,
covered by the Backend's new tests).

### Small addition, 2026-09-12 — "Posting as {name}" on carpool forms

Human feedback: when offering/requesting a ride, the form should say
which name the post will carry, since `display_name` is never a form
field (it comes from the session for a member, the local profile for a
guest, see `CarpoolPostCreate`) so there was previously no way to tell
from the form itself. Added a `userName` prop to `CarpoolBoard.svelte`
(a member's own account name, from the group layout's `data.user.name`)
and a reactive `postingAsName` (falls back to `$localProfile.displayName`
for a guest, which can change mid-session via the lazy name prompt in a
way a member's name never does). Shown as "Posting as {name}" at the top
of all four offer/request form variants (member/guest x driver/rider).
New key `carpool_posting_as`, en/es. `check` 0 errors, `build` clean,
vitest 151 green (unchanged, no new test surface for a pure display
string).

### F33 — Carpool: claim a seat in a driver's post (frontend for Backend B27) [x]

Frontend half of B27. `CarpoolBoard.svelte`'s driver list currently just
shows each post's static `seats_available`; this makes it a real
first-come-first-served claim.

**Acceptance criteria:**
- [x] Each driver post shows its computed `seats_available` (from the
  Backend, not client-derived) and, when there's at least one, a "Claim a
  seat" action, member and guest both.
- [x] After claiming, that same button becomes "Release your seat" for
  the claimant specifically (not shown as claimable-by-you to anyone
  else); a full post (no seats left) shows neither for a non-claimant.
- [x] Claimants are visible under the driver's post (names), same
  "posted content is visible to whoever can see the board" stance the
  rest of carpool already takes.
- [x] A guest's claim goes through the same local-profile/lazy-name-
  prompt/`SAVE_REQUIRED` handling every other guest carpool write already
  uses, not a separate flow.
- [x] Owner edit/delete on a driver's own post still works; deleting a
  driver post the normal way (existing behavior) is unaffected by
  whether it has claims (not attempting cascade-cleanup UI here beyond
  whatever the Backend already does).
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained.

**Tasks — Claude:**
- [x] `CarpoolPostOut`/`GuestCarpoolPost` types gain `claims` and the
  (now computed, not client-set) `seats_available`.
- [x] Claim/release actions: a form action for the member route
  (`actions/carpool.ts`), a proxy route for the guest route, following
  the exact pattern the existing offer/request actions and
  `/join/[code]/carpool/...` proxies already use.
- [x] Driver post rendering: claimant list, the claim/release button
  with the three states above (claim / release / full-not-yours).
- [x] i18n: new strings for claim/release/claimed-by, en/es.

**Tasks — Human:**
- [ ] None expected.

**Status:** Built 2026-09-12. `npm run check` 0 errors (13 pre-existing
warnings, none new); `npm run build` clean; vitest 155 green (151 baseline
+ 4 new tests for `carpoolOwnership.ts`'s generalized claim-id tracking).

Deviations from the plan text:
- `carpoolOwnership.ts` was generalized in place (shared `readOwnedIds`/
  `writeOwnedIds` keyed by a storage key) rather than adding a parallel
  module, per the plan's own "generalize... whichever reads cleaner"
  latitude: `isOwnedCarpoolClaim`/`rememberCarpoolClaim`/`forgetCarpoolClaim`
  track a claim id the same way the existing post-id functions do, under a
  separate `divisi:myCarpoolClaimIds` storage key.
- The member form actions (`claimSeat`/`releaseSeat`) key their `runAction`
  `form` string by the post/claim id (`` `claimSeat:${driverPostId}` ``)
  rather than a fixed string, so a rejection on one driver post's button
  (already full, already claimed, event locked) renders under that post
  specifically instead of every driver post at once.
- The Backend's `create_claim` rejects the domain checks (wrong kind, full,
  already claimed) with 400 and the event lock/archive check with 409; both
  guest proxy routes fold either into the same `conflict` verdict, since
  the client just surfaces the Backend's own message either way.
- No UI lets a driver or admin release someone *else's* claim, even though
  the Backend allows both (see `release_claim`'s own docstring) — F33's
  acceptance criteria only ever describe the claimant's own button, and
  that moderation surface wasn't asked for, so it's left out rather than
  guessed at.

### F34 — Guests can remove their own responsibility signup (frontend for Backend B28) [x]

Frontend half of B28. The member tab (`ResponsibilitiesTab.svelte`)
already shows "Remove me" next to a signup where `s.userId === data.user.id`.
The guest join page has no such control at all, and can't use the same
check: `ResponsibilityGuestSignupOut` deliberately carries no `user_id`
(name only, "never email or account id"), so a guest client can't compare
against anything the Backend returns. It has to remember which signup ids
it created itself, the exact problem `carpoolOwnership.ts` (F29) already
solved for guest carpool posts (compare against `post.user_id` there,
against nothing here, since even the id-comparison field doesn't exist on
this response shape). Same trick applies: track "signup ids this browser
created" in `localStorage`, checked only for a guest (a member's own check
stays the existing `user_id` compare).

**Acceptance criteria:**
- [x] After a guest signs up, that signup's row shows a "Remove me"
  control, immediately and again on a later page reload (this is the
  part today's purely in-memory `doneKeys` tracking can't do, since it
  resets on reload, so switching to persisted-id tracking fixes visible
  behavior, not just this feature).
- [x] Clicking it calls a new guest proxy that resolves the same way the
  existing responsibilities-signup proxy does (cookie/`local_id`), then
  updates the visible list.
- [x] A locked date still shows no "Remove me" (matches the member
  view's existing behavior, the Backend still enforces the 409 either
  way).
- [x] `npm run check` / `npm run build` clean; vitest green.

**Tasks — Claude:**
- [x] A small ownership-tracking helper for signup ids, either a new
  small module mirroring `carpoolOwnership.ts`'s shape or a generalized
  version both features share, implementer's call. Called right after a
  guest's own signup succeeds.
- [x] New guest proxy route for `DELETE .../responsibilities/signups/{id}`,
  following the existing signup-create proxy's cookie/local_id handling.
- [x] "Remove me" control on the join page's responsibilities view, gated
  on the ownership check above.

**Tasks — Human:**
- [ ] None expected.

**Status:** Built 2026-09-12. `npm run check` 0 errors (13 pre-existing
warnings, none new); `npm run build` clean; vitest 161 green (155 baseline
+ 6 new tests for `responsibilitySignupOwnership.ts`).

Deviations from the plan text:
- `responsibilitySignupOwnership.ts` is a new module, not a generalization
  of `carpoolOwnership.ts`: F33 landed concurrently in this same working
  tree and had already reshaped that file for its own claim-id tracking by
  the time this was built. Folding a second, unrelated id namespace into a
  file under active concurrent edit risked a conflict for no real payoff
  (each module is ~60 lines), so this duplicates the shape instead.
- The member tab's own "Remove me" (`ResponsibilitiesTab.svelte`) doesn't
  actually gate on `d.locked`/`d.canceled` today, unlike what this
  section's acceptance criteria describe. Removal still isn't blocked in
  the UI, only backstopped by the Backend's 409; the guest control here
  follows the acceptance criteria as written (hides on a locked/canceled
  date) rather than the member tab's current, looser behavior, since a
  guest with no error-recovery affordance for a raw 409 benefits more from
  the control just not being there.
- Added `responsibilities_removal_failed` (en/es) rather than reusing
  `responsibilities_signup_failed` for a failed removal: the existing
  string reads "Could not sign you up," which is wrong for a delete
  failure. The new guest DELETE proxy also forwards the Backend's 409
  detail as `message`, the same way the signup-create proxy already does
  for its own conflict case, so a locked-date removal attempt shows the
  real reason rather than a generic fallback.
- Dropped the old `responsibilities_signup_done` string's only call site
  (and its now-unused `.signup-done` CSS rule) rather than keeping it
  alongside the new control: once a guest's own name in the roster carries
  a "Remove me" button, a separate "You're signed up" line next to the
  sign-up form is redundant, matching the member tab's own minimalism
  (no equivalent text there either).

### F36 — Carpool as a built-in tab, drop generic Custom Pages (frontend for Backend B31) [x]

Starts once Backend B31 lands. Mirrors it on the frontend: carpool stops
being the one custom page anyone can create/rename/slug, and becomes a
sixth fixed tab like Homework/Members/Responsibilities/Weekly Notes/About.

Acceptance criteria:
- [x] `groupTabs.ts` gains `carpool` as a `BuiltinTabKey`; the generic
  custom-page/slug branch (`GroupTabEntry.slug`, `pageEntries`,
  `data.customPages`) is removed, matching Backend B31 having exactly zero
  `GroupCustomPage` rows left to enumerate. Same change mirrored in
  `joinTabs.ts` for the guest side.
- [x] `pages/[slug]/+page.svelte`, `pages/[slug]/+page.server.ts`,
  `pages/[slug]/actions/carpool.ts`, `actions/customPages.ts`,
  `PagesTab.svelte` (if still present) all deleted. Carpool renders from a
  new `tabs/CarpoolTab.svelte` alongside the other tab components, reusing
  the existing `CarpoolBoard.svelte`/`CarpoolMap.svelte` components
  unchanged.
- [x] The guest join route (`join/[code]/carpool/...` proxies,
  `join/[code]/pages/[slug]` reads) is repointed at the new flat
  group-scoped Backend URLs from B31, no more slug lookup.
- [x] Settings' Page Visibility card gets a plain `carpool` row like every
  other built-in page, replacing whatever "custom pages" sub-section F30
  added there.
- [x] `groupTabs.test.ts` / `joinTabs.test.ts` updated for the simplified
  shape; `npm run check` 0 errors, `npm run build` clean, vitest green.

Deviations from the plan:
- The guest `join/[code]/+page.svelte` route had been left mid-migration
  (still reading the removed `result.customPages`/`GuestTabEntry.slug` and
  never actually rendering `CarpoolBoard` for a guest at all, despite
  `guestJoin.ts` already resolving all the data it needs) — finished that
  wiring as part of this pass rather than leaving it broken: the guest tab
  strip is now a plain button list off `computeGuestTabs`, and a `tab ===
  'carpool'` branch renders `CarpoolBoard` with `isAdmin={false}`,
  `userId=""`, and `guest={{ code: data.code }}`, same shape the deleted
  `pages/[slug]` route used.
- `CarpoolTab.svelte` (member/admin) was passing a stray `groupId` prop
  `CarpoolBoard` never declared (a leftover from an earlier iteration) —
  removed it; `svelte-check` flags an unknown prop as a real type error.
- `groups/[id]/+layout.server.ts`'s guest-gate `route.id` switch still
  matched the deleted `/groups/[id]/pages/[slug]` route, which
  `svelte-check` now flags as a type comparison with no overlap (the route
  literally can't match anymore) — simplified to the one remaining case.

### F37 — Carpool direction: there / back / round trip (frontend for Backend B32) [x]

Starts once Backend B32 lands. `CarpoolBoard.svelte` gets an "On the way
there" / "On the way back" toggle above the driver/rider lists (same tab
strip pattern as the existing List/Map toggle from F35); a round-trip post
appears under both. The post form (`CarpoolBoard.svelte`'s
create/edit form) gets a direction picker (There / Back / Round trip),
defaulting to Round trip.

Acceptance criteria:
- [x] Direction toggle filters the rendered driver/rider lists; round-trip
  posts show in both.
- [x] Post form direction field wired into create/update actions
  (`app/actions/carpool.ts` wherever it lives post-F36) and the guest proxy
  routes.
- [x] `carpool.test.ts` covers the filter logic and the new form field.
  `npm run check` 0 errors, `npm run build` clean, vitest green.

Deviations from the plan:
- "Covers ... the new form field" landed as a plain `<select name=
  "direction">`/`bind:value` field per form (create-driver, create-rider,
  owner edit — member and guest variants of each, six forms total), not a
  new unit test: this repo's `carpool.test.ts` only exercises pure logic
  functions (`postMatchesDirection` already covers the filter side), and
  there's no component-test harness here to assert against form markup —
  covered instead by `npm run check`/`build` plus the existing action-level
  tests on the read side.
- The guest write proxies (`join/[code]/carpool/events/[eventId]/posts`,
  `join/[code]/carpool/posts/[postId]`) needed a `direction` field added to
  their request bodies and forwarded to the Backend — they weren't
  forwarding it at all before this pass, so a guest's post always landed as
  the Backend's own `round_trip` default regardless of what they picked.

### F38 — Group tab strip: single row, scrolls sideways on mobile [x]

The built-in tab strip (`+page.svelte` under `/groups/[id]`, and its guest
counterpart under `/join/[code]`) currently wraps onto multiple rows on a
narrow screen, which eats vertical space above the fold. Change it to a
single row that scrolls horizontally instead: `overflow-x: auto`,
`flex-wrap: nowrap`, `white-space: nowrap` (or the flex-item equivalent,
`flex-shrink: 0` per tab), `-webkit-overflow-scrolling: touch`. Keep desktop
layout as-is if it already fits without scrolling.

Acceptance criteria:
- [x] Tab strip never wraps to a second row at any viewport width.
- [x] Tabs remain scrollable sideways by touch/trackpad/scrollwheel on
  mobile widths where they overflow.
- [x] No regression to keyboard/tab-key navigation through the tab
  buttons/links.
- [x] Same fix applied to both the member (`groups/[id]`) and guest
  (`join/[code]`) tab strips, since both render from the same
  `groupTabs.ts`/`joinTabs.ts` list shape.

Deviations from the plan:
- Landed as a new `.tab-strip` modifier class in `shell.css`, applied
  alongside the base `.tabs` class (`class="tabs tab-strip"`) at the two
  call sites, rather than changing `.tabs` itself: `.tabs` is also reused by
  F37's direction toggle and the login page's tab switcher, both of which
  should keep wrapping/staying put rather than gaining a scrollbar. No
  `white-space: nowrap` needed — tab labels are short enough that
  `flex-shrink: 0` on `.tab` alone keeps each button from compressing.
  Keyboard/tab-key navigation is unaffected: both strips are plain
  `<button>`/`<a class="tab">` elements in DOM order with no `tabindex`
  overrides, and `overflow-x: auto` on the container doesn't change that
  order. Not verified in a real browser/touch device yet — a human should
  confirm the horizontal scroll feels right on an actual phone.

### F39 — Guest About/Info tab (frontend for Backend B33) [x]

Starts once Backend B33 lands. `about` was never a guest-reachable tab at
all (`joinTabs.ts`'s `GuestBuiltinTabKey` has no `about` member); add one,
read-only, showing the group's description and regular-rehearsal schedule
the same way `AboutTab.svelte` shows them to a member, minus every
admin/member-only control (description editor, rehearsal editor, leave
group, page-visibility settings, join-link copy).

Acceptance criteria:
- [x] `joinTabs.ts`: `GuestBuiltinTabKey` gains `'about'`; `GuestTabData`
  gains `aboutVisible: boolean` (from the Backend's new
  `GuestTabsOut.about_visible`); `computeGuestTabs` includes it in the
  fixed guest tab order, gated on that flag same as every other guest tab.
- [x] A new read-only guest About view (component or inline branch in
  `join/[code]/+page.svelte`, whichever matches how the other guest tab
  content is rendered there) shows description + rehearsal schedule, no
  edit controls, no join-link/leave-group actions (guest is already past
  the join link, and has nothing to "leave").
- [x] `data/+server.ts` / `guestJoin.ts` (or wherever guest tab content is
  fetched) pulls the new guest About data from B33's guest route.
- [x] `joinTabs.test.ts` covers the new tab's visibility gating.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green.

**Deviations from the plan:** the plan guessed the guest-facing TS types
would live in `$lib/server/backendTypes.ts` — that file turns out to be
member-route-only (no `Guest*` types at all); the real home, matching
every other guest DTO (`GuestHomework`, `GuestWeeklyNote`, etc.), is
`$lib/api/guest.ts`, so `GuestAbout`/`listGuestAbout` landed there instead.
Also kept `about_visible` on `getGuestTabs`'s response type in sync with
the Backend even though that function has no live caller today (`/join/
[code]` fetches each guest page's content directly instead, same as
homework/weekly_notes/carpool) — matches the existing dead-but-kept
convention documented on `GuestTabs` itself. No new i18n keys: the member
`groups_about_tab_title`/`groups_rehearsals`/`groups_no_description`
strings already say exactly the right thing for a guest.

### F40 — Carpool direction: grouped legs instead of an exclusive toggle

Human feedback 2026-09-14, right after F37 shipped: the "On the way there" /
"On the way back" tab strip above the driver/rider lists doesn't hold up in
practice. Two real problems, surfaced by walking through the actual use
case (someone needs a ride from work to rehearsal, then rehearsal to home,
often with two different drivers):

- A post never shows its own direction anywhere. The only way to learn a
  post is one-way is which tab it happens to be sitting under right now —
  so a rider looking at the default "there" tab can miss a "back only"
  driver post entirely.
- The tab hides one leg while showing the other, which is actively wrong
  for this feature's whole reason for existing: the two legs can have
  completely different drivers, so a rider needs to see both lists, not
  pick one.
- Round trip (the default, and the common case for a same-driver-both-ways
  rehearsal) still pays the full toggle tax for no benefit, since a
  round-trip post shows under both tabs unchanged.

Exact pickup/dropoff times are deliberately out of scope here: the human's
call is that the rehearsal's own start/end time is anchor enough, and the
existing optional `leave_time_text` note plus contact info covers
coordination. No new time field, no backend/schema change — `direction`
already round-trips correctly (B32); this is a `CarpoolBoard.svelte`
presentation rework.

New shape:
- Drop `directionFilter` and the tab-strip toggle above the lists.
- Within each of the existing Drivers/Riders cards, split the post list
  into "Getting there" and "Getting home" groups (`postMatchesDirection`
  already implements the right membership test — a round-trip post
  belongs in both groups, unchanged semantics from the toggle version).
- Skip the group headings entirely, rendering one flat list exactly like
  today, whenever every post in that card is round trip (no post with
  `direction` of `there` or `back`) — the common case stays exactly as
  simple as it was before F37.
- Post form direction field: reword the three options so they read as two
  optional legs rather than an abstract enum (e.g. "Just getting there" /
  "Just getting home" / "Both ways"), and rename the `en.json`/`es.json`
  strings accordingly; add the two new group-heading strings.

Acceptance criteria:
- [x] No `directionFilter` state or direction tab strip left in
  `CarpoolBoard.svelte`.
- [x] A pure helper (`$lib/utils/carpool.ts`) decides "flat list" vs.
  "grouped," unit tested for: all round trip → flat; empty list → flat;
  any `there`/`back` present → grouped, each group's membership matching
  `postMatchesDirection`.
- [x] Both Drivers and Riders cards use that helper/grouping independently
  (a driver-only split shouldn't force headings onto an all-round-trip
  rider list, or vice versa).
- [x] Post form direction `<select>` options and the new group headings
  read as "getting there" / "getting home" language, not "there"/"back"/
  "round trip" as a bare enum.
- [x] `leave_time_text` stays optional, unchanged.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green.

✅ Built 2026-09-14: dropped `directionFilter`/`CarpoolDirectionFilter` state
and the tab-strip toggle from `CarpoolBoard.svelte`; `drivers`/`riders`
derive the full per-event list again, with no direction filtering, same as
before F37. New `carpoolPostsNeedDirectionGrouping` (`carpool.ts`) decides
flat-vs-grouped per list; a shared `directionGroupedPosts` snippet renders
either one flat list or "Getting there"/"Getting home" subsections (each
built with `postMatchesDirection`, a round-trip post intentionally in both),
used independently by the Drivers and Riders cards so one card's split never
forces headings on the other. New `.carpool-leg-heading` style, one level
lighter than `.card-eyebrow`. Reworded `carpool_direction_there/back/
round_trip` to "Just getting there"/"Just getting home"/"Both ways" (and
Spanish "Solo de ida"/"Solo de vuelta"/"Ida y vuelta"), added
`carpool_leg_there`/`carpool_leg_back` ("Getting there"/"Getting home",
Spanish "De ida"/"De vuelta") in both `en.json`/`es.json`. `check` 0 errors,
`build` clean, vitest 194 green (was 189; +5 new `carpoolPostsNeedDirectionGrouping` cases).

### F41 — Carpool direction: bring the toggle back, extend it to the map

Human feedback 2026-09-14, right after using F40: the auto-collapsing
per-card grouping ("flat when everyone's round trip, headings appear once
someone posts one-way") reads as inconsistent, the board's shape changing
underneath you depending on what other people posted. Revert to an
explicit toggle, F37's shape, but carry over F40's better labels and fix
the gap F37 never covered: the map never respected the toggle at all,
always plotting every pin regardless of which leg was selected.

Acceptance criteria:
- [x] `directionFilter` state and the tab-strip toggle return to
  `CarpoolBoard.svelte`, above the map and the driver/rider lists,
  defaulting to `'there'` (same reasoning as F37: reads as the first leg).
- [x] Tab labels read "On the way there" / "On the way home" (the user's
  own wording; "home" instead of F37's "back"). Reuse the F40
  `carpool_leg_there`/`carpool_leg_back` keys for this rather than adding
  new ones, updating their English/Spanish strings to the tab-label
  wording, since F40's group-heading usage of those keys is going away in
  this same change.
- [x] `drivers`/`riders` go back to being filtered by `directionFilter`
  (`postMatchesDirection`), one flat list per card, no grouping/headings.
  Remove `carpoolPostsNeedDirectionGrouping` (`carpool.ts`), its test
  cases, the `directionGroupedPosts` snippet, and the `.carpool-leg-
  heading` style added in F40, now unused.
- [x] `CarpoolMap` receives the same (now direction-filtered) `drivers`/
  `riders` the lists use, so switching the toggle changes which pins show
  too. This should need no changes inside `CarpoolMap.svelte` itself, it
  already just plots whatever `drivers`/`riders` arrays it's given, same
  as F35/F37 originally did before F40 changed what those arrays held.
- [x] Keep F40's reworded post-form `<select>` options ("Just getting
  there" / "Just getting home" / "Both ways") as is, that framing wasn't
  the complaint, only the viewing split's shape was.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green.

**Built 2026-09-14:** reverted `CarpoolBoard.svelte`'s `drivers`/`riders`
`$derived`s to filter by `directionFilter`/`postMatchesDirection` again
(F37's shape), brought back the `.tabs`/`.tab` toggle markup, now placed
above the map as well as the lists so `CarpoolMap`'s `{drivers}`/`{riders}`
props inherit the filtering with zero changes inside `CarpoolMap.svelte`
itself. Removed `carpoolPostsNeedDirectionGrouping` (`carpool.ts`) and its
5 test cases, the `directionGroupedPosts` snippet, and the
`.carpool-leg-heading` style. Repointed `carpool_leg_there`/`carpool_leg_back`
(`en.json`/`es.json`) from F40's group-heading text to the tab-label
wording ("On the way there" / "On the way home"; Spanish "De ida" / "De
vuelta a casa"). F40's reworded post-form `<select>` options were left
untouched. `check` 0 errors, `build` clean, vitest 189 green (was 194; -5
from the removed grouping tests).

### F42 — Piece list cards: show what's available (interactive player / recording / PDF)

Human's request 2026-09-14: on a group's track list, a member or guest
should be able to tell what a piece actually offers (interactive player,
reference recording, PDF score) without opening it. Today only the
admin-mode Tracks tab shows this, as a ✓/– badge row
(`TracksTab.svelte`'s `.track-contents`); the member (non-admin) card and
the guest join-page card show nothing but the title.

The presence signals already exist and are already the exact vocabulary
the piece detail page (`piece/[id]/+page.svelte`) uses to decide what to
render: `has_music`/`hasMusic` → interactive player, `has_pdf`/`hasPdf` →
PDF pane, `youtube_url`/`youtubeUrl` (non-null) → reference recording. No
backend or schema change needed.

One nuance: both the member Tracks tab and the guest join page fall back
to a small bundled/local piece registry (`$lib/pieces/registry.ts`,
`getPieceByTitle`) for the two demo pieces that ship with the app, which
can offer a player/PDF without the Backend flags being true at all
(`TracksTab.svelte`'s existing `bundled`/`practiceHref` logic already
handles this for the visibility filter and the play button). The new
indicator must derive availability the same way, not read `has_music`/
`has_pdf` raw, or the bundled pieces will show as offering nothing.

Acceptance criteria:
- [x] Member (non-admin) track card shows a compact "what's available"
  indicator (interactive player / reference recording / PDF), present-only
  (no need to call out what's missing the way the admin ✓/– badge does).
- [x] Guest join-page piece card shows the same indicator.
- [x] Availability accounts for both the Backend-reported flags and the
  bundled-registry fallback, matching the existing `practiceHref`/
  visibility-filter logic exactly (a bundled demo piece shows correctly).
- [x] Reuses existing i18n keys (`groups_track_has_music`/
  `groups_track_has_pdf`/`groups_track_has_reference`) unless the wording
  genuinely doesn't fit a member/guest audience, in which case adjust
  those strings (both `en.json`/`es.json`) rather than fork new ones.
- [x] Admin mode's existing ✓/– badge row is untouched.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green.

**Built 2026-09-14:** added three `@const`s alongside the existing
`bundled`/`practiceHref` computation in both `TracksTab.svelte` (member
branch) and `join/[code]/+page.svelte` (guest card) — `availableHasPlayer`/
`availableHasReference`/`availableHasPdf` — each `||`-ing the Backend flag
(`has_music`/`youtube_url`/`has_pdf`, or the guest `GuestPiece`'s camelCase
equivalents) with the matching field on the bundled fallback `Piece`
(`load`/`youtubeUrl`/`pdfUrl`), so a demo piece with none of the Backend
flags set still shows correctly. Rendered as one present-only `<p
class="card-meta">` line, items joined with " · " (the same separator
`ResponsibilityDateCard`/`HomeworkCard`/`CarpoolBoard` already use for
compact meta lines elsewhere), fixed order player/reference/PDF, nothing
rendered when nothing is available. Reused
`groups_track_has_pdf`/`groups_track_has_reference` as-is; reworded
`groups_track_has_music` from "Music file" to "Interactive player" (`en.json`)
/ "Reproductor interactivo" (`es.json`, matching `piece_view_player`'s
existing "Reproductor") since "Music file" read like a filename in a
present-only list, not "there's a player here" — checked it still reads
fine in the admin ✓/– row too ("✓ Interactive player" / "– Interactive
player"), so no key fork was needed. Admin's `.track-contents` badge row
untouched. `check` 0 errors, `build` clean, vitest 189 green (unchanged,
no new tests per this milestone's own acceptance criteria: markup-only,
same as F37).

### F43 — Sort member/guest piece lists by resource count, most populated first

Human's request 2026-09-14, right after F42: a member/guest browsing the
piece list should see the most-resourced pieces (player + recording + PDF,
i.e. the ones they can actually do the most with) first, not whatever
order the Backend happens to return.

Scope: the member (non-admin) Tracks tab and the guest join-page piece
list only. Admin's management list keeps its existing order deliberately,
since admin already sees full detail via the ✓/– badge row, and re-sorting
a list an admin is actively editing (upload a PDF, track jumps position)
would be disruptive rather than helpful.

F42 already computed per-piece availability (`availableHasPlayer`/
`availableHasReference`/`availableHasPdf` in `TracksTab.svelte`, the
mirrored derivation in `join/[code]/+page.svelte`) accounting for both the
Backend flags and the bundled-registry fallback. F43 reuses that, extracted
somewhere shared enough that both files' sort and per-card render read off
one function rather than drifting.

Acceptance criteria:
- [x] Member Tracks tab (`mode !== 'admin'`) lists pieces most-resourced
  first (count of player+reference+PDF available, descending).
- [x] Guest join-page piece list, same ordering rule.
- [x] Ties keep a stable, sensible order (whatever the list's existing
  order was among equally-resourced pieces, not re-shuffled).
- [x] Admin's Tracks tab list order is unchanged.
- [x] The count/availability logic has one shared home (a pure function),
  not divergent copies between the sort and the F42 display line, and
  ideally not divergent between the member and guest files either if that
  can be done without forcing an awkward shared import between a route
  file and a tab component.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green (add a
  unit test for the sort/count helper if it lands somewhere testable).

**Built 2026-09-14:** extracted F42's inline `availableHasPlayer`/
`availableHasReference`/`availableHasPdf` derivation into a new
`$lib/pieces/availability.ts` (`pieceAvailability(hasMusic, hasPdf,
youtubeUrl, bundled)` returning a `PieceResourceFlags` object, plus
`resourceCount(flags)`), shared by both `TracksTab.svelte` and
`join/[code]/+page.svelte` for their F42 display line (unchanged
rendering, just sourced from the shared function now) and their new F43
sort. `TracksTab.svelte`'s `visibleTracks` (member branch only) now does
`[...filtered].sort((a, b) => trackResourceCount(b) -
trackResourceCount(a))` on a copied array, `trackResourceCount` computing
each track's `bundled` piece the same way the existing filter/
`practiceHref` logic already does; `join/[code]/+page.svelte`'s
`visiblePieces` gets the same treatment via a `guestPieceResourceCount`
helper over `GuestPiece`. No secondary sort key: JS's stable `.sort()`
keeps ties in their pre-sort relative order on its own. Admin's
`data.tracks` branch untouched (still unsorted, unfiltered). Added
`availability.test.ts` covering `pieceAvailability` (Backend flags,
bundled-only fallback, either-is-enough) and `resourceCount` (all-three
vs. two-of-three ranking, stable-sort tie preservation). `check` 0 errors,
`build` clean, vitest 195 green (was 189; +6 new).

## Backlog

- ~~**Persist F12 annotation mode + F13 audio source per piece**~~ **done 2026-09-02** (with the F21/F22 batch). `PersistedSettings` grew `showMineMarkup` / `showDirectorMarkup` / `audioSource` (all optional). "Annotation mode" here = the F21 layer-visibility toggles, not the transient armed-tool state. The toggles persist via a guarded `$effect` in `piece/[id]/+page.svelte` (no page-level setter, same shape as the zoom-persist effect); `audioSource` persists from `setAudioSource` and is restored only when the stored value is `'reference'` **and** the restored `viewMode === 'pdf'` **and** `piece?.youtubeUrl` is set. F4's separate score-marker toggle was out of scope.
- ~~**F11 fast-follow — group-published markup layer**~~ **→ promoted to F21** (2026-09-02), redesigned as a shared group-owned layer any admin co-edits (no per-author publish). See F21.
- **F11 fast-follow — import/export markup:** the human's other ask alongside the group layer, also deliberately deferred — no shape decided yet (a portable file format? peer-to-peer copy of one person's marks to another?).
- Track "last opened piece" server-side, to power a real Home "Continue practice" card (currently fixture/bundled-demo-only)
- Admin default tempo only rides along on the group Tracks tab's and personal Library's practice links so far — the guest join page's practice link doesn't carry `?defaultTempo=` yet since `GuestPieceOut` doesn't expose `default_tempo_bpm`
- Admin's Assignments/Tracks tabs have no edit/delete UI yet (Backend supports `DELETE /homework/{id}`; no equivalent for tracks)
- `/groups/new`'s form only asks for a name — the Backend's `GroupCreate` schema has no fields yet for a description or default-sections checklist
- Preserve fully independent polyphonic notation in the player-generated MusicXML — same-onset notes render as chords now, but truly independent overlapping rhythms on one staff still need a multi-voice representation
- **Shared OSMD-view code between `ScoreView` and `EditorScoreView`.** `stepCursorTo`/`walkCursorTo` (identical pure cursor-stepping algo), the `osmdOptions()` builder, the follow-scroll block, the zoom controls (identical markup + ~45 lines of CSS), and the theme CSS-custom-prop block are duplicated. Extraction candidate (`$lib/components/score/osmdCursor.ts` + a shared `<ScoreZoomControls bind:zoom />`) with a unit test — deferred, needs a click-through of both the practice player and the editor right after.
- Live tempo control for F5's stem-backed pieces — a real time-stretching problem, not a rate multiplier like the MIDI-synth player has
- Guest-side wiring for genuinely-new real pieces via join code (see F5's "Expanded" note) — closed via the fix logged 2026-08-29 below; kept here only if a similar gap resurfaces for a future upload path
- **Fix the live production Backend URL if it ever regresses**: the deployed Worker was once built with `PUBLIC_API_BASE_URL=http://localhost:8000` baked in — always deploy with `PUBLIC_API_BASE_URL=<real-backend-url> npm run build && npx wrangler deploy`, never a plain `npm run build`, so it's never silently sourced from whatever a local `.env` happens to hold
- ~~F23 fast-follow: email magic link as a second Save method~~ — moot: F25/Backend B21 (2026-09-11) dropped the PIN Save mechanism this would have been a second method *for*.
- ~~F23: extra nudges toward "Save across devices"~~ — moot for the same reason; F25 replaced the Settings Save flow with the join page's automatic "is this you?" name-match prompt, which needs no separate nudge.

## iOS app (paused 2026-08-27, moved here from root `plan.md`)

Condensed 2026-08-28 during repo cleanup — the root-level `plan.md` (the native
Swift/SwiftUI app this project pivoted away from) was deleted since it's a fully
separate, already-frozen sub-project; the day-by-day build log stays in git history.

**What existed:** M1 (Xcode/xcodegen scaffold) → M2 (MIDI parsing via AudioToolbox's
`MusicSequence`/`MusicEventIterator`, not `AVAudioSequencer` — `AVMIDIMetaEvent`
couldn't expose lyric/track-name payload bytes) → M3 (playback via
`AVAudioSequencer`/`AVAudioEngine`, verified surviving backgrounding on a real
device) → M4 (in-app follow-along: OpenSheetMusicDisplay in a `WKWebView`, flat/
highlighted/solo display modes, per-part balance mixing — frozen mid-milestone with
zoom controls and seek/scrub both confirmed broken, never fixed) — M5 through M7
(SwiftUI shell, PiP piano-roll renderer, PiP controller) were never started. The
MIDI-parsing heuristics and `MusicXMLConverter` quantization math carried over
conceptually into this Frontend's own `$lib/midi`/`$lib/musicxml`, rewritten in TS.

**Standing constraint, if iOS work ever resumes:** keep pure-algorithm Swift free of
Foundation/UIKit types where the logic itself doesn't need them — plain data in,
plain data/strings out. Turns a future Android port into translation rather than
redesign. No Kotlin Multiplatform or cross-platform framework until Android work
actually starts. (Also recorded in this session's own persistent memory,
`divisi-android-portability.md`.)

**Fixture provenance:** the `Fixtures/*.mid` files (still used by this Frontend and
the Backend) are synthetic, generated via `Fixtures/generate.py` (mido)
approximating the opening of Mozart's Requiem's "Requiem aeternam" — not a verified
transcription, since CPDL/8notes/MuseScore/smallchurchmusic all blocked automated
fetching or required accounts.

## Log

*Condensed 2026-08-29, again 2026-09-02 (entries tightened to 1-3 sentences, superseded runs collapsed to markers). See each milestone's own section above for full acceptance-criteria/task detail; this is a chronological breadcrumb, not a re-narration.*

- 2026-09-11: Built F25 (frontend for Backend B21): dropped F23's "Save across devices" PIN form entirely and replaced it with a join-page "is this you?" name-match reconnect. `localProfile.ts` lost `saved`/`markProfileSaved()` (no client-side "saved" state left to track); Settings drawer's guest Account section shrank to one line plus the existing Create account/Log in buttons. The join page's lazy name prompt now calls a new `/join/[code]/name-matches` proxy (thin pass-through to the Backend's public `GET /guest/{code}/name-matches`) right after a name is first typed; a hit shows candidates (name + title or joined date, mirroring `MembersTab.svelte`'s title convention) with a decline escape hatch, and confirming threads `claimUserId` through `/join/[code]/responsibilities/signups` into the Backend's `merge_participant`. The one-time post-signup banner and the unrelated `min_identity = saved` inline prompt both stopped referencing the removed Save flow (the latter now points at registering a real account instead). `check` 0 errors, vitest 125 green. Not deployed.

- 2026-09-11: F24's "Preview Admin" half built (frontend for Backend B20). `$lib/api/guest.ts`'s `GuestGroup` gained `adminPreviewAvailable` (from `admin_preview_available`); a new `$lib/demoPreview.ts` store (plain `svelte/store`, matching `localProfile.ts`) holds the currently-viewed guest join code + whether it offers preview, set/cleared by `join/[code]/+page.svelte` via an `$effect` on `data.result`. Settings drawer's guest section gained a "Preview Admin" block gated on that store; clicking it posts to a new `/join/[code]/admin-preview` proxy (`app/routes/join/[code]/admin-preview/+server.ts`), which calls the Backend's `GET /guest/{code}/admin-preview`, sets the normal session cookie (`$lib/server/session.ts`) plus a new non-httpOnly `divisi_demo_preview` marker cookie (`$lib/server/demoPreviewSession.ts`), and navigates to `/groups/{group_id}` with `invalidateAll` (needed because the cookie was set via a plain `fetch`, outside SvelteKit's own invalidation tracking, same reason `saveAcrossDevices` calls it). `hooks.server.ts` reads the marker into `locals.demoPreviewJoinCode`, threaded through the root `+layout.server.ts` into `PageData`; the root layout renders a persistent, non-dismissible banner with "Exit preview", which posts to a new `/demo-preview/exit` route that reads the join code back out of the marker cookie, clears both cookies, and redirects to `/join/{code}`. Spot-checked `PREVIEW_READ_ONLY:` 403 legibility on 3 admin flows against a locally seeded demo group (docker compose + a real Playwright walkthrough): the page-settings toggle and homework-creation actions already forwarded `BackendApiError.message` into a visible slot for free; the responsibilities tab's signup/assign and cancel/reinstate forms did not (a silent no-op), so added the missing `form?.error` rendering there (`ResponsibilitiesTab.svelte`). Verified end to end: Settings shows "Preview Admin" only for the Backend-flagged demo group (confirmed absent for a second, non-demo seeded group), the full admin view renders, a blocked page-settings write shows the legible message and left `homework.enabled` unchanged (re-checked via a direct curl with the real admin's own token), and "Exit preview" clears both cookies and lands back on `/join/{code}`. `check` 0 errors, `build` clean, vitest 126 (+12). Not deployed; needs the human's real-browser pass once `DEMO_JOIN_CODE` is set on Render.

- 2026-09-09: F23 built. New `$lib/localProfile.ts` (svelte/store-backed, unit-testable): a silent `localStorage` profile (`localId` + lazy `displayName` + `saved`/`signedUp`/`bannerDismissed` flags) from the first visit. Guest responsibility self-signup is now wired on the `/join/[code]` tab (per-role "Sign me up" via `ResponsibilityDateCard`'s `roleExtra`), through a new `/join/[code]/responsibilities/signups` proxy that mints B19's anonymous participant and re-sets its `divisi_participant` cookie first-party (`$lib/server/participantSession.ts`); the display name is prompted once, then reused. Settings drawer gained a "Save across devices" section (name + numeric PIN → `/settings?/saveAcrossDevices` → B19 `POST /auth/save`, stores the returned bearer as the session). Plus the one-time post-signup banner, the roster "Unverified" badge (`GroupMemberOut.is_anonymous`), and an inline "needs a saved account" prompt for the `SAVE_REQUIRED:` 403. Build-time findings: no guest annotation/homework write store exists to migrate (annotations are members-only, guest homework/markup read-only); PIN is 4-8 digits, `inputmode=numeric`, client-validated. en+es keys added. `check` 0 errors, `build` clean, vitest 114 (+32). Needs a real-browser pass (silent profile, lazy prompt, Save via PIN, same data on a 2nd browser, the banner).

- 2026-09-09: Brainstormed lowering the account barrier with the human (chat only, no code). Guests already read everything, so the wall is the singer's first stateful action. Agreed a local-first identity: a silent local profile (localId + name in localStorage) from the first visit, the Backend mints an anonymous participant on the first shared action, and "Save across devices" in Settings promotes it to a real cross-device account (name + PIN, email magic link later; Google was considered and dropped 2026-09-09). One dismissible post-signup nudge; roster badges unverified participants. Captured as Frontend F23 / Backend B19.

- 2026-09-03: F22 — PDF cue glyphs now always render in the player for every viewer (logged-in members and not-logged-in join-link guests) whenever the audio source is the reference recording, independent of the per-viewer "Show director markup" toggle. New `cueLoader` controller dep + `syncCues` load the cue subset of the group layer unconditionally; `markVisibleOnPage` pure helper gates a `cue` only on `showCues`; `PdfMarkupLayer` mounts its SVG on `markup.cuesVisible` even where `canMarkup` is false. Guests read cues via a new `GET /guest/{code}/pieces/{id}/cues` (cue-only, tracks/everyone gate) behind a `?code=` guest branch added to `piece/[id]/markup/+server.ts`'s GET; new client fn `listGroupCues`. Director pen/stamp/text ink unchanged (toggle-gated, members-only); editing cues unchanged. `check` 0 errors, `build` clean, vitest 82; not browser-exercised (standing blocker).

- 2026-09-03: Wired the Backend's new `Piece.presentation` hint ("Opens as: Auto / Score + reference recording / Play-along mix", set from the Rehearsal Tracks edit panel). Threaded `presentation` through `RemotePieceMeta` / `LibraryEntryOut` / `resolve/+server.ts` (both authed and guest branches) and `buildRemotePiece`. `piece/[id]/+page.svelte` gained `seededPresentation()`: on a first-ever open of a piece carrying the hint, and only when the piece actually has the panes it needs (PDF + reference recording, or a player), it seeds `viewMode`/`audioSource` accordingly; any viewer who has opened the piece before (a persisted settings blob exists) gets the unchanged pane-shape default and `bootstrap()` restores their own pick. `bootstrap()` itself untouched. 5 en+es keys (`groups_presentation_*`, `groups_invalid_presentation`). `check` 0 errors, vitest 79, `build` clean; not browser-exercised (standing blocker).

- 2026-09-02: Responsibilities selected-date panel declutter (reported live: "two Cancel buttons, two delete options, Duplicate does nothing"). The event-state toggle now reads "Cancel date" / "Reinstate date" (new `groups_cancel_date`; `groups_reinstate` reworded) so it stops colliding with the delete-confirm's "Cancel". Delete `ConfirmButton` moved to its own `.delete-row` below the Edit/Lock/Cancel row (its expanded "Delete this date?" prompt had been wrapping into that row and reading as duplicate buttons). "Duplicate next week" now `await tick()` + `scrollIntoView`s the prefilled Add-date form, which renders at the top of the tab, off-screen from where the button lives. Also linked the upcoming-dates strip to the selected-date panel visually: the active chip gets an `inset` accent ring + a downward caret (`::after` diamond) pointing into the roster below, and the panel's card gets a 3px accent top border + accent "Selected date" label, all keyed off `var(--accent)`. The strip itself switched from a wrapping `auto-fill` grid to a single horizontal-scroll flex row (`overflow-x: auto`, fixed 10rem chips, `scroll-snap`), so it stays one row tall however many dates exist. Strip + selected-date roster are now one `.card` (was two): `ResponsibilityDateCard` gained a `flush` prop that drops its own card chrome for embedding. Inside that card the selected date's roster sits in its own accent-outlined, faintly accent-tinted box, and the active chip has a solid accent caret pointing down into it, so chip + roster read as one connected shape (robust under the horizontal scroll — no position math). Dropped the now-redundant "Selected date" eyebrow + whole-date status badge from that box (the outlined box + caret already say "selected", per-role badges + the chip's fill count already say coverage); removed `dateStatusLabel` and the `responsibilities_{selected_heading,badge_empty,badge_needs_people,badge_covered}` keys. Selected-date admin action row slimmed to Edit / Cancel date / Duplicate next week: the standalone delete `ConfirmButton` is gone (delete is already in the Edit panel via `EditableCard`'s built-in confirm-then-delete), and the Lock/Unlock toggle is gone (`groups_{lock,unlock}` keys deleted; `d.locked` still renders on the chip/card and still gates signup, just no longer toggleable from this tab).

- 2026-09-02: Responsibilities dates: resolve the `datetime-local` field to a UTC ISO string on the client (`datetimeLocalToIso` in `dates.ts`, applied in `use:enhance` via a new `EditableCard` `beforeSubmit` hook) instead of in the form action, which runs on Cloudflare's UTC clock and shifted a 7 PM rehearsal to 12:00 for viewers behind UTC (caught live). Also added a ‹ / › week stepper to the quick-add panel (walks the group's weekly slot forward/back, floored at the next occurrence) and an inline delete on the selected date. en+es `responsibilities_quick_add_{prev,next}_week`.

- 2026-09-02: **Cleanup round 2: god-files** (no behaviour change; git `d85eb0c`..`d92054d`, detail there and in the now-deleted root `CLEANUP.md`). Round 1 was duplication-focused; round 2 targeted single-responsibility and file size via helper/action extractions (`score/scoreTreatments.ts`, `player/mixMath.ts` + `player/persistence.ts`, the repo's first custom Svelte action `$lib/actions/pinchZoom.ts`), stateful `.svelte.ts` composables (`player/annotations.svelte.ts`, the `components/pdf/` markup controller), the backend `library.py` → `library/` package split, and (this session) `groups/[id]/+page.server.ts` → per-tab `actions/*.ts` and `groups/[id]/+page.svelte` (2070 → 158 lines) → `tabs/*.svelte`. Markup verified identical against the pre-split files. Deferred: player transport/mix composables, `db/models/` split, further `ResponsibilitiesTab` breakup. `check`/`build` clean, vitest 63; not browser-exercised (standing blocker).

- 2026-09-02: **Pre-push cleanup pass** (no behaviour change). Deleted the throwaway F14 engine spike (`src/lib/spike/musicXmlEdit.ts` + the `/spike/f14-editor` route, which had been shipping to production unguarded); collapsed `resolve/+server.ts`'s two identical `GET /groups` calls into one `resolveOwningGroupRole()`; extracted `Disclosure.svelte` and `$lib/components/score/osmd.ts` for chrome / OSMD-option duplication F20 had introduced. `check` 0 errors, `build` clean, vitest 107.

- 2026-09-02: **F20 built: "Piece Notes"** (frontend for Backend B16, which had shipped backend-only). `PieceNotesPanel.svelte` disclosure with two sections: **From the director** (group-wide, admin-authored via B16's `rehearsal-notes`, members read-only) and **My notes** (per-member private). The personal source is stored as a B5 `Annotation` at the reserved sentinel position `-1` (no new Backend work, and it syncs), so `piece/[id]`'s `loadAnnotations` now filters `positionWholeNotes >= 0` to keep those off the score. Shown on the piece page and in a lazy disclosure on each Rehearsal Tracks card; director section self-hides on 403/404. Same-day iPad follow-ups: Tracks-card controls gated on `mode === 'admin'`, player panel collapsed by default with a capped scroll body, responsive note grid, `pn-`-prefixed classes. Needs a human real-browser pass against a local Backend (B16 not yet deployed).

- 2026-08-31 – 09-01: **In-app notation editor + OMR seam/page review (F14–F19) — designed and built this stretch, later pulled off `main`.** ~25 log entries condensed here. The editor route (`/piece/[id]/edit`), `editableScore.ts`, `EditorScoreView.svelte`, `reviewPages.ts`, the OMR job-alert header (`OmrJobAlerts.svelte` / `omrJobs.svelte.ts` / `/omr` proxies), the Playwright `e2e/` harness, and the throwaway F14 engine spike were all developed on `feat/generate-track-from-pdf`: F14 editor + spike (correction-only OSMD editor on a MusicXML-DOM model) → F15 seam review → F16 working-draft save/publish loop (+ Backend B17) → editor playhead-desync fix + the e2e harness → F17 measures / range-clef mode → F18 undo/redo → F19 page-by-page draft review (+ Backend B18) → code-review fixes. All of it was then deleted from `main` as unverified WIP. That work now lives on the `omr-editor` branch with its own plan (`OMR_EDITOR_PLAN.md`, milestones E1–E10) and its own log; full detail there and in that branch's git history. The dormant Backend OMR code stayed on `main`, UI-unreachable.

- 2026-09-01: Added `.mxl` (compressed MusicXML) upload + playback support. New `$lib/musicxml/mxl.ts` (`isMxl` / `extractMusicXmlText`, backed by `fflate`) follows `META-INF/container.xml` to the rootfile, normalizes the path, strips a BOM, decodes a UTF-16 inner document; wired into `remotePiece.ts`'s `loadRemoteMusicFile` (a corrupt ZIP surfaces as the existing "Malformed MusicXML" failure), `FileSlot.svelte`, and the `groups/[id]` track upload picker. Mirrors the Backend's `app/omr/pipeline.py` handling. vitest +12 (`mxl.test.ts`).

- 2026-09-01: Responsibilities tab: whole-date coverage meter + restructure (no milestone number; built alongside the editor stretch, recorded after the fact). New `coverageTotals(roles)` in `groupCards.ts` rolls per-role needed/active counts into `{ active, needed, openSlots, filledFraction, status }` (`empty`/`underfilled`/`covered`/`overfilled`, no lending of surplus); new `CoverageMeter.svelte` renders the bar. The tab now shows upcoming dates as a compact strip (chip + meter per date) with only the selected date expanded, plus admin quick-adds (New role-set / Add-date / "Duplicate next week" / "Next rehearsal" prefilled from the group's weekly slot). en+es `responsibilities_*`; vitest +6; `check`/`build` clean. Needs the human's confirmation the reconstructed intent is right, and a real-browser pass.
- 2026-08-30: Found and fixed a real bug live-testing F13: `getPieceByTitle()` (F10) was preferred *unconditionally* over a real Backend piece's own content in all three places it is used (the personal library, the group Tracks tab, the guest join page), so a real admin-uploaded track sharing a title with a bundled fixture (e.g. "Lacrymosa") always played the bundled asset and silently ignored the admin's own music/PDF/YouTube link. Fixed to fall back to the bundled match only when the real piece has neither `has_music` nor `has_pdf` of its own, which is `getPieceByTitle()`'s original intent (a working Practice button for a track with nothing wired up yet).
- 2026-08-30: `piece/[id]`'s back button now does a real `history.back()` when there is history, landing where the human actually came from (a specific group's Tracks tab, its scroll position, admin vs. member view). The old destination-guessing logic stays as the fallback for a direct open / fresh tab / deep link.
- 2026-08-30: Brought `/settings/more` in line with every other screen: same `AppHeader`/`BottomNav` chrome instead of its own bare `<main>` + hand-rolled breadcrumb, and the same guest-via-join-code handling as `/settings`. Dropped the redundant breadcrumb text and, at the human's request, the "How Divisi works" section (`more_how_it_works` key deleted).
- 2026-08-30: F13 polish at the human's follow-up after trying it live: the "Audio source" section moved directly under View and now always renders in PDF view whenever the piece has any audio at all, with the missing source shown as a `disabled` picker button instead of the whole section disappearing.
- 2026-08-29: Built F11 (PDF markup: freehand pen + stamps), additive alongside F4's annotations per the human's explicit follow-up. Used a portable Node install already on the Windows machine to get real `npm run check`/`build` verification for the first time this session (0 errors both), which caught two real reactivity bugs (`activeStrokePage`/`recentMarkIds` needed `$state`) before they shipped. Deployed to the isolated Cloudflare preview Worker; drawing won't save/load there until the Backend deploys F11's endpoints.
- 2026-08-29: Built F4's real annotation UI (create/view/edit/delete/share/unshare, rendered as score markers via OSMD's multi-cursor support; see F4's "Expanded" note). Added one small Backend endpoint along the way (`GET /annotations/{id}/shares`). Confirmed `check`/`build`-clean in the F11 entry above once real Node tooling was found; originally shipped hand-reviewed only.
- 2026-08-29: Built F10 (locked down the bundled piece registry), the human's direct follow-up after F9 (see F10's section for the mechanism). `check` 0 errors / `build` clean.
- 2026-08-29: Built F9 (graceful error handling app-wide; see F9's section). Verified live via a real kill-Backend/restart-Backend cycle in both locales.
- 2026-08-29: Built F8 (Spanish localization; see F8's section). Not deployed; local-only, not clicked through in a real browser. Layered on top of the same-day guest-piece-upload fix below.
- 2026-08-29: Fixed a real F5 gap: real Backend pieces were completely unreachable as a guest: the guest listing filter, `piece/[id]`'s guest branch, and both file/pdf proxy routes all assumed a member session. Fixed all four and threaded the join code through `remotePiece.ts`; verified live via Playwright and curl against production, deployed straight to production.
- 2026-08-28: Built and deployed F7 (Weekly Notes tab + guest sign-in banner) to production, with `SettingsDrawer.svelte`'s "Change password" section against the Backend's `PUT /auth/me/password`. Stood up an isolated Cloudflare Workers preview for the human to review first. Live Playwright pass (human away, explicitly authorized) caught two real bugs no amount of `check`/code-reading would have; see F7's section.
- 2026-08-29: Added a regular weekly rehearsal schedule (F6's "Expanded" note) after the human reported responsibility-date times not storing properly; the Backend round trip checked out exactly right via curl, so this builds the requested "Next rehearsal" quick-fill rather than chasing a bug that didn't reproduce.
- 2026-08-29: Built F5's expanded scope (real piece uploads) on a Windows machine with no browser/Playwright: see F5's "Expanded" note for what stays unverified. Not deployed; local-only, on top of a fresh `git clone` (two `"`-quoted fixture PDFs couldn't check out on Windows, harmless here).
- 2026-08-28: Deployed a round of live-testing fixes: Settings-drawer inline "Edit name" + click-to-confirm "Delete account"; admin default-tempo control + `?defaultTempo=` on practice links; several `ScoreView`/`PdfView` rendering bugs (current-note accent landing on VexFlow wrapper `<g>`s not leaf shapes, cursor-follow scrolling the wrong ancestor, a concurrent `page.render()` race in `PdfView`, a reload layout race); sticky zoom controls; a mobile-Safari `font-size: 16px` fix for the iOS zoom-on-input-focus trigger. Verified live by the human (project convention), not Playwright.
- 2026-08-28: **Morning summary**: overnight, unsupervised, per explicit direction. Shipped the Frontend half of Backend B14 to production (register-twice, forgot/reset-password pages, oauth-callback route, conditional OAuth buttons). Repo cleanup: this file gained the "UI/UX conventions" and "iOS app" reference sections, condensed from three now-deleted root docs. Also fixed a real `ScoreView` zoom-loses-scroll-position bug (now measures the viewport's vertical-center as a fraction of content height across `osmd.render()`); flagged `groups/[id]/+page.svelte` (1000+ lines) for modularization and left "cursor following isn't quite right" alone for lack of specifics.
- 2026-08-28: Deployed F6 plus everything added to it from live testing (settings-as-a-drawer, member role management, responsibility edit/delete, group description, Home's "Upcoming responsibilities"). Chased a real bug live: "saving page settings reset all the checkmarks" was a one-way `checked={...}` binding with no `bind:`, fixed by driving the form from real local `$state`.
- 2026-08-28: Built F6 (group page settings + Responsibilities) to catch the Frontend up on Backend B12/B13. Fixed a real gap B12 introduced: `/groups/[id]` and `/home` both called member-facing routes unconditionally, which now 403 a non-admin once their group's admin disables that page; both now treat a 403 there as "hide this tab" rather than failing the whole load.
- 2026-08-28: Rewrote F5 after the human questioned its premise directly ("I don't think we need a better renderer do you?"; see F5's section). Deleted `src/lib/api/manifest.ts` / `src/lib/server/manifest.ts` (built for the abandoned stems design, never committed, unreferenced).
*2026-08-27 condensed 2026-08-30 — the F1-prototype day, ~30 granular entries folded into the summary below. Full detail is in git history.*

- 2026-08-27: **Project started** as a product pivot: the iOS app is paused in favor of this web app. Chose SvelteKit + shareable join-link guest access; drafted the milestone skeleton, detailed F1–F5, added Backend B6/B7. Reprioritized mid-day to prove playback + notation frontend-only first: collapsed the old F2/F3/F4 into one new F1, demoted old F1 (guest access) to F2.
- 2026-08-27: **F1 built and approved** as MVP-done. SvelteKit scaffold; `MIDIParser`/`MusicXMLConverter` ported to TS; WASM FluidSynth via vendored `<script>` tags; `playbackMidiBuilder.ts` after finding the dev fixtures put every track on channel 0. Key fixes: `AudioWorkletNodeSynthesizer` on a dedicated thread to stop synth glitches during OSMD re-renders; synth output routed through a real `<audio>` element (the only way iOS grants background/lock-screen playback); a document-wide tempo pre-scan (only one part's MusicXML carries `<sound tempo>`); cursor-flicker / solo-mode cursor-scaling fixes; click-to-seek via OSMD hit-testing.
- 2026-08-27: Added a MusicXML importer for "The Challenge of Thor" (its MIDI export has no usable track structure); extracted the shared voice-part heuristic so both parsers use one implementation. Wired lyrics to the score (`attachLyrics()`); switched Lacrymosa to the MusicXML importer to keep its 341 lyric events.
- 2026-08-27: Upgraded the mixer/visual model from fixed Full/Highlighted/Solo to presets + per-track Off/Muted/Active; accompaniment shown as one simplified bass-clef cue staff; same-onset notes grouped into MusicXML chords (independent overlapping rhythms still need multi-voice, see Backlog).
- 2026-08-27: Forced a PDF-viewer rewrite: mobile Safari's iframe PDF viewer has no toolbar or pinch-zoom at all; replaced it with `PdfView.svelte` on `pdfjs-dist` matching the score view's zoom UX, and added pinch-to-zoom to `ScoreView` too.
- 2026-08-27: **F3 built** (app-shell UI from `UX_WIREFRAME.md`, all screens as real routes against fixture data), then **F2** (guest listing, scope narrowed, Backend CORS added), then **F4** (login + groups/home/library wired to the real Backend). UX pass: `AppHeader.svelte`, `BottomNav` → Home | Library | Groups, the admin route merged into a Member/Admin toggle, `/groups/new` flow. Real bug fixed via curl: the guest-settings endpoint wasn't a true partial patch.
- 2026-08-27: **Live production bug**: `divisi.maripi.net` 500'd on every Backend route because the deployed build had `PUBLIC_API_BASE_URL=http://localhost:8000` baked in from a local `.env` (the bundled-demo player had masked it with zero Backend calls). Added check-only CI (`frontend-ci.yml`); deploys stay manual; the URL fix is a manual build-time step, tracked in Backlog.

## OMR + Notation Editor (formerly `OMR_EDITOR_PLAN.md`)

This plan owns the scanned-PDF → MusicXML (OMR) pipeline and the in-app notation-correction editor built on top of it. It was split out of `Backend/plan.md` and `Frontend/plan.md` on 2026-09-01 so those two plans stay focused on core product work; milestones here are prefixed `E`. The work spans both halves of the stack: the backend (`app/omr/`, the `/omr/*` routes, Alembic migrations) and the frontend (`/piece/[id]/edit`, `EditorScoreView`, `EditableScore`). The E1..E10 order below follows build and dependency order, so backend and frontend milestones interleave.

## Milestone map

| New | From | Title | Status |
|---|---|---|---|
| E1 | B8 | OMR pipeline | ✅ Done (verified end-to-end on macOS) |
| E2 | F14 | In-app notation editor for a track's music | 🚧 In progress — edit/save/export loop done 2026-08-31 (route, editable model, editing surface, MusicXML export, save-as-draft, unsaved guard, entry points, i18n). **Reopened 2026-08-31** for in-editor playback — full transport (play/stop, seek, tempo, per-part mix), playback cursor + follow-scroll, note-preview-on-select, full-screen player-style shell: **all Claude tasks done 2026-08-31**, pending the human real-browser pass + acceptance-criteria sign-off. Playhead reworked + desync fixed 2026-09-01, now with a Playwright e2e regression test (`Frontend/e2e/`) — that pass caught and fixed a per-frame `osmd.render()` stall. |
| E3 | B16 | Paged OMR pipeline | ⏳ Claude tasks done (full suite 181 green); human hasn't run a real multi-page scan through it. Migration `d2f8a6c4e1b9` not yet on production — reaches prod only via merge to `main` (its parent `c1f7a4d2e8b6` is already on prod + `main` as of 2026-08-31) |
| E4 | F15 | Review a segmented OMR result in the editor | ⏳ Built, `check`/`build`-clean, vitest 58 green. **Review UX superseded by E10** (page-by-page); seam-onset mapping + markers are kept and reused there |
| E5 | B17 | Working-draft slot + per-page OMR progress & re-run (backend) | ⏳ Claude tasks done (202 green); human hasn't run a real multi-page scan + re-run through it. Migration `e7b1c9d3a2f4` not on production — reaches prod only via merge to `main` |
| E6 | F16 | Working-draft slot: labelled editing, seam-fill, per-page progress & re-run (frontend) | ⏳ Claude tasks done, `check`/`build`-clean, vitest 67 green. Working-draft slot / save / publish / re-run / insert-bars all kept; the seam-first **review flow is reorganised by E10**. Still needs E5 deployed |
| E7 | F17 | Editor "Measures" mode: select a bar range, change its clef | ⏳ Claude tasks done + first live-test round fixed (bar selection, highlight geometry, clef-row label), `check` 0 errors, vitest 76, e2e 6 green (new `editor-measures.spec.ts`); still wants a human confirm |
| E8 | F18 | Editor undo / redo | ⏳ Claude tasks done — snapshot stack, toolbar buttons, Cmd/Ctrl+Z / Shift+Z / Ctrl+Y, dirty-state tracked back to last save; `check` 0 errors, vitest 89 (+6 `editHistory`), `build` clean; needs a real-browser pass |
| E9 | B18 | Per-page measure offsets in the paged report (backend) | ✅ Built 2026-09-01 (`pytest` 205 green); no migration, report-shape only. Feeds E10 |
| E10 | F19 | Page-by-page review of a generated draft (frontend) | ⏳ Claude tasks done 2026-09-01, `check`/`build`-clean, vitest 103 green; needs the full real-browser pass (replaces E4's + E6's pending passes). Supersedes the E4/E6 review UX. Reworked 2026-09-01 to a strict in-order one-page-at-a-time review bar (no tab stepper / chip rail) with the score pane locked + dimmed to the current page and trimmed editor chrome during review; model unchanged. Still needs the real-browser pass |

### E1 — OMR pipeline (formerly B8)

**Acceptance criteria:**
- [x] Uploading a scanned sheet-music PDF produces a job id; polling it eventually returns MusicXML/MIDI output for a real test PDF

**Tasks — Claude:**
- [x] `app/omr/audiveris.py` (subprocess wrapper), `app/omr/oemer.py` (subprocess wrapper — wraps the CLI, not a direct import; oemer has no other stable entry point), `pipeline.py` (chooses/chains engine, normalizes to MusicXML)
- [x] Background-task job tracking (DB row: pending/running/done/failed + result path)
- [x] `/omr/jobs` POST (upload) + `/omr/jobs/{id}` GET (status/result) endpoints
- [x] Follow-up: `POST /omr/jobs/{id}/import` turns a `done` job's result into a real `Piece`/`PieceVersion`
- [x] Follow-up (2026-08-31): `GET /omr/jobs` lists the caller's own jobs (newest first, +piece/group context) for the Frontend's "your generation finished" header alert
- [x] `audiveris.py` now passes `-constant org.audiveris.omr.Main.sheetStepTimeOut=<audiveris_step_timeout_seconds>` (default 1800s) — Audiveris's own 120s-per-step default is too tight for real scores, not a sandbox artifact (see log below)

**Tasks — Human:**
- [x] Supply a real scanned sheet-music PDF to test the pipeline end-to-end — used `fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf` (real 4-part choral score, not a toy image)
- [x] Install Audiveris locally — GitHub release `.dmg` (bundles its own JRE, no separate JDK needed); recipe in `Backend/README.md`'s "OMR engines" section

**Verified 2026-08-31 (macOS, arm64):** Both engines installed and run end-to-end against the real fixture above (see log entry below for the full debugging trail — sandbox CPU/IO throttling, the 120s timeout, missing Tesseract language data, and two real bugs in oemer 0.1.8 itself). Audiveris correctly recovers the piece's 4-part (SATB) structure and OCR's its lyrics/title/composer; oemer's output flattens every staff into one part with notes stacked as chords and captures no lyrics at all (it has no OCR step) — confirms `pipeline.py`'s existing engine priority (Audiveris primary, oemer a last-resort single-page fallback) is the right call, not just a paper design.

### E2 — In-app notation editor for a track's music (formerly F14)

Requested 2026-08-31. E1 (OMR) can now generate a track's music
straight from its scanned PDF, but the output is rough (wrong accidentals,
stray/missing notes, off rhythms) and today the only way to fix it is to
download the file, edit it in desktop MuseScore/Finale, and re-upload. This
milestone puts an editor *in the app* so an admin opens it on a track's
music file, corrects the notation, and saves the result as a new draft
version — no round trip through another program. The human chose a full
in-app editor over the lighter options (external download/re-upload
round-trip; embedding a third-party web editor like Flat.io/Soundslice)
when asked.

**Engine decision (2026-08-31, from the spike): path 1 — correction-only
editor on OSMD, with a MusicXML-DOM editable model.** The spike
(`/spike/f14-editor`, `src/lib/spike/musicXmlEdit.ts` — throwaway, delete
once the real editor lands) proved the whole loop against the bundled
`SFCC/The_Challenge_of_Thor_Elgar.musicxml` fixture in a real browser:
click a notehead → OSMD `GraphicSheet.GetNearestNote` → resolve to a
`<note>` in a parsed XML `Document` (by part id + staff + absolute
whole-note onset, walked from `<divisions>`/`<backup>`/`<forward>`) →
mutate that element (transpose ±1 semitone rewriting
`<step>`/`<alter>`/`<octave>` + syncing `<accidental>`; delete = convert
to `<rest>` of the same `<duration>` so nothing downstream shifts) →
`osmd.load(serializedXml)` + `osmd.render()`. Verovio was not prototyped:
the OSMD loop cleared every bar path 1 needs, and Verovio would add a
~2 MB WASM payload to a page choir members open on phones, plus a
MusicXML↔MEI round-trip that risks dropping the PDF-carry-forward and
any data OMR emitted that we don't model. Findings that shape the build:

- **OSMD stays a pure view.** The editable model is the XML `Document`
  itself (mutate in place, re-serialize), *not* `$lib/musicxml/parser.ts`
  (read-only, no serializer) and *not* OSMD's internal `Sheet` graph
  (no edit API). Mutating the DOM leaves every element we don't touch
  (layout hints, unmodelled OMR output, the structure) exactly as-is —
  which is the whole point for "clean up an OMR result".
- **Click → note identity needs part-awareness.** OSMD numbers staves
  globally across the score; MusicXML `<staff>` is per-part. Map via
  `sourceNote.ParentStaffEntry.ParentStaff.ParentInstrument.IdString`
  (the MusicXML part id) + the in-instrument staff index + onset. A
  naive staff-number match picks a note in the wrong part.
- **Full re-render per edit is the main perf cost** — ~1.2 s on a
  3,751-note orchestral reduction; an OMR page (tens–low-hundreds of
  notes) will be far quicker, but debounce rapid edits and keep the
  "updating…" affordance `ScoreView` already uses. OSMD has no partial
  re-render.
- **Rough edges to finish in the real editor:** re-highlighting the
  edited note after re-render (the spike falls back to parking OSMD's
  playback cursor on it); chord handling on delete (spike only promotes
  the next chord member when the anchor note goes); accidental spelling
  on transpose is a fixed sharp/flat table, no key-aware respelling;
  duration edits (in path 1's set) not yet prototyped — straightforward
  DOM-wise but they shift following onsets, so they need the same
  measure-timing care `deleteToRest` took.

For the record, the paths that were on the table, cheapest first:
1. **Correction-only editor on our own render** — click a note, nudge its
   pitch/duration, delete it, fix a clef/key/accidental; no engraving, no
   adding measures from scratch. Built on OSMD (or Verovio for finer
   coordinate control) + our parsers as the model. Covers ~all of the
   "clean up an OMR result" use case with the least new surface.
2. **Adopt an editing library** (e.g. a Verovio-based editor toolkit, or
   an OSS fork of one) and wrap it. More capability, more integration and
   licensing risk, larger bundle on a page choir members open on phones.
3. **General-purpose editor from scratch** — full note entry, layout,
   parts. Its own multi-month effort; almost certainly out of scope here.

The spike (done 2026-08-31) picked path 1; everything below assumes it.

**Save path:** the editor exports MusicXML and POSTs it to the existing
`POST /library/pieces/{piece_id}/versions` (music-file slot), which already
creates a `draft` version with `source: modification` and carries the
PDF slot forward — the same endpoint Frontend F5's edit panel and E1's OMR
auto-import use. No new Backend endpoint needed for a first cut. The
current web player synthesizes client-side and sniffs MIDI-vs-MusicXML by
magic bytes, so a MusicXML version plays without the Backend B7 render pipeline
(which only renders MIDI sources — a known gap tracked in Backlog).

**Entry points:** an "Edit music" action in the group Tracks tab's admin
edit panel (`groups/[id]`, next to Replace/Delete), and on the piece page
for a user viewing their own/admin track. Opens a new `ssr: false` route,
e.g. `/piece/[id]/edit`, mirroring the player route's client-only setup.
Gated to the piece's review authority (group admin, or the owner for a
personal piece) — the same `require_piece_access` check the upload path
already enforces server-side.

**Acceptance criteria:**
- [x] The spike's engine decision is written into this section, with the
      reason, before any editor code lands (done 2026-08-31)
- [ ] An admin can open the editor on a track that has a music file, from
      both the group Tracks edit panel and the piece page; a member with no
      edit rights on that track never sees the entry point, and the route
      itself 403s/redirects them if reached directly
- [ ] The editor loads the track's current music file and renders it as
      editable notation (for a MIDI-source track, via the existing
      MIDI→MusicXML conversion; for a MusicXML-source track, directly)
- [ ] Within the agreed scope (path 1: at minimum change a note's pitch,
      change its duration, delete a note, and fix key/clef/accidental) the
      admin can make an edit and see it reflected in the rendered notation
- [ ] Playing back inside the editor reflects the edits (reuses the
      client-side synth path — `MidiPlayer` + `parseMusicXmlFile` — not a
      separate engine). The editor carries a full transport: play/stop, a
      seek scrubber with elapsed/total time, a tempo control, and a
      per-part (SATB + accompaniment) mix, in the same visual language as
      the practice player's bottom bar
- [ ] A playback cursor tracks the audio position across the score while
      playing, with follow-scroll and a "scroll to cursor" control; it
      does not fight the click-to-select marker (selection marker is
      suppressed while playing, restored on stop)
- [ ] Editing the score while it is loaded for playback is handled
      sanely: the old audio keeps playing, a hint says the edits aren't
      audible yet, and the next play/seek reloads from the edited model
- [ ] Selecting a note (click or arrow-key nav) and changing a note's
      pitch both sound that note through the same synth, so a correction
      can be heard, not just seen
- [ ] The editor is a focused, full-screen surface with its own chrome
      (back / title / Save, no `AppHeader`/`BottomNav`), matching the
      practice player's shell; designed desktop-first for this pass
- [ ] Saving POSTs the edited MusicXML as a new `draft` version on that
      piece; the existing PDF slot is preserved; the new draft then flows
      through the normal submit/approve/distribute review workflow
      unchanged
- [ ] Leaving the editor with unsaved edits warns before discarding them
- [ ] The edited version is what the player loads afterward (once it's the
      latest / approved version, per the existing version-resolution rules)
- [x] `npm run check` / `npm run build` both clean (2026-08-31, plus the
      55-test vitest suite green)
- [x] New `messages/en.json` + `es.json` keys for every editor-facing
      string (2026-08-31; the placeholder `piece_editor_coming_soon` removed)

**Tasks — Claude:**
- [x] **Spike:** prototype the minimal "click a note, change its pitch,
      re-render" loop (done 2026-08-31, `/spike/f14-editor` +
      `src/lib/spike/musicXmlEdit.ts`). OSMD cleared path 1; Verovio not
      prototyped (bundle + MEI round-trip not worth it once OSMD worked).
      Decision + findings recorded above.
- [x] Editor route (`/piece/[id]/edit`, `ssr: false`) + server `load`
      that resolves the piece and enforces edit access (done 2026-08-31).
      Unlike the player route (whose `load` stays instant for shared-link
      cold-start first paint), this route's `load` hits the Backend:
      resolves the piece via `/library/pieces`, then grants for a personal
      piece's owner (JWT `sub` vs `owner_id`) or an `admin` of the owning
      group (`/groups` `role`) — the same rule the Backend's
      `_require_review_authority` enforces on save. `denied`/`notFound`/
      `unreachable` all render as cards; the placeholder editor body only
      mounts for `granted`.
- [x] Load + parse the track's music file into an editable model (task 2,
      2026-08-31 — `$lib/musicxml/loadEditableScore.ts` sniffs MIDI/MusicXML,
      MIDI through `convertAllParts` first, `.mxl` rejected)
- [x] Editing surface for the path-1 operation set (pitch, duration,
      delete, key/clef/accidental), with keyboard + click interaction
      (tasks 3 / 3b / 3c, 2026-08-31)
- [x] MusicXML export from the edited model (2026-08-31 —
      `EditableScore.exportMusicXml()`: `serialize()` plus the XML
      declaration and a partwise DOCTYPE; 2 unit tests)
- [x] Save action → `POST /library/pieces/[id]/versions` with the exported
      file; success returns to the piece page on the new draft (2026-08-31 —
      new `piece/[id]/edit/save/+server.ts`; draft only, no auto
      submit/approve/distribute, per the plan's review-flow note)
- [x] Unsaved-changes guard on navigation away (2026-08-31 —
      `beforeNavigate` `confirm()` for in-app nav + a `beforeunload`
      listener for tab close / hard reload, both keyed off `dirty`)
- [x] "Edit music" entry points in `groups/[id]` Tracks edit panel and the
      piece page, admin/owner-gated (2026-08-31 — Tracks panel link shown
      when `track.has_music`; piece page link in the practice-setup drawer,
      gated by a new `canEditMusic` flag `resolve/+server.ts` computes with
      the same owner/admin rule as the editor route's `load`)
- [x] `messages/en.json` + `es.json` keys (2026-08-31)
- [x] `npm run check` / `npm run build` clean (2026-08-31)

**Tasks — Claude (reopened 2026-08-31 — in-editor playback + note preview + full-screen shell):**

Desktop-first for this pass; a mobile layout for the toolbars/mix panel is
a follow-up (the three toolbar rows already eat ~40% of a phone screen).
Audio path is settled: `EditableScore.serialize()` → `parseMusicXmlFile()`
(`src/lib/musicxml/parser.ts`, already returns `ParsedMIDI` with SATB +
accompaniment buckets) → `MidiPlayer` (`src/lib/audio/player.ts`, the same
FluidSynth engine the player route uses).

- [x] **Shell:** editor page → full-screen player-style chrome (committed
      2026-08-31 `fe2cc95`: `.editor-shell` column, player-lifted `.top-bar`,
      pinned toolbars, `fill` prop on `EditorScoreView`, centered
      `.status-card` states).
- [x] **Working score → audio.** (2026-08-31) `currentParsedAudio()` memoizes
      `parseMusicXmlFile(workingXml)` on the exact string it parsed; an edit
      invalidates it but re-parse only happens on the next play/seek. A parse
      failure keeps the last good parse and renders the transport disabled
      with `piece_editor_transport_parse_error`.
- [x] **`MidiPlayer` lifecycle in the editor.** (2026-08-31) `ensurePlayer()`
      lazy-creates on first Play (reentrancy-guarded; will also cover note
      preview); `destroy()` in `onDestroy`; RAF `tick()` mirrors
      `positionMs`/`isPlaying` off the player, same shape as the player route.
      `MidiPlayer.create()` failure → `audioUnavailable` → disabled transport
      with `piece_editor_transport_unavailable`.
- [x] **Transport bar.** (2026-08-31) `.transport-bar` in the shell:
      play/stop toggle, `--fill` seek scrubber, `formatTime` elapsed/total —
      markup/styles lifted from the player's bottom bar.
- [x] **Tempo control.** (2026-08-31) Compact `−  [readout]  +` stepper in
      the transport row (not the mix panel), `describeTempo` readout,
      `player.setTempo`, `MIN/MAX_TEMPO_BPM` clamp. Survives an audio reload.
- [x] **Per-part mix panel.** (2026-08-31) Right-hand `.mix-panel` drawer
      toggled from a top-bar button; parts discovered from `ParsedMIDI.parts`
      on first load; per-part 0..1 volume sliders + "Reset to even".
      **Deviation:** no `everyone/minusMe/mostlyMe` presets — those key off a
      "your part" (`VoicePart`) focus the editor has no concept of; plain
      per-part sliders + an even reset is the right scope for a
      correction tool. `mixVolumes` persists across a reload.
- [x] **Playback cursor in `EditorScoreView`.** (2026-08-31) New optional
      `playbackWholeNotes` prop. One shared OSMD cursor: `placeCursor()`
      drives it from the audio position while playing (cheap `walkCursorTo`,
      only `reset()`s on a backward seek — same shape as `ScoreView`), and
      falls back to `parkSelectionCursor()` on stop, so the selection marker
      is suppressed during playback and restored after. Follow-scroll ported
      and simplified (here `.score-container` is itself the scroller, no
      ancestor walk): recenters on every new system via
      `cursorElement.style.top`, nudges horizontally otherwise; a
      wheel/touchmove disengages it; `scrollCursorIntoView()` (exported)
      re-engages. "Scroll to cursor" button in the transport row.
- [x] **Playhead desync fixed + reworked.** (2026-09-01) The 2026-08-31
      cursor above lagged / moved "per measure" / drifted on a repeat-heavy
      PDF-sourced piece. `playbackWholeNotes` → `playheadWholeNotes` + new
      `isPlaying` prop; the playhead is now its own cursor (index 1), shown
      whenever audio exists (playing *or* paused) so it's always draggable;
      selection marker is cursor 0. Three OSMD fixes: `SkipInvisibleNotes =
      false` on both cursors re-asserted per render (stop on every note);
      `EngravingRules.CursorIgnoreRepetitions = true` (walk linearly like
      `parseMusicXmlFile`, no back-jump at end-repeats); show/hide/style/
      follow-scroll gated to edges, not every frame. New `onSeekTo` prop +
      `handleSeekTo` in `edit/+page.svelte`: drag the bar to reposition,
      click empty staff space to seek + play. A per-frame `osmd.render()`
      stall found by the new e2e test (`$effect` transitive dep tracking
      re-subscribing the zoom/theme + seam effects to `playheadWholeNotes`)
      fixed with `untrack()`. See the 2026-09-01 Log entry + `Frontend/e2e/`.
- [x] **Edit-during-playback.** (2026-08-31) Covered by the audio-pipeline
      commit: an edit only re-serializes `workingXml` (the synth keeps
      playing untouched), `audioStale` derives true, the transport shows the
      hint, and `syncAudioToModel()` on the next play/seek reloads preserving
      the play state and clamping the resume point to the (possibly shorter)
      new duration.
- [x] **Note preview.** (2026-08-31) `MidiPlayer.previewNote(midi, ms=700)`
      on a reserved channel (15, clear of the mixer buckets + percussion):
      lazily sets a piano program + full volume on it, releases any note
      still sounding, `midiNoteOn`, schedules `midiNoteOff`. Resumes the
      audio graph from the caller's gesture like `play()` does; re-armed
      after a `load()` (`resetPlayer` wipes channel state). Editor: immediate
      on click-select and after `transpose`/`setAccidental`; 140 ms trailing
      debounce on ArrowLeft/Right nav (a held key plays only the note you
      land on). Not on duration/key/clef edits.
- [x] **i18n** (2026-08-31) — new keys `piece_editor_transport_unavailable`
      / `piece_editor_transport_parse_error` / `piece_editor_audio_stale` /
      `piece_editor_mix_panel` / `piece_editor_close_mix` /
      `piece_editor_reset_mix` / `piece_editor_mix_after_play` /
      `piece_editor_part_volume` in `en.json` + `es.json`; reused the
      player's `piece_play` / `piece_pause` / `piece_seek` /
      `piece_scroll_to_cursor` / `piece_tempo` / `piece_increase_tempo` /
      `piece_decrease_tempo`. `check` / `build` / 55-test vitest suite green.

**Tasks — Human:**
- [ ] Confirm the spike's engine choice before the build proceeds
- [ ] In a real browser: open the editor on a real OMR-generated track,
      make each kind of edit, save, and confirm the new draft plays back
      with the corrections and moves through review normally
- [ ] In a real browser (desktop): play the working score inside the
      editor — transport, seek, tempo, per-part mix, follow cursor — make
      an edit mid-playback, and confirm note-preview-on-select sounds
      right. *(Playhead-vs-audio sync + drag-to-seek now have an automated
      Playwright test — `Frontend/e2e/editor-playhead.spec.ts`, run with
      `E2E_PIECE_ID=<id> npm run test:e2e`; this human pass still covers
      tempo / mix / note-preview / edit-mid-playback.)*

### E3 — Paged OMR pipeline (formerly B16)

E1's `run_omr` hands Audiveris a multi-page PDF as one "book". Audiveris exports
*nothing* for the whole book if a single page crashes a step (a RHYTHMS-step
NullPointerException is the common one), so one bad page on a 21-page choral scan
= zero output. This milestone ports the paged approach proven in the standalone
`omr-local` tool: split the PDF into one-page PDFs, transcribe each independently,
then merge only the page joins that are *obvious* (same part count, matched
top-to-bottom, measures renumbered end-to-end). A run of such pages becomes one
**segment**; a join that isn't obvious (part count changed, a page failed, a page
had no measures) ends the segment and starts a new one, recording why. A
*provisional* whole-score merge is always written too (short parts rest-padded)
so downstream always has a draft — it's the one that auto-imports as the draft
`PieceVersion`, exactly as E1 does today.

Feeds E4 (below) — the editor overlays a marker at each unresolved
boundary so an admin fixes the seams there instead of in MuseScore.

**Decisions:**
- Paged mode is the default for any PDF with >1 page (`omr_paged_multipage`,
  default on). A 1-page input, and the case where Audiveris isn't installed, both
  fall back to E1's single-run `run_omr` (which can still try oemer). Paged mode
  itself is Audiveris-only — oemer is first-page-only, so paged+oemer is moot.
- `OmrJobStatus` is unchanged. A needs-review job is still `done` with a pending
  draft; it carries an extra `needs_review` boolean + a stored `paged-report.json`.
- Cross-page ties / slurs / directions are lost at every join, obvious or not —
  same limitation the standalone tool documents.

**Acceptance criteria:**
- [x] A multi-page PDF where one page crashes Audiveris still yields a MusicXML +
      MIDI draft from the pages that succeeded, instead of the whole job failing
- [x] Consecutive pages with the same part count merge into one segment with
      end-to-end measure numbers; a part-count change or a failed page starts a
      new segment and the boundary records the reason
- [x] `needs_review` is true iff the pages did not all land in one segment; the
      provisional `score.musicxml` is written regardless
- [x] `GET /omr/jobs/{id}/paged-report` returns the segment/boundary/per-page
      breakdown; `GET /omr/jobs/{id}/segments/{n}/{kind}` serves a segment's
      MusicXML/MIDI and rejects `../` path traversal
- [x] The auto-imported draft `PieceVersion` is the provisional whole-score merge
- [x] `pytest` green (new `test_omr_paged.py` + `test_omr_api.py` additions;
      full suite 181 passing 2026-08-31)

**Tasks — Claude:**
- [x] `app/omr/paged.py` ported from `omr-local/omr_local/paged.py` — `split_pages`,
      per-page engine run, `_segment_pages`, `merge_musicxml` (rest-pad + renumber),
      `run_omr_paged`; adapted to `get_settings()` and the 2-arg engine signature.
      Report gains a `boundary_measure` per segment (the E4 seam anchor).
- [x] `app/omr/_subprocess.py` (`run_logged` + `log_tail`) — tee engine output to
      `<dir>/<engine>.log`; reworked `audiveris.py`/`oemer.py` onto it so a bad page
      leaves a `pages/pNN/audiveris.log` trail; tail the log into `OmrEngineError`.
- [x] `OmrJob` columns `paged` / `needs_review` / `paged_report_path` + migration
      `d2f8a6c4e1b9` (Postgres only — an earlier migration already uses PG-only DDL).
- [x] `run_omr_job`: multi-page ⇒ `run_omr_paged` (falls back to `run_omr` on
      `OmrEngineUnavailable`); persists the paged fields; draft import unchanged.
- [x] `omr.py` routes + schema: `paged`/`needs_review`/`report_url` on `OmrJobOut`,
      `needs_review` on the list item, `GET .../paged-report` (rewrites segment file
      paths to URLs) + `.../segments/{n}/{kind}` (traversal-guarded `FileResponse`).
- [x] `latest_omr_job` in `library`'s `LibraryEntryOmrJobOut` gains `needs_review` / `paged`.
- [x] `config.py`: `omr_paged_multipage` (default true), `oemer_dpi` (promoted from
      the hardcoded 300 in `oemer._rasterize_first_page`).
- [x] Tests: `test_omr_paged.py` (7: segmenting, merge padding/renumber, boundary
      measures, run_omr_paged shapes) + `test_omr_api.py` (5: paged job ⇒ `done` +
      `needs_review`, report route URL rewrite, segment download, traversal 404,
      non-paged job 404s the report route).

**Tasks — Human:**
- [ ] With Audiveris installed, run a real multi-page choral scan (`fixtures/SFCC/`
      no longer has one bundled — supply any multi-page scan) through the paged
      path (upload via `POST /omr/jobs`, or call `run_omr_paged` directly) and
      confirm the `pages/`, `segments/`, `paged-report.json` layout and a sane
      `needs_review` + `boundary_measure`s.
- [ ] Get migration `d2f8a6c4e1b9` onto production by **merging this branch to
      `main`** (the Render deploy then runs it). Do NOT `alembic upgrade` it from
      a local checkout against the prod `.env` — see the 2026-08-31 Log entry for
      why that breaks `main`'s deploy. `c1f7a4d2e8b6` (its parent) is already on
      both prod and `main` as of 2026-08-31.

### E4 — Review a segmented OMR result in the editor (formerly F15)

E3 adds paged OMR: a multi-page scan is transcribed page-by-page and the
*obvious* page joins are merged into segments, leaving the non-obvious joins (part
count changed, a page failed) as **unresolved boundaries**. The job still
auto-imports one provisional whole-score merge as the draft, plus a stored
`paged-report.json`. This milestone surfaces that: the group Tracks review block
tells the admin the draft was stitched from N sections, and the E2 editor
overlays a marker at each unresolved boundary so they fix the seam right there
with the existing correction tools instead of round-tripping through MuseScore.

**Decisions:**
- Seam markers are a pure overlay in `EditorScoreView` — never written into the
  MusicXML, so a saved draft is clean. Each seam is anchored by mapping the
  report's merged-measure number to an onset (whole notes) via `EditableScore`,
  reusing the playback cursor's coordinate system.
- The backend's boundary "reasons" are English prose; shown as-is for a first
  cut. Localizing those strings is Backlog.
- No multi-segment stitching UI (load each segment separately, join/reorder by
  hand) — the provisional merge + seam markers cover the review need with far
  less surface. That heavier option stays on the table if seam-fixing proves
  insufficient.

**Acceptance criteria:**
- [x] On a group track whose latest OMR job needs review, the Tracks admin panel
      shows a "stitched from pages, some joins unclear" note and the "Edit music"
      link becomes "Review seams in editor" — alongside the existing Use it / Discard
- [~] Opening the editor on such a track draws a labelled marker at each
      unresolved boundary, at the correct measure, in both themes and after
      re-render / zoom (built; pixel placement needs a real-browser check)
- [x] A "Next seam" control cycles through the boundaries with a readout of which
      one and why; suppressed-while-playing selection-cursor behaviour is unchanged
- [x] Editing at a seam and saving produces a normal draft version whose
      MusicXML contains no marker markup (markers are overlay DOM only)
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 58 green (new
      `measureOnset` tests)

**Tasks — Claude:**
- [x] `backendTypes.ts`: `needs_review` on `OmrJobListItem`, `needs_review`/`paged`
      on `latest_omr_job`, a `PagedReport` type.
- [x] `omr/jobs/[id]/paged-report/+server.ts` proxy route (mirrors
      `omr/jobs/+server.ts`; 401 when logged out rather than an empty body).
- [x] `groups/[id]` review block: the needs-review note + the "Review seams in
      editor" relabel of the Edit-music link; new i18n keys (`groups_generate_*`).
      Per-segment download `<details>` deferred — not needed once the editor
      handles the seams.
- [x] `editableScore.ts`: `measureOnset(measureNumber)` + 3 unit tests.
- [x] `piece/[id]/edit/+page.server.ts`: returns `pagedReportJobId` when the
      piece's latest OMR job is paged + needs review.
- [x] `piece/[id]/edit/+page.svelte`: fetches the report, derives the seam list
      from the live model (keyed on `workingXml` so onsets track edits), passes
      `seamMarkers` down, adds the "Next seam" control + readout; new i18n keys.
- [x] `EditorScoreView.svelte`: `seams` prop; `measureSeams()` walks the shared
      cursor to each seam onset right after `render()` (and on zoom/theme/`seams`
      change), records content-space px, draws absolutely-positioned `.seam-mark`
      overlays inside `.score-container`; `placeCursor()` always runs after to
      restore the selection/playback cursor.

**Tasks — Human:**
- [ ] In a real browser: run a real multi-page choral scan through Generate from
      PDF, open the review, confirm the seam markers land where the joins
      actually are, fix one, save, and confirm the draft is clean and plays.

### E5 — Working-draft slot + per-page OMR progress & re-run (formerly B17)

Pairs with E6 (below). Designed with the human 2026-08-31 to
make generate-from-PDF → in-app edit → publish one coherent loop instead of a
pile of unrelated `draft` rows.

**Model:**
- **Working draft** = the single open `draft` / `source: modification`
  `PieceVersion` on a piece (today's `pending_generated_version_id` is almost
  this — E5 makes it *the* concept and enforces "at most one open").
- The **live** version is unchanged: a group piece's latest `distributed`, a
  personal piece's latest. Never mutated in place.

**Decisions:**
- Copy-on-edit clones the live version's `file_path` + `pdf_file_path` by
  content-copy (`save_file(load_file(...))`, as `_import_draft_version` already
  does for the MIDI) so the draft's files outlive anything the live version does.
- Generate-from-PDF replaces an existing open working draft: the old one is
  `reject`ed (status → `rejected`, history kept) before the new import.
- `POST /library/versions/{id}/publish` is a convenience wrapper over the
  existing submit → approve → (distribute) endpoints, same authority checks — no
  new state machine. Personal piece = submit + approve, no distribute. Takes
  `{ seams_resolved: bool }`; `false` → 409. The Backend can't inspect the
  editor's seam state — it records the ack on the version and trusts E6's gate.
- Per-page progress is best-effort: `pages_done` bumped + committed after each
  page in `run_omr_paged`. No new status value.
- Per-page re-run reuses the split PDF still on disk under
  `omr_jobs/{id}/pages/page-NN.pdf`: re-run the one page, re-run `_segment_pages`
  + the merges, rewrite `score.musicxml` / `score.mid` / `paged-report.json` and
  `OmrJob.needs_review`, and return the re-run page's own normalized MusicXML
  (+ measure count, + whether it still failed) for E6 to splice. It does **not**
  re-import the draft — the editor owns the working model at that point.

**Acceptance criteria:**
- [x] `POST /library/pieces/{id}/working-draft` returns the existing open working
      draft, or creates one cloning the live version's music + PDF; review
      authority required; idempotent (second call returns the same version).
- [x] `PUT /library/versions/{id}/file` replaces a `draft` version's music file
      in place (creator or review authority); refuses a non-draft.
- [x] `POST /library/versions/{id}/publish` with `seams_resolved: true` takes a
      working draft to `approved` and (group piece) distributes it; `false` or a
      non-working-draft → 409; not review authority → 403.
- [x] Generate-from-PDF on a piece that already has an open working draft rejects
      the old one and imports the new — never two open at once.
- [x] `OmrJobOut` + the list item carry `pages_done` / `pages_total`; they climb
      while a paged job runs. (TestClient runs the bg task synchronously so the
      suite only sees the final `pages_done == pages_total`; the per-page commit
      is covered by `test_on_page_done_fires_once_per_page`.)
- [x] `POST /omr/jobs/{id}/pages/{n}/rerun` re-transcribes page n, rewrites the
      report + provisional merge + `needs_review`, and returns
      `{ ok, still_failed, measure_count, page_musicxml_url }`; 404 for a
      non-paged job or an out-of-range page; traversal-safe.
- [x] `pytest` green (202 passed — new working-draft, publish, rerun, progress
      tests).

**Tasks — Claude:**
- [x] `services/pieces.py`: `working_draft(piece_id, db)` (the lookup, renamed /
      widened from `pending_generated_version_id`),
      `get_or_create_working_draft(piece, user, db)` (clone live files),
      `publish_version(version, user, db)` (wraps submit / approve / distribute).
      Also `live_version` + `replace_version_file`. `pending_generated_version_id`
      kept as a thin wrapper over `working_draft`.
- [x] `_import_draft_version` (`app/jobs/omr_jobs.py`): reject an existing open
      working draft before adding the new one.
- [x] `app/api/routes/library.py`: `POST /library/pieces/{id}/working-draft`,
      `PUT /library/versions/{id}/file`, `POST /library/versions/{id}/publish`
      (`{ seams_resolved }`). Schemas `WorkingDraftOut` / `VersionPublishRequest`
      in `app/api/schemas/library.py`.
- [x] `OmrJob.pages_done` / `pages_total` (nullable ints) + migration
      `e7b1c9d3a2f4` (chained off `d2f8a6c4e1b9`; also adds
      `piece_versions.seams_resolved_ack`). `run_omr_paged` takes an optional
      `on_page_done(done, total)` callback; `run_omr_job` passes one that bumps +
      commits the job row per page.
- [x] `app/omr/paged.py`: factored the per-page loop (`_transcribe_page` +
      `_finalize_paged_run`) so `rerun_page(output_dir, page_no, engine)` re-runs
      one page from the on-disk split PDF and rebuilds segments + merges +
      `paged-report.json`. Each page's normalized XML lands at a deterministic
      `pages/pNN/page.musicxml` so a re-run can reload the others.
- [x] `app/api/routes/omr.py`: `POST /omr/jobs/{id}/pages/{n}/rerun` (job owner;
      calls `rerun_page`, updates `OmrJob.needs_review`, returns the E6 shape) +
      `GET /omr/jobs/{id}/pages/{n}/musicxml` (serves the re-run page's XML,
      traversal-guarded like `.../segments/{n}/{kind}`).
- [x] Schemas: `pages_done` / `pages_total` on `OmrJobOut` +
      `LibraryEntryOmrJobOut` + `OmrJobListItemOut`; `OmrPageRerunOut`.
- [x] Tests: `test_library_working_draft.py` (get-or-create idempotency, clone
      contents, publish happy / 409 / 403, generate replaces),
      `test_omr_paged.py` / `test_omr_api.py` additions (progress counters,
      rerun recovers / still-fails / out-of-range, route wiring + page-XML serve).

**Tasks — Human:**
- [ ] After E6: run a real multi-page scan, re-run a page via the API, confirm
      `paged-report.json` + `score.musicxml` are rewritten and `needs_review`
      flips when the last bad page is recovered.
- [ ] Migration reaches prod only by merge to `main` (same rule as
      `d2f8a6c4e1b9` — see the 2026-08-31 outage Log entry).

### E6 — Working-draft slot: labelled editing, seam-fill, per-page progress & re-run (formerly F16)

Builds on E2 (the editor) and E4 (seam markers). Designing the
generate → edit → publish loop with the human (2026-08-31) surfaced three gaps:

1. The editor always loads the piece's *live* version (`/piece/[id]/file`) and
   every save spawns a fresh `draft` row, so generate-from-PDF and hand edits
   don't chain and there's no single "work in progress" to point at.
2. A failed OMR page leaves only a zero-width seam — nowhere to type the missing
   bars.
3. Nothing tells the editor which version it's showing (live vs draft), and
   nothing gates promoting a rough draft to live.

Pairs with E5 (above) (working-draft slot endpoints, per-page progress
counters, per-page re-run).

**Model (agreed with the human 2026-08-31):**
- **One working-draft slot per track** = at most one open `draft` /
  `source: modification` `PieceVersion` per piece (E5 formalizes
  `pending_generated_version_id` into this). The **live** version (a group's
  `distributed`, a personal library's latest) is never edited in place.
- "Edit music" opens the working draft if one exists, else clones the live
  version into a fresh one (copy-on-edit, server-side —
  `POST /library/pieces/{id}/working-draft`). Generate-from-PDF writes into the
  same slot, replacing (rejecting) any unpublished working draft that's there.
- Save updates the working draft's file in place
  (`PUT /library/versions/{id}/file`), no new row per save; it stays `draft`.
- **Publish** ("Publish as live version") lives in the editor, runs
  submit → approve → distribute in one E5 call, and is disabled until every
  seam is marked resolved.

**Decisions:**
- Per-seam "resolved" state is client-only, `localStorage` keyed on
  `jobId + before_page`, same overlay-only philosophy as E4's markers — nothing
  new persisted server-side just for review bookkeeping. The publish call carries
  a single `seams_resolved: true` acknowledgement the Backend records but can't
  itself verify.
- Failed-page seams (reason starts "page N failed") get the fill affordance;
  part-count-change seams keep E4's review-and-clear only (no missing bars
  there).
- Inserted fill bars are real `<measure>`s of full-measure rests across every
  part, not a marker — the user overwrites the rests. New `EditableScore`
  measure-level ops (`insertMeasures` / `deleteMeasure`), the first structural
  edits in that model.
- Generation stays one job / one click. Per-page *progress* is display-only
  (E5's `pages_done`/`pages_total`); per-page *re-run* is an editor action on a
  failed-page seam that splices the re-run page's MusicXML into the working model
  client-side so the user's other edits survive.
- Auto-handoff into the editor is the existing `OmrJobAlerts` completion alert
  gaining a "Review generated draft" link — not a forced navigation.

**Acceptance criteria:**
- [x] Opening "Edit music" on a track with no working draft clones the live
      version; the header badges "Live version" (pristine copy) → "Working draft —
      not yet live" once edited. A second open reuses the same draft (no
      stacking). *(E5 `get_or_create_working_draft`; needs the browser pass.)*
- [x] Editing, leaving, then re-opening shows the same in-progress draft, not the
      live version; the live player is unchanged until Publish. *(save is now
      `PUT .../file` in place; publish is the only thing that touches live.)*
- [x] Generate-from-PDF into a track that already has a working draft replaces it
      (E5 `_import_draft_version` rejects the old one); the Tracks panel links to
      the editor for the new draft.
- [x] A failed-page seam: "Next seam" opens the PDF pane at that page
      (`scrollToPage`); an "insert N bars" control adds N full-measure-rest bars
      at the seam onset across every part (`EditableScore.insertMeasures`);
      measures renumber; the saved MusicXML has only real bars.
- [x] "Re-run this page" on a failed-page seam splices the re-run result into the
      working model at the seam onset (`spliceMeasuresFromXml`) without discarding
      other edits; the seam is marked resolved by hand once it looks right.
- [x] "Publish as live version" is disabled until every seam shows resolved;
      publishing runs E5 submit→approve→distribute and leaves the editor, so the
      next load starts a fresh copy-on-edit.
- [x] Tracks tab shows "page X of Y" while a paged generate job runs; the header
      alert links a finished single job straight to `/piece/[id]/edit`.
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 67 green (+14
      `insertMeasures` / `deleteMeasure` / `spliceMeasuresFromXml`).

**Tasks — Claude:**
- [x] `backendTypes.ts`: `PieceVersionOut` / `WorkingDraftOut` / `OmrPageRerunOut`;
      `pages_done`/`pages_total` on the OMR job shapes.
- [x] `piece/[id]/edit/+page.server.ts`: resolve the working draft via E5's
      create-or-get; return `workingDraftId` + `forkedFromLive` alongside the
      existing access / `pagedReportJobId` fields.
- [x] `piece/[id]/edit/save/+server.ts`: `PUT /library/versions/{id}/file` on the
      working draft (client sends the version id) instead of `POST .../versions`.
- [x] New `piece/[id]/edit/publish/+server.ts` proxy → E5
      `POST /library/versions/{id}/publish` `{ seams_resolved: true }`. Also new
      `piece/[id]/edit/file` (stream a version's music by id), and
      `omr/jobs/[id]/pages/[n]/rerun` + `.../musicxml` proxies.
- [x] `editableScore.ts`: `insertMeasures` / `deleteMeasure` /
      `spliceMeasuresFromXml` (the splice was needed for "Re-run this page") —
      full-measure-rest bars carry the prevailing divisions/time, every part kept
      the same length, `<measure number>` re-sequenced 1..N, out-of-range /
      empty-a-part refused. Unit tests.
- [x] `piece/[id]/edit/+page.svelte`: load the working-draft file; header badge;
      "Publish as live version" gated on all-seams-resolved (flushes unsaved
      edits first, then leaves); per-seam "Mark resolved / Reopen" toggle
      (localStorage keyed on job + `before_page`); failed-page seam → auto-open
      PDF pane + `scrollToPage`, "insert N bars" input, "Re-run this page" button
      (rerun proxy → fetch page MusicXML → `spliceMeasuresFromXml`). Save stays in
      the editor now (no nav) with a "Saved" notice.
- [x] `PdfView.svelte`: `scrollToPage(n)` export.
- [x] `EditorScoreView.svelte`: verified — `measureSeams()` re-derives from
      `seam.onsetWholeNotes` on every re-engrave and when `seams` changes, so
      markers track an insert / delete / splice. No change.
- [x] `groups/[id]/+page.svelte`: draft-ready block → "Open working draft in
      editor" link + "Discard working draft"; "page X of Y" readout while the
      paged job runs; the redundant edit-music-row is hidden while a draft is
      pending. `promoteGeneratedVersion` server action left in place but unused
      (superseded by the editor's Publish).
- [x] `OmrJobAlerts.svelte`: a finished single generate job links to
      `/piece/[id]/edit`; multi-job / failed still point at the Tracks tab.
- [x] en + es i18n keys (badges, publish, per-seam + re-run, page progress).

**Tasks — Human:**
- [ ] Full real-browser pass: generate from a multi-page PDF (watch the page
      counter), land in the editor on the working draft, fill a failed page from
      the side-by-side PDF, re-run another page, mark all seams resolved, Publish,
      confirm the live track now plays the corrected music and re-opening the
      editor starts a clean copy.

### E7 — Editor "Measures" mode: select a bar range, change its clef (formerly F17)

At the human's request: the editor was one flat surface (click a note, edits pin
to its measure) with no way to act on a span of bars. Added an explicit
**Notes / Measures** mode toggle rather than a hidden gesture — a visible
affordance, no keyboard-map collision with the note-level arrows, and a home for
the bar-scoped ops that already exist on the model with no UI
(`insertMeasures`/`deleteMeasure`/`spliceMeasuresFromXml`) and for time-signature
editing later. Time signature itself was considered and **deferred** here — it
needs note re-barring with ties.

**Tasks — Claude (done 2026-09-01):**
- [x] `EditableScore.setClefRange(partId, staff, start, end, spec)` — writes the
      clef at the range start, strips any other explicit `<clef>` for that staff
      inside the range, and re-asserts the pre-range clef at `end+1` so later
      bars are visually unchanged (skipped when that bar has its own clef, the
      restore equals `spec`, or the range hits the end). No-op / out-of-range /
      unknown-part all return `false` without mutating. Refactor:
      `applyClefToMeasure` + `clefInEffectAt` extracted and shared with `setClef`
      / `clefAt`. New readers `clefAtMeasure`, `measureCount`, `partName`.
      +13 vitest (jsdom).
- [x] `EditorScoreView`: `measureMode` + `measureBand` props; in measure mode a
      click anywhere in a bar is a select (never a click-to-seek) and carries the
      Shift key; a translucent `.measure-band` overlay per system row, boxes read
      off `GraphicSheet.MeasureList` (same sheet-unit → px factor as the click
      hit-testing), recomputed on re-engrave / zoom / theme / band change.
- [x] `edit/+page.svelte`: `editMode` + `measureSel` ({partId, staff, anchor,
      start, end}); Notes/Measures segmented control as the first toolbar row;
      note-level rows hidden in measure mode; the clef row is shared (dispatches
      to `applyClef` or `applyClefRange`, active pip from `clefAtMeasure`).
      Click / Shift-click builds the range; keyboard: ←/→ move the bar, Shift+←/→
      extend from the anchor, Esc back to Notes. Status line + footer hint adapt.
- [x] en + es i18n (`piece_editor_mode_*`, `piece_editor_measure*_selected`,
      `piece_editor_measures_hint`, `piece_editor_clef_range_refused`,
      `piece_editor_clef_for_selection` / `_for_note`, `piece_editor_staff_n`).
- [x] **Live-test round 1 fixes (2026-09-01):**
  - Bar selection no longer goes through `EditableScore.findByOnset` — that
    resolver misfires badly on a part that's tacet at the click's onset (a
    choral intro: every click resolved to the same bar 11, so the range never
    grew and clef edits landed in the wrong place, reading as "treble/bass
    swapped"). `EditorScoreView` now reads the 1-based `measureNumber` straight
    off OSMD's graphical note (`parentStaffEntry.parentMeasure`) and passes it
    in the pick; the page uses `measureNumber - 1` directly.
  - Highlight geometry: a bar's own bbox height collapses to ~1 unit for a
    rest-only measure, so the band was a 10px sliver. Now uses
    `ParentStaffLine.StaffHeight` for height, tints only the target staff (not
    the whole part), one rect per system row a wrapped range crosses, +0.7-unit
    padding, solid accent border.
  - `applyClefRange` gives `measureSel` a fresh identity after a successful
    edit so `selectedMeasureClef` / `measureBand` re-derive (score is mutated
    in place).
  - Clef row got a leading label (`Clef for the selected bars:` /
    `Clef from this bar on:`) so it's clear what the presets act on; the status
    line names the staff for a multi-staff part.
- [x] `editor-measures.spec.ts` (4 tests): range select via click + Shift-click,
      clef-range write + prior-clef restore + active pip, note toolbars hidden
      in Measures mode + Escape returns.
- [x] **Live-test round 2 (2026-09-01):** clef readout on a multi-staff part
      (piano) showed the wrong staff's clef. `clefInEffectAt` /
      `applyClefToMeasure` / `explicitClefsForStaff` now share one
      `clefForStaffIn(attr, staff)`: a numbered `<clef>` matched by `number`,
      else unnumbered `<clef>`s read positionally (1st -> staff 1, 2nd -> staff
      2) — the old code returned nothing or the staff-1 clef when OMR output
      omitted `number` on a 2-staff part. `handlePickNote` pins a single-staff
      part (every SATB voice) to staff 1 and clamps a multi-staff part's staff
      to `score.staffCount(partId)`. +1 vitest (`TWO_STAVES_UNNUMBERED`).
      `check` 0 errors, vitest 77.
      Blocked: the test piece's working draft is corrupt (won't parse —
      pre-existing, not E7; discard + regenerate to retest the e2e).

**Tasks — Human:**
- [ ] Real-browser confirm: toggle Measures, click a bar + Shift-click a later
      one, apply Bass, confirm bars in range switch and the bar after keeps its
      clef, Save + reload to confirm it persisted, toggle back to Notes.

### E8 — Editor undo / redo (formerly F18)

At the human's request. The editor had no undo — a wrong transpose / delete /
duration / clef edit could only be fixed by hand or by reloading and losing
everything. Cheap to add because every edit already funnels through `applyEdit` /
`applyStructuralEdit` / `applyClefRange` and each ends by re-serializing the whole
model into `workingXml`, so a snapshot of every state already exists; undo just
keeps a stack of those strings and rebuilds an `EditableScore` from the previous
one. No command log, no inverse ops.

**Mechanism:**
- New `$lib/musicxml/editHistory.ts` — `EditHistory`: bounded undo stack + mirror
  redo stack of `workingXml` strings (`record` / `undo(current)` / `redo(current)`
  / `reset`, cap 60, oldest falls off). Plain class, no runes, so it unit-tests
  under the existing node vitest config.
- `edit/+page.svelte`: the three apply functions snapshot `workingXml` *before*
  mutating and `record()` it only once the mutation reports success (a refused
  no-op edit records nothing). `undoEdit` / `redoEdit` pop a snapshot,
  `new EditableScore(xml)` it (snapshots are always clean `serialize()` output —
  never MIDI/`.mxl`, so no loader needed), swap it in, clear the selection (indices
  don't survive a structural undo), and re-render via the existing `xml` prop.
- Dirty tracking: new `savedXml` = the serialized state as of the last load /
  save; `dirty` is now `workingXml !== savedXml` everywhere it was set, so undoing
  all the way back to the saved state clears the unsaved-nav guard instead of
  leaving the editor falsely dirty.
- Toolbar: an Undo / Redo group as the second row (under Notes/Measures, shown in
  both modes), disabled when the matching stack is empty or mid-render/save.
  Keyboard in `handleKeydown` (both modes, before the mode split): Cmd/Ctrl+Z
  undo, Cmd/Ctrl+Shift+Z or Ctrl+Y redo.
- `canUndo` / `canRedo` / `dirty` added to `window.__divisiEditorProbe()` for a
  future e2e test.

**Tasks — Claude (done 2026-09-01):**
- [x] `editHistory.ts` + `editHistory.test.ts` (6 vitest: empty, undo→redo
      round-trip, record clears redo, cap drops oldest, reset).
- [x] `edit/+page.svelte` wiring (snapshots, `undoEdit`/`redoEdit`/`restoreSnapshot`,
      `savedXml` dirty tracking, keyboard, toolbar row, probe fields).
- [x] en + es i18n (`piece_editor_history_label`, `piece_editor_undo`,
      `piece_editor_redo`).
- [x] `check` 0 errors, vitest 89 green, `build` clean.

**Tasks — Human:**
- [ ] Real-browser confirm: make several edits (transpose, delete, duration,
      clef, insert bars), Undo/Redo through them by button and by keyboard,
      confirm the score and the dirty state track correctly and Save still works;
      undo back past the last Save and confirm the unsaved-changes prompt goes away.

### E9 — Per-page measure offsets in the paged report (formerly B18)

Feeds E10 (below) (page-by-page review of a generated draft).
E10's editor needs to map each source page to its measure range in the
provisional whole-score merge, to scroll + highlight that range while the admin
approves the page. The report already has segments → page lists and a
`boundary_measure` per segment, but nothing per *page*, so the frontend would
otherwise have to fetch all N `pages/pNN/page.musicxml` and count `<measure>`s.

**Decisions:**
- Report-shape change only — no new column, no migration. `paged-report.json` is
  rewritten by `rerun_page` already, so a re-run keeps the offsets current.
- Offsets are into the **provisional whole-score merge** (`score.musicxml`), the
  same coordinate system as `boundary_measure`, so E10 can reconcile the two.
- A failed page contributes 0 measures and gets `measure_count: 0` with
  `start_measure` pointing at where it *would* begin (so "insert N bars" in E10
  has an anchor).

**Acceptance criteria:**
- [x] `GET /omr/jobs/{id}/paged-report` returns `start_measure` (1-based) and
      `measure_count` on every entry of `pages[]`; they tile the merge with no
      gaps or overlaps and `sum(measure_count) == <measures in score.musicxml>`.
- [x] A failed page has `measure_count: 0` and a `start_measure` equal to the
      next real page's `start_measure`.
- [x] `rerun_page` rewrites the offsets when a recovered page changes measure
      counts downstream.
- [x] `pytest` green (new assertions in `test_omr_paged.py` / `test_omr_api.py`).

**Tasks — Claude:**
- [x] `app/omr/paged.py`: `merge_musicxml` now returns a third value,
      `per_page_measures` (page number -> bars it contributed to that merge;
      `sum ==` the merged score's measure count). `_finalize_paged_run` feeds
      the *whole-score* merge's map to a new `_assign_page_offsets`, which walks
      `report.pages` in order setting `start_measure` / `measure_count` on every
      `PageResult` (failed pages included — count 0, `start_measure` inherits
      the running offset so it equals the next real page's). `rerun_page` goes
      through `_finalize_paged_run`, so offsets are rewritten on a re-run.
- [x] `PagedReport.as_dict()`'s `pages[]` entries emit the two fields;
      `PageResult` gained `start_measure` / `measure_count`. The paged-report
      route returns the dict as-is, so no `app/api/schemas/omr.py` change was
      needed (that route has no pydantic model — it rewrites segment paths to
      URLs dynamically); the shape is documented on `PageResult` / `as_dict`.
- [x] Tests: `test_omr_paged.py` — `merge_musicxml` per-page-count return,
      offsets tile the provisional merge + sum to its measure count,
      failed-page zero-count at the next page's start, `rerun_page` rewrites
      downstream offsets (on disk too). `test_omr_api.py` — the stub report
      carries the fields and the route passes them through.

**Tasks — Human:**
- [ ] None beyond E10's end-to-end pass (no migration, no deploy gate).

### E10 — Page-by-page review of a generated draft (formerly F19)

Redesign of the generate → review → publish loop, agreed with the human
2026-09-01. E4/E6 drop the admin into the merged whole-score draft facing
scattered seam markers, and never prompt a look at the *interior* of a segment:
if pages 3–8 merged into one segment, pages 4–7 get no review at all. E10
replaces that with a deliberate progression — approve each page against its PDF
source, **then** resolve the joins between them — so "have I checked everything?"
has an answer.

**Model:**
- The editor gains a **Review** panel, on by default when the working draft came
  from a paged OMR run that needs review (`data.pagedReportJobId` is set). Three
  steps: **Pages → Seams → Publish**. A single-run / non-paged generate has no
  pages and no seams — the panel stays off and the editor opens exactly as today.
- **Stepper over the existing continuous score**, not a paginated view (decided
  with the human 2026-09-01): one editable `EditableScore` as now. Selecting page
  K scrolls the reference PDF pane (`PdfView.scrollToPage`) and scrolls +
  highlights K's measure range in the score, via a new full-system `pageBand`
  overlay sibling to E7's single-staff `measureBand`. **Panel placement**
  (decided with the human 2026-09-01): the transport bar's bottom, replacing
  E4/E6's `.seam-bar` row — not a left dock pane or a top strip.
- **Pages step:** a rail of pages 1..N, each `✓ approved / ⚠ review / ✗ failed /
  – untouched` (seeded from the paged report's per-page ok/error). Page-scoped
  toolbar: **Approve page** (advances to the next `–`), **Re-run page**, **Insert
  N bars** (failed pages only — moved here from E6's seam step). A per-segment
  **Approve pages X–Y** bulk action for a clean run.
- **Seams step:** locked until every page is approved (or explicitly skipped).
  This is E4/E6's seam review with the failed-page-fill removed — a failed page
  is now a first-class stop in the Pages step, not a zero-width marker. Each seam
  still shows the two pages it joins, the reason and the join bar, with Mark
  resolved / Reopen (E6's `localStorage` per-seam state is unchanged).
- **Publish:** gated on all-pages-approved **and** all-seams-resolved. The ack
  the Backend records widens from `{ seams_resolved: true }` to
  `{ pages_reviewed: true, seams_resolved: true }`.

**Decisions:**
- Page-approved state is client-only `localStorage`, keyed `jobId:page` — same
  philosophy as E6's per-seam resolved state. No new server bookkeeping beyond
  widening the publish ack; the Backend can't verify a page any more than it can
  verify a seam, and trusts the E10 gate.
- Approval is an honour-system "I looked" ack, exactly like a resolved seam.
- Re-running a page or inserting bars into it clears that page's approval and
  reopens any seam that touches it — the content moved.
- A failed page can't be approved until a re-run succeeds or bars are hand-filled;
  "skip for now" is allowed but blocks Publish.
- **Supersedes the E4/E6 review UX.** Their pending human real-browser passes
  fold into E10's — not worth verifying a flow that's being replaced. The
  underlying machinery (seam-onset mapping, working-draft slot, save/publish,
  re-run, insert-bars, measure-band) is all kept.

**Paired backend change — E9** (above): `PagedReport.pages[]` gains
`start_measure` / `measure_count` (each page's position in the provisional
whole-score merge) so the frontend can map page → measure range without fetching
all N page XMLs and counting bars.

**Acceptance criteria:**
- [x] Opening the editor on a paged working draft that needs review shows the
      Review panel at the Pages step; a non-paged draft opens with no panel.
- [x] Selecting a page scrolls the PDF pane to that page and highlights the
      page's measure range in the score; the highlight survives re-render / zoom
      / theme change (same recompute triggers as E7's `measureBand`).
- [x] Approving a page advances to the next untouched one; the rail reflects
      `✓ / – / ⚠ / ✗`; a per-segment bulk approve marks the whole run at once.
- [x] A failed page offers Re-run and Insert N bars; approving it is refused
      until it's recovered or filled; a re-run clears a prior approval and
      reopens a touching seam.
- [x] The Seams step is locked until every page is approved; once unlocked it
      cycles the joins with the E4 readout and Mark resolved / Reopen.
- [x] Publish is disabled until every page is approved and every seam resolved;
      publishing sends `{ pages_reviewed: true, seams_resolved: true }` and
      leaves the editor.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green (103).

**Tasks — Claude:**
- [x] `backendTypes.ts`: `start_measure` / `measure_count` on
      `PagedReport.pages[]`; `pages_reviewed` on the publish request shape.
- [x] Page-range mapping: new pure `$lib/musicxml/reviewPages.ts` (`mapReport` /
      `pageStatus` / `seamPages`, +11 vitest) turns the report into page →
      `{ startMeasure, measureCount }`; `edit/+page.svelte`'s `reviewPages`
      re-derives each page's live 0-based measure range + onset off the current
      model on every `workingXml` change, same pattern as the E4 seam mapping,
      so an insert / splice shifting later pages stays correct.
- [x] `edit/+page.svelte`: the Review panel + a Pages / Seams / Publish stepper
      state machine; the page rail; per-page approve + skip + per-segment bulk
      approve (`localStorage` `divisi:pagesReviewed`, keyed `jobId:page`);
      re-run / insert-bars retargeted from the seam onset to the selected review
      page, clearing its approval and any seam touching it on success; Seams step
      locked until every page is approved-or-skipped, Publish gated on
      all-approved + all-seams-resolved.
- [x] `EditorScoreView.svelte`: new `pageBand` prop — a full-system tint (every
      part, not just E7's one staff) for the focused page's bar range, same
      `GraphicSheet.MeasureList` geometry and recompute triggers as
      `measureBand`.
- [x] `edit/publish/+server.ts`: ack body carries `pages_reviewed: true` (the
      Backend's `VersionPublishRequest` ignores unknown fields by default —
      recording it server-side is an out-of-scope Backend follow-up, no B-number
      yet).
- [x] Relabelled the entry points so their copy names the page-by-page pass:
      `OmrJobAlerts`'s done-job alert, and the `groups/[id]` Tracks-panel
      review link/hint/needs-review copy. Both already deep-linked to the
      editor, so no routing change.
- [x] en + es i18n (step labels, page-rail statuses, approve / skip / bulk
      approve, the publish-gate readout and blocked reason); reused the
      existing `piece_editor_seam_*` keys for the Seams step and the fill/re-run
      controls rather than duplicating them.
- [x] `check` 0 errors / `build` clean / vitest 103 green.

**Tasks — Human:**
- [ ] Full real-browser pass, replacing E4's and E6's pending passes: generate
      from a real multi-page choral scan, step through every page against the
      PDF, approve the clean ones and bulk-approve a segment, recover a failed
      page by re-run and by hand-fill, then resolve the seams and Publish;
      confirm the live track plays the corrected music and re-opening the editor
      starts a clean copy.

**Strict page-by-page rework (2026-09-01, with the human):** the tabbed stepper
+ N-chip page rail + controls row was three stacked rows of chrome over the
score. Replaced with one compact `.review-bar` in the transport bar:
`‹ Prev | Page K of N, <status> | [Approve]/[Skip] | Next ›` plus text links to
move between the pages, seams and publish phases. Prev/Next walk the pages in
order (clamped), the score pane stays a continuous render but locks to the
current page (its band scrolls to the top via a new
`EditorScoreView.scrollPageIntoView()`, and two `.page-dim` veils recede
everything outside it), and while review is active the editor's own toolbars
collapse to the Notes/Measures + Undo/Redo groups with the per-mode edit rows
behind an `[Edit]` disclosure, so the score + PDF panes get the height. The E10
model (`reviewPages.ts`, E9 offsets, `localStorage` state, every
approve/skip/re-run/insert handler, `pageBand` geometry) is unchanged.

## Backlog

- Real job queue (Celery/RQ) if background-task OMR processing proves too slow/blocking
- **Mid-piece tempo changes drift the editor playhead.** `parseMusicXmlFile` (drives the editor's audio) bakes each `<sound tempo>` into note `startMs` but returns a single `tempoBPM`, and the editor converts the transport position to a musical onset with that one factor (`msPerWholeNote`). On a piece with tempo changes the playhead cursor gradually leads/lags the sound. The 2026-09-01 e2e test tolerates up to one whole note and does not assert this. Fix is either a piecewise ms→onset map from the parser or a tempo-map the editor can walk.

## Log

- 2026-09-01: **Split the OMR + notation-editor work into this plan.** Moved B8 (OMR pipeline), B16 (paged OMR), B17 (working-draft slot + per-page progress and re-run), and B18 (per-page measure offsets) out of `Backend/plan.md`, and F14 (in-app notation editor), F15 (segmented-OMR review), F16 (working-draft slot, frontend), F17 (editor "Measures" mode), F18 (editor undo/redo), and F19 (page-by-page draft review) out of `Frontend/plan.md`, into this one file. Renumbered E1..E10 in build and dependency order (B8→E1, F14→E2, B16→E3, F15→E4, B17→E5, F16→E6, F17→E7, F18→E8, B18→E9, F19→E10); cross-references between the moved sections were rewritten to the E numbers. The section bodies are otherwise verbatim. The OMR/editor-only Backlog items came along (real job queue for OMR; editor playhead tempo drift); the historical Log entries stayed in the two source plans, so the 2026-08-31 production-outage entry that E3 and E5 cite (a feature-branch migration must never run against prod) still lives in `Backend/plan.md`. This is merge-prep for landing `feat/generate-track-from-pdf` on `main`: pulling OMR's B16/B17/B18 out also clears the numbering collision with `main`'s own committed B16 ("Piece rehearsal notes").
