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

#### A3. `ConfirmButton` — click-to-confirm destructive action
Button that swaps to `[confirm] [cancel]` pair on first click. Hand-rolled
with a `confirming*Id`/`confirming*` state var **10+ times**:
- `groups/[id]/+page.svelte`: leave group `:1700`, remove member `:1046`,
  delete schedule `:1155`, delete date `:1406`, delete track `:674`,
  delete homework `:466`, delete weekly note `:970`
- `lib/components/AnnotationSheet.svelte:113`
Effort M. Risk L (small, self-contained).

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
- [x] Step 1 (C1 + B-fe-2 + B-fe-1) — done on the working tree, NOT committed.
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
- [ ] Step 2 (A3)
- [ ] Step 3 (A1 + A2)
- [ ] Step 4+
