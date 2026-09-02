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
- [x] Step 4 (player annotations.svelte.ts). Created
      `src/lib/player/annotations.svelte.ts` (266 lines), the repo's first
      *stateful* `.svelte.ts` composable (steps 1-2 moved only pure fns;
      `settingsDrawer.svelte.ts` is a bare `$state` object). Moved: the 7
      annotation `$state` decls (annotations, annotateMode, annotationSheet,
      saving, error, shares, sharesLoading), all 12 functions (loadAnnotations,
      annotationErrorMessage, measureLabel, toggleAnnotateMode,
      openCreateAnnotation now `openCreate`, openAnnotation now `openMarker`,
      loadShares, closeAnnotationSheet now `closeSheet`, saveAnnotation now
      `save`, deleteCurrentAnnotation now `deleteCurrent`, share/unshare), the 3
      `$derived.by` label/content/isOwner computations, and the whole
      `$lib/api/annotations` import block. `canAnnotate` stayed in the component
      (it also gates the PDF markup UI, so it is not annotation-specific).
      Interface decision: a **factory** (`createAnnotationController(deps)`)
      returning getters for the reactive state and `$derived` values plus the
      action methods, not a class. The factory reads closer to the existing
      module style, and it keeps the "snapshot annotationSheet into a local
      const so TS narrows it" pattern verbatim in every method. Three deps are
      threaded as **getters** (same param-not-closure choice as steps 1-2):
      `pieceId: () => remoteMeta?.pieceId`,
      `currentUser: () => page.data.user ?? undefined`,
      `timeSignature: () => parsed?.timeSignature`. `remoteMeta` and `parsed`
      are assigned imperatively (not `$state`) and declared lower in the file,
      but the arrow getters are not called until the controller acts, so there
      is no TDZ at instantiation. The component builds
      `const ann = createAnnotationController({...})` next to the other state
      decls; template refs were rewired to `ann.*` (ScoreView
      `annotations`/`annotateMode`/`onAnnotationPlace`/`onAnnotationMarkerClick`,
      the annotate toggle button, all 14 `AnnotationSheet` props). piece/[id]
      2100 to 1928 (minus 172). No unit test added: instantiating the factory
      pulls in `$state`/`$derived.by`, the awkward-outside-a-component case
      steps 1-2 deliberately stayed clear of, and the pure-ish
      `measureLabel`/`annotationErrorMessage` are now private to the module.
      check 0 errors (14 warnings, all pre-existing, byte-identical to
      baseline), build ok, 54 tests green.
- [ ] Step 5 — PdfMarkupLayer.svelte
- [ ] Step 6 — groups/[id] tabs/*.svelte
- [ ] Step 7 — groups/[id] actions/*.ts
- [x] Step 8 — backend library.py split — `app/api/routes/library.py` (626
      lines) → `app/api/routes/library/` package: `pieces.py` (piece CRUD +
      `_omr_fields`), `versions.py` (upload/submit/approve/reject/distribute
      + working-draft/replace-file/publish), `files.py` (file/pdf/manifest/
      renders serving + `_source_path_or_404`), shared `_common.py`
      (`_get_piece_or_404`/`_get_version_or_404`/`_require_piece_access`/
      `_require_review_authority`/`_save_upload`), and `__init__.py` mounting
      the three subrouters under the same `/library` prefix so `main.py` is
      unchanged. Pure mechanical move: all 15 `/library/*` paths, methods,
      response models, status codes, docstrings, auth checks identical
      (verified against `app.openapi()`). One test's monkeypatch target
      updated to the `library.files` submodule. Full suite 226 passed.
      `db/models/` package split not done (out of scope for this pass).
