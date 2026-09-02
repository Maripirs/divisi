# Project Plan: Divisi Backend

Separate from the native iOS app's own plan (paused 2026-08-27, condensed into `Frontend/plan.md`'s "iOS app" section during 2026-08-28's repo cleanup). This plan tracks the backend service only. Milestones prefixed `B` to avoid confusion with the app's `M` milestones when discussed together.

**Status:** B1–B15 shipped (a couple of the earlier ones got informal follow-up expansions afterward — real piece uploads under B4, a rehearsal-schedule addition under B13). B11's long-standing ephemeral-disk gap is now closed in code: `app/storage/files.py` writes uploads to Neon Object Storage (committed 9d7ef53), with a remaining human step to set the `AWS_*` env vars on Render (see Backlog). **B8 is now fully verified end-to-end** (both human tasks done — see its section). Other open threads, none Claude-blocking: B7 has one human-only task left (see its section); B14's email-provider and OAuth-consent-publish steps are in Backlog. **B15 is built but not deployed** — its migration hasn't run against the real production DB yet, a human-only step (see B15's own section).

The web frontend is the active product; OMR (B8) is scaffolded but backlogged. See `Frontend/plan.md` and the repo-root `README.md`.

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
| B8 | OMR pipeline | ✅ Done (verified end-to-end on macOS) |
| B9 | Homework / assignments | ✅ Done |
| B10 | Guest privacy controls (password + homework visibility) | ✅ Done |
| B11 | Deploy to hosting | ✅ Live at `divisi.onrender.com`; ephemeral-disk gap closed by the Neon Object Storage swap (9d7ef53) |
| B12 | Group page configuration | ✅ Done |
| B13 | Responsibilities (+ regular rehearsal schedule) | ✅ Done |
| B14 | Account security (password reset, OAuth scaffold) | ✅ Done (Google OAuth built but hidden pending consent-screen publish; Apple honestly unimplemented) |
| B15 | Piece markup: freehand pen strokes + stamps | ✅ Built; migration not yet run against production |
| B16 | Piece rehearsal notes (durable per-piece reminders) | ⏳ Planned |

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

### B8 — OMR pipeline [x]

**Acceptance criteria:**
- [x] Uploading a scanned sheet-music PDF produces a job id; polling it eventually returns MusicXML/MIDI output for a real test PDF

**Tasks — Claude:**
- [x] `app/omr/audiveris.py` (subprocess wrapper), `app/omr/oemer.py` (subprocess wrapper — wraps the CLI, not a direct import; oemer has no other stable entry point), `pipeline.py` (chooses/chains engine, normalizes to MusicXML)
- [x] Background-task job tracking (DB row: pending/running/done/failed + result path)
- [x] `/omr/jobs` POST (upload) + `/omr/jobs/{id}` GET (status/result) endpoints
- [x] Follow-up: `POST /omr/jobs/{id}/import` turns a `done` job's result into a real `Piece`/`PieceVersion`
- [x] `audiveris.py` now passes `-constant org.audiveris.omr.Main.sheetStepTimeOut=<audiveris_step_timeout_seconds>` (default 1800s) — Audiveris's own 120s-per-step default is too tight for real scores, not a sandbox artifact (see log below)

**Tasks — Human:**
- [x] Supply a real scanned sheet-music PDF to test the pipeline end-to-end — used `fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf` (real 4-part choral score, not a toy image)
- [x] Install Audiveris locally — GitHub release `.dmg` (bundles its own JRE, no separate JDK needed); recipe in `Backend/README.md`'s "OMR engines" section

**Verified 2026-08-31 (macOS, arm64):** Both engines installed and run end-to-end against the real fixture above (see log entry below for the full debugging trail — sandbox CPU/IO throttling, the 120s timeout, missing Tesseract language data, and two real bugs in oemer 0.1.8 itself). Audiveris correctly recovers the piece's 4-part (SATB) structure and OCR's its lyrics/title/composer; oemer's output flattens every staff into one part with notes stacked as chords and captures no lyrics at all (it has no OCR step) — confirms `pipeline.py`'s existing engine priority (Audiveris primary, oemer a last-resort single-page fallback) is the right call, not just a paper design.

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
- [ ] Deploy this to production — push to `backend/deploy`, and run the new migration against the real Neon Postgres DB. Nothing in the Frontend's F11 can actually save/load until this happens.

### B16 — Piece rehearsal notes (durable per-piece reminders) [ ]

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
- [ ] A group admin can create a rehearsal note against a piece that
  belongs to their group (kind, optional title, body, optional
  page_number / measure_label / part_scope)
- [ ] Any member of the group can list a piece's rehearsal notes; a
  non-member / guest cannot (403, no data leak)
- [ ] Creating a note for a piece that isn't this group's piece is
  rejected (400/404, not a cross-group write)
- [ ] An admin can edit (full replace) and delete a note; a member cannot
- [ ] Unknown group / piece / note id returns 404
- [ ] Disabling the gating page hides the list for members but not admins
  (same mechanism as homework)

**Tasks — Claude:**
- [ ] `PieceRehearsalNote` model + `PieceRehearsalNoteKind` enum in
  `app/db/models.py` (after `WeeklyNote`), following the `Homework`
  pattern — `_uuid` PK, `_now` default, nullable `created_by` with the
  account-deletion comment. `kind` stored as plain `String` (validated by
  the Pydantic enum at the API layer, like `GroupPageSettings.page`)
- [ ] Alembic migration, `down_revision = 'c1f7a4d2e8b6'` (current head);
  `op.create_table` with FKs to `groups.id` / `pieces.id` / `users.id`;
  no `group_page_settings` seeding. Do **not** run `alembic upgrade`
  locally against `Backend/.env` (prod Neon) — verify against a scratch
  SQLite URL or a Neon branch
- [ ] `app/api/schemas/piece_rehearsal_notes.py` (`...Create` / `...Update`
  full-replace / `...Out`), re-exported from `schemas/__init__.py`
- [ ] `app/api/routes/piece_rehearsal_notes.py`, two-prefix router cloned
  from `weekly_notes.py` / `homework.py`:
  `POST/GET /groups/{group_id}/pieces/{piece_id}/rehearsal-notes`,
  `PUT/DELETE /piece-rehearsal-notes/{note_id}`. Reuse `get_group_or_404`,
  `require_admin`, `require_member`, `get_piece_or_404`, `get_or_404`,
  `require_member_page_access(..., GroupPage.weekly_notes, ...)`. Register
  in `app/main.py`
- [ ] `tests/test_piece_rehearsal_notes.py` — reuse `_upload_piece(...,
  owner_type="group", group_id=...)` from `test_piece_markup.py`; cover
  every acceptance criterion above

**Tasks — Human:**
- [ ] Deploy: push to `backend/deploy`, run the new migration against the
  real Neon Postgres DB

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
- **B15 fast-follow — group-published markup layer**: an admin publishes their `PieceMarkupMark`s for a piece, group members opt in to see them layered on top of their own personal marks (Frontend's own Backlog note has the full ask). Needs a `published_at`-style flag (or a parallel table) + a publish endpoint + loosening `list_marks`'s per-user filter for the published case.
- Decide diff/patch vs. full-reupload semantics for what a group "modification" actually contains
- Group invite flow (email invite vs. join code) — not designed yet
- ~~Wire `app/storage/files.py` to Neon's Object Storage~~ **DONE 2026-08-31** (committed 9d7ef53; credential verified 8bc2e31). `save_file` → `uploads` bucket (`obj/…` keys) when `AWS_*` set, else local disk; `resolve_source_path` materializes via a local cache; serving routes 404 (not 500) on missing bytes. **Remaining human step:** set `AWS_ENDPOINT_URL_S3` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `S3_BUCKET` on Render, redeploy, then re-upload the 6 lost modification-version PDFs.
- Object-storage orphans: `delete_piece` leaves `obj/…` files in the bucket. Add a sweep-by-prefix cleanup (or delete-on-piece-delete).
- Real job queue (Celery/RQ) if background-task OMR processing proves too slow/blocking
- Responsibilities: recurrence rules + lazy date generation (needs a real scheduled-job runner, which doesn't exist yet)
- Responsibilities: notifications/reminders (no notification infra of any kind exists yet)
- Responsibilities: swap requests between members, and an admin-required-approval step for signups — both explicitly deferred out of B13
- Responsibilities: whether roles/schedules should be reusable *templates* shared across groups — an open question, never decided
- No `pytest` coverage yet for `PUT /groups/{id}/description`, `PUT /groups/{id}/members/{user_id}/role`, or `DELETE /responsibilities/schedules/{id}`/`.../roles/{id}` (added post-B13, live in production)
- Pick a transactional email provider so password-reset links actually work for someone who isn't reading server logs (`FRONTEND_BASE_URL` itself is already set on Render — see B14)
- Re-enable Google Sign-In for real users: publish the OAuth consent screen out of Testing status in Cloud Console (project `divisi-506916`, non-sensitive scopes so this shouldn't need Google's full verification review), then re-add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on Render and restart the service

## Log

*Condensed 2026-08-29 — see each milestone's own section above for full acceptance-criteria/task detail; this is now a chronological breadcrumb, not a re-narration.*

- 2026-09-01: Scoped B16 (piece rehearsal notes) off the Codex "Weekly Notes Backend Proposal" — took only `piece_rehearsal_notes` (durable per-piece reminders, the real product win) and pushed the proposal's `weekly_note_sections`/`_items` tree and `group_resources` to Backlog. Not built yet.

- 2026-08-31: Closed out B8 (OMR) — installed both engines locally on macOS and ran a real 4-part choral PDF (`fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf`) through each end-to-end. Debugging trail: (1) initial runs looked stuck/timing-out — turned out the harness's Bash sandbox throttles CPU/IO 10-50x, confirmed by rerunning outside it; (2) even unsandboxed, Audiveris still hit its own 120s-per-step default on real content (`HEADERS` took ~19min, `HEADS` ~30min) — not an environment artifact, just too tight for dense scores, so `audiveris.py` now always passes `-constant …sheetStepTimeOut=<audiveris_step_timeout_seconds>` (1800s default); (3) Audiveris produced zero lyrics silently until Tesseract's `eng.traineddata` was installed (empty by default, no error); (4) oemer hit two real bugs in its own unmaintained 0.1.8 code — a CoreML/onnxruntime crash and an OpenCV `HoughLinesP` shape-mismatch `IndexError` — both reproduced, root-caused, and worked around (patches don't survive a fresh `pip install`, so they're documented as a re-apply-after-install step, not shipped as a repo fix). End state: Audiveris correctly recovers 4 separate SATB parts + OCR'd lyrics/title/composer; oemer completes but flattens everything into one chord-stacked part with no lyrics — confirms the existing engine-priority design rather than changing it. Recipe for both installs + the oemer patches now in `Backend/README.md`'s "OMR engines" section. No test suite changes (this was an install/config verification pass, not new application code beyond the timeout constant).

- 2026-08-31: Wired `app/storage/files.py` to Neon Object Storage (closing the long-standing B11 ephemeral-disk gap), prompted by a production 500 on a piece PDF whose bytes were lost to a disk wipe. `save_file` → `uploads` bucket when `AWS_*` set, else local disk unchanged; `obj/…` served via a local materialize-cache; all raw-file routes now 404 cleanly when bytes are missing instead of letting `FileResponse` 500. Added `boto3`. Committed 9d7ef53; storage credential minted and verified (8bc2e31). Remaining human step: set `AWS_*` on Render and re-upload the 6 modification-version PDFs that were nulled in the prod DB to keep the app coherent (2 dead `file_path`s fell back to the fixture original). Tests: touched-area suite 57/57.

- 2026-08-29: Built B15 (piece markup: pen strokes + stamps) to feed Frontend F11, after the human tried F4's annotations and asked for something closer to piaScore's real drawing tool instead — additive, not a replacement. `pytest` 5/5 new, 143/145 full suite (2 pre-existing FluidSynth gaps). Not deployed — migration hasn't run against production yet, tracked as a human task on B15 itself.

- 2026-08-29: Added `GET /annotations/{id}/shares` (B5's own note) while wiring the Frontend's real annotation UI (F4) — owner-only, lists who an annotation is currently shared with, which share/unshare alone never exposed. `pytest` 4/4 in `test_annotations.py`, 138/140 full suite (2 pre-existing FluidSynth-on-PATH gaps, unrelated).
- 2026-08-29: Fixed a guest-path gap: `GuestPieceOut` was missing `composer`/`youtube_url`/`has_music`/`has_pdf`, leaving new Backend-uploaded pieces unreachable by guests. Added the 4 fields to `guest.py`'s `resolve_join_code`. Pushed straight to `backend/deploy` (it was stale) and to production; verified live end-to-end. `pytest` 139/139.
- 2026-08-29: Added `Group.rehearsal_weekday`/`rehearsal_time` + `PUT /groups/{id}/rehearsal-schedule` (see B13's "Expanded" note above). `pytest` 137/139 (2 known FluidSynth gaps).
- 2026-08-29: Built real piece uploads (MIDI/MusicXML + PDF + reference audio, see B4's "Expanded" note) from a fresh Windows worktree with a portable Postgres+venv setup. Re-pulled Neon Object Storage `AWS_*` credentials (still unused — storage swap not implemented). Migration `a3f7c1e9b5d2` verified up/down/up; `pytest` 133/135; curl-verified all 4 upload combos end to end. Not deployed/pushed this session — done in the entry above.
- 2026-08-28: Added `PUT /auth/me/password`. `pytest` 124/124. Deployed to production with the matching Frontend Settings UI, verified via a local Playwright round trip.
- 2026-08-28: Google Sign-In verified for real (see B14's Human tasks above — a prior "verified" claim had only ever curled the API). B14 marked `[x]`.
- 2026-08-28: Deployed `PUT`/`DELETE /auth/me` (edit name; delete account with cascade — nulls `created_by` on group-owned content rather than orphan-deleting it, blocks deletion if the account is a group's sole admin) and admin per-piece default tempo. Migrations `a7e2c9f4b3d8`, `f1a9d3c7b2e6`. Hid Google OAuth again (real credentials existed but weren't yet human-tested). `pytest` 109/109.
- 2026-08-28: Repo cleanup — split `app/api/schemas.py` (445 lines) into `app/api/schemas/` by domain, zero-edit for route files (re-exported via `__init__.py`). Deleted the stale root `plan.md` and `BACKEND_PROPOSALS.md` (content folded into the two active plans first). `pytest` 103/103. Deliberately left the Frontend's equivalent (`groups/[id]/+page.svelte`) untouched — no way to visually verify a live-`$state` refactor unsupervised; flagged in Frontend's Backlog instead.
- 2026-08-28: Built B14 (account security) overnight per explicit human direction. `pytest` 103/103 (11 new), plus a real bug caught by the new tests: a naive/aware datetime comparison broke under the SQLite test DB (fixed with a normalizing helper, Postgres-safe either way).
- 2026-08-28: Deployed `ResponsibilitySignup.user_id` (now nullable) + `guest_name` (cover a role with a non-account guest by name only — coverage queries switched to an outer join) and `GroupMembership.title` (e.g. "Soprano 2 — Section leader"). `pytest` 92/92 beforehand.
- 2026-08-28: Deployed `Group.description` + its `PUT` endpoint, `PUT .../members/{user_id}/role`, `DELETE` for a responsibility schedule/role (added while wiring Frontend F6). Not yet covered by `pytest` — tracked in Backlog.
- 2026-08-28: B13 (Responsibilities) approved.
- 2026-08-28: B13 built — `services/responsibilities.py` computes coverage in one shared place so member/guest routes can't drift; one `PATCH .../dates/{id}` covers edit/lock/cancel; capacity intentionally unenforced (overfilled is a real, reachable status); guest route returns coverage only, never signup identities. `pytest` 92/92 (12 new), verified live end-to-end against a real Postgres.
- 2026-08-28: B12 approved, moving to B13.
- 2026-08-28: B12 built — backfill migration preserved homework's old `guest_homework_visible` value into its `audience`; `tracks` defaults enabled/everyone (it had no gate before this); `members`/`about`/`responsibilities` default members-only. Backfill correctness verified by hand-inserting pre-migration rows and checking the migrated output, not just "the migration runs." `pytest` 80/80 (5 new). Frontend intentionally left on the old field this pass (backend-only scope).
- 2026-08-28: Seeded the human's real group ("San Francisco City Chorus") with all 7 fixture pieces via direct model insert (no upload UI yet at the time — see F5 for the eventual real path).
- 2026-08-28: Scoped B12+B13 with the human off the now-deleted proposal doc, deliberately narrowed (no recurrence, no notifications, no swap/approval — see Backlog).
- 2026-08-27: Closed out B11 (deploy) while the human was away — fixed two real production issues along the way: a stale `backend/deploy` branch (missing CORS/Homework/B10) merged into `main`, and a broken redeploy from Render's `rootDir: Backend` prefixing onto `render.yaml`'s `dockerContext` (see B11's note). Verified live end to end. `pytest` 75/75.
- 2026-08-27: Built B6–B10 in sequence — B6 guest join codes (short 8-char, generic 404 with no oracle, in-process rate limiter); B7 rendering pipeline (`app/rendering/` ports the Swift `MIDIParser`/`MusicXMLConverter`, byte-equivalent against fixtures); B8 OMR (engine wrappers + job tracking + `/omr/jobs/{id}/import`, no engine installed here so transcription quality unverified); B9 Homework; B10 guest privacy controls. Added CORS middleware (none existed before). Milestone renumbering from the product pivot: old OMR B6→B7→B8 as B6 (guest) then B7 (rendering) were inserted ahead of it.
- 2026-08-26: Backend plan split from the root `plan.md`; domain model agreed. **B1–B5 built and approved** (scaffold, auth, groups, pieces/versions/distribution/review, annotations+sharing). Gotchas worth keeping: a `passlib`/`bcrypt`≥4.1 incompatibility in B2 (dropped `passlib` for direct `bcrypt`); renamed the domain's "Choir" concept to "Group" before B3. Each milestone verified via a real Postgres migrate up/down/up plus a manual smoke test, not just `pytest`.
