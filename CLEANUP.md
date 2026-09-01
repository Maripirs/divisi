# Divisi cleanup — working doc (round 2: god-files)

Started 2026-08-31. This is a living scratch/plan file, not permanent project
docs — fold into `Frontend/plan.md` / `Backend/plan.md` and delete once the
work lands (same lifecycle as the round-1 doc).

## What this round is

Round 1 (git `648fbaa`..`c1b73e8`, doc deleted in `e129cb2`) was
**duplication-focused**: shared card components, `ConfirmButton`,
`withSubmitting`, `$lib/utils/dates.ts`, `$lib/api/client.ts`, backend
`get_or_404`, `runAction`. It deliberately scoped **away from the largest
files**.

Round 2 target = those large files. Theme is **single responsibility / file
size**, not raw duplication. Goal: no hand-written frontend file over ~600
lines without a real reason, each module doing one thing.

## Repo shape (unchanged from round 1)

- `Frontend/` — SvelteKit, Svelte 5 runes. Bulk of this work.
  - Checks: `npm run check` (svelte-check) + `npm run build` (vite) +
    `npm test` (vitest — pure helper modules, added after this doc was
    written) + `npm run test:e2e` (Playwright, added 2026-09-01, gated on
    `E2E_PIECE_ID`; see `Frontend/e2e/`). Browser still not always
    available on the work machine (standing blocker, see `Frontend/plan.md`).
  - `.svelte.ts` rune-composable convention already exists:
    `src/lib/stores/settingsDrawer.svelte.ts`.
- `Backend/` — FastAPI + SQLAlchemy, well-layered
  (routes/schemas/services/db/rendering/omr). Just cleaned in round 1 —
  **low priority** here. Tests: `.venv/bin/python -m pytest -q` (SLOW —
  full ~17 min, subsets ~9 min — always background).
- `DivisiKit/` + `App/` — iOS/Swift, out of scope (small, clean, kept
  pure-algorithm per user memory `divisi-android-portability`).

---

## Problems

Five files carry ~6,800 lines (~40% of hand-written frontend code, excluding
`lib/paraglide/`):

| File | Lines | What's crammed in |
|---|---|---|
| `routes/piece/[id]/+page.svelte` | 2072 | ~8 concerns (see P2) |
| `routes/groups/[id]/+page.svelte` | 1604 | 6 tab bodies inlined in one template |
| `lib/components/PdfView.svelte` | 1466 | pdf.js rendering **+** a full freehand-markup editor |
| `lib/components/ScoreView.svelte` | 949 | OSMD wrapper + SVG paint math + gestures + cursor-follow |
| `routes/groups/[id]/+page.server.ts` | 710 | 28 form actions in one object |

**P1. God-components untouched by round 1.** The card extraction shrank the
*duplication* between member/guest pages but left the per-section wiring,
`{@const}` normalization, and controls all in the page bodies.

**P2. The player page** (`piece/[id]/+page.svelte`) — ~60 module-level state
decls + ~55 functions spanning: remote-piece resolution, MIDI bootstrap +
RAF render loop, transport (play/seek/tempo), focus/desk selection,
display-mode + per-staff visual states, mix-mode + balances, `localStorage`
persistence, MediaSession, global keyboard shortcuts, YouTube reference
audio, full annotation CRUD + sharing.

**P3. `PdfView`** bundles two unrelated features — pdf.js render/zoom/pan
and a markup editor (tools, stamps, text overlay, eraser, undo, API sync,
~480 script lines already fenced with a `// --- Markup (freehand drawing) ---`
banner at line 92).

**P4. Duplicated pinch-zoom/pan** — `touchDistance` /
`handleTouchStart|Move|End` / `zoomBy` / `resetZoom` reimplemented in both
`PdfView` and `ScoreView`.

**P5. `ScoreView`** has ~200 lines of pure DOM paint functions
(`paintableLeaves`, `renderedStaffBands`, `clusteredNumbers`,
`paintSymbolsInMutedBands`, `svgBox`, `paintSvgElement`, `hasPaint`) with no
component state — extractable as-is.

**P6. Backend (low priority).** `library.py` (531) mixes piece CRUD +
version review workflow (submit/approve/reject/distribute) + file serving.
`models.py` (477) is all ORM classes in one module. Everything else is fine.

---

## Proposed module boundaries

```
src/lib/player/                        composables + pure helpers for piece/[id]
  mixMath.ts                           pure: presetBalances, presetVisualStates,
                                       matchingMixMode/matchingDisplayMode,
                                       sameBalances, sameVisualStates,
                                       expandBaseRecord, collapseToBaseRecord,
                                       materializePartRecord, isFocusPart
  persistence.ts                       pure: settingsStorageKey,
                                       loadPersistedSettings, persistSettings
  annotations.svelte.ts                annotation list/sheet/shares state + all
                                       CRUD/share calls + annotationErrorMessage
  (later) transport.svelte.ts          player instance, position/duration/isPlaying,
                                       RAF loop, seek, togglePlay, tempo  — DEFERRED
  (later) mixState.svelte.ts           voicePart/subPart/display/mix/visualStates/
                                       balance + the "matches default" deriveds — DEFERRED
src/lib/actions/pinchZoom.ts           shared touch-gesture + zoom-clamp Svelte action
src/lib/components/score/
  scoreTreatments.ts                   pure SVG paint fns lifted from ScoreView
src/lib/components/pdf/
  PdfMarkupLayer.svelte                markup editor; page-canvas geometry via props
src/routes/groups/[id]/tabs/
  TracksTab.svelte  HomeworkTab.svelte  WeeklyNotesTab.svelte
  ResponsibilitiesTab.svelte  MembersTab.svelte  AboutTab.svelte
src/routes/groups/[id]/actions/
  tracks.ts  homework.ts  weeklyNotes.ts  responsibilities.ts  members.ts  group.ts
                                       spread-composed in +page.server.ts:
                                       export const actions = { ...trackActions, ... }
```

Keeps the existing style — Svelte 5 runes, `$lib/...`, thin server actions,
`.svelte.ts` composables. No new patterns, no new deps.

---

## Refactor steps (behavior-preserving first)

| # | Refactor | Files | Risk | Verify |
|---|---|---|---|---|
| 1 | `ScoreView` → `score/scoreTreatments.ts` (pure fns, move + import) | 2 | very low | check + build |
| 2 | `piece/[id]` → `player/mixMath.ts` + `player/persistence.ts` (pure fns) | 3 | very low | check + build |
| 3 | `$lib/actions/pinchZoom.ts`; adopt in `PdfView` + `ScoreView` | 3 | low | check + build + manual pinch |
| 4 | `player/annotations.svelte.ts` — lift annotation feature out of player page | 2 | medium | check + build + manual annotate flow |
| 5 | `PdfMarkupLayer.svelte` — split markup editor from `PdfView` | 2 | medium | check + build + manual markup flow |
| 6 | `groups/[id]/+page.svelte` → `tabs/*.svelte` (one per tab) | 7 | medium | check + build + click each tab |
| 7 | `groups/[id]/+page.server.ts` → `actions/*.ts` (spread-compose) | 6 | low | check + build |
| 8 | *(separate session)* backend `library.py` → pieces/versions/files split; maybe `db/models/` package | ~4 | low-med | pytest touched subset |

Steps 1–3: pure mechanical moves, zero behavior surface. 4–7: isolated
feature/section extractions. Player **transport/mix-state composables are
deferred** — they touch the RAF loop and are safer once the page is already
smaller.

One step per pass, each a reviewable diff. Do not refactor unrelated areas
in the same pass.

## Tradeoffs / open questions

- **Frontend test runner: RESOLVED — vitest added** (2026-08-31, step 1).
  `vitest` + `jsdom` dev deps, standalone `vitest.config.ts` (does not load
  the SvelteKit/paraglide/SSL plugins), `npm test` / `npm run test:watch`.
  Tests are `src/**/*.{test,spec}.{js,ts}`, default env `node`, opt into
  jsdom per-file with a `// @vitest-environment jsdom` docblock. Caveat
  learned in step 1: jsdom has no SVG layout engine and only a stub
  `getComputedStyle` for SVG presentation attrs, so geometry/computed-style
  paths stay build+manual-checked; pure algorithms and guard clauses get
  real tests.
- Steps 1–2 shrink `ScoreView` by ~110 and `piece/[id]` by ~120 with
  essentially no behavior change (the ~400/~200 guesses were high — the
  extracted fns were compact and their comments moved out with them). The
  real win is testability: 35 unit tests now cover logic that had none.
- Step 6 (tab split) is the one most likely to churn markup/styles; the
  round-1 card components already absorbed the cross-page duplication, so
  each tab component should be a fairly clean lift.

## Suggested sequence

1. Steps **1 + 2** (pure helpers) — cheapest, biggest readability win per
   line touched, unblocks everything downstream.
2. Step **3** (pinchZoom) — small, kills a real dup, self-contained.
3. Steps **4 + 5** (annotation + markup feature extraction) — own focused
   session each.
4. Step **6** (tab split), then **7** (action split) — one groups/[id]
   session.
5. Step **8** (backend) — separate session, needs the pytest suite free.

## Status log

- [x] Step 1 — ScoreView scoreTreatments.ts — `src/lib/components/score/
      scoreTreatments.ts` (7 pure fns: paintableLeaves, clusteredNumbers,
      svgBox, paintSvgElement, hasPaint, renderedStaffBands,
      paintSymbolsInMutedBands). `renderedStaffBands` /
      `paintSymbolsInMutedBands` took `svg`/`cursorElement`/resolved-color
      params instead of closing over `container`/`osmd`/`themeFor`. ScoreView
      949→839. + vitest setup (see Tradeoffs) + scoreTreatments.test.ts (12
      tests). check 0 errors, build ok, tests green.
- [x] Step 2 — player mixMath.ts + persistence.ts — `src/lib/player/mixMath.ts`
      (9 pure fns: expandBaseRecord, materializePartRecord, collapseToBaseRecord,
      isFocusPart, presetVisualStates, matchingDisplayMode, sameVisualStates,
      presetBalances, matchingMixMode, sameBalances) + `src/lib/player/
      persistence.ts` (settingsStorageKey, loadPersistedSettings,
      savePersistedSettings + PersistedSettings iface). Functions that used to
      close over `parsed`/`subPart` now take `parts`/`subPart` params (same
      pattern as step 1's renderedStaffBands); call sites pass
      `parsed?.parts ?? []`. Component keeps a thin `persistSettings()` wrapper.
      piece/[id] 2072→1955 (less than the ~400 the doc guessed — the fns were
      compact). + mixMath.test.ts (23 tests) + persistence.test.ts (5 tests,
      Map-backed localStorage stub, stays node env). check 0 errors, build ok,
      35 tests green.
- [x] Step 3 — pinchZoom action — `src/lib/actions/pinchZoom.ts`: a Svelte
      `use:` action (first custom action in the repo — only `use:enhance` from
      SvelteKit existed before) plus `clampZoom` + `MIN/MAX_ZOOM`/`ZOOM_STEP`
      exports. Both components dropped their local pinch block (touchDistance /
      handleTouch{Start,Move,End} / pinchState/pinchRaf/pendingZoom, the 4
      touch listeners in onMount/onDestroy, and the duplicated MIN/MAX/STEP
      consts) for `use:pinchZoom={{ zoom, onZoom, onPan? }}` on the container.
      ScoreView's one-finger-drag → cancelFollow branch is preserved via the
      optional `onPan` param; PdfView omits it. `zoomBy`/`resetZoom` stay
      component-local (they mutate each component's own `zoom` $state) but now
      call `clampZoom`. ScoreView 839→775, PdfView 1466→1412 (−118 total),
      shared action is 108 lines with the two components' comments merged. +
      pinchZoom.test.ts (3 tests on clampZoom; the action stays build+manual
      per the jsdom-no-TouchEvent caveat). check 0 errors, build ok, 38 tests
      green.
- [ ] Step 4 — player annotations.svelte.ts
- [ ] Step 5 — PdfMarkupLayer.svelte
- [ ] Step 6 — groups/[id] tabs/*.svelte
- [ ] Step 7 — groups/[id] actions/*.ts
- [ ] Step 8 — backend library.py split
