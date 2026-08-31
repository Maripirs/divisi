# Divisi project-wide cleanup — working doc

Started 2026-08-30. Goal: remove repeated logic, repeated styling, and pull
out shared modules/components where structures are similar enough that a
shared piece + local edits makes sense.

This is a living scratch/plan file for the cleanup effort — not permanent
project docs. Delete or fold into `Frontend/plan.md` / `Backend/plan.md`
once the work lands.

## Coordination

- Peer Claude session **`Divisi-Mac`** is working **Backend OMR only**:
  `Backend/app/omr/{audiveris,oemer,pipeline}.py`, `app/jobs/omr_jobs.py`,
  `app/api/routes/omr.py`. It confirmed it is NOT in Frontend or the iOS app.
- Everything in this doc is Frontend or non-OMR Backend → no conflict.
- Re-check with `ListAgents` / `SendMessage` before touching anything under
  `app/omr/` or `omr.py`.

## Repo shape

- `Frontend/` — SvelteKit (Svelte 5 runes), the bulk of active work.
- `Backend/` — FastAPI + SQLAlchemy. Tests are black-box API-level in
  `Backend/tests/`, run with `.venv/bin/python -m pytest -q` (SLOW: full
  suite ~17 min, subsets ~9 min — always background these).
- `DivisiKit/` + `App/` — iOS/Swift, ~1500 LOC, intentionally kept
  pure-algorithm (see user memory `divisi-android-portability`). Out of
  scope for this cleanup — small and clean.

---

## DONE — B1+B2+B3 (Backend shared helpers) ✅ committed cbe8db5

Tests after change: touched-area suite **83/83 pass**. Full suite has 2
failures but both are `test_omr_*` "no engine installed" tests failing
because the peer installed Audiveris/oemer on this machine — unrelated to
these changes.

### What changed

**New file `Backend/app/services/groups.py`** — group-level helper module
(counterpart to `services/pieces.py` and `services/pages.py`):
- `group_role()` — MOVED here from `services/pieces.py` (B3). Re-exported
  from `pieces.py` via `from app.services.groups import group_role  # noqa: F401`
  so `library.py` / `omr.py` imports keep working untouched.
- `get_group_or_404()`, `require_member()`, `require_admin()` — the
  byte-identical `_`-prefixed copies (B1).

**Deduped — deleted local copies, now import from `services.groups`:**
- `routes/homework.py` — removed `_get_group_or_404`/`_require_member`/`_require_admin`; 7 call sites renamed to public names; dropped now-unused `Group`/`GroupRole` imports.
- `routes/weekly_notes.py` — same 3 removed; 6 call sites; dropped `Group`/`GroupRole`.
- `routes/responsibilities.py` — same 3 removed (kept local `_is_admin`, the non-raising variant); 15 call sites renamed via perl.
- `routes/groups.py` — removed only `_get_group_or_404` (its `_require_admin` returns `GroupMembership`, left as-is); 10 call sites; kept `Group` import (used elsewhere).
- `routes/annotations.py` + `routes/piece_markup.py` (B2) — removed local `_get_piece_or_404`, now use existing `services.pieces.get_piece_or_404`; 2 call sites each. Left each file's `_can_access_piece` alone (author documented it as a deliberate local copy).

Net: ~70 lines of duplication removed, one new 48-line module, no behavior change.

### Not done in B-series (candidates)
- **B4** — generic `get_or_404(db, Model, id, name)` for the ~12
  `_get_<thing>_or_404` helpers (responsibilities.py has 4 alone). Backend,
  mechanical, wants test suite free to verify.

---

## Frontend wide analysis — shared-component + local-edit opportunities

All file:line refs are `Frontend/src/`. No edits made yet.

### Tier A — Shared component + slotted local edits (highest payoff)

#### A1. Content cards rendered in BOTH member page and guest page
`routes/groups/[id]/+page.svelte` (member, editable) and
`routes/join/[code]/+page.svelte` (guest, read-only) render the **same four
card types** from the same underlying data, diverging only in admin
affordances and snake_case (member API) vs camelCase (guest API) field names.

| Card | Member site | Guest site | Extra variants |
|---|---|---|---|
| Homework/assignment | `groups/[id]/+page.svelte:373` | `join/[code]/+page.svelte` `tab==='homework'` | `home/+page.svelte` "Due soon" (3rd) |
| Weekly note | `:908` | `join/[code]` `tab==='weeklyNotes'` | — |
| Responsibility date | `:1280` | `join/[code]` `tab==='responsibilities'` | `home` "Upcoming responsibilities" (4th) |
| Track/piece | `:580` | `join/[code]` tracks tab | `lib/components/PieceLibrary.svelte` (5th) |

Plan: `HomeworkCard.svelte`, `WeeklyNoteCard.svelte`,
`ResponsibilityDateCard.svelte`, `TrackCard.svelte`. Each takes a
normalized item + optional `admin` snippet for edit/delete controls. Guest
page passes no snippet. Normalize guest camelCase in `join/[code]/+page.ts`
so the card sees one shape.
Effort M–L. Risk M (no component tests; read paths are manual-tested).

#### A2. `EditableCard` inline-edit shell (user's original flag)
Edit-in-place flow — card → Save/Cancel row → confirm-then-delete — repeats
**~7×** in `groups/[id]/+page.svelte`, each styled differently.

Divergence table (target = Homework flow, per user decision):

| Instance | line | Edit trigger | Save btn | Cancel | Delete placement | Delete confirm |
|---|---|---|---|---|---|---|
| **Homework (REFERENCE)** | 405 | `text-link` "Edit details" | `btn-outline` | `text-link` | inside edit form via `formaction` | inline icon ✓/✕ (`hw-icon-btn`) |
| Weekly note | 910 | `btn-outline` "Edit" | `btn-primary` | `btn-outline` | outside, separate form, shown when NOT editing | text + `btn-danger` |
| Track details | 582 | `text-link` | `btn-outline` | `text-link` | corner trash icon, own form | `piece-action--sm` ✓/✕ |
| Member title / remove | 1007 | `text-link` | `text-link` | `text-link` | separate | `text-link` |
| Responsibility schedule delete | 1155 | (delete only) | — | `btn-outline` | own row | own row |
| Responsibility date | 1280 | `btn-outline` | `btn-primary` | `btn-outline` | outside | own row |
| (Description / Rehearsal on About tab — single-instance, not per-item, lines ~1445 / ~1505) |

Homework-flow code comments (`:449-452`, `:110-117`) explain WHY delete
lives in-form level with Save/Cancel — treat that as the intended good design.

`EditableCard.svelte` API sketch:
- bindable `editing: boolean`, `saving: boolean`, `confirmingDelete: boolean`
- `saveAction: string`, `deleteAction: string`, hidden id field name+value
- snippet `read()` — the display view
- snippet `fields()` — the edit-form fields (slotted, since they differ per type)
- enhance callbacks / labels
- Renders: card → (read snippet OR form[fields + Save/Cancel/inline-delete-confirm row])

Pairs with A1 — the A1 cards use EditableCard internally for their admin snippet.
Effort L. Risk M.

#### A3. `ConfirmButton` — click-to-confirm destructive action  ✅ DONE
`lib/components/ConfirmButton.svelte` — 15-line component, two slotted
snippets (`trigger(start)` / `confirm(cancel)`), owns a local `confirming`
boolean + the `{#if}/{:else}` swap. Optional `bind:confirming`.

Migrated all 8 hand-rolled copies, deleting 6 module `confirming*Id` state
vars + 1 `confirmingLeave` + 1 `confirmingDelete`:
- `groups/[id]/+page.svelte` (7): leave group, remove member, delete
  schedule, delete date, delete track, delete homework, delete weekly note
- `lib/components/AnnotationSheet.svelte` (1, uses `bind:confirming` since
  the sheet stays mounted and resets in an `$effect`)

Each call site keeps its exact bespoke markup (text links, `btn-danger`
rows, corner trash icons, the homework `formaction` submit) inside the
snippets. `$lib/utils/enhance.ts`'s `afterSubmit` helper (added in Step 1
for these 4 delete forms) is now unused — removed; those forms use bare
`use:enhance`. Behavior change: a *failed* delete now leaves the confirm
pair open (page shows the error) instead of snapping back to idle.
`check` + `build` clean.

#### A4. `AuthCard` / form-page scaffold
`routes/login`, `routes/forgot-password`, `routes/reset-password` (partly
`routes/groups/new`) share the skeleton:
`<main class="shell"><header class="shell-header"><h1>` +
`<form class="card" use:enhance={submitting pattern}>` + `.field` labels +
`{#if form?.error}<p class="error">` +
`<button class="btn btn-primary btn-block" disabled={submitting}>{submitting ? Xing : X}</button>` +
`<p class="note"><a href="/login">`.
`forgot-password` and `reset-password` are near-identical skeletons (both
have a success-state `.card` + an else-branch form).
Effort M. Risk L.

#### A5. Bottom-sheet / overlay shell
`{#if open}<div class="backdrop" role="presentation" onclick={onClose}></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber">`
duplicated in `lib/components/AnnotationSheet.svelte:76` and dead
`lib/components/AnnotationModal.svelte:47` (see C1). Related overlay logic
in `lib/components/SettingsDrawer.svelte` and
`lib/components/LanguageSwitcher.svelte`.
Plan: `BottomSheet.svelte` (backdrop + panel + grabber + esc + scroll-lock).
Effort M. Risk M (focus-trap / scroll-lock need care).

### Tier B — Shared helper / module (not components)

#### B-fe-1. `use:enhance` submitting-flag boilerplate — ~40 copies
```
use:enhance={() => { X = true; return async ({ update }) => { X = false; await update(); }; }}
```
31 in `groups/[id]/+page.svelte` alone + every auth page + `new-homework`.
→ `$lib/utils/enhance.ts` helper: `submitting(set: (v: boolean) => void)`.
Effort S. Risk L. **Biggest raw-count dup in the frontend.**

#### B-fe-2. Date formatters → `$lib/utils/dates.ts`
`formatDate`, `formatDueDate`, `formatDateTime`, `formatNoteDate`,
`toDateInputValue` defined identically
(`toLocaleDateString(undefined, {month:'short',day:'numeric',timeZone:'UTC'})`)
in `groups/[id]/+page.svelte:245`, `join/[code]/+page.svelte:21`,
`home/+page.svelte:58`.
Effort S. Risk L.

#### B-fe-3. Client API plumbing → `$lib/api/client.ts`  (was "L2")
`ApiError` class + `errorDetail()` + `call()`/`guestFetch()` + `jsonInit()`
triplicated across `lib/api/annotations.ts`, `lib/api/pieceMarkup.ts`,
`lib/api/guest.ts`; 4th `errorDetail` copy in `lib/server/backend.ts`.
Keep the domain-specific error subclasses; collapse the plumbing.
Effort M. Risk L–M.

#### B-fe-4. `groups/[id]/+page.server.ts` `formAction` wrapper  (was "L1")
28 form actions, identical
`try { await backendFetch(...) } catch (err) { if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'X' }); throw err } return { success: true, form: 'X' }`.
A few actions have extra pre-checks / multi-fetch (`uploadTrack`,
`updatePieceDetails`, `removeMember`) — wrapper must allow those.
Effort M. Risk M.

### Tier C — Delete dead code

#### C1. `lib/components/AnnotationModal.svelte` — UNUSED (266 lines incl. style)
Not imported anywhere (grep: only referenced in comments). Superseded by
`AnnotationSheet.svelte`. Delete outright.
Effort XS. Risk XS.

### Tier D — Style consolidation (from first report, still open)

- `.error`, `.note`, `.success`, `.text-link`, `.btn[disabled]`, `.hero`
  re-declared across ~8 route `<style>` blocks → move into
  `lib/styles/shell.css`. (`shell.css` already has `.btn`/`.card`/`.field`
  base classes; these belong there too.)
- `.piece-action` icon-button family (~40 lines) copy-pasted in
  `PieceLibrary.svelte`, `join/[code]/+page.svelte`, `groups/[id]/+page.svelte`
  → shell.css section or fold into A-series IconButton.
- Palette hex values duplicated: `src/app.css` `:root` custom props vs
  `src/lib/theme.ts` `THEME_PALETTES` — two sources of truth.
- `AnnotationSheet.svelte` hand-reimplements shell.css `.btn`/`.field`
  because player routes don't import shell.css (documented). Splitting
  shell.css into core (tokens+primitives) + layout would let the player
  import core.

---

## Suggested sequence

1. **C1** (delete dead `AnnotationModal`) + **B-fe-2** (dates util) +
   **B-fe-1** (enhance helper) — quick, mechanical, low risk, shrinks
   everything downstream.
2. **A3 `ConfirmButton`** — small, high-frequency, self-contained.
3. **A1 + A2 together** — the big structural win (guest/member card
   duplication). Own focused session.
4. **A4**, then **B-fe-3 / B-fe-4**, then **A5**.
5. **Tier D** style consolidation can slot in anytime; do alongside A-series
   where the same files are open.
6. **B4** (backend `get_or_404`) whenever the test suite is free.

## Status log

- [x] B1+B2+B3 backend helpers — committed (cbe8db5)
- [x] DETOUR 2026-08-30/31: prod 500 on a piece PDF → wired `app/storage/files.py`
  to Neon Object Storage (the long-open B11 gap). Committed 9d7ef53; credential
  minted + verified (8bc2e31). Remaining human step: set `AWS_*` on Render,
  redeploy, re-upload the 6 nulled PDFs. Tracked in `Backend/plan.md`.
- [x] Step 1 (C1 + B-fe-2 + B-fe-1) — committed (648fbaa).
  `npm run check` clean (0 errors; 11 pre-existing warnings, none in touched code).
  - C1: `AnnotationModal.svelte` deleted; stale mention in an `AnnotationSheet.svelte`
    comment reworded.
  - B-fe-2 `$lib/utils/dates.ts`: `formatCalendarDate` (UTC — replaces
    `formatDate`/`formatDueDate`/`formatNoteDate`), `formatEventDate` (local),
    `formatDateTime`, `toDateInputValue`, `toDatetimeLocalValue`. Local copies
    deleted from `groups/[id]`, `join/[code]`, `home`.
  - B-fe-1 `$lib/utils/enhance.ts`: `withSubmitting(set, onSettled?)` +
    `afterSubmit(onSettled)`. ~28 call sites migrated across `groups/[id]`, `login`,
    `forgot-password`, `reset-password`, `groups/new`, `new-homework`. Left inline
    by design: `groups/[id]` page-settings form (`update({ reset: false })`) and
    `SettingsDrawer.svelte` (branches on `result.type`).
- [x] Step 2 (A3 `ConfirmButton`) — committed (f448761).
  New `lib/components/ConfirmButton.svelte`; 8 call sites migrated (7 in
  `groups/[id]`, 1 in `AnnotationSheet`); 8 `confirming*` state vars deleted;
  unused `afterSubmit` helper removed. `check` + `build` clean. Details in
  the A3 section above.
- [x] Step 3 (A1 + A2) — committed (65899a8). Scope narrowed 2026-08-30
  (see "Step 3 execution plan" below). What landed:
  - New `lib/components/groupCards.ts` — normalized `HomeworkCardItem`,
    `WeeklyNoteCardItem`, `ResponsibilityDateCardItem` (+ `ResponsibilityRole`,
    `ResponsibilityRoleSignup`).
  - New `HomeworkCard.svelte` / `WeeklyNoteCard.svelte` /
    `ResponsibilityDateCard.svelte` — render `<section class="card">` from a
    normalized item. HomeworkCard has the `collapsible` toggle (member only,
    collapse state now local per card — `collapsedHomeworkIds` Set + toggle
    deleted from the group page). Weekly/Responsibility cards take
    `editing` + `edit` snippet (editing replaces the header).
    ResponsibilityDateCard owns `coverageLabel` and takes `roleExtra(role)`.
  - New `EditableCard.svelte` — the inline-edit shell (Homework flow as the
    reference). `<form use:enhance={withSubmitting(...)}>` + slotted `fields()`
    + error line + `.btn-row`[Save / Cancel / in-form `formaction`
    delete-confirm via `ConfirmButton`, bare ✓/✕ icons `.icon-btn`].
  - `join/[code]/+page.svelte` — homework/weeklyNotes/responsibilities `#each`
    blocks now render the 3 cards, passing the raw guest DTOs straight through
    (guest camelCase already == the normalized shape). Dropped now-unused
    imports (`formatCalendarDate`, `formatDateTime`, `renderNoteMarkdown`) and
    the local `coverageLabel`.
  - `groups/[id]/+page.svelte` — homework / weekly-notes / responsibility-date
    `#each` blocks migrated to the cards + `EditableCard`. Deleted the inline
    edit `<form>`s, the `collapsedHomeworkIds` machinery, `coverageLabel`, and
    the now-unused `formatCalendarDate`/`formatDateTime`/`renderNoteMarkdown`
    imports. Style block: removed `.hw-summary*`, `.hw-collapsed*`,
    `.hw-edit-delete`, `.hw-icon-btn*`, `.responsibility-role*`, `.badge*`
    (moved into the components) and `.text-link*` / `.error` / `.success`
    (moved to shell.css). Kept `.role-switch .text-link` override,
    `.assign-*`, `.role-row*`, `.inline-edit-row*`, `.track-*`,
    `.piece-action*`.
  - `lib/styles/shell.css` — added shared `.text-link`, `.text-link--danger`,
    `.error`, `.success` (needed by EditableCard + the cards).

  **Behavior changes (all intended — Homework flow is the target per the
  user's A2 decision):**
  - Weekly-note and responsibility-date **delete moved into the edit form**
    (was a standalone "Delete note"/"Delete date" `ConfirmButton` visible
    without entering edit mode). Now: Edit → in-form trash ✓/✕.
  - Weekly-note / responsibility-date edit **Save button restyled**
    `btn-primary` → `btn-outline`; Cancel `btn-outline` → `text-link`
    (matches Homework).
  - Guest responsibilities: role coverage indicator **`<span class="dim">`
    → `<span class="badge badge--{status}">`**, and role rows now sit in
    `.responsibility-role` (top-border separators) instead of bare
    `.list-row` (bottom-border). Cosmetic.
  - Delete-confirm icon `aria-label` on homework went from "Delete" to
    "Delete homework?" (uses the same string as `title` now).
  - Known wart carried over unchanged: a *failed* inline save still closes
    the editor (its `onCancel` runs on settle regardless), so the
    page-level error isn't shown inline. Not fixed here to keep this a
    pure refactor.

  `npm run check` — 0 errors, 11 pre-existing warnings (none in the new
  files). `npm run build` clean. **Not manually verified in a browser**
  (no browser on this machine — the standing Frontend blocker).
- [x] Step 4 (Tier D: .track-card / .piece-action CSS → shell.css) — committed (b568c33).
  Circular icon-button family + track-card row layout deduped from 3 files; groups/[id]
  keeps a local `.track-card { position: relative }`. check + build clean, no visual change.
- [x] A4 (AuthShell scaffold) — committed (34c9158). New
  `lib/components/AuthShell.svelte` owns the `.shell` chrome + default "Back to
  login" footer for `login` / `forgot-password` / `reset-password`; login
  overrides the footer via a snippet (its `/welcome` link + OAuth row). `.note`
  and `.btn:disabled` moved into `shell.css` next to `.error` / `.success`.
  Minor intended changes: disabled `.btn` now dims app-wide (several pages did
  this locally, login/reset never did); auth-page `.error` top margin
  0.25rem → shell.css's 0.4rem. `check` + `build` clean, not browser-verified.
- [x] B-fe-3 (client API plumbing → `$lib/api/client.ts`) — committed (f0a3e90).
  New `lib/api/client.ts`: `ApiError` base (the 4 `XApiError` classes now
  extend it, `(status, message)` shape unchanged so all `err instanceof`
  call sites untouched), `errorDetail`, `jsonInit`, `fetchOr503`,
  `makeCall`. Deduped from `annotations.ts`, `pieceMarkup.ts`, `guest.ts`,
  `server/backend.ts` (~70 lines of copy removed). `guest.ts`'s `guestFetch`
  stays a thin `fetchOr503` wrapper (maps 404/401 to distinct error types
  itself). No behavior change. check + build clean.
- [x] B-fe-4 (`groups/[id]/+page.server.ts` `runAction` wrapper) — committed (e833504).
  22 form actions' shared `try/catch BackendApiError → fail() / return
  { success, form }` tail hoisted into `runAction(form, work)`. -138 lines.
  `leaveGroup` throws its success `redirect` from inside `work`;
  `removeMember` self-guard + the raw multipart fetches in
  `updatePieceDetails`/`uploadTrack` `throw new BackendApiError(...)` to
  route through the same handling. One intended change: `updateGuestSettings`
  failure now carries `form: 'guestSettings'` (was the only action omitting
  it). check + build clean, not browser-verified.
- [ ] Step 4+ — TrackCard component itself still not extracted (CSS-only fold above,
  markup duplication remains).
- [~] A5 (BottomSheet shell) — **not worth doing as specced.** C1 already
  deleted the duplicate (`AnnotationModal`). Only `AnnotationSheet` uses the
  bottom-sheet pattern now, and it deliberately can't import `shell.css`.
  `SettingsDrawer` is a right-side slide-in drawer (different pattern),
  `LanguageSwitcher` is an absolutely-positioned nav (not an overlay at all).
  Extracting for one consumer = speculative abstraction. Deferred/dropped.
- [~] Tier D — palette single-source: **investigated, needs a bigger change
  than cleanup allows.** `theme.ts`'s `THEME_PALETTES` is load-bearing —
  `ScoreView.svelte` reads the raw hex for SVG score-paint math
  (`highlightedMutedInk` / `mixHex`), and `applyTheme()` pushes them as inline
  props; `app.css`'s `:root[data-theme]` blocks are the pre-hydration paint
  source. True single-sourcing wants a JS→CSS codegen step (no such build
  machinery in the repo), or `getComputedStyle` reads (fragile — JS needs
  *both* palettes at once, CSS exposes only the active one), or a guard test
  (no test runner installed — `package.json` has no `test` script / vitest).
  All are bootstrap-level changes unverifiable without a browser. Same risk
  class as the deferred `shell.css` core/layout split. Left as-is.
- [~] Tier D — `.hero` dedup: **not worth doing.** `join/[code]`'s `.hero` is
  a false match (`flex-direction: row` centering wrapper, coincidental name).
  `join/` vs `welcome/` share a centered-column header but diverge in 3 of 6
  props (`gap`, `padding-top`, h1 `font-size`). Consolidating saves ~4 lines
  for added indirection. Left as-is.

## Step 3 execution plan (scoped 2026-08-30)

Full read of `groups/[id]/+page.svelte` (1954 L), `join/[code]/+page.svelte`,
`home/+page.svelte`, `PieceLibrary.svelte`, both loaders. Finding: A1's
"5 variants" table is overstated. **In scope:**

- **HomeworkCard / WeeklyNoteCard / ResponsibilityDateCard** — genuine
  guest↔member(read) dup. Each takes a *normalized* item (camelCase);
  normalize snake_case at the member call site, guest is already camelCase.
  - HomeworkCard: renders `<section class="card">` + collapsed/expanded
    toggle (member has it, guest doesn't → `collapsible` prop, default off)
    + eyebrow(dueDate)/title/range/instructions. `children` snippet after
    the display for admin edit trigger / edit form.
  - WeeklyNoteCard: eyebrow("Week of" date)/title/markdown body. `children`.
  - ResponsibilityDateCard: eyebrow(date + canceled/locked)/title/notes +
    roles list (name · active/needed + status badge). Guest currently uses
    `<span class="dim">` for status; **standardizing on the `badge--{status}`
    both sides** (minor visual change to guest — an improvement). Optional
    `roleExtra` snippet per role (member: signup sublist + assign/signup
    controls; guest: none). `coverageLabel` moves into the card.
- **EditableCard** — inline-edit shell, Homework flow as the reference
  (per user decision). API: `bind:editing`, `bind:saving`, `saveAction`,
  `deleteAction?`, `idFieldName`, `idValue`, `error?`, label props,
  `fields()` snippet, optional `enctype`/extra hidden inputs via a
  `beforeFields` snippet (track needs `enctype=multipart/form-data`).
  Renders the `<form use:enhance={withSubmitting(...)}>` + `{@render fields()}`
  + error + btn-row[Save / Cancel / in-form `formaction` delete-confirm
  (ConfirmButton, `hw-icon-btn` ✓/✕)]. Weekly-note + responsibility-date
  delete move *into* the edit form (from their current outside-the-form
  spot) — that convergence is the point.
- Leftover **`.piece-action` / `.track-card` / `.error` / `.success` /
  `.text-link`** CSS: fold shared copies into `lib/styles/shell.css`
  (Tier D) as the member/guest pages lose their local per-card styles.

**Out of scope** (documented divergence, thin overlap):
- Home "Due soon" / "Upcoming responsibilities" rows — deliberately a
  quieter divided-list design, not `.card` boxes (code comments say so).
- PieceLibrary — `<ul>` grid of `.piece-card`, different layout.
- TrackCard guest↔member — guest side ~6 L, member side ~95% admin editing.
  Keep both; just dedup the `.piece-action` CSS via shell.css.

Sequence: (1) build 3 cards + EditableCard, (2) migrate guest page + its
`+page.ts` normalization, `check`/`build`, commit. (3) migrate member page
tab-by-tab (homework → weekly notes → responsibilities), `check`/`build`,
commit. (4) shell.css CSS fold, `check`/`build`, commit.
