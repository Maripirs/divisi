# Project Plan: Divisi Backend

Separate from the root `plan.md` (owned by another session, tracking the iOS app's M-milestones). This plan tracks the backend service only. Milestones prefixed `B` to avoid confusion with the app's `M` milestones when discussed together.

**Current milestone:** B6 done (approved via the human's join-code-format call, see log). B7's Claude tasks are also done, still pending the human's listening sign-off. B8 (OMR) not started. All of this done in parallel with another session driving `Frontend/plan.md`'s F1.

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
- [ ] `app/omr/audiveris.py` (subprocess wrapper), `app/omr/oemer.py` (direct import), `pipeline.py` (chooses/chains engine, normalizes to MusicXML)
- [ ] Background-task job tracking (DB row: pending/running/done/failed + result path)
- [ ] `/omr/jobs` POST (upload) + `/omr/jobs/{id}` GET (status/result) endpoints

**Tasks — Human:**
- [ ] Supply a real scanned sheet-music PDF to test the pipeline end-to-end
- [ ] Install Audiveris locally (or confirm container approach) — licensing/install path not yet decided

## Backlog

- Decide diff/patch vs. full-reupload semantics for what a group "modification" actually contains
- Group invite flow (email invite vs. join code) — not designed yet
- S3 (or equivalent) migration for file storage once local-disk stops being enough
- Real job queue (Celery/RQ) if background-task OMR processing proves too slow/blocking

## Log

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
