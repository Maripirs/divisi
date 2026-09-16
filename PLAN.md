# Divisi — Plan

Divisi is a choir-practice web app: synced audio + notation playback, PDF
markup, groups/homework/responsibilities/carpool, and guest join links.
Backend is FastAPI/Postgres (Render + Neon); frontend is SvelteKit
(Cloudflare Workers). A native iOS app existed early on and is paused/
backlogged (see `README.md`).

For the product description, see `README.md`. This file tracks current
state and what's still open; it doesn't re-derive the full build history.

**Top-line status (2026-09-14):** The backend is fully built and deployed —
everything shipped so far is on `main`, and Render auto-deploys from `main`
on every push, so the live backend matches `main`'s head. The frontend is
fully built and committed to `main` too, but frontend deploys are a
**manual** step (`npm run build && npx wrangler deploy`, see
`Frontend/README.md`) — most of the last several days' frontend work hasn't
had that manual redeploy or a real-browser/touchscreen confirmation pass
yet, which is the single biggest bucket of open work below. A separate OMR
pipeline + in-app notation editor track is parked on the `omr-editor`
branch, not on `main`.

## Shipped

- **Backend**: scaffold, auth, groups/membership, pieces/versions/
  distribution/review, annotations+sharing, guest join links + privacy
  controls, homework, group page visibility, responsibilities, account
  security (password reset, Google OAuth), piece/group PDF markup + cue
  points, progressive/anonymous-participant accounts, demo "Preview Admin",
  a Carpool tab (events, posts, seat claims, standing board, direction, map,
  guest read+write), guest About/Info access, a guest local-display-name
  edit synced server-side, and admin-triggered lyric generation from a
  piece's PDF (Groq-classified, sequentially injected as MusicXML
  `<lyric>` elements).
- **Frontend**: standalone player prototype, guest join flow, full app-shell
  UI wired to the real backend, real piece uploads, group page settings,
  Responsibilities, Weekly Notes, Spanish localization, app-wide error
  handling, bundled-piece lockdown, PDF markup (pen/stamp/eraser/undo, mode
  toggle, group layer, cue points), audio-source picker, local-profile/
  guest-reconnect flow, demo Preview Admin entry point, Carpool UI (board,
  map, claims, direction, guest posting, contact-phone/rider-interest),
  tab-strip/navigation cleanups, piece-list availability + sort,
  chord-based divisi auto-split (pitch-rank-per-onset, unison onsets on
  both desks; audio/mixer-only, does not add a staff to the score), and a
  Tracks tab "Generate lyrics from PDF" admin button.
- **iOS app**: paused 2026-08-27, code removed from `main` 2026-09-14 (see
  the `pre-cleanup-audit-20260914` tag to recover it). Portability
  constraint (keep pure-algorithm logic free of platform types) stands if
  it's ever resumed.

## Open work

None outstanding on the building side. Every piece of real, unbuilt work
has already been built (verified against the actual state of `main` via
`git log`). What remains is entirely deploy/verification/decision work,
tracked in the two sections below.

## Awaiting human verification

Frontend code for all of these is built, committed to `main`, and
`check`/`build`-clean. What's missing is a manual frontend redeploy and/or a
real browser/touchscreen/device pass — not further Claude-side building.

- [x] **Frontend redeploy.** Shipped 2026-09-15 (see Log). Still needs a live-site confirm pass.
- [ ] **Real backend-hosted piece playback**: member and guest, including password-protected groups — sounds/looks right end to end.
- [ ] **PDF markup**: pen/stamp/eraser/undo, the annotation-mode on/off toggle, and the "My mix" vs. reference-recording audio-source picker — real touchscreen/browser confirm.
- [ ] **Piece Notes panel**: director + personal notes on both the player and the Rehearsal Tracks card, as admin and as plain member.
- [ ] **Group markup + cue points**: group markup layer toggles + admin draw-target switch, and PDF cue points (place/tap-to-jump/edit, visible to guests) — real touchscreen pass.
- [ ] **Local profile / guest reconnect**: guest name-match reconnect — a real phone / second physical browser pass (already Playwright-verified functionally).
- [ ] **Carpool board UI + guest posting**: manual browser pass once deployed.
- [ ] **Carpool Map**: needs a real Google Maps API key configured (human/account step) plus a real-browser pass; currently no-ops safely to the list-only board with no key set.
- [ ] **Rendering-pipeline audio quality**: human hasn't listened to a rendered stem set to confirm the GM soundfont's quality. Low priority — the current player synthesizes client-side and never wires up the server-rendered stems at all; that pipeline is dormant, not on any critical path.

## OMR pipeline + in-app notation editor (parked)

Built out on the `omr-editor` branch (OMR transcription, paged multi-page
handling, a working-draft slot, a full in-app MusicXML correction editor
with playback/undo/measures-mode/page-by-page review) but **not merged to
`main`**. The frontend editor surface (`/piece/[id]/edit` and everything
under it) was deleted from `main` as unverified WIP on 2026-09-01; the
backend OMR code (`Backend/app/omr/`: `audiveris.py`, `oemer.py`,
`paged.py`, `pipeline.py`) still sits on `main`, dormant and
UI-unreachable — no route on `main` ever calls it end to end.

All of that branch's own implementation work is done; what's pending there
is exclusively human real-browser passes (run a real multi-page scan
through paged OMR, step through the editor's playback/undo/measures modes,
publish a corrected draft) and two migrations that only reach production by
merging that branch (or cherry-picking) to `main` — never by a local
`alembic upgrade` against the prod `.env` (this broke production once
already, 2026-08-31).

Revisit by merging (or restarting UI work from) `omr-editor`, not by
redesigning from scratch — the design (correction-only editor on an OSMD
render, MusicXML-DOM as the editable model) was already spiked and proven.

## Backlog

- Real job queue (Celery/RQ) if background-task OMR processing, or
  Responsibilities recurrence/reminders, or the anonymous-participant
  sweep, ever need real scheduling instead of a manual command.
- Mid-piece tempo changes drift the OMR editor's playhead (piecewise
  ms→onset map, or a walkable tempo-map, needed).
- Weekly note structured sections/items (deferred pending evidence admins
  want structure over prose; a JSONB `structured` column is the cheap
  first step if so).
- Decide diff/patch vs. full-reupload semantics for a group "modification."
- Group invite flow (email invite vs. join code) — not designed yet.
- Set `AWS_*` Object Storage env vars on Render (`save_file` already
  supports it) and re-upload the 6 modification-version PDFs lost to old
  disk wipes before that swap landed.
- Responsibilities: recurrence rules + lazy date generation; notifications/
  reminders; swap requests + admin-approval-required signups; whether
  roles/schedules should be reusable templates across groups — all
  explicitly deferred, all need a real job runner or a design pass first.
- Pick a transactional email provider (Resend/Postmark) so password-reset
  links work for real, in place of the current server-log-only send. Now a
  shared dependency for a second thing (see next item), which raises its
  priority.
- Carpool match notifications: email each side once a match exists
  (`CarpoolSeatClaim`/`CarpoolRiderInterest` created), pointing them at
  each other's contact info to coordinate off-app. Chosen 2026-09-14 over
  SMS (no Twilio-style provider today, and "Google phone" isn't a real
  automatable-SMS option) and over in-app-only (not proactive enough).
  Depends on the transactional-email item above; also needs an email
  field on `CarpoolPost` (today it only collects an opt-in
  `contact_phone` — no email is collected for carpool at all yet).
  Decided 2026-09-14: optional, same as `contact_phone` — but the
  post/claim form warns that skipping it means no match notification
  (in-app reveal is the only fallback then).
- Re-enable Google Sign-In: publish the OAuth consent screen out of
  Testing in Cloud Console (project `divisi-506916`), re-add
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` on Render, restart the service.
- Decide the anonymous-participant retention window (N days) for
  `scripts/prune_anonymous_participants.py`.
- Track "last opened piece" server-side for a real Home "Continue
  practice" card (currently fixture/bundled-demo-only).
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
  time-stretching problem, not a rate multiplier, and moot unless the
  server-rendered stems pipeline ever actually gets wired up.
- Always deploy the frontend with `PUBLIC_API_BASE_URL` explicitly set to
  the real backend URL, never a bare `npm run build` (has caused a live
  outage before by baking in a local `.env`'s `localhost` value).
- `groups/[id]/+page.svelte`'s per-tab split and further god-file cleanup
  (`ResponsibilitiesTab` breakup, a `db/models/` split, player
  transport/mix composables) — partially done across two cleanup passes,
  more candidates flagged but not required.

## Log

- 2026-09-15: Fixed a display bug in the chord-based divisi auto-split
  shipped earlier today: `splitChordalDivisi` correctly split a chordal
  divisi voice into `${base}-1`/`${base}-2` desks for the mixer, but that
  same split object fed the score renderer too, so the notation also came
  out as two staff rows (confirmed on "The Challenge of Thor": "Soprano 1"
  and "Soprano 2" each showing one note of what used to be a single
  2-note chord). The split should only ever affect audio/mixer routing,
  never the printed score. Added `mergeSplitDesksForDisplay` in
  `notation/voicePartAssignment.ts`, the literal inverse of
  `splitChordalDivisi`: collapses an auto-split base voice's two desks
  back into one combined part before `musicXmlConverter.ts`'s
  `convertVisualParts` builds staves, reconstructing the original 2-note
  chord at a real divisi onset and deduping the duplicated note/lyric back
  to one at a unison onset. Only pairs `splitChordalDivisi` itself
  produced are merged — marked with a new `autoSplit` flag on
  `VoicePartInfo` — so a file that names its own real two-staff divisi
  split (e.g. actual "Soprano 1"/"Soprano 2" tracks/parts) still renders
  as two staves, untouched. Mixer-facing `parsed.parts`/`notes`/`lyrics`
  are never mutated; `convertVisualParts` builds a fresh transformed copy
  for display only. New tests in `voicePartAssignment.test.ts` (split
  reversed to one chord, unison duplicate deduped to one note, lyric
  dedup, file-named split left alone, no-mutation check, full visual-state
  merge-rule table) and a new `musicXmlConverter.test.ts` (one staff per
  base voice for an auto-split piece, file-named splits still get two
  staves, no mutation of the mixer's inputs). Full suite green (232
  tests), `npm run check` clean.
- 2026-09-15: Shipped the "Lyrics in the player" backlog item: an
  admin-triggered "Generate lyrics from PDF" button (Tracks tab edit
  panel, shown once a track has both a music file and a PDF) that reads
  the piece's PDF text layer, classifies it into per-voice sung syllables
  via Groq (`llama-3.3-70b-versatile`, OpenAI-compatible endpoint, JSON
  requested in prose per the proven `~/projects/walkcode/server/llm.js`
  shape rather than `response_format`), and sequentially injects them as
  MusicXML `<lyric>` elements onto each voice part's note onsets (Nth
  cleaned syllable -> Nth sung onset, skipping rests/tie-continuations —
  the same positional-alignment principle `musicXmlConverter.ts`'s
  `attachLyrics` already uses for MIDI lyric events). Scope decisions:
  MusicXML/`.mxl`-sourced pieces only (MIDI-sourced pieces 400 with a
  clear message — no OMR/note-data regeneration involved at all); no OCR
  fallback for a scanned PDF with no real text layer (also a clean 400);
  synchronous in the request, no job queue (Groq calls are fast, files
  are small; a real job queue stays backlogged below for heavier work).
  The new `PieceVersion` is immediately published (submit -> approve ->
  distribute in one step via the existing `publish_version` helper)
  rather than left as a review draft: unlike the OMR pipeline (a full
  transcription redo `publish_version`'s draft step exists to guard),
  this only ever adds lyric annotations on top of already-approved
  note/rhythm data, and there's no frontend affordance today to review a
  parked draft anyway (the OMR editor that would do that is deleted from
  `main`, see below) — so draft-only would have been a dead end no admin
  could reach. New code: `Backend/app/lyrics/` (`extract.py` PyMuPDF word
  tokens + scanned-PDF detection, `groq_client.py` the Groq call + prompt
  + defensive JSON extraction, `inject.py` the sequencing/injection logic
  via music21), `Backend/app/api/routes/library/lyrics.py`
  (`POST /library/pieces/{id}/generate-lyrics`, admin-only), two new
  `Settings` fields (`groq_api_key`, `groq_lyrics_model`), and
  `Backend/tests/test_lyrics.py` (33 tests: sequencing/tie/rest-skipping
  unit tests against a synthetic music21 score, PDF extraction against
  real generated PDFs, Groq response parsing against a monkeypatched
  `_call_groq`, full route wiring, plus one `integration`-marked
  real-network test skipped without a real `GROQ_API_KEY`). Full Backend
  suite: 440 passed, 1 skipped. Frontend: `generateLyrics` action in
  `Frontend/src/routes/groups/[id]/actions/tracks.ts` and a button in
  `TracksTab.svelte`'s edit panel, `npm run check` clean.
- 2026-09-15: Fixed a live prod bug (SFCC tester report): "The Challenge of
  Thor" 404'd on load ("Malformed MusicXML... '<' not found"). Root cause:
  `af05222` (2026-09-14) deleted `Backend/fixtures/SFCC/` believing it was
  only the dead frontend bundled-demo copy, but a real Backend `Piece`
  (group-owned, SFCC) was still distributed with `file_path` pointing at
  that exact now-gone fixture path. Recovered the file's bytes from git
  history (last commit before the deletion) and re-uploaded them through
  the real service layer (`save_file` to object storage, `add_version` +
  `publish_version`, as the group admin) rather than patching `file_path`
  via raw SQL — same code path the upload UI uses. New version
  `9fdcb139...` is live, round-trip verified readable from object storage.
  The two older approved versions still point at the dead fixture path but
  are no longer distributed, so nothing serves them; left alone.
- 2026-09-15: Chord-based divisi split for the mixer, resolving the
  backlog item's open design call. New `splitChordalDivisi` in
  `notation/voicePartAssignment.ts`: groups a plain (unsplit) SATB voice's
  notes by exact `startMs` onset, and where a real 2-note onset exists
  somewhere in the voice, splits it into `${base}-1`/`${base}-2` desks by
  pitch rank (higher pitch to desk 1). A 1-note onset duplicates onto both
  desks rather than picking one, since both parts are genuinely sounding
  the same pitch there. Bails out (leaves the voice unsplit) if any onset
  stacks more than 2 notes, or if the voice never has a 2-note onset at
  all. Wired into both `midi/parser.ts` and `musicxml/parser.ts` as a
  post-process step after the existing name-based `assignVoiceParts` call,
  so a file that already names its own split (e.g. "Soprano 1"/"Soprano
  2") is untouched. New `voicePartAssignment.test.ts` covers clean splits,
  mixed unison/2-note onsets, monophonic (no-op), 3+-note bail-out, lyric
  duplication, and already-split no-op; full suite green (214 tests),
  `npm run check` clean.
- 2026-09-15: "Mostly Me" mix preset now drops non-focus parts to silence
  (0) instead of a quiet 0.15, matching a +50/-50 delta from the 0.5 Even
  baseline (focus was already at the +50 cap). Deployed the frontend
  (`npm run build && npx wrangler deploy`, picking up `.env.production`'s
  real backend URL) to `https://divisi.maripi.net` — clears the
  long-standing "Frontend redeploy" item below; everything built over the
  last several days is now live, not just committed.
- 2026-09-14: Replaced `Backend/plan.md`, `Frontend/plan.md`, and
  `OMR_EDITOR_PLAN.md` with this `PLAN.md`, tracking current state and
  backlog going forward (the old files' full history was archived locally,
  outside the repo). Cross-checked every milestone the source files marked
  incomplete against `git log`: nearly all of the "not pushed/deployed"
  notes scattered through the source plans turned out to be stale — the
  commits were already reachable from `main`, and `main` matched
  `origin/main` — so the only genuinely open work left is a manual frontend
  redeploy, a batch of human real-browser/touchscreen passes, a handful of
  backlog-tracked decisions, and the parked OMR/editor branch.
- 2026-09-14: Backend test coverage for `PUT /groups/{id}/description`,
  `PUT /groups/{id}/members/{user_id}/role` (last-admin-demote guard,
  promote/demote, 404 on a non-member), and `DELETE
  /responsibilities/roles/{id}` (role removal, cascading signup cleanup,
  admin-only). Added `delete_file` to `app/storage/files.py` and wired it
  into `delete_piece` so a deleted piece's local-disk/object-storage
  files are actually reclaimed instead of left as orphans. Weekly-note
  markdown renderer now supports `[text](url)` links (http/https/mailto
  only; other schemes render as plain text). Guest join page's practice
  link now carries the admin-set default tempo (`GuestPieceOut.
  default_tempo_bpm`), matching the member Tracks tab.
- 2026-09-14: Shipped two backlog items. `group_resources` (a group's
  stable link list — playlist, portal, shared doc): new `GroupResource`
  model/migration, admin CRUD at `/groups/{id}/resources`, a guest read
  route, and a Resources section on the Info/About tab (member read
  rides along with that page's existing `about` gate rather than a new
  `GroupPage` of its own). Weekly-note promotion: `PieceRehearsalNote`
  gained a nullable `source_weekly_note_id`, plus `POST
  /weekly-notes/{id}/promote` (admin picks the piece; title/body default
  to the source note's own) and a "Promote to rehearsal note" action on
  the Weekly Notes tab. Both migrations verified upgrade/downgrade
  clean against the local disposable Postgres; backend/frontend suites
  green.

