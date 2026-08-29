# Handoff — continue on another machine

Ephemeral — delete this file once the piece-upload work below lands (or a
deliberate decision is made instead) and that's reflected in
`Backend/plan.md`/`Frontend/plan.md`. Written because the human is
switching to a Claude Code session on a different (Windows) computer and
wants it to pick up cleanly.

## State right now (repo is clean)

Branch `frontend/guest-mode-polish` — pushed, and fast-forwarded into both
`main` and `backend/deploy` (Render/Cloudflare auto-deploy off those).
`git status` is clean except one deliberately-untracked file, see below.
Nothing is mid-flight; there's no in-progress commit or uncommitted code
to lose by switching machines.

**Live in production right now** (both verified end-to-end, not just
deployed):
- Weekly Notes group-page tab + a dismissible guest sign-in banner on
  `/join/[code]` (`Frontend/plan.md`'s F7, `Backend/plan.md`'s matching
  entry)
- Password change while logged in (Settings → Account →
  `PUT /auth/me/password`)

Two real bugs were found and fixed live via Playwright this session (the
human was away from their computer and explicitly authorized using it —
see the `no-playwright-verification` memory, a per-instance exception, not
the project's default): a second, independent cause of "page-visibility
toggles reset after saving" (SvelteKit's `use:enhance` default `update()`
calls a native `form.reset()`, wrong for a form that stays visible after
saving), and a timezone display bug on Weekly Notes' dates.

## Deliberately untracked: `Frontend/wrangler.preview.jsonc`

A second Cloudflare Workers config (distinct Worker name
`divisi-frontend-preview`, no custom-domain route) — deploys to
`https://divisi-frontend-preview.mariapazmaluenda-564.workers.dev`,
completely isolated from the real `divisi-frontend`/`divisi.maripi.net`.
Useful for previewing Frontend changes without touching production;
`PUBLIC_API_BASE_URL=https://divisi.onrender.com npm run build && npx
wrangler deploy --config wrangler.preview.jsonc` redeploys it. Kept out of
git on purpose (ephemeral, machine-agnostic to recreate — the file
content is trivial, see the working tree if you want it, or just recreate
from `wrangler.jsonc` minus the `routes` block).

## Local dev env — what the other machine needs

Nothing secret is required beyond what's already in each `.env` (both
gitignored, so this describes what to put there rather than pasting
values):

- **`Backend/.env`**: only `CORS_ORIGINS` is currently active there
  (plus commented-out Google OAuth credentials, left commented
  deliberately — Google Sign-In is off in production right now,
  `google: false`, per the human's call). No `DATABASE_URL`/`JWT_SECRET`
  needed locally — `app/core/config.py`'s hardcoded local-dev defaults
  cover those against the project's own `docker compose` Postgres.
- **Frontend/.env**: just `PUBLIC_API_BASE_URL`. **Real gotcha hit this
  session**: the local Backend `uvicorn` here runs HTTPS-only
  (`.certs/dev-*.pem`, needed for `vite-plugin-basic-ssl`'s secure-context
  requirement — see `vite.config.ts`'s comment on `AudioContext
  .audioWorklet`). If the other machine's local Backend also runs HTTPS,
  set `PUBLIC_API_BASE_URL=https://localhost:8000` to match; if it runs
  plain HTTP, use `http://localhost:8000` instead — mismatching the
  scheme means the Frontend's SSR `fetch` can't reach the Backend at all
  (confirmed this exact failure mode locally tonight). Also, if the local
  Backend uses a self-signed cert, `vite dev` needs
  `NODE_TLS_REJECT_UNAUTHORIZED=0` in its environment or Node's `fetch`
  rejects the cert outright.

## Next up: real piece uploads (MIDI/MusicXML + PDF + reference audio)

Full plan below, already scoped and read through by the human live this
session (not yet built) — paste this into a fresh planning pass on the
other machine, or just start implementing directly, whichever the human
prefers there.

---

<!-- BEGIN PLAN -->

# Real piece uploads: MIDI/MusicXML + PDF + reference audio

## Context

Group admins currently have no way to add a real playable piece to their
group — the Backend has a generic upload API
(`POST /library/pieces`/`.../versions`), but (a) there's no Frontend form
for it (admin has to hand-roll a `curl`), and (b) even a successfully
uploaded piece can't actually be practiced: the player only knows how to
load the 7 bundled demo pieces (`$lib/pieces/registry.ts`), never a real
Backend file. That's exactly what F5 (in `Frontend/plan.md`, `[~]`, scoped
but unbuilt) was for.

This expands F5's original scope per the human's live direction: a piece
should be able to carry a music file (MIDI/MusicXML), a PDF, and a YouTube
reference-audio link — any combination, not all-or-nothing like the
bundled demo pieces assume today. The player needs to adapt to whichever
subset actually exists for a given piece.

**One real blocker found during exploration, surfaced before proceeding:**
`Backend/plan.md` claims Neon Object Storage (S3-compatible) credentials
already sit in `Backend/.env` and only the client code is missing. That's
no longer true — `.env` currently has zero `AWS_*` keys, and `boto3` isn't
a dependency. So durable file storage (fixing the known "Render's free
tier wipes `STORAGE_DIR` on every restart" limitation) can't be wired
without first re-obtaining those credentials — a Neon Object Storage
dashboard/CLI step, needs the human. This plan builds everything else
(fully functional against today's local-disk storage, exactly as reliable
as every other upload already going through `/library/pieces`) and calls
the storage swap out as a separate, clearly gated follow-up rather than
blocking on it. **Check with the human whether they've re-obtained those
credentials before starting** — if so, wire the real swap in as part of
this pass instead of deferring it.

## Backend

**`app/db/models.py`**
- `Piece`: add `composer: str | None` (nullable) and `youtube_url: str | None`
  (nullable) — the "author" field and the reference-audio link, both
  piece-level (not per-version) since neither is a revision concern.
- `PieceVersion`: add `pdf_file_path: str | None` (nullable), **and widen
  the existing `file_path` to nullable too** — a version needs to support
  "PDF only, no music file" (currently `file_path` is `nullable=False`,
  i.e. always required). Validation that at least one of the two exists
  moves to the API layer (see below), not a DB constraint — matches this
  codebase's general style of keeping DB constraints minimal.

**New migration**, chains off current head `b4d8e2f6c9a1`:
`op.add_column` x3 (`pieces.composer`, `pieces.youtube_url`,
`piece_versions.pdf_file_path`) + `op.alter_column('piece_versions',
'file_path', nullable=True)`. Straightforward `downgrade()`: drop the
three columns, restore `file_path` to `nullable=False` (only safe if no
row actually has it null at downgrade time — matches this codebase's
existing precedent of accepting that kind of downgrade constraint rather
than writing data-loss-avoidance logic for a rarely-run path).

**`app/services/pieces.py`**: `create_piece_with_version`/`add_version`
gain an optional `pdf_file_path: str | None = None` kwarg, threaded into
the `PieceVersion(...)` constructor call. `file_path` param on both
becomes `str | None` too. No other signature changes — `omr.py`'s
`import_job_result` call sites keep working unchanged (both new kwargs
default to `None`).

**`app/api/routes/library.py`** — `upload_piece`/`upload_version` gain:
- `composer: str | None = Form(None)`, `youtube_url: str | None = Form(None)`
- `default_tempo_bpm: int | None = Form(None)` — set directly on the
  created `Piece` at upload time (currently a separate `PUT
  .../default-tempo` call; folding it into the one upload form the human
  asked for)
- `file: UploadFile | None = File(None)` (was required; now optional)
- `pdf_file: UploadFile | None = File(None)` (new)
- Validation: reject with 400 if neither `file` nor `pdf_file` is present
  ("Provide a music file, a PDF, or both")
- Each present file gets its own `save_file(...)` call (already handles
  being called any number of times per request, no changes needed there)

**New file-serving routes** (F5's already-scoped raw-file endpoint,
doubled for PDF, both 404ing cleanly when that half doesn't exist for a
version):
- `GET /library/versions/{id}/file` (F5-scoped, not yet built) — raw
  music-file bytes, same `_require_piece_access` gate as the manifest
  route, 404 if `file_path is None`
- `GET /library/versions/{id}/pdf` (new) — same gate, 404 if
  `pdf_file_path is None`
- `GET /guest/{join_code}/pieces/{piece_id}/file` (F5-scoped) and
  `GET /guest/{join_code}/pieces/{piece_id}/pdf` (new) — same
  join-code/password/page-settings gate as the existing guest manifest
  route, same 404-when-absent behavior

**`app/api/schemas/library.py`**: `PieceOut` gains `composer: str | None`,
`youtube_url: str | None`. `LibraryEntryOut` gains `composer: str | None`,
`youtube_url: str | None`, `has_music: bool`, `has_pdf: bool` (computed
booleans, not raw paths — matches this schema's existing "never leak a
storage-relative path to the client" pattern; the Frontend uses these to
decide what to render, and reaches actual bytes only through the new
file-serving routes above).

**Tests**: extend `tests/test_library.py` (`_upload_file` helper already
posts synthetic bytes — follow the same convention for a `pdf_file` field,
`io.BytesIO(b"%PDF-1.4 fake")`) — upload with music-only, PDF-only, both,
neither (400), `composer`/`youtube_url`/`default_tempo_bpm` round-trip,
the two new file-serving routes (200 when present, 404 when absent,
access-gate parity with the manifest route), same for the two new guest
routes in `tests/test_guest.py`.

Verify: `alembic upgrade head`/`downgrade -1`/`upgrade head` against the
real Postgres container; full `pytest` green; a live curl round trip
against the local Backend covering all four upload combinations.

## Frontend

**`src/lib/pieces/types.ts`**: `PieceSummary.pdfUrl` becomes optional
(`pdfUrl?: string`), add `youtubeUrl?: string`; `Piece.load` becomes
optional (`load?: () => Promise<ParsedMIDI>`) so a PDF-only piece is a
valid `Piece` with no `load` at all. `collection` widens to include a new
tag for real Backend pieces (e.g. `'group'`).

**New `src/lib/pieces/remotePiece.ts`** (F5-scoped, expanded): factory
building a `Piece` from Backend metadata (`title`, `composer`,
`has_music`, `has_pdf`, `youtube_url`) — `pdfUrl` points at the new PDF
proxy route only if `has_pdf`; `load` is only defined if `has_music`
(fetches the file proxy route, sniffs MIDI `MThd` magic bytes vs.
MusicXML, same as F5's original plan).

**New proxy routes** (F5-scoped `file`, new `pdf`), both authenticated,
attach `locals.token` server-side, stream the Backend response back:
- `/piece/[id]/file/+server.ts`
- `/piece/[id]/pdf/+server.ts`

**`/piece/[id]/+page.server.ts`** (F5-scoped, new): resolves bundled vs.
real Backend piece (same "check the user's `/library/pieces` listing"
approach F5 already planned), builds a `remotePiece` for the latter.

**`/piece/[id]/+page.svelte`**: the View-mode toggle (`VIEW_MODES`,
currently unconditional) becomes conditional — only offers `'player'`
when `piece.load` exists, only offers `'pdf'` when `piece.pdfUrl` exists;
if only one is available, no toggle at all, just that view. The YouTube
embed (when `piece.youtubeUrl` present) is **not** gated behind the
player/PDF toggle at all, per the human's explicit call — it shows
regardless of which of music-file/PDF exist, in its own always-visible
area (a simple `<iframe>` embed, small/collapsible section near the top).
`PdfView.svelte` itself needs no changes (`pdfUrl` is already a plain URL
prop — a proxy-route URL is a drop-in).

**New upload form** on `groups/[id]/+page.svelte`'s admin Tracks tab,
replacing the current "no in-app upload UI yet" note: Name, Author, Music
file, PDF, Default tempo, YouTube URL (client-side: require at least one
of Music file/PDF before enabling submit, mirroring the Backend's
validation). New `+page.server.ts` action (`uploadTrack`) that:
1. Posts the multipart `FormData` straight to the Backend's
   `POST /library/pieces` (`owner_type=group`, this group's id) — **not**
   through `backendFetch`, which force-sets `Content-Type:
   application/json` whenever a body is present (a real gotcha the
   explore pass caught: a raw multipart body needs the browser/fetch's
   own generated `multipart/form-data; boundary=...` header instead).
   Calls `fetchFn` directly with the attached auth header.
2. On success, chains `submit` → `approve` → `distribute` for that new
   version automatically — the uploading admin already has review
   authority over their own group's content (confirmed against
   `_require_review_authority`'s existing rule), so this collapses what
   would otherwise be 4 manual calls into the one-step "upload and it's
   on the Tracks tab" experience the human asked for.

**`src/lib/server/backendTypes.ts`**: `LibraryEntryOut` gains `composer`,
`youtube_url`, `has_music`, `has_pdf`.

Verify: `npm run check`/`build` clean; a live Playwright pass against the
local dev server covering all four upload combinations (music+PDF,
music-only, PDF-only, +YouTube link on each) and confirming the player
page shows exactly the right controls for each case; a guest join-code
pass confirming the same piece plays/displays identically with no login.

## Explicitly deferred (not this pass, unless credentials turn up)

- **Durable storage (Neon Object Storage / S3 swap)** — blocked on
  re-obtaining real `AWS_*` credentials (see Context above); `app/storage/
  files.py` stays on local disk, same already-documented "wiped on Render
  restart" limitation as every other upload today, not a new regression.
  `Backend/plan.md`'s Backlog entry already tracks this, just needs its
  "credentials already exist" claim corrected regardless of whether this
  pass ends up fixing it for real.

<!-- END PLAN -->

## Once this lands

Fold the acceptance-criteria/task checkboxes into `Backend/plan.md`'s B4
(or a new B-milestone) and `Frontend/plan.md`'s F5 the same way every
other milestone here tracks completion, log it, then delete this file.
