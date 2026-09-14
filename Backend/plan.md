# Project Plan: Divisi Backend

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
everywhere). Sets on Render only after `DEMO_SETUP.md`'s Step 3 (the demo
group's join code is hand-set); see that doc's note under Step 3.

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
  code is set (`DEMO_SETUP.md` Step 3), then restart the service.

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
