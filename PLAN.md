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

### Practice modes [ ]

Scoped 2026-11-12. Slices 3, 4, 5, 7 done; engine path committed (e9bb335). Adds Step mode (note by note) and Pitch
mode (microphone, "wait for pitch") beside today's Listen mode, on the
notation-engine score view (vendored at `Frontend/vendor/notation-engine`
via `npm run sync:engine`; source repo `~/projects/notation-engine`).
Listen mode already drives the engine cursor from the app's own player.

**Decisions (human, 2026-11-12):**
- Step and Pitch mode walk measures in **written order**, matching Listen
  mode, whose audio does not expand repeats. Repeats across all three
  modes are a later, separate slice (see Backlog).
- The engine becomes the **default renderer** before the practice modes
  ship (Slice 2); OSMD stays reachable via `?renderer=osmd`.
- The step-sequence builder is built in **Divisi first** and moved into
  notation-engine once Step and Pitch mode have settled its shape.
- Pitch mode is one part at a time (monophonic detection, no chords).

**Where things live:**
- Divisi: everything in Slices 0 to 8: step sequence (for now), mode UI,
  YIN detector, mic tracker, pitch session logic, `MidiPlayer` additions.
- notation-engine: `renderer.setNoteColors` (new, per-note ink; today's
  `setStaffColors` only colours whole staves), and later the step-sequence
  builder. The YIN detector is not notation-specific and stays in Divisi.

**Acceptance criteria (whole milestone):**
- [ ] Engine is the default score renderer, OSMD reachable via `?renderer=osmd`
- [ ] Step mode steps a chosen part (or all parts) onset by onset on real
      pieces, with touch buttons and arrow keys, playing each step
- [ ] Pitch mode advances on a held, in-tune sung note and shows how far
      off the singer is
- [ ] `npm run check` / `test` / `build` green throughout

**Tasks (Claude):**
- [ ] **Slice 0: Foundation.** Remove the `[DEBUG-a4f2]` pitch-drift probe
      from `Frontend/src/lib/audio/player.ts` (or keep it only until Slice
      1's diagnosis lands), sync the vendored engine to v0.2.0, and commit
      the engine path (`?renderer=engine`, tap-to-select, read-mode arrow
      stepping, `RenderSourceBadge`). Acceptance: check/test/build green;
      `vendor/notation-engine/VERSION` shows 0.2.0 with a clean SHA.
      After the sync, pass `header: false` to `mountScore` in
      `EngineScoreView` (no title block, like OSMD's `drawTitle: false`;
      0.1.0 has no such option).
      Partly done: engine path committed on 0.1.0 (e9bb335). Left: the
      probe removal and the 0.2.0 sync (notation-engine has no `v0.2.0`
      tag yet and uncommitted work).
- [ ] **Slice 1: Fix the audio pitch drift.** After a while on a piece,
      playback and tapped notes go flat (C4 measured at 258 Hz vs 261.6,
      about 24 cents) and sometimes recover; a fresh tab is in tune. Ruled
      out so far: the synth's own output (in tune in a headless loop), the
      `AudioContext` clock (audio/wall ratio stays 1.000 while flat), and
      resetting the `<audio>` element's `srcObject`. Main suspect: the
      `MediaStreamAudioDestinationNode` -> `<audio>` bridge (kept for iOS
      background audio). Acceptance: diagnosis confirmed by the human's
      `__divisiAudio.direct()` test, fix in, tuner stays in tune after
      long use. Gate for Slice 2.
- [ ] **Slice 2: Engine as the default renderer.** Flip the default in
      `scoreRendererFromUrl`, with `?renderer=osmd` as the fallback; the
      `RenderSourceBadge` still shows whenever a `renderer` param is
      present. Acceptance: tests for the flag, and the human renderer
      checks below pass first.
- [x] **Slice 3: Step sequence (pure).** Done 5a21a86 (`src/lib/practice/stepSequence.ts`). From the engine `Score`, a part
      filter (staves) and written order: the list of steps, each with its
      onset (whole notes), note ids and MIDI pitches. Rests skipped by
      default, a chord is one step, a tie continuation is not a new step,
      grace notes skipped. In `engineAdapter.ts` (or a sibling module).
      Acceptance: unit tests through `importMusicXml` on real fixtures.
- [x] **Slice 4: Mode switch + Step mode.** Listen / Step / Pitch switch
      on the piece page. Step mode: a practice cursor (highlight via
      `renderer.setPlaybackCursor` + `redrawMeasure`, follow-scroll via
      `view.scrollToNote`), touch-sized previous / replay / next buttons,
      arrow keys on desktop (in Step mode they move the practice cursor,
      not the Listen-mode selection), a part picker, and an "also play
      the other parts" toggle (others quieter). Needs a `MidiPlayer`
      addition that sounds several notes at once at per-note volumes.
      Acceptance: component/unit tests for the stepping state, plus a
      Playwright pass stepping a real piece.
      Done 102e4fd (`stepSession.ts`, `e2e/step-mode.spec.ts`, run with
      `--no-deps`). Scoped out: declared divisi layouts
      (`AdaptiveScoreView`, needs a cross-section staff mapping), and a
      step always sounds for 1 s rather than its written length.
- [x] **Slice 5: Pitch detector (pure).** YIN or similar over a
      `Float32Array` and sample rate, returning frequency + confidence.
      Acceptance: unit tests on synthetic signals (sines across the vocal
      range, vibrato, noise/silence rejected, octave-error cases).
- [ ] **Slice 6: Mic tracker.** `getUserMedia` only after a user gesture,
      per-frame detection, reports nearest note and cents off, full
      cleanup on stop (tracks stopped, nodes disconnected). Needs HTTPS
      (localhost is fine). Acceptance: unit tests with a fake stream/frame
      source; manual mic check.
- [x] **Slice 7: Pitch session logic (pure).** State machine: the target
      is the current step of the chosen part; holding within a tolerance
      for a hold time advances; rests auto-advance; settings for tolerance
      (default ±30 cents), hold time (default 400 ms) and "any octave".
      Acceptance: unit tests on synthetic frame sequences (hold, wobble
      out and back, wrong octave with and without "any octave", rests).
- [ ] **Slice 8: Pitch mode UI.** Mic permission flow (prompt, denied,
      unavailable), tuner-style cents needle, settings, matched note turns
      green. Until `setNoteColors` lands in the engine, mark the current
      note with the selection colour instead. Matching the last step goes
      straight to `finished` with no one-frame `matched` state, so the UI
      turns that last note green from `finished`. Acceptance: Playwright
      pass with a fake mic stream; human sing-test below.

**Tasks (Human):**
- [ ] Slice 1: when the tuner reads flat, run `__divisiAudio.direct()` in
      the dev-server tab and tap C4 again (back to 261 = the bridge).
- [ ] Before Slice 2: the M8 renderer checks on the engine view (dark
      theme, touch pinch, iOS Safari, long scores like der_abend), then
      decide to flip the default.
- [ ] notation-engine: add `renderer.setNoteColors` (per-note ink), then
      `npm run sync:engine` in Divisi.
- [ ] notation-engine, after Slice 8: adopt the step-sequence builder as a
      public engine helper.
- [ ] Step mode device check (`?renderer=engine`): iOS Safari audio on
      first tap, own-vs-other-parts volume, phone layout of the practice
      bar, scroll-follow on Der Abend, default part pick.
- [ ] Sing-test Step and Pitch mode on a laptop, a phone, and iOS Safari.

### Other open work

None outstanding on the building side. Both halves of the ambiguous
voice-part gate (Part A: `/review` confirmation, `cf362db`; Part B:
Tracks-tab direct-upload gate, `4bb9fbc`) and the player "greying out" fix
(`ace3802`) are done. What remains is deploy/verification/
decision work, tracked in the two sections below.

## Awaiting human verification

Frontend code for all of these is built, committed to `main`, and
`check`/`build`-clean. What's missing is a manual frontend redeploy and/or a
real browser/touchscreen/device pass — not further Claude-side building.

- [x] **Frontend redeploy.** Shipped 2026-09-15. Still needs a live-site confirm pass.
- [x] **Frontend redeploy, round 2.** Shipped 2026-09-23 —
  everything from that session's work is live on `divisi.maripi.net`.
  Still needs a live-site confirm pass.
- [ ] **Real backend-hosted piece playback**: member and guest, including password-protected groups — sounds/looks right end to end.
- [ ] **PDF markup**: pen/stamp/eraser/undo, the annotation-mode on/off toggle, and the "My mix" vs. reference-recording audio-source picker — real touchscreen/browser confirm.
- [ ] **Piece Notes panel**: director + personal notes on both the player and the Rehearsal Tracks card, as admin and as plain member.
- [ ] **Group markup + cue points**: group markup layer toggles + admin draw-target switch, and PDF cue points (place/tap-to-jump/edit, visible to guests) — real touchscreen pass.
- [ ] **Local profile / guest reconnect**: guest name-match reconnect — a real phone / second physical browser pass (already Playwright-verified functionally).
- [ ] **Carpool board UI + guest posting**: manual browser pass once deployed.
- [ ] **Carpool Map**: needs a real Google Maps API key configured (human/account step) plus a real-browser pass; currently no-ops safely to the list-only board with no key set.
- [ ] **Rendering-pipeline audio quality**: human hasn't listened to a rendered stem set to confirm the GM soundfont's quality. Low priority — the current player synthesizes client-side and never wires up the server-rendered stems at all; that pipeline is dormant, not on any critical path.
- [ ] **Lyric generation on "The Challenge of Thor"**: reverted back to its original, no-lyrics version after the 2026-09-16 NVIDIA debugging session's partial results weren't good enough to keep live. Now that generate-lyrics lands an unpublished, reviewable draft instead of auto-publishing, and "AI edit" exists to fix specific wrong measures without starting over, worth a fresh attempt: generate, review side by side at `piece/[id]/review`, spot-fix anything wrong with a targeted AI edit, then approve — real end-to-end use of the review flow, not just a synthetic smoke test.

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

- Repeats: Listen mode's audio plays measures in written order (no repeat
  or ending expansion), so Step and Pitch mode do too. A later slice should
  expand repeats for all three together (engine `measurePlayOrder`, plus a
  whole-note clock that maps to play order).
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
- `POST /library/pieces/{id}/generate-lyrics` regenerates from the current
  live version, not the pre-lyrics source, so a second run layers onto an
  earlier partial one: notes the new run doesn't reach keep the old run's
  lyrics. Regenerate from the pre-lyrics source (or clear all lyrics first)
  before this button gets routine use.
- `groups/[id]/+page.svelte`'s per-tab split and further god-file cleanup
  (`ResponsibilitiesTab` breakup, a `db/models/` split, player
  transport/mix composables) — partially done across two cleanup passes,
  more candidates flagged but not required.

