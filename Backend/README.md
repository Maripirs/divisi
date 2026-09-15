# Divisi Backend

FastAPI service backing the Divisi web app. See the root `PLAN.md` for
current status. What it does:

1. **Accounts + groups** — individual and group (e.g. choir) accounts, groups
   distributing reviewed piece versions to members, homework, responsibilities,
   weekly notes, per-page visibility settings, account security (password reset,
   Google OAuth scaffold).
2. **Annotations + markup** — private per-user score annotations with optional
   peer sharing; personal freehand PDF pen/stamp marks.
3. **Guest access** — a group's `join_code` resolves (no login) to its
   distributed pieces and enabled pages, via `/guest/*`.
4. **Rendering** — a `PieceVersion`'s MIDI into per-voice-part audio stems (via
   FluidSynth) plus multi-part MusicXML, cached per version. The current
   frontend actually synthesizes client-side and does not wire this up, but
   the pipeline and manifest endpoint exist.
5. **OMR** — scanned-PDF → MusicXML/MIDI via Audiveris (primary) or oemer
   (single-page fallback). Verified end-to-end on macOS against a real 4-part
   choral scan — see "OMR engines" below for the local install recipe
   (Audiveris correctly recovers per-part structure and lyrics; oemer
   flattens parts and has no lyrics, confirming it's a last-resort fallback
   only). The full OMR pipeline + in-app editor is currently parked on the
   `omr-editor` branch — see the root `PLAN.md`.

Uploaded files go to **Neon Object Storage** (S3-compatible, `uploads` bucket)
when the `AWS_*` env vars are set, and fall back to local disk otherwise; the
render cache and OMR scratch are always local (and ephemeral on Render). See
`app/storage/files.py`.

Rendering shells out to the `fluidsynth` binary (not just the `mido` Python package) —
install it locally with `brew install fluid-synth` (macOS) or `apt install fluidsynth`
(Debian/Ubuntu); the Docker image installs it automatically.

## OMR engines

Neither engine is a Python dependency (`pyproject.toml`) — both are external
CLIs the wrappers `shutil.which()` and shell out to, same pattern as
`fluidsynth`. Install path verified on macOS (arm64):

**Audiveris** (preferred — multi-page PDFs, correct per-part structure, OCR'd
lyrics):
1. Download the latest `Audiveris-<version>-macosx-<arch>.dmg` from
   [GitHub releases](https://github.com/Audiveris/audiveris/releases/latest)
   (ships its own bundled JRE — no separate JDK install needed) and drag
   `Audiveris.app` into `/Applications`.
2. Clear the quarantine flag (it's unsigned) and put its CLI on `PATH`:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Audiveris.app
   ln -s /Applications/Audiveris.app/Contents/MacOS/Audiveris /opt/homebrew/bin/audiveris
   ```
3. Install Tesseract's English language data — without this, the `TEXTS`
   step runs but silently produces zero lyrics (no error, no warning beyond
   a one-line "collection of supported languages is empty" log):
   ```bash
   mkdir -p ~/Library/Application\ Support/AudiverisLtd/audiveris/tessdata
   curl -sL -o ~/Library/Application\ Support/AudiverisLtd/audiveris/tessdata/eng.traineddata \
     https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
   ```
4. The 120s-per-step default (`sheetStepTimeOut`) is too tight for real
   scores — the app already passes `audiveris_step_timeout_seconds` (1800s
   default, see `app/core/config.py`) on every run, no manual flag needed.

**oemer** (fallback — single page only, flattens parts, no lyrics):
```bash
# onnxruntime-gpu (oemer's declared dep) has no macOS wheel — install the
# CPU package first, then oemer itself with --no-deps to skip that pull:
pip install onnxruntime opencv-python-headless matplotlib pillow scipy \
  "scikit-learn>=1.2" typing-extensions
pip install --no-deps oemer
```
Two known bugs in oemer 0.1.8 itself (unmaintained since ~2022), both
reproduced and worked around locally during OMR-pipeline testing — no upstream fix
available, so these need re-patching in `site-packages/oemer/` after any
fresh install until oemer cuts a new release:
- `inference.py` hardcodes `CoreMLExecutionProvider` on macOS, which fails
  mid-inference on Apple Silicon with recent onnxruntime (`error code: -1`);
  drop it and use `["CPUExecutionProvider"]` on `sys.platform == "darwin"`.
- `bbox.py`'s `find_lines()` assumes `cv2.HoughLinesP` always returns shape
  `(N, 1, 4)`; modern `opencv-python-headless` (5.x) can return `(N, 4)`
  directly, causing `IndexError: invalid index to scalar variable`. Reshape
  defensively: `line = np.asarray(line).reshape(-1)` before indexing.

## Local dev

```bash
cp .env.example .env          # adjust if needed
docker compose up --build     # starts postgres + api on :8000
curl localhost:8000/health    # {"status": "ok"}
```

Without Docker, against a local Postgres:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

> **The committed `.env` points `DATABASE_URL` at the live production Neon
> database** (see the comment at the top of `.env`), so a bare
> `alembic upgrade head` here runs against production. Before any local
> `alembic` command, either use `docker compose up` (it ignores `.env` and
> hard-codes a local `postgres` container) or point `.env`'s `DATABASE_URL`
> at a throwaway DB. See "Migrations" below for why this specifically
> breaks deploys.

## Migrations

```bash
alembic revision --autogenerate -m "message"
alembic upgrade head
```

### Never run `alembic upgrade` / `downgrade` / `stamp` against production from a feature branch

The Render deploy's start command is `alembic upgrade head` against the
production DB, run from **`main`'s** migration files. Alembic reads the
current revision id out of the DB's `alembic_version` table and looks for a
matching file in the checked-out code. If production is stamped at a
revision whose file exists only on an unmerged branch, `main`'s deploy
aborts with `Can't locate revision identified by '<id>'`, `uvicorn` never
starts, and Render crash-loops the container — the whole backend goes
down (this happened 2026-08-31, see `PLAN_HISTORY.md`'s Backend Log).

Rules:
- Do local schema work against a local / disposable DB, never the
  production connection string. `docker compose up` is always safe.
- A new migration file reaches production **only by merging to `main`**,
  never by running `alembic upgrade` locally while `.env` points at prod.
- Keep the migration graph linear and forward-only: don't `downgrade`
  production to "un-apply" a branch's migration — that leaves the schema
  changed while `alembic_version` says otherwise, and the branch's own
  deploy will then fail re-applying it.

**Recovery if it happens again** (backend crash-looping, logs show
`Can't locate revision identified by '<id>'`):
1. `render logs --resources <service-id>` to confirm the offending id.
2. Find that revision's file on whatever branch it lives on and read its
   `down_revision`.
3. Either cherry-pick the migration file(s) onto `main` and let it deploy
   (preferred — no schema drift, the DB already matches), **or** if the
   migration's DDL was never actually applied, stamp the DB back:
   `UPDATE alembic_version SET version_num = '<down_revision>';`
4. Check `\d <changed_table>` against the migration body to know which of
   those two you're in.

## Tests

Black-box, API-level, in `tests/`. Run with `.venv/bin/python -m pytest`
(config in `pytest.ini`: quiet, `testpaths = tests`, `-n auto`).

The full suite runs in roughly 30 to 60 seconds. It used to take ~7.5
minutes; almost all of that was bcrypt password hashing at the production
cost factor, run hundreds of times (most tests register and log in a few
users just to assert a permission check). The root `conftest.py` sets
`BCRYPT_ROUNDS=4` for the test session before `app` is imported, which
drops the per-hash cost ~240x with no behaviour change (bcrypt reads the
cost from the stored hash on verify). Production uses the default 12; see
`bcrypt_rounds` in `app/core/config.py`.

`-n auto` runs the suite across CPU cores via `pytest-xdist`. Each test
gets its own in-memory SQLite engine (see `tests/conftest.py`), so this is
safe. Pass `-p no:xdist` to run serially when debugging.

Tests that shell out to the `fluidsynth` binary (the audio-rendering
pipeline) are marked `@pytest.mark.integration`. Run everything by default, or
`.venv/bin/python -m pytest -m "not integration"` on a host without
`fluidsynth`.

OMR tests force `shutil.which` to report both engines missing where that
matters, so they pass regardless of whether Audiveris/oemer happen to be
installed locally.

CI (`.github/workflows/backend-ci.yml`) runs the full suite, including the
`integration` tests, on any change under `Backend/`.

## Deployment

Live at **https://divisi.onrender.com** (Render free web service, deploys
`Dockerfile` via the repo-root `render.yaml`; Postgres is Neon, set
`DATABASE_URL` manually). The Docker `CMD` runs `alembic upgrade head` before
`uvicorn`, so migrations apply on deploy — which also means a migration graph
mismatch between `main` and the production DB takes the whole service down
(see "Never run `alembic ...` against production from a feature branch" under
Migrations). Render's free plan has no persistent disk — durable uploads must
go to Neon Object Storage via the `AWS_*` env vars (see `render.yaml` and
`app/storage/files.py`). Free tier also has no pre-deploy step, so the
migration runs inside the web container: a failed migration is a failed boot,
not a blocked deploy.

## Local test accounts

Against the local dev Postgres (not production — see `mariapazmaluenda@gmail.com`'s
real account and its live San Francisco City Chorus group for that):

| Email | Password | Role | Group |
| --- | --- | --- | --- |
| `test@example.com` | `testpass123` | admin | Test Choir |
| `alex@example.com` | *(unset — reset via `/auth/forgot-password` if needed)* | member | Test Choir |

`test@example.com`'s password was reset 2026-08-28 via the real forgot-password flow
(the dev server logs the reset link instead of emailing it — see `auth.py`'s
`forgot_password`), since the original wasn't recoverable from its bcrypt hash.
