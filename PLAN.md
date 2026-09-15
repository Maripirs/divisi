# Divisi — Plan

Divisi is a choir-practice web app: synced audio + notation playback, PDF
markup, groups/homework/responsibilities/carpool, and guest join links.
Backend is FastAPI/Postgres (Render + Neon); frontend is SvelteKit
(Cloudflare Workers). A native iOS app existed early on and is paused/
backlogged (see `README.md`).

For the product description, see `README.md`. For the full build history
(every milestone's acceptance criteria, task lists, deviations, and log
entries) see `PLAN_HISTORY.md` — this file only tracks current state and
what's still open.

**Top-line status (2026-09-14):** Backend is through **B33** (all shipped,
all on `main`, all pushed — Render auto-deploys from `main` on every push, so
the deployed backend matches `main`'s head). Frontend is through **F43**
(all built and committed to `main`), but frontend deploys are a **manual**
step (`npm run build && npx wrangler deploy`, see `Frontend/README.md`) —
most of the last several days' frontend work has not yet had that manual
redeploy or a real-browser/touchscreen confirmation pass, which is the
single biggest bucket of open work below. The OMR pipeline + in-app
notation editor track (E1–E10) is parked on the `omr-editor` branch, not on
`main`.

## Shipped

- **Backend B1–B33**: scaffold, auth, groups/membership, pieces/versions/
  distribution/review, annotations+sharing, guest join links + privacy
  controls, homework, group page visibility, responsibilities, account
  security (password reset, Google OAuth), piece/group PDF markup + cue
  points, progressive/anonymous-participant accounts, demo "Preview Admin",
  Custom Group Pages → promoted to a built-in Carpool tab (events, posts,
  seat claims, standing board, direction, map, guest read+write), guest
  About/Info access. Two small shipped fast-follows never got written into
  the plan text at build time (confirmed via git log, not documented
  above): **B22/F26** (guest can edit their local display name from
  Settings, synced server-side) and a **carpool contact-phone / rider-
  interest** fast-follow around B29–B30. Full detail: `PLAN_HISTORY.md`.
- **Frontend F1–F43** (except F40, superseded same-day by F41): standalone
  player prototype, guest join flow, full app-shell UI wired to the real
  backend, real piece uploads, group page settings, Responsibilities,
  Weekly Notes, Spanish localization, app-wide error handling, bundled-
  piece lockdown, PDF markup (pen/stamp/eraser/undo, mode toggle, group
  layer, cue points), audio-source picker, local-profile/guest-reconnect
  flow, demo Preview Admin entry point, Carpool UI (board, map, claims,
  direction, guest posting), tab-strip/navigation cleanups, piece-list
  availability + sort. Full detail: `PLAN_HISTORY.md`.
- **iOS app**: paused 2026-08-27, code removed from `main` 2026-09-14 (see
  `pre-cleanup-audit-20260914` tag to recover it). Portability constraint
  (keep pure-algorithm logic free of platform types) stands if it's ever
  resumed — see `PLAN_HISTORY.md`'s Frontend "iOS app" section.

## Open milestones

None. Every milestone with real unbuilt Claude-side work has already been
built (verified via `git log` against the actual state of `main`, which
frequently overtook the plan text's own "not pushed/deployed" notes — see
Log below). What remains is entirely deploy/verification/decision work,
tracked in the two sections below.

## Awaiting human verification

Frontend code for all of these is built, committed to `main`, and
`check`/`build`-clean. What's missing is a manual frontend redeploy and/or a
real browser/touchscreen/device pass — not further Claude-side building.
Group by feature area:

- [ ] **Frontend redeploy.** Run `PUBLIC_API_BASE_URL=https://divisi.onrender.com npm run build && npx wrangler deploy` from `Frontend/` to ship everything through F43 to `https://divisi.maripi.net`. Confirm the live site afterward.
- [ ] **F5**: real Backend-hosted piece playback (member and guest, incl. password-protected groups) — sounds/looks right end to end.
- [ ] **F11/F12/F13**: PDF markup pen/stamp/eraser/undo, the annotation-mode on/off toggle, and the "My mix" vs. reference-recording audio-source picker — real touchscreen/browser confirm.
- [ ] **F20**: Piece Notes panel (director + personal notes) on both the player and the Rehearsal Tracks card, as admin and as plain member.
- [ ] **F21/F22**: group markup layer toggles + admin draw-target switch, and PDF cue points (place/tap-to-jump/edit, visible-to-guests) — real touchscreen pass.
- [ ] **F23**: local profile + guest name-match reconnect — a real phone / second physical browser pass (already Playwright-verified functionally).
- [ ] **F28/F29**: Carpool board UI and guest carpool posting — manual browser pass once deployed.
- [ ] **F35**: Carpool Map needs a real Google Maps API key configured (human/account step) plus a real-browser pass; currently no-ops safely to the list-only board with no key set.
- [ ] **B7**: human hasn't listened to a rendered stem set to confirm the GM soundfont's quality. Low priority — the current player synthesizes client-side (F5's design call) and never wires up B7's server-rendered stems at all; this pipeline is dormant, not on any critical path.

## OMR pipeline + in-app notation editor (parked)

Built out on the `omr-editor` branch (E1–E10: OMR transcription, paged
multi-page handling, working-draft slot, a full in-app MusicXML correction
editor with playback/undo/measures-mode/page-by-page review) but **not
merged to `main`**. The frontend editor surface (`/piece/[id]/edit` and
everything under it) was deleted from `main` as unverified WIP on
2026-09-01; the backend OMR code (`Backend/app/omr/`: `audiveris.py`,
`oemer.py`, `paged.py`, `pipeline.py`) still sits on `main`, dormant and
UI-unreachable — no route on `main` ever calls it end to end.

Every E1–E10 milestone's own "Tasks — Claude" list is fully checked on the
`omr-editor` branch; what's pending there is exclusively human real-browser
passes (run a real multi-page scan through paged OMR, step through the
editor's playback/undo/measures modes, publish a corrected draft) and two
migrations (`d2f8a6c4e1b9`, `e7b1c9d3a2f4`) that only reach production by
merging that branch (or cherry-picking) to `main` — never by a local
`alembic upgrade` against the prod `.env` (this broke production once
already, 2026-08-31; see `PLAN_HISTORY.md`'s Backend Log).

Revisit by merging (or restarting UI work from) `omr-editor`, not by
redesigning from scratch — the design (correction-only editor on an OSMD
render, MusicXML-DOM as the editable model) was already spiked and proven.
Full milestone detail: `PLAN_HISTORY.md`'s OMR + Notation Editor section.

## Backlog

- Real job queue (Celery/RQ) if background-task OMR processing, or
  Responsibilities recurrence/reminders, or the anonymous-participant
  sweep, ever need real scheduling instead of a manual command.
- Mid-piece tempo changes drift the OMR editor's playhead (piecewise
  ms→onset map, or a walkable tempo-map, needed — see `PLAN_HISTORY.md`).
- B16 fast-follow: promote a weekly note into a durable `PieceRehearsalNote`
  (`source_weekly_note_id` + a promote action).
- B16 fast-follow: `group_resources` — stable group links (playlist, portal,
  shared doc, join link) as a small table + CRUD.
- Weekly note structured sections/items (deferred pending evidence admins
  want structure over prose; a JSONB `structured` column is the cheap
  first step if so).
- Markdown links (`[text](url)`) in the frontend weekly-note renderer.
- Decide diff/patch vs. full-reupload semantics for a group "modification."
- Group invite flow (email invite vs. join code) — not designed yet.
- Object-storage orphans: `delete_piece` leaves `obj/…` files in the
  bucket; needs a sweep-by-prefix or delete-on-piece-delete.
- Set `AWS_*` Object Storage env vars on Render (`save_file` already
  supports it) and re-upload the 6 modification-version PDFs lost to old
  disk wipes before that swap landed.
- Responsibilities: recurrence rules + lazy date generation; notifications/
  reminders; swap requests + admin-approval-required signups; whether
  roles/schedules should be reusable templates across groups — all
  explicitly deferred out of B13, all need a real job runner or a design
  pass first.
- No `pytest` coverage yet for `PUT /groups/{id}/description`,
  `PUT /groups/{id}/members/{user_id}/role`, or
  `DELETE /responsibilities/schedules/{id}`/`.../roles/{id}`.
- Pick a transactional email provider (Resend/Postmark) so password-reset
  links work for real, in place of the current server-log-only send.
- Re-enable Google Sign-In: publish the OAuth consent screen out of
  Testing in Cloud Console (project `divisi-506916`), re-add
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on Render, restart the service.
- Decide the anonymous-participant retention window (N days) for
  `scripts/prune_anonymous_participants.py`.
- Track "last opened piece" server-side for a real Home "Continue
  practice" card (currently fixture/bundled-demo-only).
- Admin default tempo doesn't yet ride along on the guest join page's
  practice link (`GuestPieceOut` has no `default_tempo_bpm`).
- Admin's Assignments/Tracks tabs have no edit/delete UI for tracks yet
  (homework delete exists; tracks doesn't).
- `/groups/new`'s form only asks for a name — no description or
  default-sections checklist field exists yet on `GroupCreate`.
- Preserve fully independent polyphonic notation in player-generated
  MusicXML (same-onset notes render as chords; true overlapping
  independent rhythms on one staff need a multi-voice representation).
- Shared OSMD-view code between `ScoreView` and `EditorScoreView`
  (cursor-stepping algo, `osmdOptions()`, follow-scroll, zoom controls,
  theme CSS block are duplicated) — extraction deferred, needs a
  click-through of both the player and the editor right after.
- Live tempo control for a hypothetical stems-backed player path — a real
  time-stretching problem, not a rate multiplier, and moot unless B7's
  server-rendered stems ever actually get wired up.
- Always deploy the frontend with `PUBLIC_API_BASE_URL` explicitly set to
  the real backend URL, never a bare `npm run build` (has caused a live
  outage before by baking in a local `.env`'s `localhost` value).
- `groups/[id]/+page.svelte`'s per-tab split and further god-file cleanup
  (`ResponsibilitiesTab` breakup, a `db/models/` split, player
  transport/mix composables) — partially done across two cleanup passes,
  more candidates flagged but not required.

## Log

- 2026-09-14: Consolidated `Backend/plan.md`, `Frontend/plan.md`, and
  `OMR_EDITOR_PLAN.md` into `PLAN_HISTORY.md` (full historical detail) and
  this `PLAN.md` (current state + backlog going forward). Cross-checked
  every milestone the source files marked incomplete against `git log`:
  nearly all of the "not pushed/deployed" notes scattered through the
  source plans turned out to be stale — the commits were already reachable
  from `main`, and `main` matched `origin/main` — so the only genuinely
  open work left is a manual frontend redeploy, a batch of human real-
  browser/touchscreen passes, a handful of backlog-tracked decisions, and
  the parked OMR/editor branch.
