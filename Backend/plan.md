# Project Plan: Divisi Backend

Separate from the root `plan.md` (owned by another session, tracking the iOS app's M-milestones). This plan tracks the backend service only. Milestones prefixed `B` to avoid confusion with the app's `M` milestones when discussed together.

**Current milestone:** B5

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

### B6 — OMR pipeline [ ]

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
