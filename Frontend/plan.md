# Project Plan: Divisi Frontend (web player)

Separate from `Backend/plan.md` (the API/data model this talks to) and the native
iOS app — **paused/backlogged** as of 2026-08-27 in favor of this web player; see
the condensed "iOS app" section below.  Milestones prefixed `F` to avoid clashing
with the Backend's `B`-prefixed and the iOS app's `M`-prefixed milestones.

**Why a website first:** the earliest useful version of Divisi is choir members
listening to customizable practice tracks in the background, joining a group's
tracks as unauthenticated guests (no login needed unless saving annotations). Top
priority is a genuinely accurate, easy-to-use synced player — explicitly benchmarked
against PlayScore, whose UI is weak and whose audio/visual sync is often off. A
website also sidesteps a real pain point the iOS app hit: OpenSheetMusicDisplay is a
JS library that had to be wrapped in a `WKWebView` bridge there (source of real
cursor-sync and zoom bugs) — on an actual website it runs natively with direct
access to the audio clock.

**Sequencing call (2026-08-27):** prove the player itself out — entirely
frontend-only, against a bundled fixture MIDI file, no Backend/account wiring at
all — before spending any effort connecting it to real groups or logins.

**Stack:** SvelteKit — lean/compiles-away runtime, good fit for a UI that's mostly
live audio/animation state, small bundle matters for a page choir members open on
their phones.

**Status:** F1, F6, F7, F9, F10 done and approved. F2–F5, F8, F11–F13 are built and
`check`/`build`-clean but each still has at least one open "human confirms in a real
browser / on a real touchscreen" item — much of this Frontend's recent work was built
on a machine with no browser/Playwright available, so that's the recurring blocker
across the board, not a code gap. F11's markup layer also can't fully work on the
preview until Backend B15's migration runs against production. The in-app notation
editor and the OMR-review milestones live in their own plan, `OMR_EDITOR_PLAN.md`
(E1–E10), and now only on the `omr-editor` branch — the frontend surface of that
work was deleted from `main` as unverified WIP (the Backend OMR code stays, dormant
and UI-unreachable). See the status table under Milestones.

The web app is the active product; the native iOS app is paused (see the "iOS app"
section below and the repo-root `README.md`).

## UI/UX conventions

Condensed 2026-08-28 from the now-deleted `UX_WIREFRAME.md` — these are the
*standing rules* worth keeping as a reference, since several log entries cite
them by name.

**Navigation and brand:**
- Divisi is persistent app chrome (top-left `AppHeader` brand), never a
  repeated centered page title
- Global account/settings access lives top-right as the gear button
  (`Settings`) — a drawer (see F6)
- Page titles name the current place: Home, Library, a specific group's
  name, Settings — not the app name again
- Bottom nav: Home | Library only (no "Me" — its contents live under
  Settings; no standalone Groups tab — "My groups" lives on Home)
- The practice player uses its own focused chrome (back button, piece
  title, Practice Setup button) — no `AppHeader`/`BottomNav`

**Naming:**
- "Settings" = global account/app defaults. "Practice Setup" = choices
  scoped to the current piece/track/assignment — never call the player's
  drawer "Settings"
- "Group Settings" = admin-only group configuration
- "Viewing as Member"/"Viewing as Admin" for the role switcher
- Singer-facing practice labels: Everyone / My part / My part + others /
  My part + accomp / Custom (not the underlying `DisplayMode`/`MixMode`
  values)

**Redundancy:** don't repeat "Divisi" as a page title; don't duplicate a
control in two places (e.g. theme picker only in Settings, not also in
Practice Setup); don't show "Join a group" once the user already belongs
to one; don't show a sparse empty section with no explanation of the next
action; Library (finding practice material) and Groups (membership/admin/
context) stay conceptually distinct even though they share underlying data.

**Still-open questions** (never decided, carried over in case they matter
later): should annotations default to shared-with-director rather than
fully private? Should personal calendar export of responsibility dates be
supported? Should roles/responsibility templates be reusable across groups?

## Milestones

| # | Milestone | Status |
|---|---|---|
| F1 | Standalone playback + notation prototype | ✅ Approved — reads as more accurate/pleasant than PlayScore |
| F2 | Guest access to real pieces via the Backend | ⏳ Built; human hasn't confirmed the join flow in a real browser yet |
| F3 | App-shell UI screens (fixture data) | ⏳ Built; human hasn't looked over the screens yet |
| F4 | Login + wire groups/home/library to the real Backend | ⏳ Built, incl. score-position annotation create/share UI; `check`/`build`-clean; human hasn't confirmed login/groups/homework/annotations yet |
| F5 | Wire the player to real Backend pieces (+ real uploads: MIDI/PDF/YouTube) | ⏳ Built and curl/check-verified; nobody has clicked through the actual upload/practice flow yet (no browser on the build machine) |
| F6 | Group page settings + Responsibilities | ✅ Built; human hasn't done a live-app walkthrough (`check`/`build` only) |
| F7 | Weekly Notes tab + guest sign-in banner | ✅ Done — Playwright-verified live |
| F8 | Spanish localization (`/es`) | ⏳ Built and curl/check-verified; human hasn't clicked through the Spanish UI in a real browser |
| F9 | Graceful error handling app-wide | ✅ Done — live-verified including a real Backend-down/recovered cycle |
| F10 | Lock down bundled pieces (security fix) | ✅ Done — closed a real hole where 5+ real choir pieces were publicly fetchable with no auth |
| F11 | PDF markup: freehand pen + stamps (piaScore-style) | ⏳ Built, `check`/`build`-clean; Backend not yet deployed to production (new migration), so unusable on the preview until that lands |
| F12 | PDF markup: top-level Annotation mode on/off toggle | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it on a real touchscreen |
| F13 | Audio-only reference recording, driving the bottom bar in PDF view | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it in a real browser |
| — | In-app notation editor + OMR review | Lives on the `omr-editor` branch only (`OMR_EDITOR_PLAN.md`, milestones E1–E10); frontend surface deleted from `main` as unverified WIP |
| F20 | Piece Notes panel — director + personal notes (frontend for Backend B16 + B5) | ⏳ Built: two sources (group B16 / personal position-less B5 annotation), on the piece page and an expandable Rehearsal Tracks card, per-note timestamps, player-mode scroll cap; `check`/`build`/vitest 107 green; no real-browser pass yet |

### F1 — Standalone playback + notation prototype [x]

No backend, no accounts — everything driven from a bundled MIDI fixture file, so the
core "is this actually accurate and pleasant to use" bet gets proven before any
wiring work. Audio approach for *this milestone only*: client-side MIDI parsing +
in-browser synthesis via the Web Audio API (a WASM soundfont synth) — not the
server-rendered stems originally planned for production (see Backend `B7`). That was
the right call for accuracy at scale, but it requires a backend, which this milestone
deliberately has none of.

**Acceptance criteria:**
- [x] Given a bundled fixture MIDI file, the app parses it client-side and plays it back audibly, all SATB parts + any accompaniment synthesized in-browser
- [x] All parts start in sample-accurate sync and stay in sync for the full piece length — no audible drift by the end
- [x] Play/pause/seek are immediate and accurate, driven off `AudioContext.currentTime` — no polled position readout in the critical path
- [x] Real engraved notation (OSMD) renders with a moving cursor tracking that same clock, no perceptible lag
- [x] Flat/highlighted/solo display modes, switchable without ever restarting or repositioning audio
- [x] The score scrolls for pieces longer than one screen, and genuinely zooms in/out (verified by hand in a real browser)
- [x] A balance slider per SATB part adjusts that part's volume live during playback
- [x] Audio keeps playing when the browser tab is backgrounded or the phone screen locks — confirmed on a real phone after routing playback through a real `<audio>` element
- [x] Human confirms it reads as more accurate/pleasant than PlayScore on the same piece, before any Backend/account wiring is invested

**Tasks — Claude:**
- [x] Scaffold SvelteKit project under `Frontend/`
- [x] Port MIDI parsing to TS (`src/lib/midi/parser.ts`, `midi-file` npm package) — replicates the iOS `MIDIParser`'s track→voice-part heuristic; verified against all 4 real `Fixtures/*.mid` files
- [x] Port `MusicXMLConverter`'s quantization/tie/measure-splitting logic to TS (`src/lib/midi/musicXmlConverter.ts`)
- [x] Client-side synthesis: `js-synthesizer` (WASM FluidSynth) + `TimGM6mb.sf2`
- [x] Web Audio API player (`src/lib/audio/player.ts`) — architecture changed from the original plan: the whole piece is fed to a single FluidSynth player instance, live per-part balance is a MIDI CC7 message sent to that part's channel (channel numbers assigned by `playbackMidiBuilder.ts`, since the project's own synthetic dev fixtures put every track on channel 0)
- [x] Embed OSMD directly in `ScoreView.svelte`, drive the cursor off the shared clock via `requestAnimationFrame` — required disabling SSR for this route and dynamically `import()`ing OSMD
- [x] Flat/highlighted/solo display-mode picker
- [x] Media Session API integration for background/lock-screen playback controls
- [x] Scrolling/zoom controls on `ScoreView.svelte` (0.5×–2×)
- [x] `Frontend/README.md` with local-run instructions
- [x] Visual polish pass: card shell, light/dark design tokens, segmented pickers, circular play/pause, filled seek scrubber, collapsible "Mix" balance panel
- [x] `Piece` registry (`src/lib/pieces/{types,registry}.ts`): a `{id, title, composer, load()}` contract
- [x] MusicXML importer (`src/lib/musicxml/parser.ts`) for pieces whose only clean source is a score export

**Tasks — Human:**
- [x] Try it end-to-end and compare directly against PlayScore on the same piece; sign off before Backend wiring starts

### F2 — Guest access to real pieces via the Backend [~]

**Depends on Backend B6** (join code + public guest endpoints). Swaps F1's bundled
fixture for a real group's actual distributed pieces, reached via a shareable join
link, still no login required. Scope narrowed 2026-08-27 to just the join-code
listing route — wiring F1's player to Backend-rendered pieces is F5. Extended
2026-08-27 alongside F4: guests also see a group's homework (when opted in via
Backend B10), and a password-protected group prompts for it.

**Acceptance criteria:**
- [x] Visiting a valid join-code URL shows that group's distributed pieces, with no login
- [x] An invalid/unknown join code shows a clear "not found" state, not a crash
- [x] A password-protected group prompts for the password and retries, rather than showing a raw error
- [x] Homework only appears in the guest view for groups that opted into `guest_homework_visible`
- [ ] Human confirms the join flow (including a password-protected group) in a real browser before this is considered done

**Tasks — Claude:**
- [x] `$lib/api/guest.ts`: `listGuestHomework`, password param threaded through `resolveJoinCode`
- [x] `/join/[code]`: password-prompt state on 401, tabbed Homework/Rehearsal Tracks view
- [x] Backend: CORS middleware — no cross-origin allowance existed before this
- [x] Frontend: `PUBLIC_API_BASE_URL` env var, `src/lib/api/guest.ts` typed client
- [x] Routes: `/join` (code-entry form) and `/join/[code]` (resolves the code server-side)
- [x] Wired `/groups`' dead "Join a group with a code" button to `/join`
- [x] Verified against a real local Backend: registered a user, created a group, uploaded/approved/distributed a piece, confirmed the join code resolves correctly for both a valid code and an unknown one via a real SSR network call

**Tasks — Human:**
- [ ] Look over `/join` and `/join/[code]` in a real browser before this is considered done

### F3 — App-shell UI screens (fixture data) [?]

Built every screen from `UX_WIREFRAME.md` other than the already-approved practice
player, as real routes against local fixture data — same "prove the UI before wiring
a backend milestone" call F1 made for the player. Started from a low-fidelity
wireframe artifact covering all ten screens, reviewed by the human, before any code
was written.

**Acceptance criteria:**
- [x] Every UX_WIREFRAME.md screen besides the practice player has a real route, styled with the same design tokens as the rest of the app, reachable via the bottom nav / in-page links, not just a direct URL
- [x] All new routes read from local fixture data only (`lib/fixtures/appData.ts`) — no Backend calls added, consistent with F2 not being wired yet
- [x] `npm run check` and `npm run build` both clean
- [ ] Human confirms the screens read as intended in a real browser, light and dark

**Tasks — Claude:**
- [x] Recolored the flat-black `divisi-logo` source into a CSS-mask asset painted via `background-color: var(--accent)`, so it tracks the live accent token
- [x] `lib/fixtures/appData.ts`: Groups/Homework/Members/Annotations/Settings fixture data
- [x] `lib/styles/shell.css`: shared card/button/tab/list/field/bottom-nav classes
- [x] Routes: `/welcome`, `/home`, `/groups`, `/groups/[id]` (tabbed Homework / Rehearsal Tracks / Members / Info), `/groups/[id]/homework/[hwId]`, `/groups/[id]/admin`, `/groups/[id]/admin/new-homework`, `/settings`
- [x] `AnnotationModal.svelte`: reusable add-annotation sheet, wired from Homework Detail
- [x] `BottomNav.svelte` shared across Home/Library/Groups/Me

**Tasks — Human:**
- [ ] Look over the new screens in a real browser (light + dark) and flag anything to change before this becomes the real navigation

### F4 — Login + wire groups/home/library to the real Backend [~]

Scope expanded 2026-08-27 beyond "login + annotations": also replaces F3's fixture
data with real Backend calls for groups, membership/info, homework (Backend B9), and
"my library" listings. Depends on Backend B2 (auth) and B9 (homework).

**Explicitly still out of scope:** actually *practicing* a real Backend-sourced
piece — that's F5, a different loading path entirely (the player's registry only
loaded bundled files until F5). Real Backend pieces show up for real in group/
library listings now, just without a working Practice button until F5. Home's
"Continue practice" card also stays on its existing bundled-demo behavior — no
backend concept for "last opened piece" exists (see Backlog).

**Acceptance criteria:**
- [x] A guest can register/log in without losing their place — `redirectTo` carries through `/login` back to wherever a protected page bounced them
- [x] Session stored via an httpOnly cookie through a SvelteKit server route, not `localStorage`
- [x] `/groups`, `/groups/[id]`, `/groups/[id]/admin`, and `/home`'s "My groups"/"Due soon" sections read real data from the Backend
- [x] Homework tab, homework detail, and "+ Add homework" read/write real data via Backend B9
- [x] The root library (`/`) shows each group's real distributed pieces (title + review status) alongside the existing bundled demo pieces
- [x] Browsing, playback, and customization of the existing bundled/demo pieces remain fully guest-accessible — login is opt-in, never a gate
- [x] A logged-in user can add an annotation at a position in the score; it's private by default and shareable with a specific peer, matching Backend B5's semantics
- [ ] Human confirms login, group browsing, and homework in a real browser

**Tasks — Claude:**
- [x] Login/register UI (`/login`) against Backend B2's endpoints; session via an httpOnly cookie set by a SvelteKit server route, read in `hooks.server.ts` for every authenticated `load`
- [x] `src/lib/server/backend.ts`: authenticated server-side fetch helper
- [x] Rewired `/groups`, `/groups/[id]`, `/groups/[id]/admin`, `/home`'s groups/due-soon sections
- [x] Rewired Homework tab, homework detail, and "+ Add homework"
- [x] Rewired `/`'s per-group sections off real `/library/pieces`, shown read-only until F5 lands
- [x] `/settings`: real logged-in user (name/email) and a real logout
- [x] Annotation UI: create/view at a score position, respecting B5's private-by-default + explicit-share model
- [x] Share/unshare UI against B5's existing endpoints

**Expanded 2026-08-29 (annotations rendered in the player, at the human's
request — "mark a breath somewhere").** Built against the real B5 endpoints
(plus one new one — see the Backend plan's B5 note), not fixture data;
**not** `check`/`build`-verified this pass — this session's environment had
no `node`/`npm` on `PATH` at all (a step further than the usual "no browser"
gap the rest of this file's recent entries flag), so nothing below has been
compiled or run, only hand-reviewed. Treat as more provisional than this
file's usual "check/build-clean, pending a human's look" entries until a
session with real tooling confirms it compiles.

- [x] `$lib/api/annotations.ts`: typed client for `routes/piece/[id]/annotations/**`'s proxy routes (list/create/update/delete/share/list-shares/unshare)
- [x] `routes/piece/[id]/annotations/**`: authenticated proxy routes mirroring `../file`/`../pdf`'s pattern — `locals.token` attached server-side, never reaches client JS
- [x] `ScoreView.svelte`: renders one marker per annotation via OSMD's native multi-cursor support (`cursorsOptions`/`osmd.cursors`, `CursorType.ShortThinTopLeft`) — a short mark above the note, distinct from the playback cursor; `annotateMode` prop makes a score tap place a new marker (`onAnnotationPlace`) instead of seeking; clicking an existing marker calls `onAnnotationMarkerClick`
- [x] `AnnotationSheet.svelte` (new): create/view/edit sheet, owner-only edit/delete/share/unshare, matching B5's real semantics (not the fixture-era `AnnotationModal.svelte`'s broadcast-style visibility options, which the Backend never implemented — that component is still unused/dead)
- [x] `piece/[id]/+page.svelte`: wires an "add annotation" toggle (bottom bar, only for a real Backend piece + logged-in user — no guest path, B5 requires a session) and the sheet's create/view/edit/delete/share/unshare handlers
- [x] Position stored as `String(positionWholeNotes)` (same tempo-independent unit the playback cursor/click-to-seek already use) on B5's opaque `Annotation.position` string; displayed as "Measure N" (derived from the piece's time signature)

**Tasks — Human:**
- [ ] Run a real `npm run check`/`build` — this session couldn't (no `node`/`npm` on `PATH`)
- [ ] Open a real Backend piece, place a marker, confirm it renders sensibly on the score, and click through create/edit/delete/share/unshare in a real browser

### F5 — Wire the player to real Backend pieces (client-side, same pipeline as the bundled demo) [~]

**Rewritten 2026-08-28**, replacing the original stems/manifest design, after the
human questioned the premise directly: do we actually need a "better" (server-
rendered) player at all? F1's own in-browser soundfont synth already sounds good —
shipped and approved on that basis — so B7's server-rendered stems were never
actually needed for quality. The real gap is that the existing client-side player
only knew how to load a bundled static file, never anything from the Backend.

**Scope:** teach the existing player to fetch a real piece's raw source file (MIDI
or MusicXML) from the Backend and run it through the exact same parse/synth/render
pipeline already used for every bundled piece — no new audio engine, no stems, no
manifest. `MidiPlayer`, `ScoreView`, the mixer/display-mode UI, and per-piece
`localStorage` persistence all stay completely untouched; only *where the bytes come
from* changes. B7's rendering pipeline isn't deleted — just no longer something the
Frontend wires up to. Guest parity: a guest's experience is identical to a member's
(guest preferences already never reach the Backend — `playerDefaults.ts` is
`localStorage`-only for everyone).

**Shape:** a new `Piece` implementation whose `load()` fetches the raw-file URL,
sniffs MIDI vs. MusicXML by magic bytes (`MThd` → MIDI, else MusicXML text), and
calls the existing parsers. The guest path fetches straight from the Backend's
public origin (CORS already proven working); the authenticated path goes through a
same-origin proxy route (`/piece/[id]/file/+server.ts`) that attaches `locals.token`
server-side, so the session token never reaches client JS.

**Acceptance criteria:**
- [ ] A logged-in group member can open a real Backend-distributed piece from `/groups/[id]`'s Rehearsal Tracks tab or `/`'s per-group section and hear it play, in sync, for the whole piece's length — same accuracy bar as the bundled demo, because it's the same player
- [ ] The same piece's notation renders with a moving cursor, using the existing `musicXmlConverter`/`ScoreView` path unchanged
- [ ] The existing per-part balance/mute controls, display modes, and tempo slider all work against a real Backend piece exactly like they do against the bundled demo
- [ ] A guest who joined via `/join/[code]` can open and fully practice any of that group's distributed pieces the same way, with no login — including a password-protected group's pieces
- [ ] A real Backend piece whose title happens to match a bundled registry entry still resolves to the bundled asset, not a redundant Backend fetch
- [ ] `npm run check` and `npm run build` both clean
- [ ] Human confirms a real distributed piece sounds and looks right, played both as a logged-in member and as a guest via a join code

**Tasks — Claude:**
- [ ] Backend: `GET /library/versions/{id}/file` and `GET /guest/{join_code}/pieces/{piece_id}/file` — raw source file, same access gates as the existing manifest routes, no rendering
- [ ] `src/lib/pieces/types.ts`: widen `pdfUrl` to optional, extend `collection` for a real-Backend-piece case
- [ ] New `Piece` factory (`src/lib/pieces/remotePiece.ts`) whose `load()` fetches raw bytes, sniffs MIDI vs. MusicXML, parses with the existing parsers
- [ ] `/piece/[id]/file/+server.ts` (new): authenticated proxy — attaches `locals.token`, streams the Backend response back
- [ ] `/piece/[id]/+page.server.ts` (new): resolves bundled-registry vs. real Backend piece (via `/library/pieces`) — constructs a remote `Piece` when neither the bundled title nor a bundled id matches
- [ ] New guest route `/join/[code]/piece/[id]`: resolves a remote `Piece` from the guest raw-file endpoint directly (client-side fetch, no proxy needed), reuses the existing player UI
- [ ] Wire real "Play" links on `/groups/[id]`'s Rehearsal Tracks tab, `/`'s per-group sections, and `/join/[code]`'s Rehearsal Tracks tab
- [ ] Verify against the real live Backend (`divisi.onrender.com`, not mocked): open a real distributed piece both as the owning member and as a guest via its join code

**Tasks — Human:**
- [ ] Listen to a real distributed piece played through this path (both as a member and as a guest) and confirm it sounds right

**Expanded 2026-08-29 (real piece uploads — MIDI/MusicXML + PDF + reference audio),
built on a Windows machine with no browser/Playwright available** — everything below
is `npm run check`/`build`-verified and Backend-curl-verified end to end, but the
actual in-app interaction (upload form, player/PDF toggle, YouTube embed) has **not**
been clicked through by a human or Playwright yet.

- [x] `src/lib/pieces/types.ts`: `pdfUrl`/`load` both optional now, `collection` gained `'group'`, added `youtubeUrl`
- [x] `src/lib/pieces/remotePiece.ts`: builds a `Piece` from Backend metadata — `pdfUrl` only when `has_pdf`, `load` only when `has_music`
- [x] `/piece/[id]/file/+server.ts` and `.../pdf/+server.ts`: authenticated proxies, resolve the piece's current version via `/library/pieces` first
- [x] `/piece/[id]/+page.server.ts`: resolves bundled-registry vs. real Backend piece; returns `remote: null` for a guest with no session (this route is also reached via join-code links)
- [x] `/piece/[id]/+page.svelte`: player/PDF panes and the View-mode toggle are now conditional on `hasPlayer`/`hasPdfPane`; YouTube embed shows whenever `youtubeUrl` is set
- [x] `/groups/[id]/+page.svelte` + `+page.server.ts`: admin-only click-to-reveal upload form (Name/Author/Music file/PDF/Default tempo/YouTube); a track's Practice link now works for any track with `has_music`/`has_pdf`, not just bundled-title matches
- [ ] Guest-side wiring for genuinely-new real pieces via join code — deliberately not built this pass, closed in the follow-up entry logged below
- [ ] A human (or Playwright) actually clicking through: upload a track, open it as a member, confirm the right view(s) show, confirm the YouTube embed renders
- Storage stays local-disk this pass — same already-documented ephemeral-disk limitation as every other upload

### F6 — Group page settings + Responsibilities [x]

Backend-driven — the Backend's B12 (per-page group settings) and B13
(Responsibilities) shipped with no Frontend wiring at all. Brings both over.

**Acceptance criteria:**
- [x] Group admin's Settings tab shows all 5 pages (Homework, Rehearsal Tracks, Members, About, Responsibilities) with independent enabled/audience controls, replacing the old single "show homework to guests" checkbox
- [x] A member whose group has a page disabled just doesn't see that tab, instead of the whole group page (or Home) failing
- [x] A group's Responsibilities tab lets a member see upcoming dates with per-role coverage and sign up/remove their own signup; an admin can additionally create schedules + roles, add dates, lock/cancel dates, and assign/remove any member's signup
- [x] Guests (via `/join/[code]`) see a read-only Responsibilities tab when a group's admin opted it into `audience: everyone`
- [x] `npm run check` and `npm run build` both clean

**Tasks — Claude:**
- [x] `backendTypes.ts`: dropped `GroupOut.guest_homework_visible`; added `GroupPage`/`PageAudience`/`GroupPageSettingOut` and the `Responsibility*` types
- [x] `$lib/api/guest.ts`: `listGuestResponsibilityDates()`
- [x] `/groups/[id]/+page.server.ts`: `fetchPageOrDisabled()` wraps homework/members/responsibilities fetches so a disabled page just hides its tab; new page-settings/responsibility actions
- [x] `/groups/[id]/+page.svelte`: 5th "Responsibilities" tab; admin Settings tab's page-visibility grid
- [x] `/home/+page.server.ts`: same disabled-page guard as the group page
- [x] `/join/[code]`: guest Responsibilities tab (read-only coverage, no sign-up)
- [x] Ad hoc fixes from a live look: Rehearsal Tracks uses the same circle-play icon as the personal Library, hides version status from members; personal Library hides tracks with no practice file wired up instead of listing them as a dead card

**Tasks — Human:**
- [ ] Look at the built pages (page-settings grid, Responsibilities tab as member/admin/guest) and confirm the UI reads right — no live-app walkthrough done this pass, `npm run check`/`build` only

**Expanded 2026-08-29 (regular rehearsal schedule):** admin-editable "Regular
rehearsals" card on the Info/About tab (day + time), shown read-only to
members/guests. The Responsibilities "Add a date"/"Edit date" forms gain a
"Use next rehearsal" button that computes the next upcoming occurrence entirely
client-side. `check`/`build` clean; the weekday math verified with a standalone
script — not clicked through in an actual browser.

- [ ] Human: confirm the "Use next rehearsal" button and the About-tab editor actually look/behave right in a real browser

### F7 — Weekly Notes tab + guest sign-in banner [x]

Two asks direct from the human: a 6th group page ("Weekly Notes" — dated bulletin
entries admins post, members read, with full history) and a dismissible banner on
`/join/[code]` nudging anonymous guests to sign in. Reuses B12's per-page machinery
exactly.

**Acceptance criteria:**
- [x] Group admin can post/edit/delete dated notes from a new "Weekly Notes" tab; members see them read-only, newest first
- [x] The new page shows up in the admin Settings page-visibility grid
- [x] Guests see a read-only Weekly Notes tab only when the admin opted it into `audience: everyone`
- [x] `/join/[code]` shows a dismissible banner (guests only) pointing at `/login?redirectTo=...`; dismissal doesn't persist (reappears each visit, per the human's call)
- [x] `npm run check`/`build` clean; verified live via Playwright (human was away and explicitly authorized it for this session — not this project's default)

**Tasks — Claude:**
- [x] Backend: `WeeklyNote` model + migration, guest route, mirrors `homework.py`'s shape. 120/120 `pytest`; live curl round trip.
- [x] Frontend: 6th tab, three new actions, guest tab + sign-in banner
- [x] Two real bugs caught live via Playwright, neither would have been caught by type-checking:
  1. Page-visibility toggles visually "reset" after saving — a second, independent cause beyond one a prior session already fixed: `use:enhance`'s default `update()` calls a native `form.reset()`, snapping checkboxes back without going through Svelte's reactivity (the saved data was never wrong, only the display). Fixed with `update({ reset: false })`.
  2. `note_date` displayed a day early in any UTC-behind timezone (local-time formatting on a date-only UTC-midnight value). New `formatNoteDate` pins the display to UTC.
- [x] Local dev fix: `Frontend/.env`'s `PUBLIC_API_BASE_URL` was HTTP while the local Backend is HTTPS-only — fixed to `https://localhost:8000`

### F8 — Spanish localization (`/es`) [~]

At the human's direct request: a full Spanish version of the app under `/es`
(English stays unprefixed), covering every route. Built with Paraglide JS (inlang)
rather than hand-duplicated route files.

**Mechanism:** `project.inlang/settings.json` declares `en` (base, unprefixed) and
`es` (prefixed) locales via `messages/{locale}.json`. `vite.config.ts`'s
`paraglideVitePlugin` generates typed `m.*()` message functions plus `urlPatterns`
mapping every path to its localized form. `src/hooks.ts`'s `reroute` de-localizes
incoming URLs before route matching; `src/hooks.server.ts` composes
`paraglideMiddleware` with the existing session-cookie handle. A `<LanguageSwitcher>`
links between locales via `localizeHref`.

**The real gotcha:** Paraglide does **not** auto-localize plain `<a href>`/`goto()`/
`redirect()` — only inbound URL matching is automatic. `$lib/i18n.ts`'s `lh()`
(a thin `localizeHref` re-export) wraps every internal `href`/`goto`/`redirect` site
across the app so links don't silently drop the `/es` prefix on the next click.

**Acceptance criteria:**
- [x] Every route reachable both unprefixed (English) and under `/es` (Spanish), with correct `<html lang>`/`dir` and translated content
- [x] A language switcher lets a visitor move between locales from any page, preserving the current path
- [x] Every internal navigation stays within the currently-chosen locale — verified live via curl
- [x] `npm run check`/`build` both clean
- [ ] Human/Playwright click-through of the Spanish UI (menus, forms, the player's Practice Setup drawer) — not done this pass, no browser in this Windows environment

**Tasks — Claude:**
- [x] Installed `@inlang/paraglide-js`; `project.inlang/settings.json`, `messages/en.json`/`es.json` (~350 keys)
- [x] `vite.config.ts`, `src/hooks.ts` (new, `reroute`), `src/hooks.server.ts` (composed via `sequence()`), `src/app.html`, `tsconfig.json` (`types: ["node"]` — Paraglide's generated `server.js` needs `async_hooks`)
- [x] New `$lib/i18n.ts` (`lh` helper) and `$lib/components/LanguageSwitcher.svelte`
- [x] Every `.svelte`/`+page.server.ts` (~30 route files + shared components) converted to `m.*()` calls, every internal `href`/`goto`/`redirect` wrapped in `lh(...)`
- [x] Deliberately left untranslated: stored/persisted content an admin types (e.g. a homework `range`'s literal default) — translating those would make content language-dependent at write time
- [x] Verified live via curl against both `build` output and `dev`

**Tasks — Human:**
- [ ] Click through the Spanish UI for real (forms, the player drawer, error states) — this pass is `check`/`build`/curl-verified only

### F9 — Graceful error handling app-wide [x]

At the human's direct request: every error path shows something reasonable instead
of crashing or silently misbehaving. Two threads: (1) no branded `+error.svelte`
existed, so any thrown `error(status, ...)` rendered SvelteKit's bare default page;
(2) a genuine network failure (Backend unreachable) wasn't distinguished from a real
HTTP error at several call sites.

**Mechanism:**
- New root `src/routes/+error.svelte` — branded, localized, status-aware (404/403/401/503/generic)
- `$lib/server/backend.ts`'s `backendFetch` now wraps its `fetchFn(...)` call in try/catch, converting a genuine network failure into the same `BackendApiError` shape a resolved non-2xx response already produces — every existing catch site gets this for free. `$lib/api/guest.ts` got the equivalent (`guestFetch`).
- Every raw `fetch()` call site not already guarded got the same try/catch treatment individually (login, register, reset-password, `uploadTrack`, the guest resolver, both file/pdf proxy routes)
- Deliberately **not** changed: the root `+layout.server.ts`'s fail-open behavior (any `/auth/me` failure quietly resolves to `user: null`). Tried making it throw for non-401 failures first, reverted after realizing this load runs for every route including fully public ones — throwing there would block pages needing no user at all over a transient blip.

**Acceptance criteria:**
- [x] Every thrown `error(status, ...)` renders a branded, localized page instead of SvelteKit's default
- [x] A genuine Backend-unreachable failure shows a friendly, translated message at every call site
- [x] A session survives a transient Backend outage — no forced re-login
- [x] `npm run check`/`build` both clean
- [x] Verified live: registered/logged in, killed the local Backend mid-session, confirmed graceful failure + no false-positive login, confirmed the guest path degrades gracefully in both locales, confirmed a nonexistent group renders the branded 404, restarted the Backend, confirmed the same session cookie resolves normally again

**Tasks — Claude:**
- [x] `src/routes/+error.svelte` (new) + 6 new message keys
- [x] `backendFetch`, `guestFetch` helper
- [x] Guarded every previously-unguarded raw `fetch()`
- [x] Live-verified via curl against the real local dev server + Postgres, including a real Backend-down/recovered cycle

### F10 — Lock down `$lib/pieces/registry.ts`'s bundled pieces [x]

At the human's direct request ("some of them might have restricted privileges... let's
keep challenge of thor the way it's routed as an example, but let's protect the rest
under their owners and invite links"). The real hole: `registry.ts`'s bundled `PIECES`
array held 5 real SFCC choir pieces as static files, fetchable by anyone with zero
auth by direct URL — and `piece/[id]/+page.svelte` checked this bundled registry
*before* the already-correctly-gated Backend `remote` piece, so the Backend-side
gating (member session or guest join code, confirmed still correct) was never even
reached.

**Mechanism:**
- `registry.ts`'s `PIECES` pruned from 7 entries to 2: Lacrymosa (not owned by any real group, kept public per the human's choice) and Challenge of Thor (kept exactly as before, as a worked example of this direct-URL/no-auth path)
- Deleted the other 5 pieces' PDF/MusicXML files from `static/fixtures/SFCC/` outright — pruning the registry alone wasn't enough, since Cloudflare's asset binding serves anything under `static/` regardless of routing. Also deleted an 8th real SFCC piece (`The-Frost-Myth`) that had no registry entry at all but sat in the same public directory.
- No routing/gating logic changed anywhere — once the registry only has 2 entries, everything else falls through to the real gated path automatically
- Found and fixed a real regression this would otherwise have caused: `/`'s personal-library section only ever rendered a piece via a bundled-registry title match, with no `has_music`/`has_pdf` fallback (unlike the group Tracks tab and guest join page). Fixed by building a `Piece` via `remotePiece.ts`'s `buildRemotePiece()` for any library entry with no bundled match.
- The 5 migrated pieces lost their registry `tempoOverrideBPM` (their MusicXML exports carry no tempo data). The Backend's `Piece.default_tempo_bpm` is the real replacement — left for the human to fill in via the Tracks tab (Der Abend 58, Proserpine 80, Les djinns 138, Eglamore 141, The Fay's Song 100, same values as the removed overrides)

**Acceptance criteria:**
- [x] Only Lacrymosa and Challenge of Thor remain reachable with no login and no invite code, by direct URL or otherwise
- [x] The other 5 registry pieces + The Frost Myth have no public static file left to fetch directly
- [x] A group member still sees their group's full distributed repertoire on `/`, `/groups/[id]`, and the player — via the real Backend piece now
- [x] A guest with a valid join code (and group password, if set) still gets the same access as before
- [x] `npm run check`/`build` both clean

**Tasks — Claude:**
- [x] Pruned `registry.ts`'s `PIECES` to Lacrymosa + Challenge of Thor
- [x] Deleted the other 5 pieces' + The Frost Myth's public static files
- [x] Fixed `/`'s personal-library section to fall back to a real Backend piece via `buildRemotePiece()`
- [x] `check`/`build` clean

**Tasks — Human:**
- [ ] Set the 5 migrated pieces' default tempo via the group's Tracks tab (values above) — nothing plays at the wrong tempo until this is done, it just falls back to the player's own default

### F11 — PDF markup: freehand pen + stamps [~]

At the human's direct request, after trying F4's score-position text annotations and
being unimpressed ("The current annotation system is not useless [but] we can
improve on it") — modeled on piaScore's real annotation tool (pens + stamps drawn
directly on the page), not F4's pin-and-sheet approach. **Additive, not a
replacement** — F4's annotations stay as they are.

**Why the PDF pane, not the notation player:** freehand ink only makes sense on a
fixed page image. The OSMD player pane reflows constantly (zoom, display mode,
mute/solo all trigger a full re-render), so a stroke drawn there would drift off
the note it was meant to mark the moment anything changed. The PDF pane's pages
are geometrically stable, so this only works for pieces with an uploaded PDF.

**Mechanism:** points stored as fractions of the page's own rendered *width* for
*both* x and y (not width/height respectively) — keeps a stroke's thickness and a
stamp's size undistorted regardless of the page's aspect ratio, and correctly
positioned across zoom levels with no conversion. An SVG overlay per page
(`viewBox="0 0 1 {aspectRatio}"`) sits on top of each PDF canvas; pointer events on
it draw/erase depending on the active tool.

**Acceptance criteria:**
- [x] A logged-in user viewing a real Backend piece's PDF can draw a freehand pen stroke (color/width choice) directly on the page
- [x] The same user can place one of 6 stamps (breath mark, accent, fermata, staccato, circle, star) at a tap
- [x] An eraser tool removes a stroke/stamp it's dragged over; a separate Undo removes the most recently created mark
- [x] Marks persist per-piece per-page and reappear on reload, personal to their creator only (no sharing — see Backlog for the planned group layer)
- [x] `npm run check`/`build` both clean
- [ ] Human confirms drawing/erasing/undo actually feels right on a touchscreen (built without one) and that a stroke stays visually anchored to its note across zoom

**Tasks — Claude:**
- [x] Backend: `PieceMarkupMark` model + migration, `POST`/`GET /piece-markup`, `DELETE /piece-markup/{id}` (owner-only, personal — no share/unshare, unlike B5's `Annotation`)
- [x] `$lib/api/pieceMarkup.ts`: typed client for the new proxy routes
- [x] `routes/piece/[id]/markup/**`: authenticated proxies, same `locals.token`-server-side pattern as every other piece-scoped route
- [x] `PdfView.svelte`: per-page SVG drawing overlay, pointer-driven stroke capture, tap-to-place stamps, eraser (segment-distance hit-testing), session-local undo stack, a floating toolbar (tool/color/width/stamp pickers)
- [x] `piece/[id]/+page.svelte`: passes `pieceId`/`canMarkup` (same gate as F4's annotations — logged in + a real Backend piece) into `PdfView`

**Tasks — Human:**
- [ ] Deploy the Backend (new migration needs to run against the real production DB) — the Frontend preview can't actually save/load marks until this lands
- [ ] Click through pen/stamp/eraser/undo on a real device and confirm it reads right

### F12 — PDF markup: top-level Annotation mode on/off toggle [~]

At the human's direct request, following a first look at F11. Today, `canMarkup`
unconditionally renders both the marks overlay and the floating pen/stamp/eraser
toolbar for a logged-in user on a real Backend piece's PDF — there's no way to get
back to a plain, uncluttered PDF. The per-tool behavior already added in F11 (arming
pen/stamp/eraser hands `touch-action` fully to drawing so a one-finger drag draws
instead of scrolling; deselecting the tool restores `pan-x pan-y`) is correct and
**stays as-is** — this milestone doesn't touch it.

**Scope:** one master toggle, off by default (matching F4's annotate toggle also
defaulting off), that gates the whole markup layer rather than one tool at a time:

- **Off:** no toolbar, no marks rendered, full normal pan/pinch-zoom — same as
  viewing a PDF with no markup feature at all
- **On:** F11's existing toolbar + marks + per-tool draw/pan-disable behavior,
  unchanged

**Acceptance criteria:**
- [x] A logged-in user viewing a real Backend piece's PDF sees an explicit
      Annotation-mode on/off control, off by default each visit (session-local
      state, not persisted — matching F4's `annotateMode`)
- [x] With the mode off: no toolbar, no existing marks drawn on the page, and
      one-finger drag always pans/scrolls the PDF — never arms a tool by accident
- [x] Turning the mode on restores exactly F11's current behavior with no
      regressions: marks visible, toolbar visible, picking pen/stamp/eraser still
      hands pan over to drawing, deselecting still restores it
- [x] Turning the mode back off, mid-tool-selection, clears the armed tool and
      returns to plain full-pan viewing (no stuck `touch-action: none`)
- [x] `npm run check`/`build` both clean
- [ ] Human confirms on a real touchscreen: mode off never accidentally draws,
      mode on behaves exactly like today's F11

**Tasks — Claude:**
- [x] `PdfView.svelte`: new `annotationMode` state (default `false`); gates the
      `marks` overlay render and the floating `.markup-toolbar` on it
- [x] `toggleAnnotationMode()`: flipping off also resets `tool`/`activeStroke`/
      `activeStrokePage`, so no stale armed tool or in-flight stroke survives
      into the next time it's turned back on
- [x] New `.annotation-mode-toggle` floating button, top-left corner (clear of
      `.zoom-controls` bottom-right and `.markup-toolbar` bottom-left, the
      latter only present once the mode is on) — always visible whenever
      `canMarkup`, even while off, so there's a way back in
- [x] `handleMarkupPointerDown` also gates on `annotationMode`, matching the
      template's overlay gate (belt-and-suspenders — the overlay isn't even
      mounted while off, but `tool` is also forced `null` at that point)
- [x] New `messages/en.json`/`es.json` keys (`markup_mode_on`/`markup_mode_off`)
      for the toggle's `aria-label`
- [x] No prop threading needed — `annotationMode` is fully internal to
      `PdfView.svelte`, `piece/[id]/+page.svelte` is unchanged
- [x] `npm run check` (0 errors, pre-existing unrelated warnings only) and
      `npm run build` both clean

**Tasks — Human:**
- [ ] Confirm on a real device that mode-off never lets a stray tap/drag start a
      mark, and mode-on is unchanged from today's F11 behavior

### F13 — Audio-only reference recording, driving the bottom bar in PDF view [~]

At the human's direct request, following up on F12: F5's reference-recording
YouTube link showed as a video, embedded in an always-visible top disclosure,
regardless of which pane (score/PDF) was open — the human wanted it audio-only
and controlled from the same bottom bar the synthesized player already uses.
Clarified scope: the choice belongs specifically to PDF view, between the
synthesized mix and the real reference recording's audio — not a second,
independent player running alongside the existing one.

**Mechanism:** new `$lib/audio/youtubeAudioPlayer.ts` wraps Google's YouTube
IFrame Player API in the same `create()`/`play()`/`pause()`/`seek()`/
`positionMs`/`duration`/`isPlaying` shape `MidiPlayer` already exposes, so
`piece/[id]/+page.svelte`'s bottom bar can treat either as an interchangeable
"whatever `audioSource` currently is." The iframe itself is created but never
shown — parked off-screen (not `display: none`, which risks some browsers
pausing background video decode) so only its audio is ever heard.

**Acceptance criteria:**
- [x] While viewing a real Backend piece's PDF, if it has both a music file
      and a reference recording, an "Audio source" control in Practice Setup
      lets the human pick "My mix" (today's synthesized player) or "Reference
      recording" (the real YouTube audio) — either one drives the same
      play/pause button and scrubber
- [x] That control sits directly under the View section, appearing the moment
      PDF is picked there (both live in the drawer's `viewMode === 'pdf'`
      branch) — not tucked away somewhere unrelated
- [x] Switching source always pauses whichever one is being left, so the two
      are never audible at once
- [x] Leaving the PDF pane always reverts to "My mix" — the reference choice
      only makes sense there, since the notation cursor stays synced to the
      synthesized clock, not a recording
- [x] Picking the reference recording hides the Mix section entirely — a
      per-part balance mixer has nothing to balance against a single audio
      track. Tempo and "Your part" are likewise hidden whenever there's no
      music file at all (a PDF-only piece) — both are meaningless with no
      synthesized clock to apply to
- [x] The Practice Setup gear button is enabled for a PDF-only piece too, not
      just a piece with a music file — this drawer no longer requires a real
      player just to open
- [x] The Audio-source section itself always appears in PDF view as long as
      *some* audio exists for the piece — a piece with no reference recording
      still sees the section, just with "Reference recording" disabled rather
      than the section vanishing outright; a PDF-only piece sees "My mix"
      disabled instead
- [x] A PDF-only piece (no music file) with a reference recording gets a
      working bottom bar too — forced to the reference recording, since
      there's no "mix" to speak of
- [x] A piece with a reference recording but **no PDF at all** keeps the old
      video disclosure unchanged — the new picker has no PDF pane to live in
      for that shape
- [x] `npm run check`/`build` both clean
- [ ] Human confirms in a real browser: switching source mid-playback, a
      PDF-only+reference piece's bottom bar and drawer, and that the reference
      audio is genuinely inaudible-as-video (no visible player, just sound)

**Tasks — Claude:**
- [x] Real bug found live-testing this milestone: `getPieceByTitle()` (F10)
      was preferred unconditionally over a real Backend piece's own content
      everywhere it's used — a track sharing a bundled fixture's title (e.g.
      "Lacrymosa") always played/showed the bundled asset even after an admin
      uploaded their own music file/PDF/YouTube link to it, so this
      milestone's picker looked broken (always disabled) for such a piece.
      Fixed in `/`, the group Tracks tab, and the guest join page: the
      bundled match is now only used when the real piece has neither
      `has_music` nor `has_pdf` of its own
- [x] `$lib/audio/youtubeAudioPlayer.ts` (new): `YoutubeAudioPlayer` class
      wrapping the YouTube IFrame API (loaded as a vendor `<script>`, same
      pattern `audio/player.ts` uses for js-synthesizer) — off-screen host
      element, `extractYoutubeVideoId()` helper for the three URL shapes the
      upload form accepts
- [x] `piece/[id]/+page.svelte`: `audioSource` state (`'mix' | 'reference'`),
      `ensureReferencePlayer()` (lazy — only loads the YouTube API/video once
      `'reference'` is actually reachable), `setAudioSource()`, `tick()`/
      `togglePlay()`/`seek()` all branch on it
- [x] Two `$effect`s: force `audioSource = 'reference'` for a PDF-only piece
      with a reference recording (and preload it, so the scrubber has a real
      duration before the first play tap); lazily create the reference player
      whenever `audioSource` is `'reference'` and it doesn't exist yet —
      guarded on `referencePlayerError` so a failed load doesn't retry in a
      loop (an explicit Play tap still retries deliberately)
- [x] `setViewMode()`: leaving `'pdf'` while `audioSource === 'reference'`
      pauses it and reverts to `'mix'`
- [x] New "Audio source" Practice Setup section, directly under View, shown
      whenever `viewMode === 'pdf' && (hasPlayer || piece?.youtubeUrl)` — a
      segmented picker with each button individually `disabled` for whichever
      source this piece doesn't actually have (`!hasPlayer`/no
      `youtubeUrl`), rather than hiding the whole section
- [x] Practice Setup's gear button enabled for `loadState.kind === 'pdfOnly'`
      too, not just the music-file-driven kinds
- [x] Tempo and "Your part" sections gated on `hasPlayer` (meaningless with no
      synthesized clock); Mix section additionally gated on
      `audioSource !== 'reference'` (meaningless balancing a single audio
      track) — all three used to render unconditionally, harmless before this
      milestone since the drawer was unreachable for any piece they wouldn't
      apply to
- [x] Footer (`bottom-bar`) now also renders for a `pdfOnly` piece that has a
      reference recording, not just the music-file-driven `loadState` kinds
- [x] Old top video disclosure narrowed to `piece?.youtubeUrl && !hasPdfPane`
      (a music file + reference recording, no PDF — the one shape the new
      picker can't cover, since it has no PDF pane to live in)
- [x] New `messages/en.json`/`es.json` keys: `piece_audio_source(_mix|_reference)`,
      `piece_reference_loading`, `piece_reference_unavailable`
- [x] `npm run check` (0 errors, same pre-existing unrelated warnings) and
      `npm run build` both clean

**Tasks — Human:**
- [ ] Confirm in a real browser: source switching, the PDF-only+reference
      bottom bar, and that the reference recording is genuinely audio-only
      (nothing visible, just sound) on a real device

### F20 — Piece Notes panel (frontend for Backend B16, + a personal source) [~]

Backend **B16** (`f08c969`, committed but not yet pushed/deployed) shipped
`PieceRehearsalNote` — a group admin's durable, group-wide reminders pinned
to a piece. It landed with **no frontend at all** and no `F` milestone;
the endpoints existed but nothing in the app called them. This wires it in
as **"Piece Notes"** (the human's preferred name), and sets up a second,
per-member **personal** source alongside the admin one.

**Deliberately plain (per the human, 2026-09-02):** a piece note is just a
short line of text. B16's optional kind / title / page / measure / part
fields are **not** surfaced; they stay at their Backend defaults.

**Two sources, kept visually distinct** (per the human, 2026-09-02):
- **From the director** — group-wide, admin-authored (B16). Members read-only.
  Solid accent left-edge; section label in the accent colour.
- **My notes** — the signed-in member's own private note. Stored as a
  Backend **B5 `Annotation`** with the reserved sentinel position `-1`
  ("not pinned to a spot in the score"), so no new Backend work and it
  syncs across devices. `ScoreView`'s marker layer filters position `-1`
  out (`loadAnnotations` now keeps only `positionWholeNotes >= 0`). Dashed
  muted left-edge; muted section label. Always editable by its owner.

Each note shows its **timestamp** (`formatDateTime` — both sources already
persist `created_at`).

Numbered **F20** on purpose — `F14`–`F19` are the editor milestones now in
`OMR_EDITOR_PLAN.md` (E2–E10), referenced all through that plan's log.

**Where it shows:**
- Piece page (`/piece/[id]`), a collapsible panel under the top bar
  (`PieceNotesPanel`, default `chrome="details"`). Starts **collapsed**
  with a rotating chevron; when open its body is capped at
  `min(45vh, 14rem)` and scrolls, so it never pushes the score/PDF down.
- Group **Rehearsal Tracks** tab (`groups/[id]`), each track card gains an
  expandable "Piece Notes" disclosure (chevron + label) rendering the same
  panel with `chrome="bare"`. Lazy — nothing fetches until a card is
  expanded.

**Layout:** notes flow in a responsive grid (`auto-fill`,
`minmax(min(100%, 15rem), 1fr)`) so they sit side by side when there's
width and stack when narrow. A long body is clamped to 4 lines with a
per-note "Show more" (so one long note can't stretch its row and strand
the short notes beside it); an expanded or editing card spans the full
row. Cards are compact — body, then a footer line with the timestamp and
edit/delete. Adding is a small `+` next to each section heading (no
full-width "Add note" bar). All component classes are `pn-`-prefixed after
a bare `.note` collided with a centered global in `shell.css`.

If the group's Weekly Notes page is disabled for members (B16 gates the
list on `GroupPage.weekly_notes`, 403/404), just the director section is
hidden — the personal section still works.

**Access shape:** director notes — members with Weekly Notes page access
list them, only a group admin writes. Personal notes — any signed-in
member, always their own. No guest path (both sources need a session).

**Acceptance criteria:**
- [x] The piece page shows a "Piece Notes" disclosure for a logged-in user
      viewing a real group-owned Backend piece; a personal piece, a guest,
      or a bundled fixture never shows it
- [x] A group admin can add a director note (one text field), edit it, and
      delete it (click-to-confirm); a non-admin member sees it read-only
- [x] Any signed-in member can add / edit / delete their own personal notes
      on the piece; another member never sees them
- [x] Director vs. personal notes are visually distinct — solid accent edge
      + accent label vs. dashed muted edge + muted label, plus the two
      section headings
- [x] Notes render through the small shared note-markdown renderer; each
      note shows its stored timestamp
- [x] Personal notes never appear as score markers (`ScoreView` filters
      position `-1`)
- [x] On the player the panel body is height-capped and scrolls
- [x] The Rehearsal Tracks tab lets you expand any track card to read (and
      manage) that piece's notes without opening the player; nothing fetches
      until expand
- [x] The director section degrades quietly on a 403/404; the personal
      section keeps working
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 107 green
- [ ] Human clicks through it in a real browser (admin + plain member, both
      surfaces, both notes kinds), against a local Backend with B16

**Tasks — Claude:**
- [x] `$lib/api/pieceNotes.ts` — typed client, two sources: `group` (B16
      `rehearsal-notes` proxy) and `personal` (B5 `annotations` proxy with
      the reserved position `-1`). `{ body }` in/out; `PieceNoteSource`
      discriminator on the returned `PieceNote`
- [x] `routes/piece/[id]/notes/{,[noteId]}/+server.ts` — authenticated
      proxies onto B16's `rehearsal-notes` endpoints (the personal source
      reuses the existing `annotations` proxies unchanged)
- [x] `RemotePieceMeta.groupId` added; `resolve/+server.ts` populates it and
      a `canManagePieceNotes` flag (admin of the owning group)
- [x] `PieceNotesPanel.svelte` — `chrome` prop (`'details'` | `'bare'`),
      two sections with distinct edges/labels, per-note `formatDateTime`
      timestamp, `42vh` scroll cap in `details` mode, `ConfirmButton`
      delete, `renderNoteMarkdown` body, section-aware edit/add state
- [x] `piece/[id]/+page.svelte` — mounts the panel under the top bar;
      `loadAnnotations` filters to `positionWholeNotes >= 0` so personal
      notes aren't drawn as score markers
- [x] `groups/[id]/+page.svelte` — track card restructured to a column
      (`.track-card-row` + a `<Disclosure variant="inline">`; 2026-09-02
      cleanup replaced the hand-rolled `.track-notes` `<details>`);
      lazy-mounts the panel on expand
- [x] en/es keys (`piece_notes_*`)

**Tasks — Human:**
- [ ] With B16 available locally: on the piece page and on a track card, as
      an admin add a couple of director notes and a couple of personal
      notes, edit/delete one of each, confirm the timestamps and the
      visual distinction; then as a plain member confirm the director notes
      are read-only and personal notes are their own. Check `/` and `/es`,
      and that the player panel scrolls rather than shoving the score down.

## Backlog

- **F11 fast-follow — group-published markup layer:** an admin publishes their own PDF markup for a piece to the whole group; each member independently toggles "show group markup" on top of their own personal marks (per the human's explicit ask, 2026-08-29). Needs a `published_at`/similar flag on `PieceMarkupMark` (or a parallel table) plus a publish action and a per-viewer visibility toggle — deliberately not built alongside F11 itself, personal-only marks first.
- **F11 fast-follow — import/export markup:** the human's other ask alongside the group layer, also deliberately deferred — no shape decided yet (a portable file format? peer-to-peer copy of one person's marks to another?).
- Track "last opened piece" server-side, to power a real Home "Continue practice" card (currently fixture/bundled-demo-only)
- Admin default tempo only rides along on the group Tracks tab's and personal Library's practice links so far — the guest join page's practice link doesn't carry `?defaultTempo=` yet since `GuestPieceOut` doesn't expose `default_tempo_bpm`
- Admin's Assignments/Tracks tabs have no edit/delete UI yet (Backend supports `DELETE /homework/{id}`; no equivalent for tracks)
- `/groups/new`'s form only asks for a name — the Backend's `GroupCreate` schema has no fields yet for a description or default-sections checklist
- Preserve fully independent polyphonic notation in the player-generated MusicXML — same-onset notes render as chords now, but truly independent overlapping rhythms on one staff still need a multi-voice representation
- **Shared OSMD-view code between `ScoreView` and `EditorScoreView`.** `stepCursorTo`/`walkCursorTo` (identical pure cursor-stepping algo), the `osmdOptions()` builder, the follow-scroll block, the zoom controls (identical markup + ~45 lines of CSS), and the theme CSS-custom-prop block are duplicated. Extraction candidate (`$lib/components/score/osmdCursor.ts` + a shared `<ScoreZoomControls bind:zoom />`) with a unit test — deferred, needs a click-through of both the practice player and the editor right after.
- Live tempo control for F5's stem-backed pieces — a real time-stretching problem, not a rate multiplier like the MIDI-synth player has
- Guest-side wiring for genuinely-new real pieces via join code (see F5's "Expanded" note) — closed via the fix logged 2026-08-29 below; kept here only if a similar gap resurfaces for a future upload path
- **Fix the live production Backend URL if it ever regresses**: the deployed Worker was once built with `PUBLIC_API_BASE_URL=http://localhost:8000` baked in — always deploy with `PUBLIC_API_BASE_URL=<real-backend-url> npm run build && npx wrangler deploy`, never a plain `npm run build`, so it's never silently sourced from whatever a local `.env` happens to hold

## iOS app (paused 2026-08-27, moved here from root `plan.md`)

Condensed 2026-08-28 during repo cleanup — the root-level `plan.md` (the native
Swift/SwiftUI app this project pivoted away from) was deleted since it's a fully
separate, already-frozen sub-project; the day-by-day build log stays in git history.

**What existed:** M1 (Xcode/xcodegen scaffold) → M2 (MIDI parsing via AudioToolbox's
`MusicSequence`/`MusicEventIterator`, not `AVAudioSequencer` — `AVMIDIMetaEvent`
couldn't expose lyric/track-name payload bytes) → M3 (playback via
`AVAudioSequencer`/`AVAudioEngine`, verified surviving backgrounding on a real
device) → M4 (in-app follow-along: OpenSheetMusicDisplay in a `WKWebView`, flat/
highlighted/solo display modes, per-part balance mixing — frozen mid-milestone with
zoom controls and seek/scrub both confirmed broken, never fixed) — M5 through M7
(SwiftUI shell, PiP piano-roll renderer, PiP controller) were never started. The
MIDI-parsing heuristics and `MusicXMLConverter` quantization math carried over
conceptually into this Frontend's own `$lib/midi`/`$lib/musicxml`, rewritten in TS.

**Standing constraint, if iOS work ever resumes:** keep pure-algorithm Swift free of
Foundation/UIKit types where the logic itself doesn't need them — plain data in,
plain data/strings out. Turns a future Android port into translation rather than
redesign. No Kotlin Multiplatform or cross-platform framework until Android work
actually starts. (Also recorded in this session's own persistent memory,
`divisi-android-portability.md`.)

**Fixture provenance:** the `Fixtures/*.mid` files (still used by this Frontend and
the Backend) are synthetic, generated via `Fixtures/generate.py` (mido)
approximating the opening of Mozart's Requiem's "Requiem aeternam" — not a verified
transcription, since CPDL/8notes/MuseScore/smallchurchmusic all blocked automated
fetching or required accounts.

## Log

*Condensed 2026-08-29 — see each milestone's own section above for full acceptance-criteria/task detail; this is now a chronological breadcrumb, not a re-narration.*

- 2026-09-02: **Cleanup round 2 — god-files** (no behaviour change; tracked in the now-deleted root `CLEANUP.md`, git `d85eb0c`..`d92054d`). Round 1 was duplication-focused and scoped away from the largest files; round 2 targeted single-responsibility / file size. Steps 1-3: pure helper/action extraction — `ScoreView` → `score/scoreTreatments.ts` (7 fns), `piece/[id]` → `player/mixMath.ts` + `player/persistence.ts`, and `$lib/actions/pinchZoom.ts` (repo's first custom Svelte action, replaced the pinch-zoom block duplicated in `PdfView` + `ScoreView`). Steps 4-5: stateful `.svelte.ts` factory composables — `player/annotations.svelte.ts` (lifted the whole annotation feature out of the player page, 2100→1928) and `components/pdf/` (`pdfMarkup.svelte.ts` controller + `PdfMarkupLayer` + `PdfMarkupPanel`; `PdfView` 1637→532). Step 8: backend `library.py` → `library/` package (`pieces`/`versions`/`files`/`_common`), suite 226 green. **Steps 6-7 (this session):** `groups/[id]/+page.server.ts` (740 lines, 30 form actions) → `actions/*.ts` grouped by tab (`group`/`members`/`tracks`/`homework`/`weeklyNotes`/`responsibilities` + `_shared.runAction`), spread-composed back into one `actions` export; `groups/[id]/+page.svelte` (2070 lines) → `tabs/*.svelte` (`HomeworkTab`/`TracksTab`/`WeeklyNotesTab`/`MembersTab`/`ResponsibilitiesTab`/`AboutTab`, each `{data, form, mode}` props + own state + scoped styles) plus `rehearsalSchedule.ts` for the shared weekday/next-rehearsal helpers; page keeps `mode`/`tab`/`visibleTabs` + the created-group banner + role switcher. Markup verified identical against the pre-split file (message keys, 23 form actions, 28 `use:enhance`, snippet/each structure). +page.svelte 2070→158. Deferred out of round 2: player transport/mix-state composables (touch the RAF loop), `db/models/` package split, splitting `ResponsibilitiesTab` (782 lines — one dense admin surface) further. `check` 0 errors / 14 warnings (baseline), `build` clean, vitest 63. Not browser-exercised (standing blocker) — rests on check + build + tests.

- 2026-09-02: **Pre-push cleanup pass** (no behaviour change). (1) Deleted the throwaway F14 engine spike — `src/lib/spike/musicXmlEdit.ts` + the `/spike/f14-editor` route (which was shipping to production as an unguarded page); it had no runtime importers, only stale code comments (reworded). (2) `resolve/+server.ts` was firing two identical `GET /groups` requests (`resolveCanEditMusic` + F20's `resolveCanManagePieceNotes`); collapsed to one `resolveOwningGroupRole()` that both flags derive from. (3) New `Disclosure.svelte` (`variant: 'panel' | 'inline'`) — the chevron SVG + rotate-on-open + native-marker reset that F20 had duplicated between `PieceNotesPanel`'s `details` chrome and the `groups/[id]` track-notes block now live in one place. (4) New `$lib/components/score/osmd.ts` — `baseOsmdOptions()` + `quietOsmdLogging()` share the ~11 common OSMD constructor keys and the `setLogLevel('error')` call between `ScoreView` and `EditorScoreView`. `check` 0 errors, `build` clean, vitest 107.

- 2026-09-02: **F20 built — "Piece Notes"** (frontend for Backend B16, which had shipped backend-only with no `F` milestone). Iterated hard with the human across the session: a categorized "Rehearsal Notes" panel → one plain text field → renamed "Piece Notes" → two sources → shown on the Tracks tab too → timestamps → player-mode scroll cap. Final shape: `PieceNotesPanel.svelte`, a `chrome: 'details' | 'bare'` disclosure with two visually-distinct sections — **From the director** (group-wide, admin-authored B16; solid accent edge; members read-only) and **My notes** (per-member private; dashed muted edge; always owner-editable). The personal source is stored as a B5 `Annotation` at the reserved sentinel position `-1`, so **no new Backend work** and it syncs; `piece/[id]/+page.svelte`'s `loadAnnotations` now filters `positionWholeNotes >= 0` so those don't render as score markers. Each note shows its `created_at` via `formatDateTime`. On the player the panel body is capped at `42vh` and scrolls. Shown on the piece page under the top bar and inside a new lazy expandable disclosure on each **Rehearsal Tracks** card (`groups/[id]`; card restructured to `.track-card-row` + `.track-notes`). `$lib/api/pieceNotes.ts` wraps the B16 `rehearsal-notes` proxy (`routes/piece/[id]/notes/{,[noteId]}/+server.ts`) and the existing `annotations` proxy. `RemotePieceMeta.groupId` + `resolve/+server.ts` `canManagePieceNotes` (owning-group admin). Director section self-hides on a 403/404 (Weekly Notes page disabled); personal section keeps working. en/es `piece_notes_*` keys. `check` 0 errors, `build` clean, vitest 107. Same-day follow-ups from a live look on iPad: (1) Tracks card passed `canManage={isAdmin}` (raw role) so an admin "Viewing as Member" still saw add/delete on director notes — now `canManage={mode === 'admin'}` (Backend `require_admin` blocked the writes regardless); (2) the panel filled half the player screen — now starts collapsed with a rotating chevron, body capped at `min(45vh, 14rem)` and scrolls; (3) notes now flow in a responsive grid (side by side when wide), with a long body clamped to 4 lines + a per-note "Show more" so it can't stretch its row and strand its neighbours; (4) "Add note" bar replaced by a small `+` next to each section heading; (5) all classes `pn-`-prefixed to stop a centered global `.note` in `shell.css` leaking in. Needs the human real-browser pass against a local Backend with B16 (B16 isn't pushed/deployed yet).

- 2026-09-01: **Code-review fixes on `feat/generate-track-from-pdf`** (layered on the F19 rework, no behaviour change in the common path). **F19 downstream page offsets:** `reviewPages` now derives each page's `startIndex` from a running cumulative sum of `measureCount` across `reviewPagesRaw` (not the fixed `startMeasure - 1` from the B18 report), and `onsetWholeNotes` from the live `startIndex + 1`; `insertPageBars` / `rerunReviewPage` patch that page's `measureCount` (`+ fillBars` / `= result.measure_count`) so later pages' band / auto-scroll / dim veil shift with an in-editor insert or re-run instead of landing N bars early. For a fresh B18 report the sum equals `startMeasure - 1`, so nothing moves. **Publish gate:** a `pagedReportJobId` draft whose page list fails to map (`reviewPagesUnavailable`) no longer counts as "all pages approved" via `[].every()`. Publish stays blocked and the review bar shows the new `piece_editor_review_pages_unavailable` string (en+es). **Pre-B18 fallback:** `mapReport` keeps one entry per page but flags them `offsetsKnown: false`; `pageBand` / `dimOffPage` / the score select + `scrollPageIntoView` in `selectReviewPage` no-op for such a page (approval is an honour-system "I looked"), the PDF pane still turns. `reviewPages.test.ts` updated for the new shape. **`goToPrevSeam`** steps to the last seam from the cold state instead of skipping seam 0. **`.mxl`:** `mxl.ts` normalizes the `container.xml` `full-path` (leading `./`, `\` -> `/`, percent-decode, case-insensitive / trailing-path / basename match) before the entry lookup, and decodes a UTF-16 (BOM-sniffed LE/BE) inner document instead of forcing UTF-8; `remotePiece.ts`'s `loadRemoteMusicFile` wraps the unpack so a corrupt ZIP surfaces as the same "Malformed MusicXML" failure the plain-XML path produces. `mxl.test.ts` +3 (`./`-prefix, backslash, UTF-16 LE). **Measures-mode bar pick:** `EditorScoreView` derives the 0-based measure index from the graphical measure's position in `GraphicSheet.MeasureList` (fallback: `SourceMeasures` order), not arithmetic on OSMD's printed `MeasureNumber` (a hand-upload with a `number="0"` pickup or non-sequential numbers no longer selects the wrong bars); the hit field is renamed `measureNumber` -> `measureIndex`. `check` / `test` / `build` all green.

- 2026-09-01: **F19 reworked: strict page-by-page review, less editor chrome.** *(on `feat/generate-track-from-pdf`, presentation only.)* The just-shipped F19 review UI was a Pages/Seams/Publish tab stepper drawn over the score with a wrapping rail of N page chips and a separate controls row, stacked under the editor's multi-row toolbars. Reworked to a single compact `.review-bar` in the transport bar walked strictly in order (`‹ Prev | Page K of N, <status> | [Approve]/[Skip] | Next ›`, text links between phases); the score pane stays a continuous render but locks to the current page (new `EditorScoreView.scrollPageIntoView()` frames the page band at the top, a new `dimOffPage` prop draws two `.page-dim` veils so off-page systems recede); and during review the editor toolbars collapse to the Notes/Measures + Undo/Redo groups with the per-mode edit rows behind an `[Edit]` disclosure, handing the freed height to the score + PDF panes. F19's model is untouched: same `reviewPages.ts`, B18 offsets, `localStorage` keys, publish ack, and every approve / skip / re-run / insert / seam handler. `piece_editor_review_step_*` i18n keys dropped, seven `piece_editor_review_*` nav/label keys added (en+es). `check` 0 errors, vitest 103 green, `build` clean. Still needs the real-browser pass (folds into F19's pending pass).

- 2026-09-01: **`.mxl` (compressed MusicXML) support — no milestone number.** Built alongside F17-F19 this session, recorded here after the fact. `.mxl` is a ZIP holding one score document plus `META-INF/container.xml` naming it; every music-file entry point in the app works on plain MusicXML *text*, so new `$lib/musicxml/mxl.ts` (`isMxl` / `extractMusicXmlText`, backed by `fflate`) unpacks it first: follows `container.xml` to the rootfile, falls back to the first score entry outside `META-INF/`, strips a leading BOM. Mirrors the Backend's own `.mxl` handling in `app/omr/pipeline.py`. `loadEditableScore.ts` was detecting `.mxl` only to throw `UnsupportedMusicFileError`; now it unpacks and follows the plain-MusicXML path (the editor always saves back as plain `.musicxml`, so an `.mxl` source self-heals on first save). `remotePiece.ts`'s `loadRemoteMusicFile` unpacks `.mxl` before parsing; `FileSlot.svelte` shows an "MXL" badge; the `groups/[id]` track upload picker accepts `.mxl`. vitest +9 (`mxl.test.ts`). `check` 0 errors, `build` clean. **Needs the human's confirmation that the reconstructed intent is right** and a real-browser pass with an actual `.mxl` upload.

- 2026-09-01: **Responsibilities tab — whole-date coverage meter + restructure — no milestone number.** Built alongside F17-F19 this session, recorded here after the fact. New `coverageTotals(roles)` in `groupCards.ts` rolls per-role needed/active counts into `{ active, needed, openSlots, filledFraction, status }` where `status` is `empty` / `underfilled` / `covered` / `overfilled` (an overfilled role does not lend its extra to a short one); new `CoverageMeter.svelte` renders the bar; `formatWeekdayTime()` in `dates.ts` for the date-chip subtitle. The `groups/[id]` responsibilities tab now renders upcoming dates as a compact strip (one chip + coverage meter per date), with only the selected date showing its full roster and a status badge; admin gets click-to-reveal New-role-set / Add-date forms, a Role-sets card with per-schedule inline edit, a "Duplicate next week" shortcut, and a "Next rehearsal" quick-add prefilled from the group's weekly slot. en+es i18n (`responsibilities_*`). vitest +6 (`groupCards.test.ts`). `check` 0 errors, `build` clean. **Needs the human's confirmation that the reconstructed intent is right** and a real-browser pass (member / admin / guest).

- 2026-09-01: **F19 built — page-by-page review of a generated draft.** *(on `feat/generate-track-from-pdf`, on top of F17/F18.)* Panel placement decided with the human this session: the transport bar's bottom, replacing F15/F16's `.seam-bar` row (not a left dock pane or a top strip). New pure `$lib/musicxml/reviewPages.ts` (`mapReport`/`pageStatus`/`seamPages`, +11 vitest) turns B18's per-page `start_measure`/`measure_count` into the Pages step's model; `edit/+page.svelte`'s `reviewPages` re-derives each page's live 0-based measure range off the current model on every edit, same "re-resolve, don't resolve once" pattern as the F15 seam mapping. Review state is one `localStorage` map `divisi:pagesReviewed` (`jobId:page` -> `approved`/`skipped`, missing = untouched) — a page can be skipped to unlock the Seams step without counting toward the Publish gate. `EditorScoreView` gained a `pageBand` prop: same `GraphicSheet.MeasureList` geometry as F17's `measureBand`, but a full-system tint (every part) instead of one staff, for the page focused in the rail. Re-run / insert-bars moved from the seam step onto the selected review page (`rerunReviewPage`/`insertPageBars`, replacing `rerunSeamPage`/`insertFillBars`) and now clear that page's approval plus any seam touching it (`before_page` at the page or the page after — "the content moved"). Publish's ack widened to `{ pages_reviewed: true, seams_resolved: true }`; the Backend's `VersionPublishRequest` ignores the unknown field today, recording it server-side is an out-of-scope Backend follow-up. Entry-point copy (`OmrJobAlerts`, the `groups/[id]` Tracks-panel link) relabelled to name pages, no routing change. en+es i18n. Supersedes the F15/F16 review UX; F15's seam-onset mapping and F16's working-draft slot/save/publish/re-run/insert-bars machinery are all kept underneath. `check` 0 errors, vitest 103 green, `build` clean. Needs the human real-browser pass (replaces F15's + F16's pending passes).

- 2026-09-01: **Designed F19 — page-by-page review of a generated draft** (with the human). The generate → review → publish loop felt unintentional: F15/F16 merge every "obvious" page join into one whole-score draft and drop the admin into scattered seam markers, with nothing prompting a look inside a merged segment. F19 replaces it with a **Pages → Seams → Publish** stepper in the editor: approve each page against its reference PDF page (rail of `✓/⚠/✗/–`, per-segment bulk approve, failed-page re-run + insert-bars moved here), then the seam step unlocks, then Publish gates on all-pages-approved + all-seams-resolved (`{ pages_reviewed, seams_resolved }`). Decided: **stepper over the existing continuous score**, not a paginated view — reuses F17's `measureBand` for the page highlight and `PdfView.scrollToPage`; page-approved state is client-only `localStorage` `jobId:page`, same as F16's seams. Supersedes the F15/F16 review UX (their human passes fold into F19's); the machinery underneath is all kept. Paired backend change **B18**: `start_measure` / `measure_count` per page in `PagedReport.pages[]`. Not started.

- 2026-09-01: **F18 built — editor undo / redo.** *(on `feat/generate-track-from-pdf`, on top of F17.)* Human asked for an undo button. Every editor edit already ends by re-serializing the whole model into `workingXml`, so no command log was needed: new `$lib/musicxml/editHistory.ts` (`EditHistory` — bounded undo stack + mirror redo stack of those strings, cap 60, plain class so it unit-tests under the node vitest config, +6 tests). `edit/+page.svelte`: `applyEdit` / `applyStructuralEdit` / `applyClefRange` snapshot `workingXml` before mutating and `record()` on success only; `undoEdit` / `redoEdit` rebuild an `EditableScore` from the popped snapshot (always clean `serialize()` output, no loader), clear the selection, re-render through the existing `xml` prop. New `savedXml` (serialized state as of last load/save) makes `dirty` a real `workingXml !== savedXml` comparison, so undoing back to the saved state clears the unsaved-nav guard. Undo/Redo toolbar row (both modes) + Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y in `handleKeydown`. `canUndo`/`canRedo`/`dirty` added to the e2e probe. en+es i18n. `check` 0 errors, vitest 89, `build` clean. Needs the real-browser pass.

- 2026-09-01: **F17 built — editor "Measures" mode + range clef changes.** *(on `feat/generate-track-from-pdf`, on top of the playhead-desync work.)* Human asked to select several bars at once and change their clef; agreed on an explicit **Notes / Measures** mode toggle (not a hidden shift-click gesture) since it's the long-term home for bar-scoped editing and time-signature editing later — time signature deferred here (needs re-barring with ties). `EditableScore.setClefRange(partId, staff, start, end, spec)`: clef written at the range start, other explicit `<clef>`s for that staff inside the range removed, the pre-range clef re-asserted at `end+1` so downstream bars look unchanged; no-op / out-of-range / unknown-part return `false` without mutating. Extracted `applyClefToMeasure` + `clefInEffectAt` (shared with `setClef`/`clefAt`); added `clefAtMeasure` / `measureCount` / `partName`. `EditorScoreView` gains `measureMode` + `measureBand` props: measure-mode clicks always select a bar (Shift = extend), and a translucent `.measure-band` overlay tints the range, one rect per system row, boxes read off `GraphicSheet.MeasureList` with the same sheet-unit→px factor as the click hit-testing. `edit/+page.svelte`: `editMode` + `measureSel`, a segmented control as the first toolbar row, note-level rows hidden in measure mode, the clef row shared between modes, keyboard (←/→ move a bar, Shift+←/→ extend, Esc exits). en+es i18n. `check` 0 errors, vitest 76 green (+13 `setClefRange`), editor-playhead e2e 3 green.
  **Live-test round 1 (same day):** bar selection was routed through `EditableScore.findByOnset`, which misfires on a part tacet at the click's onset (a choral intro — every click resolved to the same bar, so the range never grew and clef edits landed elsewhere, reading as "treble/bass swapped"). Now `EditorScoreView` reads the 1-based measure number straight off OSMD's graphical note and the page uses it directly. Highlight geometry fixed (a rest-only bar's bbox height is ~1 unit → the band was a 10px sliver; now uses `ParentStaffLine.StaffHeight`, tints only the target staff, one rect per wrapped system row). `applyClefRange` re-stamps `measureSel` so the derived clef/band refresh. Clef row got a "Clef for the selected bars:" / "Clef from this bar on:" label. New `editor-measures.spec.ts` (4 tests); e2e now 6 green.

- 2026-09-01: **Editor playhead desync fixed + a Playwright e2e harness for it.** *(uncommitted at time of writing — on `feat/generate-track-from-pdf` on top of the F16 work.)* Live-testing F16 showed the editor's playback cursor lagging / desyncing / moving "per measure" against the audio, unlike the practice player's `ScoreView`. Root cause: `EditorScoreView` engraves the **raw** working model (`EditableScore.serialize()`), which keeps hidden notes and repeat structure the practice player's `convertVisualParts()` output strips. Three OSMD cursor fixes in `EditorScoreView.svelte`: (1) `SkipInvisibleNotes = false` on both cursors (re-asserted every render — OSMD rebuilds cursors on `render()`) so `next()` stops on every note, not just visible ones; (2) `EngravingRules.CursorIgnoreRepetitions = true` so the cursor walks linearly like `parseMusicXmlFile` (which never expands repeats) instead of back-jumping at end-repeats and spinning `walkCursorTo`'s guard loop every frame; (3) visibility/position-change gating so `show()`/`hide()`/re-style/follow-scroll (a forced reflow) only fire on an actual edge, not every frame. Playhead reworked alongside: `playbackWholeNotes` → `playheadWholeNotes` + a new `isPlaying` prop; the playhead is its own cursor (index 1, accent bar) shown whenever audio exists — playing **or** paused — so it's always draggable; new `onSeekTo` prop + `handleSeekTo` in `edit/+page.svelte` wire a drag of the bar (reposition) and a click on empty staff space (seek + play) back to the transport. Selection marker moved to cursor 0.
  New **`Frontend/e2e/`** (Playwright): `playwright.config.ts` (reuses the HTTPS dev server; FluidSynth's AudioWorklet does run under headless Chromium), `auth.setup.ts` (logs into the Backend, saves a `storageState`), `editor-playhead.spec.ts` (playhead vs transport: monotonic onset, note-level granularity, main-thread responsiveness, position tracking, drag-to-seek), `helpers/playback.ts`, `_diagnose`/`_profile` opt-in tools (`@tools` tag). Test seams: `window.__divisiEditorProbe()` (DEV / `?e2e` only), `data-role` on the cursor elements, `EditorScoreView.playheadOnset()`. Gated on `E2E_PIECE_ID` (used "Les djinns, Op. 12" locally); `npm run test:e2e`.
  **The harness immediately caught a separate bug**: `osmd.render()` was firing on essentially every animation frame during editor playback (~1.7s main-thread stalls on a ~4-min score; rAF ~3 ticks/4s). Cause: `$effect` tracks reactive reads transitively through synchronous calls, and the zoom/theme + seam effects both call `placeCursor()`, which reads `playheadWholeNotes` — so they re-subscribed to the transport position and full-re-engraved every frame. Fixed by wrapping those imperative bodies in `untrack()`. After: rAF ~228 ticks/4s, longest task 1680ms → 88ms. `check` 0 errors, vitest 67, e2e 3 pass. Still open (unchanged): `parseMusicXmlFile` bakes mid-piece `<sound tempo>` into note `startMs` but reports a single `tempoBPM`, so a tempo-change piece can still drift — the e2e position tolerance is one whole note and does not assert this.

- 2026-08-31: **F16 built — Claude tasks** (4 commits on `feat/generate-track-from-pdf`, on top of Backend B17). The editor now opens the piece's **working draft** (B17 create-or-get, copy-on-edit from the live version), resolved in `edit/+page.server.ts`; `loadScore` streams it via a new `edit/file?v=` proxy. Save is `PUT /library/versions/{id}/file` in place (new `edit/save` shape) and stays in the editor with a "Saved" notice — no more a fresh draft per save, no nav. Header badge: "Live version" for a pristine forked copy, "Working draft — not yet live" once edited. New "Publish as live version" button → `edit/publish` proxy (B17 submit→approve→distribute), disabled until every seam is marked resolved (per-seam toggle, `localStorage` keyed on job + `before_page`); it flushes unsaved edits first, then leaves so the next visit starts a fresh copy. Failed-page seams ("page N failed …") get: "Next seam" auto-opens the PDF pane at that page (new `PdfView.scrollToPage`), an "insert N bars" control (`EditableScore.insertMeasures`), and "Re-run this page" (`omr/jobs/[id]/pages/[n]/rerun` + `.../musicxml` proxies → `EditableScore.spliceMeasuresFromXml` at the seam onset). New structural ops on `EditableScore` (`insertMeasures`/`deleteMeasure`/`spliceMeasuresFromXml` — full-measure-rest bars, prevailing divisions/time, parts kept equal length, renumbered; +14 vitest). Tracks tab: draft-ready block → "Open working draft in editor" + "Discard working draft", "page X of Y" while a paged job runs; `OmrJobAlerts` links a finished single job to the editor. en+es keys. `check` 0 errors, `build` clean, vitest 67. Needs the real-browser pass + B17 on prod.

- 2026-08-31: Designed F16 (+ Backend B17) with the human — turning generate-from-PDF → in-app edit → publish into one loop. Agreed model: **one working-draft slot per track** (the single open `draft` / `source: modification` version), live version never edited in place, editor opens the working draft (copy-on-edit from live if none), saves update it in place, and an editor "Publish as live version" button (gated on all seams resolved) runs submit→approve→distribute. Failed-page seams get a side-by-side PDF at that page + an "insert N bars" control (new `EditableScore.insertMeasures`/`deleteMeasure`) and a "re-run this page" action (splices the re-run MusicXML into the working model). Generation stays one click with a per-page progress readout + a "review generated draft" completion alert. Per-seam "resolved" is localStorage-only, like F15's markers. Nothing built yet — full task list in the F16 section.

- 2026-08-31: F14 editor — fixed a back-navigation trap surfaced in live testing. The editor's back arrow (and the error-card "back to this track" links, and the post-save nav) were plain `<a href>`/`goto` pushes to `/piece/[id]`, so entering from the piece page left the history stack as [piece, editor, piece] and "back, back" bounced piece <-> editor. Now `+page.svelte` tracks whether it was reached from inside the app (`afterNavigate`, `type !== 'enter'`) and the back control does a real `history.back()` for an in-app arrival (returning you to wherever you came from, the group Tracks tab included), falling back to a *replacing* navigation for a cold/direct load. Post-save uses `goto(piece, { replaceState: true, invalidateAll: true })` so the editor entry is replaced, not stacked, and the piece page reloads showing the new draft. `beforeNavigate` unsaved-guard still fires on the popstate path. `check` 0 errors, `build` clean, vitest 58 green.

- 2026-08-31: Added and built F15 (review a segmented OMR result in the editor) alongside Backend B16. When a track's music came from a paged OMR run that couldn't merge every page join cleanly, the group Tracks review block says so and relabels "Edit music" → "Review seams in editor"; the editor pulls the job's `paged-report.json` (new `omr/jobs/[id]/paged-report` proxy), maps each unresolved boundary's merged-measure number to an onset via a new `EditableScore.measureOnset()` (keyed on `workingXml` so it tracks edits), and `EditorScoreView` draws an absolutely-positioned labelled rule at each — measured by transiently walking the shared OSMD cursor to the seam onset after each render, then restoring it. A "Next seam" control in the transport strip cycles the boundaries with a reason readout. Markers are overlay DOM only, never in the saved MusicXML. New `piece_editor_seam_*` / `groups_generate_*` keys in en+es. `check` 0 errors, `build` clean, vitest 58 green (+3 `measureOnset`). Seam-marker pixel placement + the end-to-end flow still need a real-browser pass (and B16 deployed).

- 2026-08-31: Added F14 (in-app notation editor for a track's music) as the next milestone at the human's request — the editing counterpart to B8's OMR, so a rough generated score gets corrected in the app instead of via desktop MuseScore. Engine choice (correction-only on our own OSMD/Verovio render vs. adopting an editing library) is deliberately left to a spike, recorded in the milestone.
- 2026-08-31: F14 spike done — engine decided: **path 1, correction-only editor on OSMD with a MusicXML-DOM editable model** (not Verovio, not an editing library). Throwaway spike at `/spike/f14-editor` + `src/lib/spike/musicXmlEdit.ts` proved click → transpose/delete → `osmd.load()`+`render()` in a real browser (Playwright) against the bundled Elgar fixture. Verovio not prototyped: OSMD cleared every path-1 bar, and Verovio's ~2 MB WASM + MusicXML↔MEI round-trip isn't worth it for a page choir members open on phones. Decision, the four findings (OSMD stays a pure view; click→note needs part-awareness because OSMD numbers staves globally; full re-render ~1.2 s on a 3.7k-note score so debounce; rough edges = re-highlight/chord-delete/accidental-respelling/duration edits), and the paths considered are all written into the F14 milestone. `check`/`build` clean. Spike route/module to be deleted when the real editor lands.
- 2026-08-31: Shipped a header alert (`AppHeader` → new `OmrJobAlerts.svelte`, `$lib/stores/omrJobs.svelte.ts`, `/omr/jobs` proxy route) that tells an admin a "Generate music from PDF" job they started has finished or failed, from any screen with the app header — previously only visible by reloading that track's row in the group Tracks tab. Seeds on navigation, polls ~20s only while a job is still running (skips a hidden tab), remembers dismissals in `localStorage`. Backed by a new Backend `GET /omr/jobs` (see `Backend/plan.md`). `check`/`build` clean, frontend + backend suites green.
- 2026-08-31: **F14 build in progress** (running breadcrumb, updated per task; resume from here after a `/clear` — `git log --grep '^F14' -1` is the latest committed task). Engine + plan already committed. Checklist state:
  - [x] Task 1 — editor route `/piece/[id]/edit` (`ssr: false`) + access-gated server `load`.
  - [x] Task 2 — load the track's music file into the editable model + read-only render. `$lib/musicxml/editableScore.ts` (production port of the spike's `EditableScore`), `$lib/musicxml/loadEditableScore.ts` (sniffs MIDI/MusicXML, `.mxl` rejected, MIDI goes through `convertAllParts` first), `$lib/components/EditorScoreView.svelte` (dedicated read-only OSMD mount, not `ScoreView`).
  - [x] Task 3 — editing surface, core: click-to-select (part-aware hit-test in `EditorScoreView`), pitch +/-semitone + octave via `transpose`, delete-to-rest, ArrowLeft/Right selection nav, `dirty` flag. Toolbar + keyboard. Selection marker = parked OSMD playback cursor (coloring a `GraphicalNote` doesn't survive OSMD's per-edit sheet rebuild).
  - [x] Task 3b — duration change. `EditableScore.setDuration(index, {type, dots}) -> boolean` (false = refused, no mutation): rewrites `<type>`/`<dot>`/`<duration>` against the measure's active `<divisions>`, re-fits by absorbing the delta into the following same-voice rest run (grows/inserts a rest when shorter, eats rests when longer, refuses if the bar can't hold it or the value is off-grid). Applies to every chord member; grace notes refused. Toolbar value row + dot toggle, digit keys 1-5 + `.`. Transient refusal notice.
  - [x] Task 3c — key / clef / per-note accidental. `EditableScore` gains `setAccidental(index, alter)` (single notehead, not the chord: rewrites `<pitch><alter>` + `<note><accidental>` in DTD order, `natural` written explicitly, changes sounding pitch), `setKey(index, fifths)` (−7..7, applied to **every part** at the selected note's measure — a key change is global), `setClef(index, {sign, line})` (selected note's part + staff only; `number` attr only when the part declares `<staves>` > 1), plus `keyAt`/`clefAt` readers for the toolbar. UX decision made (human, 2026-08-31): both key and clef act on the **selected note's measure** — bar 1 edits the piece-initial value, a later bar inserts a change from that bar onward. New `findOrCreateAttributes` places a fresh `<attributes>` at measure start (after a leading `<print>`/`<barline location="left">`) with children in DTD order. All ops refuse no-ops / out-of-range without touching the DOM. UI: third toolbar row (accidental buttons ♭♭ ♭ ♮ ♯ ♯♯, key stepper, clef presets Treble/Bass/Alto/Tenor), each via `applyEdit`, active state from the in-effect value. No new keyboard shortcuts (digit keys taken by durations, `handleKeydown` frozen). New `src/lib/musicxml/editableScore.test.ts` (jsdom, 15 tests). New en/es i18n keys.
  - [x] Tasks 4-9 (2026-08-31) — `EditableScore.exportMusicXml()` (declaration + partwise DOCTYPE on top of `serialize()`, 2 tests); save via new `piece/[id]/edit/save/+server.ts` → `POST /library/pieces/{id}/versions` (draft only, no auto submit/approve/distribute — the plan's review-flow note), then `goto` back to the piece page; unsaved-changes guard (`beforeNavigate` `confirm()` + `beforeunload`, both off `dirty`); "Edit music" entry points in the `groups/[id]` Tracks admin panel (when `track.has_music`) and the piece page practice-setup drawer (new `canEditMusic` from `resolve/+server.ts`, same owner/admin rule as the editor route's `load`); en/es keys added, `piece_editor_coming_soon` removed; `check` + `build` + 55-test vitest suite all green.
  - Edit/save/export loop (tasks 1-9) done. **F14 reopened 2026-08-31** — its "play back inside the editor" acceptance criterion was never implemented; now expanded to a full transport + note-preview + full-screen shell. New Claude task list under "**Tasks — Claude (reopened 2026-08-31 …)**" above; resume from the first unchecked one.
  - Reopened checklist: **all Claude tasks done 2026-08-31** across 3 commits — (1) working-score→audio + `MidiPlayer` lifecycle + transport bar + tempo + per-part mix + edit-during-playback; (2) playback cursor + follow-scroll + scroll-to-cursor; (3) note preview + i18n. Shell was `fe2cc95`. `check`/`build`/55-test suite green throughout. Remaining: the **Tasks — Human** real-browser pass (transport/seek/tempo/mix/cursor, edit mid-playback, note-preview-on-select), then check off the acceptance criteria.
  - Known follow-ups from task 2: MIDI-sourced tracks open as a lossy `convertAllParts` approximation (16th-grid quantized rhythm, table-based enharmonics) — a later task may add a "came from MIDI" hint using the returned `sourceFormat`. `parseError` card shows raw detail (`HTTP 500`, parser message) like `ScoreView` does.
  - Working method (from 2026-08-31): tasks built inline in the main session, no subagents; commit + breadcrumb update per task.
- 2026-08-31: **F14 reopened build — all Claude tasks done** (3 commits after the shell `fe2cc95`). (1) In-editor audio: `currentParsedAudio()` memoizes `parseMusicXmlFile(workingXml)` on the exact string, re-parsing only on the next play/seek; `ensurePlayer()` lazy-creates one `MidiPlayer` (reused for preview), `destroy()` in `onDestroy`; a RAF `tick()` mirrors position/playing. `.transport-bar` lifted from the practice player (play/stop, `--fill` scrubber, `formatTime`), a compact `− readout +` tempo stepper in the row, and a right-hand `.mix-panel` drawer with per-part 0..1 sliders (no `everyone/minusMe/mostlyMe` presets — those need a "your part" focus a correction tool has no concept of). Edit-during-playback: an edit only re-serializes; `audioStale` derives true; a hint shows; `syncAudioToModel()` reloads on the next play/seek preserving play state and clamping the resume point. Parse failure / engine-unavailable → disabled transport with a reason. (2) Playback cursor: new `playbackWholeNotes` prop on `EditorScoreView`; one shared OSMD cursor, `placeCursor()` drives it from the audio position while playing (cheap forward walk, `reset()` only on a backward seek) and restores the selection marker on stop; follow-scroll ported and simplified (`.score-container` is itself the scroller), wheel/touchmove disengages, `scrollCursorIntoView()` exported for a transport button. (3) Note preview: `MidiPlayer.previewNote(midi, ms)` on reserved channel 15 (piano program, own volume, releases the prior note, scheduled note-off, re-armed after `load()`); editor previews immediately on click-select and after `transpose`/`setAccidental`, 140 ms debounced on arrow-key nav, never on duration/key/clef. Desktop-first. `check`/`build`/55-test suite green each commit. Next: the human real-browser pass.
- 2026-08-31: **F14 reopened.** Live-testing the editor surfaced that its own "play back inside the editor" acceptance criterion was never implemented — there was no Claude task for it, and the milestone had been treated as code-complete pending only the human live-test. Human asked for the full version: play the working score in the editor with a real transport (play/stop, seek, tempo, per-part SATB+accompaniment mix), preview a note's sound when it's selected or re-pitched, and a focused full-screen shell matching the practice player. Audio path settled without a new engine: `EditableScore.serialize()` → `parseMusicXmlFile()` (already emits `ParsedMIDI`) → the player route's `MidiPlayer`. New Claude task list added under F14; the full-screen shell task is done this session but left uncommitted at the reopen. This pass is desktop-first; a phone layout for the toolbars/mix panel is a follow-up.
- 2026-08-30: Found and fixed a real bug live-testing F13: `getPieceByTitle()` (F10) was preferred *unconditionally* over a real Backend piece's own content in all three places it's used (`/`'s personal library, the group Tracks tab, the guest join page) — so a real, admin-uploaded track that happened to share a title with a bundled fixture (e.g. "Lacrymosa") always played/showed the bundled asset instead, silently ignoring the admin's own music file/PDF/YouTube link. F13 surfaced this concretely: Lacrymosa's real reference-recording link never worked because the app was never actually reaching the real `Piece` it was set on. Fixed by only falling back to the bundled match when the real piece has neither `has_music` nor `has_pdf` of its own — `getPieceByTitle()`'s original intent (a working Practice button for a track with nothing wired up yet), not a permanent override once real content exists.
- 2026-08-30: `piece/[id]`'s back button now does a real `history.back()` when there's history to go back to, landing wherever the human actually came from (a specific group's Tracks tab, its scroll position, admin vs. member view) instead of always the generic library/guest-join page regardless of origin. The old destination-guessing logic (guest join code -> that group; logged-in -> `/`; guest -> `/?guest=1`) stays as the fallback for when there's genuinely nothing to go back to (opened directly, a fresh tab, a deep link).
- 2026-08-30: `/settings/more` brought in line with every other screen — now carries the same `AppHeader`/`BottomNav` chrome (title in the header, brand link home, gear button, bottom nav) instead of its own bare `<main>` with a hand-rolled breadcrumb/`<h1>`; also handles a guest reached via a join code the same way `/settings` itself does (home/footer point back to their group, not a login-gated dashboard). Dropped the redundant "Settings / More" breadcrumb text now that the header already names the page. Removed the "How Divisi works" link/section at the human's request (`more_how_it_works` message key deleted, now unused).
- 2026-08-30: F13 polish, both at the human's direct follow-up after trying it live: the "Audio source" section moved to sit directly under View (was previously its own separately-gated section) and now always renders in PDF view as long as the piece has *any* audio at all — whichever source a given piece doesn't have (no reference recording, or no music file) shows as a `disabled` picker button instead of the whole section disappearing, so it's discoverable rather than silently absent.
- 2026-08-29: Built F11 (PDF markup: freehand pen + stamps), additive alongside F4's annotations per the human's explicit follow-up request after trying them. Found and used a working portable Node install already on this Windows machine (just not on `PATH` for this session) to get real `npm run check`/`build` verification for the first time this session — 0 errors both times, and it caught two real reactivity bugs (`activeStrokePage`/`recentMarkIds` needed `$state`, not plain `let`) before they shipped. Also deployed to the isolated Cloudflare preview Worker (`divisi-frontend-preview...workers.dev`) built against the real production Backend — though the Backend itself isn't deployed with F11's new endpoints yet, so drawing won't actually save/load there until that happens.
- 2026-08-29: Built F4's real annotation UI (create/view/edit/delete/share/unshare, rendered as markers on the score via OSMD's multi-cursor support) — see F4's "Expanded" note. Added one small Backend endpoint along the way (`GET /annotations/{id}/shares`, B5's own note). Confirmed `check`/`build`-clean in the F11 entry above, once real Node tooling was found on this machine — this entry originally shipped hand-reviewed only.
- 2026-08-29: Built F10 (locked down the bundled piece registry), the human's direct follow-up after F9. See F10's own section for the full mechanism/fix. `npm run check` (0 errors)/`build` both clean.
- 2026-08-29: Built F9 (graceful error handling app-wide). See F9's own section. Verified live via a real kill-Backend/restart-Backend cycle in both locales.
- 2026-08-29: Built F8 (Spanish localization). See F8's own section. Not deployed to production; local-only, not clicked through in a real browser. Merged on top of the same-day guest-piece-upload fix below (its `join/[code]/+page.svelte` fix preserved, F8's translations layered on top).
- 2026-08-29: Fixed a real F5 gap: real Backend pieces worked for a logged-in member but were **completely unreachable as a guest** — the guest listing filter, `piece/[id]`'s guest branch, and both file/pdf proxy routes all assumed a member session. Fixed all four (widened the guest filter, added a real guest branch, branched the proxies on `locals.token` presence, threaded the join code through `remotePiece.ts`). Verified live via Playwright (full upload→guest-practice flow, zero JS errors) and via curl against production. Deployed straight to production.
- 2026-08-28: Deployed F7 to production; built `SettingsDrawer.svelte`'s "Change password" section against the Backend's `PUT /auth/me/password`. Stood up an isolated Cloudflare Workers preview so the human could look at F7 before it went live. Verified live via Playwright (human was away and explicitly authorized it for this session — not this project's default).
- 2026-08-28: Built F7 (Weekly Notes tab + guest sign-in banner). Live Playwright pass caught two real bugs no amount of `check`/code-reading would have — see F7's own section for both.
- 2026-08-29: Added a regular weekly rehearsal schedule (F6's "Expanded" note) after the human reported responsibility-date times "not getting stored or reflecting properly" — the Backend round trip checked out exactly right via curl, so this builds the requested "Next rehearsal" quick-fill rather than chasing a bug that didn't reproduce.
- 2026-08-29: Built F5's expanded scope (real piece uploads) on a Windows machine with no browser/Playwright available — see F5's "Expanded" note for what's still unverified because of that. Not deployed; local-only, on top of a fresh `git clone` (two `"`-quoted fixture PDFs couldn't check out on Windows, an OS filename restriction, harmless here).
- 2026-08-28: Deployed a round of live-testing fixes to production: Settings drawer inline "Edit name" + click-to-confirm "Delete account"; admin default-tempo control + `?defaultTempo=` on practice links; two real `ScoreView.svelte` bugs (current-note accent color landing on VexFlow's wrapping `<g>` groups instead of the leaf shapes; cursor-follow scrolling the wrong ancestor); sticky zoom controls; a `PdfView` layout race on reload; a real concurrent-`page.render()` race in `PdfView` (pdf.js throws if you call it twice on the same canvas — now tracks and cancels any in-flight `RenderTask` first); a mobile Safari `font-size: 16px` fix for the iOS zoom-on-focus-in-input trigger. Verified live by the human, not Playwright (project convention).
- 2026-08-28: **Morning summary** — overnight, unsupervised, per explicit direction before bed. Frontend half of Backend B14 shipped to production (register-twice, forgot/reset-password pages, oauth-callback route, conditional OAuth buttons). Repo cleanup: this file gained the "UI/UX conventions" and "iOS app" reference sections, condensed from three now-deleted root-level docs. Two things flagged rather than acted on: a real `ScoreView` zoom-loses-scroll-position bug got fixed, but "cursor following isn't quite right" had no specifics to safely act on; `groups/[id]/+page.svelte` (1000+ lines) flagged as a modularization candidate, deliberately not touched blind overnight — see Backlog.
- 2026-08-28: Frontend half of B14 (account security) built overnight. Also fixed, separate from B14: `ScoreView`'s zoom now keeps roughly the same music in view instead of jumping back near the top (measures the viewport's vertical-center as a fraction of content height before/after `osmd.render()`). The human's other note ("cursor following isn't quite working") had no specifics to act on — left alone rather than guessing, given a real history of cursor-sync bugs.
- 2026-08-28: Deployed F6 plus everything added to it from live testing (settings-as-a-drawer, member role management, responsibility edit/delete, group description, Home's "Upcoming responsibilities"). Chased down a real bug live: "saving page settings reset all the checkmarks" was a one-way `checked={...}` binding with no `bind:` — fixed by making the form driven by real local `$state`.
- 2026-08-28: Built F6 (group page settings + Responsibilities), to catch the Frontend up on Backend B12/B13. Fixed a real correctness gap B12 introduced: `/groups/[id]` and `/home` both called member-facing routes unconditionally, which now 403 a non-admin once their group's admin disables that page — both routes now treat a 403 there as "hide this tab" instead of failing the whole load.
- 2026-08-28: Rewrote F5 after the human questioned its premise directly ("I don't think we need a better renderer do you?"). See F5's own section for the full reasoning. Deleted `src/lib/api/manifest.ts`/`src/lib/server/manifest.ts` (built for the abandoned stems design, never committed, nothing referenced them).
*2026-08-27 condensed 2026-08-30 — the F1-prototype day, ~30 granular entries folded into the summary below. Full detail is in git history.*

- 2026-08-27: **Project started** as a product pivot — iOS app paused in favor of this web app. Chose SvelteKit + shareable join-link guest access; drafted the milestone skeleton, detailed F1–F5, added Backend B6/B7 to feed them. Reprioritized mid-day: prove playback+notation entirely frontend-only first — collapsed the old F2/F3/F4 into one new F1, demoted old F1 (guest access) to F2.
- 2026-08-27: **F1 built and approved** as MVP-done. SvelteKit scaffold; `MIDIParser`/`MusicXMLConverter` ported to TS; `js-synthesizer` (WASM FluidSynth) via vendored `<script>` tags; `playbackMidiBuilder.ts` after finding the dev fixtures put every track on channel 0. Key fixes along the way: moved to `AudioWorkletNodeSynthesizer` (dedicated thread) to stop synth glitches during OSMD re-renders; routed synth output through a real `<audio>` element (the only way iOS grants background/lock-screen playback); a document-wide tempo pre-scan (only one part's MusicXML carries `<sound tempo>`, so others silently ran at 120 BPM); cursor-flicker and solo-mode cursor-scaling fixes; click-to-seek via OSMD's pixel-to-unit hit-testing.
- 2026-08-27: MusicXML importer for "The Challenge of Thor" (its MIDI export has no usable track structure) — extracted the shared voice-part heuristic so both parsers use one implementation. Lyrics wired to the score (`attachLyrics()`); Lacrymosa switched to the MusicXML importer to keep its 341 lyric events.
- 2026-08-27: Mixer/visual model upgraded from fixed Full/Highlighted/Solo to presets + per-track Off/Muted/Active; accompaniment shown as one simplified bass-clef cue staff (known simplification); same-onset notes grouped into MusicXML chords (independent overlapping rhythms still need multi-voice — see Backlog).
- 2026-08-27: Forced PDF-viewer rewrite — mobile Safari's iframe PDF viewer has no toolbar/pinch-zoom at all; replaced with `PdfView.svelte` on `pdfjs-dist` matching the score view's zoom UX. Pinch-to-zoom added to `ScoreView` too.
- 2026-08-27: **F3 built** (app-shell UI from `UX_WIREFRAME.md`, all screens as real routes against fixture data), then **F2** (guest listing, scope narrowed — Backend CORS added), then **F4** (login + groups/home/library wired to the real Backend). UX pass: `AppHeader.svelte`, `BottomNav` → Home | Library | Groups, `/groups/[id]/admin` merged into a Member/Admin toggle, `/groups/new` flow, player drawer renamed "Practice Setup." Real bug fixed via curl: the guest-settings endpoint wasn't a true partial patch.
- 2026-08-27: **Live production bug** — `divisi.maripi.net` 500'd on every Backend route because the deployed build had `PUBLIC_API_BASE_URL=http://localhost:8000` baked in from a local `.env`. The bundled-demo player masked it (zero Backend calls). Added check-only CI (`frontend-ci.yml`); deploys stay manual; the URL fix is a manual build-time step, tracked in Backlog.
