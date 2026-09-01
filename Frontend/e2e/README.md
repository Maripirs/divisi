# End-to-end tests (Playwright)

These cover behaviour the unit suite (vitest, `src/**/*.test.ts`) can't: a
real browser, real audio (FluidSynth in an AudioWorklet), real OSMD
engraving, and a real Backend round-trip.

## What's here

- `editor-playhead.spec.ts` — the editor score view's playhead cursor stays
  coordinated with the audio transport. This is the regression net for the
  `EditorScoreView.svelte` fixes on `feat/generate-track-from-pdf`:
  - **note-level granularity** (`SkipInvisibleNotes = false`): during
    playback the playhead visits many distinct note onsets, not a handful of
    measure starts.
  - **repeat-barline linearity** (`CursorIgnoreRepetitions = true`): the
    playhead's musical position never jumps backward while the audio plays
    straight through a repeat.
  - **main-thread responsiveness during playback**
    (`assertResponsiveDuringPlayback`): the in-page sampling interval keeps
    firing on cadence. This caught a real bug the position-only checks
    missed — the zoom/theme and seam `$effect`s call `placeCursor()`, which
    transitively reads `playheadWholeNotes`, so `$effect`'s transitive
    dependency tracking re-subscribed them to the transport position and
    ran a full `osmd.render()` on *every animation frame* during playback
    (~1.7s main-thread stalls on a 4-minute score). Fixed by wrapping those
    calls in `untrack()`.
  - **position sync**: the rendered playhead stays at or just behind
    `positionMs / msPerWholeNote`, never ahead.
  - plus the drag-to-seek gesture on the playhead bar.

- `_diagnose.spec.ts` / `_profile.spec.ts` — opt-in investigation tools,
  tagged `@tools` and excluded from the default run. `_diagnose` reports
  rAF/`setInterval` cadence and long-task timing during playback;
  `_profile` captures a CDP CPU profile (written to
  `test-results/editor-playback.cpuprofile`) and prints top self-time.

  ```sh
  E2E_TOOLS=1 E2E_PIECE_ID=<id> npx playwright test _diagnose
  E2E_TOOLS=1 E2E_PIECE_ID=<id> npx playwright test _profile
  ```

## How the browser test reads internal state

It does **not** try to "hear" the audio. The audio position (`positionMs`)
and the rendered playhead's musical position are both plain numbers:

- `src/routes/piece/[id]/edit/+page.svelte` installs
  `window.__divisiEditorProbe()` — only under `vite dev` (`import.meta.env.DEV`)
  or when the page is opened with `?e2e`. It returns `{ positionMs, isPlaying,
  msPerWholeNote, playheadOnset, ... }`.
- `EditorScoreView.svelte` exposes `playheadOnset()` and tags its two cursor
  elements `data-role="playhead"` / `data-role="selection"`.

`helpers/playback.ts` polls those during playback and asserts on the series.

## Running

```sh
# from Frontend/
E2E_PIECE_ID=<a piece id owned by the test user> npm run test:e2e
npm run test:e2e:ui        # interactive
```

The suite **skips** the editor specs unless `E2E_PIECE_ID` is set. For the
repeat-barline assertion to be meaningful the piece must actually contain
repeat barlines — ideally one generated from a PDF, where the desync was
originally found.

### Config / environment

- **Dev server**: `playwright.config.ts` starts `npm run dev` on
  `https://localhost:5173` (self-signed; `ignoreHTTPSErrors`) and reuses an
  already-running one. AudioWorklet needs a secure context — `localhost`
  qualifies, so FluidSynth loads under headless Chromium.
- **Backend**: whatever `PUBLIC_API_BASE_URL` resolves to for the app
  (`.env.local` currently points at the local docker Backend on `:8000`;
  `.env` is the deployed one). `auth.setup.ts` logs in against that same
  Backend.
- **Credentials**: `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` (already in
  `Frontend/.env.local`), or `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`.
  `playwright.config.ts` loads `.env` then `.env.local` itself since the
  Playwright runner doesn't.
- **Session**: `auth.setup.ts` writes `e2e/.auth/state.json` (gitignored);
  the `chromium` project loads it as `storageState`, so specs start logged
  in.

## Known limits

- No assertion on the *actual synthesized sound* — Playwright can't capture
  audio output. The tests treat `positionMs` as the audio source of truth
  and check the visual against it. (FluidSynth's AudioWorklet does run under
  headless Chromium here, so playback genuinely advances.)
- Click-to-seek on empty staff space isn't covered here — which pixels count
  as "empty" depends on the engraving. Drag-to-seek (a stable target) is.
- The mid-piece tempo-change drift the handoff flagged (`parseMusicXmlFile`
  bakes `<sound tempo>` into note `startMs` but reports a single `tempoBPM`)
  is *not* something these tests catch — `assertPlayheadTracksTransport`'s
  tolerance is one whole note. Tightening it on a tempo-change piece would
  be the way to pin that down.
