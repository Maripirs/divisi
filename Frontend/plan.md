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

**Status:** F1, F6, F7, F9, F10 fully done and approved. F2/F3/F4/F5/F8 are built and
`check`/`build`-clean but each still has at least one open "human confirms in a real
browser" item — most of this Frontend's recent work was built on a Windows machine
with no browser/Playwright available, so that's the recurring blocker across the
board, not a code gap. See the status table under Milestones.

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

## Backlog

- **F11 fast-follow — group-published markup layer:** an admin publishes their own PDF markup for a piece to the whole group; each member independently toggles "show group markup" on top of their own personal marks (per the human's explicit ask, 2026-08-29). Needs a `published_at`/similar flag on `PieceMarkupMark` (or a parallel table) plus a publish action and a per-viewer visibility toggle — deliberately not built alongside F11 itself, personal-only marks first.
- **F11 fast-follow — import/export markup:** the human's other ask alongside the group layer, also deliberately deferred — no shape decided yet (a portable file format? peer-to-peer copy of one person's marks to another?).
- **Modularize `groups/[id]/+page.svelte`** — well over 1,000 lines, one component covering Homework/Tracks/Members/Responsibilities/Info tabs plus the admin Settings tab. Identified during 2026-08-28's repo cleanup as the Frontend equivalent of the Backend's `schemas.py` split, deliberately not attempted unsupervised — splitting live `$state`/reactive bindings with no way to visually verify a refactor is a real regression risk. A natural split: one child component per tab, each taking its slice of `data` as props, parent keeping just tab selection + `mode`. Do this with the human able to click through it right after.
- Track "last opened piece" server-side, to power a real Home "Continue practice" card (currently fixture/bundled-demo-only)
- Admin default tempo only rides along on the group Tracks tab's and personal Library's practice links so far — the guest join page's practice link doesn't carry `?defaultTempo=` yet since `GuestPieceOut` doesn't expose `default_tempo_bpm`
- Admin's Assignments/Tracks tabs have no edit/delete UI yet (Backend supports `DELETE /homework/{id}`; no equivalent for tracks)
- `/groups/new`'s form only asks for a name — the Backend's `GroupCreate` schema has no fields yet for a description or default-sections checklist
- Preserve fully independent polyphonic notation in the player-generated MusicXML — same-onset notes render as chords now, but truly independent overlapping rhythms on one staff still need a multi-voice representation
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
- 2026-08-27: Found and fixed a real live production bug while investigating "how do we make the good demo experience a robust build": `divisi.maripi.net` 500s on every Backend-touching route because the deployed build was produced with `PUBLIC_API_BASE_URL=http://localhost:8000` baked in from whatever the deploying machine's local `.env` held. The bundled-demo player masked this since it makes zero Backend calls. Added CI (`frontend-ci.yml`, check-only, no secrets needed) but dropped an initial auto-deploy job after the human said deploys should stay manual. The actual production fix is a manual step, tracked in Backlog.
- 2026-08-27: UX pass following `UX_WIREFRAME.md`'s "Implementation Direction" (navigation/brand/naming/redundancy rules) — new `AppHeader.svelte`, `BottomNav` dropped to Home | Library | Groups, merged `/groups/[id]/admin` into `/groups/[id]` as a Member/Admin view toggle, built the previously-missing `/groups/new` flow, relabeled the player's drawer from "Settings" to "Practice Setup." Two follow-up trims from the human's live look: removed `PieceLibrary`'s redundant PDF button and the Theme picker from the player drawer (Theme lives in Settings only).
- 2026-08-27 (Backend, ad hoc): Created the real San Francisco City Chorus group in the local dev Backend and distributed 6 of the 7 bundled pieces to it as real approved+distributed tracks. Added `getPieceByTitle()` so a Backend track whose title matches a bundled piece gets a real working Practice button.
- 2026-08-27: F4 built (login + wire groups/home/library to the Backend), plus F2's guest view extended in the same session — see Backend `B9`/`B10`'s log entries for the paired work. Found and fixed one real bug via live curl testing (not caught by `pytest`): the guest-settings endpoint originally required both fields on every call, which would've forced admins to resend a password just to change anything else — fixed to a true partial patch.
- 2026-08-27: Started F2 (scope narrowed to guest listing only — the player-to-stems wiring backlogged, see F5's later rewrite for why). Added CORS middleware to the Backend. Verified against a real running local Backend, not mocked.
- 2026-08-27: Two follow-ups from the human's first pass over F3: hid annotations app-wide per request (code untouched, just unreferenced, so it's a quick revert once F4 ships them for real); added a "Log out" button to `/settings`. Also fixed a real bug the human caught: new inline `<svg>` icons had no explicit `width`/`height`, so they briefly rendered at the browser's ~300px SVG fallback size before scoped CSS applied.
- 2026-08-27: Fixed the Library page per first-look feedback on F3 — folded three separate stacked links into one page with a Personal section plus one section per real group; deleted the now-redundant standalone `/sfcc` route.
- 2026-08-27: Built the app-shell UI (F3). Produced a low-fidelity wireframe artifact covering all ten screens for human review before writing any app code. Built every screen as a real route against new local fixture data, matching F1's "prove the UI before wiring a backend" precedent.
- 2026-08-27: Score-view gesture/nav polish plus a forced PDF-viewer rewrite: mobile Safari's `<iframe>`-embedded PDF viewer turned out to have no toolbar and no pinch-zoom at all (a platform limitation, not fixable from outside the iframe) — replaced with a new `PdfView.svelte` on `pdfjs-dist`, matching the score view's zoom UX. Also added pinch-to-zoom to `ScoreView`, a "bring me to cursor" button, and fixed a mobile-Safari rubber-band overscroll bug and two view-toggle regressions (OSMD not noticing regained width, cursor styling reverting on resize).
- 2026-08-27: Migrated `player.ts` off `js-synthesizer`'s main-thread `Synthesizer` to its `AudioWorkletNodeSynthesizer` variant (dedicated audio-rendering thread) — the real fix for audible glitches when heavy main-thread work (e.g. a display-mode-triggered OSMD re-render) stalled the synth callback. Done in an isolated worktree; human verified by ear against a real dev server.
- 2026-08-27: F1 approved and closed; moved to F2. The last open acceptance criterion (backgrounded/lock-screen audio) failed on first real-phone test — fixed by rerouting the synth's output through a real `<audio>` element (iOS only grants background execution to genuine `HTMLMediaElement` playback, not plain Web Audio output). Confirmed on a real phone afterward.
- 2026-08-27: Settings/player polish pass plus two real bugfixes found along the way, then human signed off F1 as MVP-done: PDF-vs-player view toggle (both panes stay mounted, switching via CSS visibility, since the earlier `{#if}`-swap version stalled the main thread long enough to audibly glitch the synth); a real MusicXML tempo-parsing bug (only one part's XML stream carries the `<sound tempo>` marking, so every other part was silently timing off a hardcoded 120 BPM default — fixed by seeding every part from one document-wide tempo pre-scan); a cursor-scaling bug in solo mode, fixed per the human's own suggested simplest approach (only scale up when exactly one staff is visible, otherwise leave OSMD's native geometry untouched).
- 2026-08-27: Cleaned up a tangled git-worktree state from the parallel-development period (uncommitted work merged/committed, dead branches deleted, one substantive orphaned change — live tempo control — hand-recovered from a stale patch file rather than lost).
- 2026-08-27: Wired lyrics through to the rendered score (`attachLyrics()` pairs each lyric event to its note by nearest onset). Swapped Lacrymosa to load via the MusicXML importer instead of the MIDI parser specifically to keep its lyrics (its MIDI export had dropped them, its MusicXML export kept all 341 events). Thor still has no digitized lyrics anywhere.
- 2026-08-27: Reorganized fixture/library assets (`static/fixtures/demo/`, `static/fixtures/SFCC/`); gave each library piece separate Player/PDF actions.
- 2026-08-27: Upgraded the mixer/visual model from fixed Full/Highlighted/Solo to presets plus per-track custom state (Off/Muted/Active per part); made muted-staff treatment robust by repainting rendered OSMD staff bands directly rather than relying only on MusicXML note colors; unified score/app theme palette.
- 2026-08-27: Added accompaniment visualization (one simplified bass-clef cue staff) while keeping accompaniment collapsed to one mixer item — not a faithful grand-staff engraving, a known simplification.
- 2026-08-27: Fixed same-onset stacked-note display — `musicXmlConverter.ts` now groups same-start-unit notes into MusicXML chords. Still open: independent overlapping rhythms starting at different times on one staff need real multi-voice MusicXML.
- 2026-08-27: Deployment attempt started then stopped at the human's request (Cloudflare Sites project target created, no version deployed) — current blocker is that Sites packaging expects a Cloudflare-worker-compatible bundle, plain SvelteKit adapter-auto output doesn't match; resume only if the human picks this back up.
- 2026-08-27: Landed the MusicXML importer that "The Challenge of Thor" needed — its MIDI export has no usable track structure for the voice-part heuristic, but its MusicXML export has real per-part structure. Extracted the shared voice-part-assignment heuristic out of the MIDI parser so both parsers use one implementation. Correctness verified two ways: per-part note counts matched a hand-computed expectation from the raw XML exactly, and voice-part ranges came out correctly ordered high→low.
- 2026-08-27: Split Frontend work into git worktrees so the MusicXML importer and UI restructuring could proceed in parallel. Landed the shared `Piece` contract (`src/lib/pieces/{types,registry}.ts`) first.
- 2026-08-27: Redesigned the F1 UI from the bare-functional smoke-test layout to a real designed one (design tokens, card shell, circular play/pause, segmented pickers). Purely visual — no player/sync logic changed. Verified with Playwright at phone and desktop widths, light and dark.
- 2026-08-27: Added click-to-seek (hit-tests OSMD's graphical sheet via its documented pixel-to-unit conversion, seeks to the matched note's timestamp).
- 2026-08-27: Fixed a cursor-flicker bug (an overshooting `next()` step was triggering a full `cursor.reset()` every frame) — fixed by backing off with `cursor.previous()` when a step overshoots the target.
- 2026-08-27: Finished F1's remaining Claude tasks — zoom controls, real `README.md`. Only the human's PlayScore-comparison task remained before F1 was done.
- 2026-08-27: Built and verified a working F1 prototype end-to-end — SvelteKit scaffold, ported `MIDIParser`/`MusicXMLConverter` to TS, `js-synthesizer` (WASM FluidSynth) loaded via vendored `<script>` tags (not npm-imported, per its own bundler-unfriendliness), `playbackMidiBuilder.ts` added after discovering this project's dev fixtures put every MIDI track on channel 0 (would've broken per-part volume). Verified via headless-Chromium Playwright run against the real dev server.
- 2026-08-27: Reprioritized per the human: prove out playback+notation entirely frontend-only first. Collapsed the old F2/F3/F4 drafts into a single new F1. Old F1 (guest access) demoted to F2; old F5 (login+annotations) renumbered to F3.
- 2026-08-27: Detailed F2–F5 (pre-reprioritization) and added Backend B7 (rendering pipeline) to feed them.
- 2026-08-27: Detailed F1 (scaffold + guest access) after deciding on SvelteKit and shareable join-link guest access; added Backend B6 for the join-code endpoints.
- 2026-08-27: Project started as part of a product pivot — Divisi's iOS app paused/backlogged in favor of this web player. Drafted a milestone-name-only skeleton per the human's stated priorities.
