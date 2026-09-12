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
across the board, not a code gap. (Backend B15 and B16 migrations are now live on
prod — Neon is at head `f9d4c1a7b2e8` — so F11 and F20 are no longer deploy-blocked;
the live Frontend Worker was redeployed from `main` on 2026-09-02.) The in-app notation
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
| F2 | Guest access to real pieces via the Backend | ✅ Join flow confirmed in a real browser, incl. a password-protected group (2026-09-02) |
| F3 | App-shell UI screens (fixture data) | ✅ Screens confirmed in a real browser, light + dark (2026-09-02) |
| F4 | Login + wire groups/home/library to the real Backend | ✅ Confirmed in a real browser (2026-09-02): login/redirectTo, real groups/home/library data, homework read+write, score-position annotations create/edit/delete |
| F5 | Wire the player to real Backend pieces (+ real uploads: MIDI/PDF/YouTube) | ⏳ Built and curl/check-verified; nobody has clicked through the actual upload/practice flow yet (no browser on the build machine) |
| F6 | Group page settings + Responsibilities | ✅ Live-app walkthrough done (2026-09-02): page-settings grid, Responsibilities admin/member/guest incl. the 2026-09-01/02 rework, About-tab rehearsal editor |
| F7 | Weekly Notes tab + guest sign-in banner | ✅ Done — Playwright-verified live |
| F8 | Spanish localization (`/es`) | ✅ Clicked through the Spanish UI in a real browser (2026-09-02): nav/drawer/screens, forms + validation, branded 404, language switcher round-trip |
| F9 | Graceful error handling app-wide | ✅ Done — live-verified including a real Backend-down/recovered cycle |
| F10 | Lock down bundled pieces (security fix) | ✅ Done — closed a real hole where 5+ real choir pieces were publicly fetchable with no auth |
| F11 | PDF markup: freehand pen + stamps (piaScore-style) | ⏳ Built, `check`/`build`-clean; Backend not yet deployed to production (new migration), so unusable on the preview until that lands |
| F12 | PDF markup: top-level Annotation mode on/off toggle | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it on a real touchscreen |
| F13 | Audio-only reference recording, driving the bottom bar in PDF view | ⏳ Built, `check`/`build`-clean; human hasn't confirmed it in a real browser |
| — | In-app notation editor + OMR review | Lives on the `omr-editor` branch only (`OMR_EDITOR_PLAN.md`, milestones E1–E10); frontend surface deleted from `main` as unverified WIP |
| F20 | Piece Notes panel — director + personal notes (frontend for Backend B16 + B5) | ⏳ Built (2 sources on the piece page + an expandable Rehearsal Tracks card); guest expansion 2026-09-02 adds a director-only read-only mode on the guest piece page + guest Tracks cards; `check`/`build`/vitest 79 green; no real-browser pass yet |
| F21 | Group markup layer (frontend for Backend B17) | ⏳ Built 2026-09-02 (`e75f79c`), check/build/vitest 70 green; not deployed; no touchscreen pass |
| F22 | PDF cue points — tap to jump the reference recording (frontend for Backend B18) | ⏳ Built 2026-09-02: cue tool + glyph, tap-to-jump, mm:ss edit in the toolbar, hidden under "My mix"; `check` 0 errors, `build` clean, vitest 79 green; not deployed; no touchscreen pass. Tightened 2026-09-02 (human's request): cue tool is Director-layer only (owning-group admin + draw target = Director); personal-cue path dropped, every cue saves `scope='group'`. 2026-09-03 (human's request): cue glyphs now always render in the PDF player for every viewer (members and not-logged-in join-link guests) whenever the audio source is the reference recording, independent of the "Show director markup" toggle; guests read them via a new `GET /guest/{code}/pieces/{id}/cues` (cue-only). Editing unchanged. `check`/`build` clean, vitest 82 |
| F23 | Local profile + "Save across devices" (frontend for Backend B19) | ⏳ Built 2026-09-09: silent local profile, lazy name prompt on guest responsibility self-signup, Settings "Save across devices" (name + PIN), one-time post-signup banner, roster "Unverified" badge, `SAVE_REQUIRED:` inline prompt. `check` 0 errors, `build` clean, vitest 114. Verified 2026-09-11 end to end (signup, save, cross-device merge, the `min_identity` gate) in a real local browser; still no human/phone pass. |
| F24 | Guest chrome cleanup + demo "Preview Admin" entry point | ⏳ Built 2026-09-11: banner removal (`0e47174`) plus the Settings "Preview Admin" entry point (frontend for Backend B20): `demoPreview.ts` store, `/join/[code]/admin-preview` proxy, `divisi_demo_preview` marker cookie, persistent banner + "Exit preview". `check`/`build` clean, vitest 126. Verified end to end locally (docker compose + Playwright); no human pass against the deployed demo yet |
| F27 | Pages tab: custom group pages foundation (frontend for Backend B23) | ⏳ Built 2026-09-11: Pages tab (admin create/publish/unpublish/archive/delete + edit, member/guest read-only), by-slug view routes for member and guest, `carpool_board` renderer shell. `check`/`build` clean, vitest 125. |
| F28 | Carpool board UI (frontend for Backend B24) | ⏳ Built 2026-09-11: event selector, driver/rider lists, owner edit/delete, admin moderation + event create/edit/lock/archive. `check`/`build` clean, vitest 132. Not deployed; no real-browser pass yet. |
| F29 | Guest carpool board: real content + posting (frontend for Backend B25) | ⏳ Built 2026-09-12: `/join/[code]/pages/[slug]` renders real `CarpoolBoard` content for a guest (events/posts via B25's guest reads), `/join/[code]` "Pages" tab discovery, `/join/[code]/carpool/...` proxy routes for guest post create/edit/delete (name prompt, `SAVE_REQUIRED:` inline, cookie round-trip). `check` 0 errors, `build` clean, vitest 138 green (was 132; +6 new). Not deployed; no real-browser pass yet. |
| F30 | Move custom-page create + visibility into Settings, alongside built-in Page Visibility | ✅ Built 2026-09-12: create-page form and per-page publish/archive/delete/edit controls moved from `PagesTab.svelte` into `AboutTab.svelte`'s Settings screen, as two new cards right after the built-in Page Visibility card ("Custom pages" list, then "Create page"). `PagesTab.svelte` is now a pure list (title, status label for admin, "View" link). `check` 0 errors, `build` clean, vitest 138 green (unchanged). |

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

### F2 — Guest access to real pieces via the Backend [x]

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
- [x] Human confirms the join flow (including a password-protected group) in a real browser (2026-09-02)

**Tasks — Claude:**
- [x] `$lib/api/guest.ts`: `listGuestHomework`, password param threaded through `resolveJoinCode`
- [x] `/join/[code]`: password-prompt state on 401, tabbed Homework/Rehearsal Tracks view
- [x] Backend: CORS middleware — no cross-origin allowance existed before this
- [x] Frontend: `PUBLIC_API_BASE_URL` env var, `src/lib/api/guest.ts` typed client
- [x] Routes: `/join` (code-entry form) and `/join/[code]` (resolves the code server-side)
- [x] Wired `/groups`' dead "Join a group with a code" button to `/join`
- [x] Verified against a real local Backend: registered a user, created a group, uploaded/approved/distributed a piece, confirmed the join code resolves correctly for both a valid code and an unknown one via a real SSR network call

**Tasks — Human:**
- [x] Look over `/join` and `/join/[code]` in a real browser — confirmed 2026-09-02

### F3 — App-shell UI screens (fixture data) [x]

Built every screen from `UX_WIREFRAME.md` other than the already-approved practice
player, as real routes against local fixture data — same "prove the UI before wiring
a backend milestone" call F1 made for the player. Started from a low-fidelity
wireframe artifact covering all ten screens, reviewed by the human, before any code
was written.

**Acceptance criteria:**
- [x] Every UX_WIREFRAME.md screen besides the practice player has a real route, styled with the same design tokens as the rest of the app, reachable via the bottom nav / in-page links, not just a direct URL
- [x] All new routes read from local fixture data only (`lib/fixtures/appData.ts`) — no Backend calls added, consistent with F2 not being wired yet
- [x] `npm run check` and `npm run build` both clean
- [x] Human confirms the screens read as intended in a real browser, light and dark (2026-09-02)

**Tasks — Claude:**
- [x] Recolored the flat-black `divisi-logo` source into a CSS-mask asset painted via `background-color: var(--accent)`, so it tracks the live accent token
- [x] `lib/fixtures/appData.ts`: Groups/Homework/Members/Annotations/Settings fixture data
- [x] `lib/styles/shell.css`: shared card/button/tab/list/field/bottom-nav classes
- [x] Routes: `/welcome`, `/home`, `/groups`, `/groups/[id]` (tabbed Homework / Rehearsal Tracks / Members / Info), `/groups/[id]/homework/[hwId]`, `/groups/[id]/admin`, `/groups/[id]/admin/new-homework`, `/settings`
- [x] `AnnotationModal.svelte`: reusable add-annotation sheet, wired from Homework Detail
- [x] `BottomNav.svelte` shared across Home/Library/Groups/Me

**Tasks — Human:**
- [x] Look over the new screens in a real browser (light + dark) — confirmed 2026-09-02, no changes flagged

### F4 — Login + wire groups/home/library to the real Backend [x]

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
- [x] Human confirms login, group browsing, and homework in a real browser (2026-09-02)

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
- [x] Run a real `npm run check`/`build` — done 2026-09-02, 0 errors / build clean
- [x] Open a real Backend piece, place a marker, click through create/edit/delete in a real browser — confirmed 2026-09-02. Share/unshare not explicitly re-confirmed this pass (needs a 2nd account); the underlying endpoints were curl-verified earlier.

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
- [x] A guest who joined via `/join/[code]` can open and fully practice any of that group's distributed pieces the same way, with no login — including a password-protected group's pieces (2026-09-03: closed by the signed httpOnly guest-token cookie, commit `62c2e58`; the token is minted on `/join/[code]/auth` and forwarded by the piece proxy routes, and a cold piece link now shows a password/login gate instead of 404ing)
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
- [x] Look at the built pages (page-settings grid, Responsibilities tab as member/admin/guest) and confirm the UI reads right — live-app walkthrough done 2026-09-02, including the 2026-09-01/02 Responsibilities rework (chip strip + selected-date panel, datetime-local UTC fix, week stepper, coverage meter)

**Expanded 2026-08-29 (regular rehearsal schedule):** admin-editable "Regular
rehearsals" card on the Info/About tab (day + time), shown read-only to
members/guests. The Responsibilities "Add a date"/"Edit date" forms gain a
"Use next rehearsal" button that computes the next upcoming occurrence entirely
client-side. `check`/`build` clean; the weekday math verified with a standalone
script — not clicked through in an actual browser.

- [x] Human: confirm the "Use next rehearsal" button and the About-tab editor look/behave right in a real browser — confirmed 2026-09-02

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

### F8 — Spanish localization (`/es`) [x]

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
- [x] Human click-through of the Spanish UI (menus, forms, the player's Practice Setup drawer, a branded 404, language-switcher round-trip) — done 2026-09-02

**Tasks — Claude:**
- [x] Installed `@inlang/paraglide-js`; `project.inlang/settings.json`, `messages/en.json`/`es.json` (~350 keys)
- [x] `vite.config.ts`, `src/hooks.ts` (new, `reroute`), `src/hooks.server.ts` (composed via `sequence()`), `src/app.html`, `tsconfig.json` (`types: ["node"]` — Paraglide's generated `server.js` needs `async_hooks`)
- [x] New `$lib/i18n.ts` (`lh` helper) and `$lib/components/LanguageSwitcher.svelte`
- [x] Every `.svelte`/`+page.server.ts` (~30 route files + shared components) converted to `m.*()` calls, every internal `href`/`goto`/`redirect` wrapped in `lh(...)`
- [x] Deliberately left untranslated: stored/persisted content an admin types (e.g. a homework `range`'s literal default) — translating those would make content language-dependent at write time
- [x] Verified live via curl against both `build` output and `dev`

**Tasks — Human:**
- [x] Click through the Spanish UI for real (forms, the player drawer, error states) — done 2026-09-02

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
- [x] Deploy the Backend — done (prod Neon at head `f9d4c1a7b2e8`); markup saves/loads against prod now
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

**Expanded 2026-09-02 (guest access to director notes) — built 2026-09-02,
not deployed.** From a guest-vs-member screenshot: guest Rehearsal Tracks
cards had no Piece Notes disclosure at all, while member cards do. Guests
now get the same disclosure with the **From the director** section,
read-only, and the **My notes** section fully omitted (no `+`, no "no notes
yet" line) — a guest has no session for per-member B5 annotations. Same on
the guest piece page: there is no `/join/[code]/piece/[id]` route — the
guest player is `/piece/[id]?guest=1&code=<code>`, so the panel mounts
there in the same `{#if remoteMeta}` block as the member mount.
- [x] `listGuestPieceRehearsalNotes(code, pieceId, { password })` in
  `$lib/api/guest.ts` + a `listGuestGroupNotes` adapter in
  `$lib/api/pieceNotes.ts` that shapes the result as `PieceNote`s
  (`source: 'group'`). Gated Backend-side on the group's `tracks` page
  being `audience: everyone`.
- [x] `PieceNotesPanel` gains a `directorLoader` prop: read-only,
  director-only mode (no add / edit / delete, no My-notes section),
  sourced from the loader not the authenticated client. Mounted on the
  guest track cards (`join/[code]/+page.svelte`, lazy on `<Disclosure>`
  expand) and the guest piece page.
- [x] en/es keys: none new (all reused).
- [ ] Human: guest browser pass — director notes visible + read-only on a
  public-Tracks group, absent otherwise.

### F21 — Group markup layer (frontend for Backend B17) [ ]

Frontend for B17's group-owned markup `scope`. Replaces the stale "F11
fast-follow — group-published markup layer" Backlog item, redesigned: no
publish step, the group layer is shared and any owning-group admin
co-edits it; members see it read-only.

**Restructures F11/F12's visibility control.** Today the PDF markup
"Annotation visibility" segmented picker in Practice Setup is None / Mine /
Group and is *exclusive* — you can't show your own marks and a shared
layer at once, which this needs. And its "Group" option currently loads
*every member's* personal marks (the B17 note explains why that's wrong).

**New shape:**
- Two **independent, session-local** toggles in Practice Setup (PDF view),
  both default off: **Show my markup**, **Show director markup**. Additive.
- The floating pencil (F12 annotation mode) stays. Arming it turns on
  "Show my markup" if it was off.
- When annotation mode is on **and** the user is an admin of the owning
  group, a **Drawing into: My markup / Director markup** segmented control
  appears, defaulting to **My markup** (so an admin never scribbles on the
  shared layer by accident).
- While the draw target is **Director markup**, a **persistent, always-
  visible reminder** (a coloured bar / pill near the toolbar, not a
  dismissible toast) states that edits go to the shared group layer that
  everyone sees. It stays up the whole time that target is active.
- Group-layer marks render in F20's director treatment (muted / dashed
  edge), non-interactive for a member; interactive only for an admin whose
  draw target is Director markup.

**Acceptance criteria:**
- [x] A member on a real group-owned piece's PDF can turn on "Show director
      markup" and see the shared layer read-only, on top of / beside their
      own marks, both toggles working independently
- [x] An owning-group admin can pick "Director markup" as the draw target
      and add / move / edit / delete marks in the shared layer, including
      marks another admin made
- [x] The persistent "editing the shared layer" reminder is visible the
      entire time the draw target is Director markup, and gone otherwise
- [x] A non-admin never sees the draw-target control or a way to write the
      group layer; a personal piece never shows "Show director markup"
- [x] `npm run check` / `npm run build` clean; vitest green
- [ ] Human confirms on a real touchscreen: the two toggles, the admin
      draw-target switch + reminder, and that a member can't edit the
      shared layer

**Tasks — Claude:**
- [x] `$lib/api/pieceMarkup.ts`: `scope` on create; keep `listMarks(pieceId,
      scope)`; drop the dead `MarkupScope = 'mine' | 'group'` exclusivity
      assumptions where they leak into the UI
- [x] `routes/piece/[id]/markup/**`: thread `scope` on POST
- [x] `pdfMarkup.svelte.ts` / `PdfView.svelte` / `PdfMarkupPanel.svelte`:
      replace `markupVisibility` (`none|mine|group`) with `showMine` /
      `showDirector` booleans + `drawTarget` (`mine|director`); load both
      mark sets when their toggle is on; gate `drawTarget` on
      `isOwningGroupAdmin`
- [x] Persistent draw-target reminder element
- [x] `resolve/+server.ts`: generalize F20's `canManagePieceNotes` to an
      `isOwningGroupAdmin` flag (or add alongside) for the piece route
- [x] en/es keys for the toggles, the draw-target control, the reminder
- [x] vitest for the new load/permission branches where practical

**Tasks — Human:**
- [ ] Touchscreen pass per the last acceptance box, against a Backend with
      B17 (needs `main` pushed so B17's migration is live, then a Frontend
      redeploy)

**Built 2026-09-02 (`e75f79c`, not deployed).** `npm run check` 0 errors,
`build` clean, `vitest run` 70 passed. `markupVisibility` replaced by
`showMine` / `showDirector` / `drawTarget`; new pure `markInteractivity` /
`scopeForDrawTarget` helpers (unit-tested); persistent reminder + the
draw-target segmented live in `PdfMarkupPanel`; `resolve/+server.ts`
returns `isOwningGroupAdmin` (alias of `canManagePieceNotes`, so F20 is
untouched). A hidden layer's marks stay in memory and re-show on toggle
with no refetch.

### F22 — PDF cue points: tap to jump the reference recording (frontend for Backend B18) [x]

At the human's request (2026-09-02): while viewing a PDF with a reference
recording, drop "play from here" markers on the page that seek the
reference audio to a timestamp. Different from the score-view cursor (that
is auto-synced to the synth clock); a PDF has no timing, so each cue is a
hand-placed anchor. Depends on **B18** (the `time_ms` column + `kind='cue'`)
and **F21** (scopes, draw-target). Reference-recording-only: a cue's
timestamp is meaningless against "My mix".

**Shape:**
- A **cue** tool in the markup toolbar, Director-layer only: present only
  when the piece has a reference recording (`youtubeUrl`), the audio source
  is the reference, the caller is an owning-group admin, **and** the draw
  target is Director. On "mine" the button is simply hidden (no
  auto-switch). Armed + tap the page = drop a cue at `(page, x, y)`
  capturing the reference player's current `positionMs`, always saved with
  `scope='group'`.
- Render: a small ▶-in-circle at the cue's `(page, x, y)`. **Always visible**
  in PDF view whenever the audio source is the reference recording, for every
  viewer (logged-in members and not-logged-in join-link guests), independent
  of the "Show director markup" toggle. Hidden under "My mix" and in score
  view (a cue's timestamp is meaningless there).
- **Tap a cue** (no annotation mode needed) → the reference player
  `seek(time_ms)` then `play()`. Unchanged for everyone.
- **Edit** a cue's time (mm:ss field) or delete it → needs annotation mode
  + owning-group admin + draw target = Director (F21 group-mark rules).
  Personal cues are no longer a thing on the frontend.

**Built 2026-09-02, not deployed.** Tightened same day at the human's
request: the cue tool is Director-layer only. `cuePlacementAllowed()` in
`pdfMarkupController` gates the toolbar button (via the `canPlaceCue`
getter), `placeCue`, and clears a stuck `tool === 'cue'` from
`setDrawTarget('mine')` / `syncAnnotationModeWithVisibility`. The
`scopeForDrawTarget` / `markInteractivity` pure helpers were left as-is
(a group cue's re-time/delete gate was already admin + annotation mode +
Director). `check` 0 errors, `build` clean, `vitest run` 79 passed. New
controller deps `getReferencePositionMs` /
`canPlaceCue` / `audioSourceIsReference` / `onCueTap`, threaded
`piece/[id]/+page.svelte` -> `PdfView` -> `createPdfMarkupController`. A
null reference playhead saves the cue at `0` (editable afterward) rather
than blocking placement. The cue edit-time UI (an `m:ss` text input + a
delete `×`) lives in `PdfMarkupPanel`'s toolbar, shown only while a cue is
selected in annotation mode and editable by the caller. Cue glyphs opt
back into pointer events (`.cue-mark { pointer-events: auto }`) so a tap
jumps the recording even with annotation mode off. `marksForPage` filters
out cues whenever the audio source isn't the reference recording. The
`markup/**` proxy routes already pass the body through generically, so
`time_ms` flows both ways with no change there.

**Always-visible cues + guest path — 2026-09-03 (human's request).** Cue
glyphs previously only rendered when a viewer manually enabled "Show
director markup" (per-viewer, default off, and unavailable to guests).
Now they render for everyone whenever the bottom-bar audio source is the
reference recording, decoupled from the toggle. A new controller dep
`cueLoader` returns a loader fn (real group piece + reference recording,
member or guest) or `null` (fixture / no reference recording);
`syncCues` loads the cue subset of the group layer into `marks` once,
independent of `syncMarksForVisibility` (which stays gated on
`canMarkup`). `marksForPage`'s per-mark rule moved to a pure
`markVisibleOnPage(mark, {showMine, showDirector, showCues})` helper
(unit-tested): a `cue` is gated only by `showCues`, every other kind
still follows its layer toggle. `PdfMarkupLayer` mounts its SVG when
`markup.cuesVisible` even for a cue-only viewer where `canMarkup` is
false. Editing cues is unchanged (owning-group admin + annotation mode +
Director draw target). Director pen/stamp/text ink is untouched: still
behind the toggle, still members-only. Guests read cues via a new
Backend `GET /guest/{join_code}/pieces/{piece_id}/cues` (cue-only,
`tracks` page enabled + `audience == everyone`, mirrors the guest
rehearsal-notes route); `piece/[id]/markup/+server.ts`'s GET gained a
guest branch (`?code=` + `scope=group`, guest token injected server-side)
matching `notes/+server.ts`. New client fn `listGroupCues(pieceId,
guestCode?)`. `check`/`build` clean, vitest 82.

**Acceptance criteria:**
- [x] On a real group-owned piece's PDF with a reference recording, an
      owning-group admin with draw target = Director can drop a cue
      (`scope='group'`) and tapping it jumps + plays the reference audio
      from that point; the button is hidden on "mine" and for non-admins
- [x] Members / guests tap group cues read-only, can't create/edit
- [x] Cue glyphs render for every viewer (members + not-logged-in join-link
      guests) whenever the audio source is the reference recording,
      independent of the "Show director markup" toggle; guests read them via
      `GET /guest/{code}/pieces/{id}/cues` (cue-only). Director pen/stamp/text
      ink stays behind the toggle and members-only
- [x] Cues are hidden when the audio source is "My mix" and in score view
- [x] Editing a cue's time (mm:ss) requires annotation mode; the value
      round-trips
- [x] `npm run check` / `npm run build` clean; vitest green
- [ ] Human touchscreen pass: as an owning-group admin drop Director cues,
      tap to jump, edit a time, confirm the button is gone on "mine" and
      the cues vanish under "My mix"

**Tasks — Claude:**
- [x] `$lib/api/pieceMarkup.ts`: `kind: 'cue'`, `timeMs` field, carried on
      create (`createCue`); `MarkupMarkPatch.timeMs` -> `time_ms`.
- [x] `routes/piece/[id]/markup/**`: `time_ms` passes through the generic
      proxy body in both directions, no code change needed.
- [x] Cue tool in `PdfMarkupPanel`, gated on `canPlaceCue()` = reference
      recording is the audio source **and** owning-group admin **and** draw
      target = Director; captures the reference player's `positionMs` on
      place.
- [x] `PdfMarkupLayer`: renders the ▶-in-circle glyph; tap handler routes
      to `onCueTap` (a callback from `piece/[id]/+page.svelte`, which owns
      the reference player) for a seek + play.
- [x] Edit-time UI (mm:ss `msToMinSec` / `parseMinSec` helpers, unit-tested).
- [x] en/es keys: `markup_tool_cue`, `markup_cue_jump`, `markup_cue_hint`,
      `markup_cue_time_label`, `markup_cue_time_placeholder`.
- [x] vitest for the format helpers + cue interactivity gating.
- [x] 2026-09-03: always-visible cues + guest path. `cueLoader` dep +
      `syncCues` in `pdfMarkup.svelte.ts`; `markVisibleOnPage` pure helper
      (cue gated only on `showCues`); `PdfMarkupLayer` mounts on
      `markup.cuesVisible`; `listGroupCues` + the `markup/+server.ts` GET
      guest branch; `cueLoader` wired `piece/[id]/+page.svelte` -> `PdfView`.
      vitest +3 for `markVisibleOnPage`.

**Tasks — Human:**
- [ ] Touchscreen pass per the last acceptance box (now also: open the piece
      as a plain member with "Show director markup" off, and as a join-link
      guest, and confirm cue glyphs still show + jump when the reference
      recording is the audio source).

### F23 Local profile + "Save across devices" (frontend for Backend B19) [ ]

*Superseded in part by F25 (2026-09-11, frontend for Backend B21): the
"Save across devices" PIN form described below (Settings, the
name+PIN section) is gone — dropped entirely, no fast-follow. Everything
else here — the local profile itself, the lazy name prompt, the one-time
post-signup banner, the roster badge — stands unchanged; F25 replaces
*how* a returning guest reconnects on a new device (typing the same name,
not a credential) and trims the Settings copy accordingly.*

The account barrier a singer actually hits: they open a join link, can
already play and read everything, then try to save an annotation, check off
homework, or sign up for a responsibility slot, and get bounced to
register. Brainstormed with the human 2026-09-09. Fix: everyone gets a
local profile from the first visit with no prompt, and "Save across
devices" (Settings) is how that becomes a real cross-device account.
Backend counterpart: B19. The conductor authoring path is out of scope
(still a full account).

**Shape:**
- On first visit, generate a local profile: `{ localId (uuid), displayName
  (empty) }` in localStorage. Annotation / homework state and prefs live in
  the client store guests already use; this gives them an owner key and
  makes them durable per device.
- `displayName` is prompted lazily, only at the first action other people
  see (a responsibility signup, or landing on a roster), never up front.
- A shared action sends `localId` to the Backend, which mints the shadow
  participant (B19) and sets its device cookie. Purely local actions
  (annotations, homework checkmarks) never hit the Backend and need no name.
- Settings drawer gains a **Save across devices** section: "You're only on
  this device." plus a Save action. Save = set a name + PIN (email magic
  link is the planned second method; Google was considered and dropped
  2026-09-09), then push the local annotation / homework state up. From
  then on the device is a normal logged-in session.
- One dismissible banner, shown once after the first responsibility signup
  (not on every page, not a modal), linking to that Settings section:
  until they Save, a cache clear wipes their name, annotations, and
  homework progress.

**Two things to confirm at build time:**
1. Where the local annotation / homework store lives today and whether it
   already survives a reload (localStorage vs. in-memory). If in-memory,
   that move is part of this milestone.
   **Resolved 2026-09-09:** there is no guest annotation / homework *write*
   store. Annotations are Backend-only and gated on `canAnnotate`
   (logged-in members); guest homework and PDF markup are read-only views.
   The client stores a guest does touch (`playerDefaults`, per-piece
   `player/persistence`) are already `localStorage`-backed and already
   survive a reload. So nothing in-memory needed migrating; `localProfile`
   just contributes the `localId` owner key for a future guest write path.
2. PIN input UX (length, numeric-only) and whether "name + PIN" reads
   clearly as a credential to a non-technical singer or needs a one-line
   "so you can sign back in on your phone" explanation.
   **Resolved 2026-09-09:** PIN field is `inputmode="numeric"`
   `pattern="[0-9]*"` `minlength=4` `maxlength=8`, client-validated against
   `/^[0-9]{4,8}$/` (matches the Backend's 422 rule), submit disabled until
   valid. Copy spells out the credential: section lead "You're only on this
   device. Add a name and a PIN so you can sign back in on your phone or
   another browser…" plus a help line "4 to 8 digits. You'll enter your
   name and this PIN to sign back in on another device, so pick something
   you'll remember." Final wording still open for the human's browser pass.

**Acceptance criteria:**
- [ ] A brand-new visitor with no session gets a local profile silently;
  annotations and homework checkmarks they make survive a page reload on
  that device with no account.
- [ ] The first responsibility signup prompts for a display name, then
  completes; the name is reused for later shared actions without re-asking.
- [ ] Settings shows "Save across devices" for a local-only profile; after
  Save via the PIN path, the same local annotations / homework are readable
  on a second browser after signing in there with the same name + PIN.
- [ ] The "you're only on this device" banner appears once after the first
  signup, is dismissible, and does not reappear once dismissed or once the
  profile is Saved.
- [ ] A profile that has already been Saved shows a normal account section
  in Settings, not the Save prompt.
- [ ] A shared action on a `min_identity = saved` page surfaces B19's
  "Save your account first" as an inline prompt to Save, not a generic
  failure.
- [x] `npm run check` / `npm run build` clean; vitest green. (`check` 0
  errors, `build` clean, vitest 114 — 2026-09-09.)
- [x] Confirmed 2026-09-11 by Claude, real browser (headless Chromium via
  Playwright, not a human/phone pass): a local docker-compose Backend +
  `npm run dev`, two separate browser contexts simulating two devices.
  Lazy name prompt on first signup, the one-time banner, Save via PIN
  (promote in place), and a second device signing up + saving with the
  *same* name+PIN correctly merging into the first (verified against the
  API, not just the UI: the second device's signup repointed to the
  merged account, its anonymous row deleted). `min_identity = saved` also
  confirmed: a fresh guest's signup attempt surfaced the inline "needs a
  saved account" prompt, reads stayed unaffected. No console/page errors.
  Still open: an actual human pass on a real phone/second physical
  browser (touch input, real network conditions).

**Tasks — Claude:**
- [x] `$lib/localProfile.ts` (plain `.ts`, `svelte/store`-backed like
  `theme.ts` so it stays unit-testable): `localId` + `displayName` +
  `saved`/`signedUp`/`bannerDismissed` flags in `localStorage`
  (`divisi:localProfile`), `setDisplayName`, `ensureLocalId`, `needsName`,
  `shouldShowSignupBanner`, and the mutators, plus pure `parseStoredProfile`.
- [x] Persist the guest annotation / homework store to localStorage keyed
  by `localId` (confirm-at-build item 1). **Finding: there is no guest
  annotation / homework write store to migrate.** Annotations are
  Backend-only and members-only (`canAnnotate`); guest homework and PDF
  markup are read-only. The stores a guest actually uses today
  (`playerDefaults`, per-piece `player/persistence`) are already
  `localStorage`-backed and already survive a reload. Nothing in-memory
  needed moving; the local profile just adds the owner key for when a
  guest write path is built.
- [x] Thread `localId` onto the responsibility self-signup call; add the
  lazy name-prompt step in that flow. New guest signup UI on the
  `/join/[code]` Responsibilities tab (per-role "Sign me up" in
  `ResponsibilityDateCard`'s `roleExtra` slot) → new proxy
  `POST /join/[code]/responsibilities/signups` that mints via B19 and
  threads the `divisi_participant` cookie first-party
  (`$lib/server/participantSession.ts`). Name prompted only when
  `needsName`, then reused silently.
- [x] Settings drawer: "Save across devices" section, name + PIN form
  calling B19's `POST /auth/save` via `/settings?/saveAcrossDevices`
  (forwards the participant cookie, stores the returned bearer token as
  the session, retires the participant cookie).
- [x] On Save, upload the local annotation / homework state (B19 owns the
  merge); on success store the returned session token and drop the local
  profile's "unsaved" state. (Token stored + `markProfileSaved()` +
  `invalidateAll()`; no local write store to push — B19's
  `merge_participant` folds the anon row's server-side annotations /
  signups.)
- [x] The one-time post-signup banner (persist "dismissed" + "saved" flags
  in the same local store).
- [x] Roster / member list: render B19's unverified badge for anonymous
  participants (`MembersTab.svelte`, `GroupMemberOut.is_anonymous`).
- [x] Handle B19's "this page needs a saved account" error on a gated
  shared action as an inline Save prompt (proxy maps the `SAVE_REQUIRED:`
  403 to `{ error: 'save-required' }`; the tab shows an inline "needs a
  saved account" line linking to the Settings Save section).
- [x] en / es keys for the name prompt, the Save section, the banner, the
  badge, the gated-action prompt.
- [x] vitest for the local-profile lifecycle and the `needsName` / gating
  branches (`localProfile.test.ts`, `server/participantSession.test.ts`;
  +32 tests).

**Tasks — Human:**
- [ ] Real-browser pass per the last acceptance box.
- [ ] Decide the PIN UX details (confirm-at-build item 2).

### F24 Guest chrome cleanup + demo "Preview Admin" entry point [x] (human real-browser pass against the deployed demo still pending)

Two asks from the human 2026-09-11 while reviewing the B19/F23 local
walkthrough, bundled since both touch the guest join page's chrome:

1. **Hide the "browsing as a guest" banner.** Done (`0e47174`): removed
   the on-page card entirely. `SettingsDrawer.svelte` already carried the
   same ground for a guest (`settings_guest_note` plus Save across
   devices / Log in / Create account, built for F23) — the banner was a
   second, louder copy of it. The gear icon into Settings is the one way
   in now.
2. **Let the public demo show what Admin looks like, without writing
   anything to the Backend.** Backend half is B20 (built, not deployed):
   `GET /guest/{code}/admin-preview` mints a real session for the demo's
   actual admin account, but a process-wide middleware rejects every
   non-GET request that session makes. No mock admin UI needed on this
   side either — the existing `/groups/[id]` admin screens render as-is
   once the session is set; a failed write just needs to read clearly
   given the Backend's `PREVIEW_READ_ONLY:`-prefixed 403 (most of this
   codebase's actions already forward `BackendApiError.message` straight
   into their visible error slot, so this should mostly show up for free).
   Scoped to the demo group only (confirmed with the human) — a real
   conductor's group never offers this.

**Shape (Preview Admin half):**
- `GuestGroupOut.adminPreviewAvailable` (via `resolve join code` /
  `join/[code]/data`) says whether the group currently being viewed is
  the demo. Thread it into a small store (e.g. `$lib/demoPreview.ts`) the
  globally-mounted `SettingsDrawer` can read, set/cleared by the join
  page as that data resolves.
- Settings drawer, guest section: when the store says the current guest
  group offers it, a distinct "Preview Admin" block (short explainer —
  "See what the conductor's view looks like. Nothing you do here is
  saved." — plus a button), separate from the Save-across-devices form.
- New proxy route (e.g. `/join/[code]/admin-preview/+server.ts`): calls
  the Backend endpoint, gets `{ access_token, group_id }`
  (`AdminPreviewOut`), sets the *normal* session cookie
  (`$lib/server/session.ts`, same as `/auth/save` and the OAuth callback
  do) plus a plain first-party marker cookie (e.g. `divisi_demo_preview`,
  value = the join code, not httpOnly — the app reads it, not just the
  server) so the rest of the app can tell this session apart from a real
  login. Frontend then navigates to `/groups/{group_id}`.
- `hooks.server.ts`: read that marker cookie into `event.locals` alongside
  the existing token resolution, threaded down through the root
  `+layout.server.ts` into `PageData`.
- A slim, persistent, dismiss-proof banner (root layout, only when the
  marker is set): "Demo preview: read-only, nothing you do here is
  saved." plus an "Exit preview" action that clears both cookies and
  redirects to `/join/{code}` (the code comes back out of the marker
  cookie's value).
- Spot-check (not a rebuild) that a `PREVIEW_READ_ONLY:` 403 reads
  acceptably on the highest-visibility admin actions: creating homework,
  a responsibilities admin action (lock/assign), and the group
  page-settings toggle. Patch only the ones where the existing error
  display swallows or mangles the Backend's message.

**Acceptance criteria:**
- [x] The on-page "browsing as a guest" banner is gone from `/join/[code]`;
  Settings still offers Sign in / Create account / Save across devices
  for a guest.
- [x] Settings offers "Preview Admin" only when viewing the one guest
  group the Backend flags as the demo; never for any other group.
- [x] Clicking it lands on that group's real `/groups/{id}` admin view,
  fully populated, indistinguishable from a real admin session for every
  read.
- [x] A persistent banner makes clear this is a read-only preview, with a
  working "Exit preview" back to the guest join page.
- [x] Attempting any write (create/edit/delete anywhere in the admin
  view) fails with a legible message, not a silent no-op or a raw/ugly
  error, and nothing it attempted actually changed (spot-checked against
  the Backend directly, not just "the UI didn't complain").
- [x] `npm run check` / `npm run build` clean; vitest green.
- [ ] Human confirms in a real browser against the deployed demo once
  `DEMO_JOIN_CODE` is set on Render.

**Tasks — Claude:**
- [x] Remove the on-page guest banner, its state, and the two orphaned
  message keys.
- [x] `adminPreviewAvailable` plumbed from the guest data fan-out into a
  small store; Settings drawer's "Preview Admin" block, gated on it.
- [x] `/join/[code]/admin-preview` proxy route: mints the session +
  marker cookie, returns the `group_id` to navigate to.
- [x] `hooks.server.ts` / root `+layout.server.ts`: surface the preview
  marker as `PageData`.
- [x] Persistent preview banner + "Exit preview" action (clears both
  cookies, redirects to `/join/{code}`).
- [x] en / es keys for the explainer, the button, the banner, and "Exit
  preview".
- [x] vitest for the store's gating logic and the marker-cookie
  read/clear helpers.
- [x] Spot-check the three admin flows named above against a locally
  seeded demo-shaped group; patch only where the error display needs it.

**Tasks — Human:**
- [ ] Once satisfied, set `DEMO_JOIN_CODE` on Render (see
  `Backend/plan.md`'s B20 and `DEMO_SETUP.md`'s Step 3 note) and do a
  real-browser pass against the live demo.

### F25 Drop "Save across devices" PIN form, add "is this you?" name-match reconnect (frontend for Backend B21) [x]

Frontend counterpart to Backend B21, decided with the human 2026-09-11: no
real user has ever hit F23's PIN "Save across devices" form, and a group's
join code is already the real gatekeeper, so a typed-name match against
another guest already in that same group is enough friction on its own.
Drops the PIN mechanism entirely rather than reworking it.

**Shape:**
- Settings drawer's guest-state Account section loses the entire name+PIN
  form (state, effect, markup) and shrinks to one line — this device's
  guest identity is local, and joining the same group again elsewhere with
  the same name will offer to reconnect it — plus the unchanged "Create an
  account" / "Log in" buttons. Directly addresses the earlier "this seems
  like too much" feedback on this section.
- The join page's lazy name prompt (`confirmName`, right after a visitor
  types their name for the first shared action) now also calls the new
  `GET /join/[code]/name-matches?name=...` proxy before firing the signup.
  A hit shows an inline "is this you?" step — each candidate by the typed
  name plus its `title` if set else its joined date (mirrors
  `MembersTab.svelte`'s `member.title` convention) — with a "that's not
  me" decline. Confirming threads `claimUserId` into the signup call so
  the Backend folds this device into that existing guest row
  (`merge_participant`, re-validated server-side) instead of minting a
  duplicate; declining (or no match at all) proceeds exactly as before.
  Only checked once, at the first name entry — later signups from the same
  browser already resolve to the right row via the participant cookie.
- `localProfile.ts` drops `saved`/`markProfileSaved()` — there is no
  longer a distinct client-side "saved" state to track. A real
  cross-device account is a separate, ordinary registration, already
  reflected server-side by `user` being non-null after `/auth/me`.
- The one-time post-signup banner keeps its shape (still gated on
  `signedUp && !bannerDismissed`) but drops its "Save across devices"
  button and copy — dismiss is now its only action.
- The `min_identity = saved` inline prompt (unrelated B12/B19 mechanism,
  untouched by B21 itself) now points at registering a real account
  (`settings_create_account`) instead of opening a Settings Save form that
  no longer exists.

**Acceptance criteria:**
- [x] No PIN form anywhere in the UI; Settings' guest-state Account
  section is materially shorter than before.
- [x] A guest typing a name that matches another guest already in that
  specific group is offered "is this you?"; confirming reconnects to that
  row (verified against the Backend: the signup lands on the matched
  user id, the freshly-minted row is gone).
- [x] A brand-new name (or a declined match) signs up exactly as before,
  unaffected.
- [x] `npm run check` / vitest green.

**Tasks — Claude:**
- [x] `localProfile.ts`: removed `saved` from `LocalProfile`,
  `markProfileSaved()`, and `saved`'s part of `shouldShowSignupBanner`;
  `parseStoredProfile` now just drops a stale pre-B21 `saved` field rather
  than surfacing it. `localProfile.test.ts` updated to match.
- [x] `SettingsDrawer.svelte`: removed the `saveName`/`savePin`/
  `savingProfile`/`saveError`/`savePinValid` state, the name-prefill
  `$effect`, and the whole PIN form; guest-state section now just
  `settings_guest_local_note` + the existing account buttons.
- [x] `settings/+page.server.ts`: removed the `saveAcrossDevices` action
  and its now-unused imports.
- [x] New `join/[code]/name-matches/+server.ts` proxy (thin pass-through,
  no cookie involved — mirrors `responsibilities/signups/+server.ts`'s
  `{ ok, ... }` verdict convention).
- [x] `join/[code]/responsibilities/signups/+server.ts`: threads an
  optional `claimUserId` through to the Backend's `claim_user_id`.
- [x] `join/[code]/+page.svelte`: `confirmName` now checks name-matches
  before signing up; new `matchKey`/`matchCandidates`/`pendingSignup`
  state and `confirmMatch`/`declineMatch` handlers; the one-time banner
  and the `min_identity = saved` prompt both stopped referencing the
  removed Save flow.
- [x] en / es: removed `save_action`, `save_only_this_device`,
  `save_name_label`, `save_pin_label`, `save_pin_help`, `save_pin_invalid`,
  `save_done_note`, `save_failed`, `save_enter_name`; added
  `settings_guest_local_note`, `name_match_title`, `name_match_joined`,
  `name_match_confirm`, `name_match_decline`; reworded
  `local_only_banner_body`.
- [x] `npm run check` (0 errors) and vitest (125 passed) both green.

**Tasks — Human:**
- [ ] None.

### F27 — Pages tab: custom group pages foundation (frontend for Backend B23) [x]

Frontend half of B23. Adds a "Pages" tab to the group shell
(`src/routes/groups/[id]/+page.svelte`'s `tabsInOrder`), gated the same
way `responsibilities`/`weeklyNotes` already are — an enabled flag off
`data`, not just a conditionally-imported component.

**Acceptance criteria:**
- [ ] Members see a "Pages" tab listing published custom pages the group
  currently has (empty state when there are none — most groups won't
  have any until F28/carpool ships). **Caveat, see deviations below:**
  the tab and its empty state are wired correctly, but a real (non-admin)
  member can't populate that list yet, since the Backend has no
  member-facing "list" route.
- [x] Admins additionally see drafts, and a "Create page" flow: for now
  the template picker offers exactly one option (Carpool board), plus
  title, visibility (audience/min_identity), and publish/unpublish/
  archive controls — same UI language as the existing group page-
  settings grid (F6), not a new pattern.
- [ ] Guests see published `audience=everyone` pages under the same join
  flow as other guest-visible pages. **Caveat, see deviations below:**
  built as a direct by-slug route instead, since there's no guest list
  route either.
- [x] A read-only page renderer exists but is functionally empty until
  F28 gives `carpool_board` real content — this milestone just needs it
  to render something sane (title + an empty state).
- [x] i18n keys added for every new string, Spanish included (F8).
- [x] `npm run check` / `npm run build` clean; vitest green.

**Tasks — Claude:**
- [x] Add `pages` to the group tab set + nav, gated on whether the group
  has any custom pages to show for the current viewer.
- [x] Admin page list + create-from-template flow (one template option).
- [x] Visibility controls (audience/min_identity), reusing the existing
  group page-settings component rather than a new one.
- [x] Read-only page renderer shell for `carpool_board` (empty state only).
- [x] Guest page route/rendering.
- [x] i18n keys, `/es` included.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-11.** `PagesTab.svelte` (admin create/edit/publish/
unpublish/archive/delete, member/guest read-only list), `CustomPageView.svelte`
(the shared `carpool_board` renderer shell), `actions/customPages.ts`, and
by-slug view routes at `groups/[id]/pages/[slug]` (member, bypassed for
admins same as the Backend's own gate) and `join/[code]/pages/[slug]`
(guest). `+page.server.ts` fetches the admin management list
(`GET .../custom-pages`) for everyone via the existing `fetchPageOrDisabled`
helper, same as `weeklyNotes`/`responsibilities`: it 200s with every status
for an admin and 403s (folded into an empty list) for anyone else.

**Deviations from the spec above:** B23's own admin-only `GET
.../custom-pages` is the *only* list route that exists, there's no
member- or guest-facing "list every published custom page" route, only
the by-slug reads (`GET /groups/{id}/pages/{slug}` and `GET
/guest/{code}/pages/{slug}`), per that route module's own comment ("a
member reaches a specific page by its slug, e.g. from a link an admin
shares"). Two consequences, both flagged as caveats above rather than
silently glossed over:
- A real (non-admin) member's Pages tab reuses the same 403-as-disabled
  fallback every other gated tab already uses, which is architecturally
  correct but means it always renders empty today, regardless of what's
  actually published, until a member-facing list route exists.
- Guest access is a direct route (`/join/[code]/pages/[slug]`) reached by
  a shared link, not a tab inside the main `/join/[code]` view: there's
  nothing there to list from either.

Both gaps are pre-existing in the already-committed Backend (B23), not
something introduced here, and the fix in either case is a small new
Backend route (a published-only list, gated the same way the by-slug
routes already are): reasonable scope for a B24/F28 fast-follow rather
than this milestone, which was told not to touch `Backend/` at all.

The visibility form also includes a `min_identity` control (Anyone, or
Saved accounts only) even though nothing in F27 writes to a custom page
yet: included now per the spec's explicit ask, ready for F28's write gate
to actually enforce it.

**Fast-follow (2026-09-11, same day):** closed the first gap above —
Backend B23's plan.md now has `GET /groups/{group_id}/pages`
(member-gated, published-only). `+page.server.ts` fetches the admin
management list for an admin and this new route for everyone else, so a
real member's Pages tab now actually lists published pages instead of
always rendering empty. The guest-discovery gap (no listing inside
`/join/[code]`, by-slug link only) is unchanged, still a real gap, left
for a future milestone since a guest's join view has no admin to hand it
a slug link in the first place. `npm run check`/`build` clean, vitest 125
green (unchanged count: no new components, just a load-path fix).

### F28 — Carpool board UI (frontend for Backend B24) [x]

Starts once F27 + B24 land.

**Acceptance criteria:**
- [x] Carpool page shows an event selector, driver list, rider list.
- [x] "I can drive" / "I need a ride" forms (name, origin label, seats/
  notes as applicable), no map, no pin picker.
- [x] A member can edit/delete their own post from the list.
- [x] Admin sees moderation actions (hide/delete any post, lock/archive
  event) inline in the same list.
- [x] Usable on mobile at the widths the rest of the group pages already
  target.
- [x] `npm run check` / `npm run build` clean; vitest green.

**Tasks — Claude:**
- [x] Carpool template renderer: event selector + driver/rider lists.
- [x] Post forms (driver/rider), owner edit/delete.
- [x] Admin moderation controls.
- [x] Unit tests for form validation; mobile layout pass.

**Tasks — Human:**
- [ ] Manual browser pass once deployed.

**Deviations / friction against the real B24 API:**
- No "name" field on either post form: `CarpoolPostCreate` has no such
  field at all, `display_name` is always `current_user.name` captured
  server-side at post time. The plan's own acceptance-criteria wording
  ("name, origin label, seats/notes") predates reading the real schema.
- `CarpoolBoard.svelte` (a new `$lib` component) is rendered directly by
  `routes/groups/[id]/pages/[slug]/+page.svelte` in place of
  `CustomPageView.svelte` once `template_key === 'carpool_board'`, rather
  than teaching `CustomPageView` itself the real content: the guest
  counterpart (`/join/[code]/pages/[slug]`) has no Backend carpool routes
  to call at all (reads or writes), so it keeps `CustomPageView`'s
  placeholder unchanged and untouched.
- `CarpoolPostUpdate` (unlike `CarpoolPostCreate`) has no seat-count
  validator, so a driver editing `seats_total` down below their current
  `seats_available` is accepted as-is by the Backend with no consistency
  check; not worked around client-side since it wasn't asked for.
- A post an admin hides disappears from its own owner's list too: the
  Backend's non-admin branch of `GET /carpool/events/{id}/posts` filters
  to `status=open` with no owner-scoped exception on read (only on direct
  edit/delete by id, per that route's own docstring). A member has no way
  to discover or un-hide their own hidden post through this UI as a
  result; flagged here rather than routed around.
- Event lock/unlock/archive: the Backend's one `PATCH` endpoint would also
  accept reopening an archived event, but the UI only ever offers Lock/
  Unlock and a one-way Archive button, matching the acceptance criteria's
  literal "lock/archive" wording rather than exposing every state
  transition the endpoint technically allows.
- `npm run check` 0 errors, `npm run build` clean, vitest 132 (was 125,
  +7 new in `$lib/utils/carpool.test.ts`). Not deployed; no real-browser
  pass yet (Human task above).

### F29 — Guest carpool board: real content + posting (frontend for Backend B25) [x]

Frontend half of B25. The guest page route (`/join/[code]/pages/[slug]`)
currently always renders `CustomPageView`'s empty placeholder for
`carpool_board`, since no guest carpool data or write path existed before
B25. This wires it to the real thing, reusing F23/F25's existing local-
profile/anonymous-participant plumbing rather than building a second one:
`$lib/localProfile.ts`, `$lib/server/participantSession.ts`, the
`divisi_participant` cookie flow, and the pattern
`/join/[code]/responsibilities/signups/+server.ts` already established
for proxying a guest write through to a mint-or-resolve Backend endpoint.

**Acceptance criteria:**
- [x] `/join/[code]/pages/[slug]` renders `CarpoolBoard` (or a guest-
  appropriate variant of it) with real events and driver/rider lists when
  the page is a published, `audience=everyone` carpool page, not the
  placeholder.
- [x] `/join/[code]` (or wherever a guest currently reaches other guest-
  visible pages from) lists this page too, using B25's new guest pages
  list route, so a guest doesn't need a slug link to find it.
- [x] A guest can submit "I can drive" / "I need a ride" the same way a
  member does: same forms, same validation
  (`$lib/utils/carpool.ts`'s existing `driverOfferError`/
  `riderRequestError`), routed through a new
  `/join/[code]/carpool/...` proxy analogous to the existing
  responsibilities-signup one, carrying the local profile's name via
  `display_name`/`local_id` the same way that proxy already does.
- [x] A guest can edit/delete their own post across a page reload (the
  `divisi_participant` cookie round-trips the same way it already does
  for responsibility signups).
- [x] A `min_identity=saved` carpool page shows the existing
  `SAVE_REQUIRED:` inline prompt for a guest attempting to post, not a
  raw error.
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained.

**Tasks — Claude:**
- [x] `/join/[code]/pages/[slug]/+page.server.ts` + `+page.svelte`: load
  real carpool data via the new guest read routes, render `CarpoolBoard`
  instead of `CustomPageView` for `template_key=carpool_board`.
- [x] `/join/[code]/pages/+server.ts` (or wherever the join page's own
  data fan-out lives): add the guest pages list to whatever the join page
  already surfaces as available pages/tabs.
- [x] New proxy route(s) under `/join/[code]/carpool/...` for post
  create/edit/delete, following the responsibilities-signup proxy's
  shape (local profile name, participant cookie, `SAVE_REQUIRED:`
  passthrough).
- [x] Reuse `CarpoolBoard.svelte`'s existing form markup rather than a
  second copy; branch only where the guest path genuinely differs
  (no admin moderation controls, different submit endpoint).

**Tasks — Human:**
- [ ] Manual browser pass once deployed (guest posting flow specifically,
  since B25/F29 is the first place carpool touches unauthenticated
  writes).

**Deviations from this section as originally scoped:**
- No `/join/[code]/pages/+server.ts` was added — the guest pages list is
  fetched from `guestJoin.ts`'s existing fan-out (`loadGuestJoin`, run by
  `/join/[code]/data/+server.ts`) alongside homework/responsibilities/
  weekly notes, and surfaced as a new "Pages" tab on `/join/[code]`
  itself, following that file's existing pattern rather than adding a
  second endpoint.
- `CarpoolBoard.svelte` stays one component (no second copy), but a guest
  render's write controls could not literally reuse the member path's
  `use:enhance`/`?/actionName` form actions: those depend on SvelteKit's
  own action-invocation machinery (a `+page.server.ts` `actions` export),
  which a `+server.ts` proxy route doesn't provide, and is the reason the
  guest responsibility self-signup (F23) isn't a form action either. The
  component instead takes an optional `guest` prop; when set, the same
  markup/CSS renders but each write posts via a plain `fetch` against the
  new proxy routes, with a lazy name prompt and inline `SAVE_REQUIRED`
  notice reusing the join page's existing patterns/copy. Ownership of a
  guest's own post (for showing Edit/Delete) is tracked client-side, by
  remembering each post id this browser successfully created
  (`$lib/utils/carpoolOwnership.ts`, localStorage-backed like
  `localProfile.ts`) — the Backend has no "is this mine" flag on a read,
  and the guest's resolved participant id isn't known until their first
  successful write.
- Two small new i18n keys not enumerated in the plan text:
  `carpool_save_required` and `carpool_guest_action_failed` (a guest-path
  generic retry message covering create/edit/delete alike).

### F30 — Move custom-page create + visibility into Settings, alongside built-in Page Visibility [x]

Human feedback 2026-09-12, looking at the Settings screen's existing
"Page Visibility" card (`AboutTab.svelte`, admin mode: a checkbox +
audience dropdown per built-in page, one shared "Save page settings"
form): custom pages (carpool, and whatever templates follow it) should
live there too, not in a separate admin flow inside the Pages tab. And
"Create page" should move there as well, not stay a Pages-tab-only form.

**Design:** purely a frontend move, no Backend change. `PagesTab.svelte`'s
"Create page" form and per-page admin controls (edit/publish/unpublish/
archive/delete, `EditableCard`) already call actions
(`createCustomPage`, `updateCustomPage`, `publishCustomPage`,
`unpublishCustomPage`, `archiveCustomPage`, `deleteCustomPage`) that are
registered once on the shared `/groups/[id]/+page.server.ts` (`...customPageActions`
spread into `export const actions`), not per-tab, so relocating the
markup from `PagesTab.svelte` into `AboutTab.svelte` needs no server-side
rewiring, both components already receive the same `data`/`form` props.

`PagesTab.svelte` becomes a pure list after the move (same for member and
admin: title, status label for admin, a "View" link), matching how a
built-in page's own tab (Homework, Responsibilities, ...) never carries
its own visibility controls either, those live in Settings only.

The built-in grid's checkbox is a plain boolean; a custom page has three
states (draft/published/archived). Map the checkbox to
draft<->published (checked = published) via the existing publish/
unpublish actions, and keep Archive as a separate explicit action per
row (not foldable into the checkbox) since it's a more final state than
"currently off," matching the distinction `PagesTab.svelte` already drew
between "unpublish" and "archive."

**Acceptance criteria:**
- [x] The Settings screen's Page Visibility area lists custom pages
  alongside the six built-in ones (or in a clearly-labeled adjacent
  section if mixing them into one literal list/form is awkward given the
  different action-per-row vs. one-shared-form shape), each with a
  published/draft toggle and an audience dropdown.
- [x] "Create page" (template picker, title, audience, min_identity) is
  reachable from Settings, not from the Pages tab.
- [x] Archive and delete remain available per custom page, from Settings.
- [x] The Pages tab still shows the list of pages (drafts included for an
  admin, published-only for a member/guest) with a working "View" link,
  but no create/edit/publish/archive/delete controls.
- [x] No Backend route or schema changes.
- [x] `npm run check` / `npm run build` clean; vitest green; i18n key
  parity maintained (reuse existing `pages_*`/`groups_page_visibility*`
  keys where the copy still fits, add new ones only where it doesn't).

**Tasks — Claude:**
- [x] Move the create-page form from `PagesTab.svelte` into
  `AboutTab.svelte`'s admin section.
- [x] Add a per-custom-page visibility row (published/draft toggle,
  audience dropdown, archive/delete) to the same area, reusing
  `EditableCard`/existing action wiring rather than a new pattern.
- [x] Strip `PagesTab.svelte` down to a read-only list.
- [x] i18n: audit which existing keys still read correctly in the new
  location vs. need a Settings-specific variant.

**Tasks — Human:**
- [ ] None expected.

**Built 2026-09-12.** Went with a clearly-labeled adjacent section rather
than folding custom pages into the built-in grid's literal list/form:
the built-in card is one shared form submitted via a single "Save page
settings" button, but each custom page acts through its own per-row
action call (publish/unpublish/archive/delete/update), so a shared save
button made no sense for them. `AboutTab.svelte` gained two new cards
right after the existing Page Visibility card: "Custom pages" (one row
per page in `data.customPages`, admin sees every status) with a
checkbox wired straight to `?/publishCustomPage`/`?/unpublishCustomPage`
(submits on change via `requestSubmit()`, no separate Save button),
Edit (opens the existing `EditableCard` title/audience/min_identity
form, wired to `?/updateCustomPage`/`?/deleteCustomPage`) and Archive
(`?/archiveCustomPage`, hidden once a page is archived, disables the
checkbox instead of letting the toggle re-check an archived page); then
"Create page" (the form, unchanged, moved verbatim). `PagesTab.svelte`
is now title + admin status label + "View" link only.

i18n: reused `pages_*`/`groups_page_visibility*` keys almost entirely
as-is. Added three: `pages_custom_pages` (the new section heading),
`pages_custom_pages_note`, and `pages_no_pages_admin_tab` (the old
`pages_no_pages_admin` says "Create one below," which is only true in
its new Settings home now that the create form moved out of
`PagesTab.svelte`; the Pages tab's own empty state needed different
copy pointing an admin at Settings instead). en/es key counts both
626, in parity.

Verification: `npm run check` 0 errors (13 pre-existing warnings,
unrelated to this change), `npm run build` clean, vitest 138 passed
(unchanged from baseline, no tests targeted this UI directly). Not
browser-exercised (standing blocker); no human pass yet.

## Backlog

- ~~**Persist F12 annotation mode + F13 audio source per piece**~~ **done 2026-09-02** (with the F21/F22 batch). `PersistedSettings` grew `showMineMarkup` / `showDirectorMarkup` / `audioSource` (all optional). "Annotation mode" here = the F21 layer-visibility toggles, not the transient armed-tool state. The toggles persist via a guarded `$effect` in `piece/[id]/+page.svelte` (no page-level setter, same shape as the zoom-persist effect); `audioSource` persists from `setAudioSource` and is restored only when the stored value is `'reference'` **and** the restored `viewMode === 'pdf'` **and** `piece?.youtubeUrl` is set. F4's separate score-marker toggle was out of scope.
- ~~**F11 fast-follow — group-published markup layer**~~ **→ promoted to F21** (2026-09-02), redesigned as a shared group-owned layer any admin co-edits (no per-author publish). See F21.
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
- ~~F23 fast-follow: email magic link as a second Save method~~ — moot: F25/Backend B21 (2026-09-11) dropped the PIN Save mechanism this would have been a second method *for*.
- ~~F23: extra nudges toward "Save across devices"~~ — moot for the same reason; F25 replaced the Settings Save flow with the join page's automatic "is this you?" name-match prompt, which needs no separate nudge.

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

*Condensed 2026-08-29, again 2026-09-02 (entries tightened to 1-3 sentences, superseded runs collapsed to markers). See each milestone's own section above for full acceptance-criteria/task detail; this is a chronological breadcrumb, not a re-narration.*

- 2026-09-11: Built F25 (frontend for Backend B21): dropped F23's "Save across devices" PIN form entirely and replaced it with a join-page "is this you?" name-match reconnect. `localProfile.ts` lost `saved`/`markProfileSaved()` (no client-side "saved" state left to track); Settings drawer's guest Account section shrank to one line plus the existing Create account/Log in buttons. The join page's lazy name prompt now calls a new `/join/[code]/name-matches` proxy (thin pass-through to the Backend's public `GET /guest/{code}/name-matches`) right after a name is first typed; a hit shows candidates (name + title or joined date, mirroring `MembersTab.svelte`'s title convention) with a decline escape hatch, and confirming threads `claimUserId` through `/join/[code]/responsibilities/signups` into the Backend's `merge_participant`. The one-time post-signup banner and the unrelated `min_identity = saved` inline prompt both stopped referencing the removed Save flow (the latter now points at registering a real account instead). `check` 0 errors, vitest 125 green. Not deployed.

- 2026-09-11: F24's "Preview Admin" half built (frontend for Backend B20). `$lib/api/guest.ts`'s `GuestGroup` gained `adminPreviewAvailable` (from `admin_preview_available`); a new `$lib/demoPreview.ts` store (plain `svelte/store`, matching `localProfile.ts`) holds the currently-viewed guest join code + whether it offers preview, set/cleared by `join/[code]/+page.svelte` via an `$effect` on `data.result`. Settings drawer's guest section gained a "Preview Admin" block gated on that store; clicking it posts to a new `/join/[code]/admin-preview` proxy (`app/routes/join/[code]/admin-preview/+server.ts`), which calls the Backend's `GET /guest/{code}/admin-preview`, sets the normal session cookie (`$lib/server/session.ts`) plus a new non-httpOnly `divisi_demo_preview` marker cookie (`$lib/server/demoPreviewSession.ts`), and navigates to `/groups/{group_id}` with `invalidateAll` (needed because the cookie was set via a plain `fetch`, outside SvelteKit's own invalidation tracking, same reason `saveAcrossDevices` calls it). `hooks.server.ts` reads the marker into `locals.demoPreviewJoinCode`, threaded through the root `+layout.server.ts` into `PageData`; the root layout renders a persistent, non-dismissible banner with "Exit preview", which posts to a new `/demo-preview/exit` route that reads the join code back out of the marker cookie, clears both cookies, and redirects to `/join/{code}`. Spot-checked `PREVIEW_READ_ONLY:` 403 legibility on 3 admin flows against a locally seeded demo group (docker compose + a real Playwright walkthrough): the page-settings toggle and homework-creation actions already forwarded `BackendApiError.message` into a visible slot for free; the responsibilities tab's signup/assign and cancel/reinstate forms did not (a silent no-op), so added the missing `form?.error` rendering there (`ResponsibilitiesTab.svelte`). Verified end to end: Settings shows "Preview Admin" only for the Backend-flagged demo group (confirmed absent for a second, non-demo seeded group), the full admin view renders, a blocked page-settings write shows the legible message and left `homework.enabled` unchanged (re-checked via a direct curl with the real admin's own token), and "Exit preview" clears both cookies and lands back on `/join/{code}`. `check` 0 errors, `build` clean, vitest 126 (+12). Not deployed; needs the human's real-browser pass once `DEMO_JOIN_CODE` is set on Render.

- 2026-09-09: F23 built. New `$lib/localProfile.ts` (svelte/store-backed, unit-testable): a silent `localStorage` profile (`localId` + lazy `displayName` + `saved`/`signedUp`/`bannerDismissed` flags) from the first visit. Guest responsibility self-signup is now wired on the `/join/[code]` tab (per-role "Sign me up" via `ResponsibilityDateCard`'s `roleExtra`), through a new `/join/[code]/responsibilities/signups` proxy that mints B19's anonymous participant and re-sets its `divisi_participant` cookie first-party (`$lib/server/participantSession.ts`); the display name is prompted once, then reused. Settings drawer gained a "Save across devices" section (name + numeric PIN → `/settings?/saveAcrossDevices` → B19 `POST /auth/save`, stores the returned bearer as the session). Plus the one-time post-signup banner, the roster "Unverified" badge (`GroupMemberOut.is_anonymous`), and an inline "needs a saved account" prompt for the `SAVE_REQUIRED:` 403. Build-time findings: no guest annotation/homework write store exists to migrate (annotations are members-only, guest homework/markup read-only); PIN is 4-8 digits, `inputmode=numeric`, client-validated. en+es keys added. `check` 0 errors, `build` clean, vitest 114 (+32). Needs a real-browser pass (silent profile, lazy prompt, Save via PIN, same data on a 2nd browser, the banner).

- 2026-09-09: Brainstormed lowering the account barrier with the human (chat only, no code). Guests already read everything, so the wall is the singer's first stateful action. Agreed a local-first identity: a silent local profile (localId + name in localStorage) from the first visit, the Backend mints an anonymous participant on the first shared action, and "Save across devices" in Settings promotes it to a real cross-device account (name + PIN, email magic link later; Google was considered and dropped 2026-09-09). One dismissible post-signup nudge; roster badges unverified participants. Captured as Frontend F23 / Backend B19.

- 2026-09-03: F22 — PDF cue glyphs now always render in the player for every viewer (logged-in members and not-logged-in join-link guests) whenever the audio source is the reference recording, independent of the per-viewer "Show director markup" toggle. New `cueLoader` controller dep + `syncCues` load the cue subset of the group layer unconditionally; `markVisibleOnPage` pure helper gates a `cue` only on `showCues`; `PdfMarkupLayer` mounts its SVG on `markup.cuesVisible` even where `canMarkup` is false. Guests read cues via a new `GET /guest/{code}/pieces/{id}/cues` (cue-only, tracks/everyone gate) behind a `?code=` guest branch added to `piece/[id]/markup/+server.ts`'s GET; new client fn `listGroupCues`. Director pen/stamp/text ink unchanged (toggle-gated, members-only); editing cues unchanged. `check` 0 errors, `build` clean, vitest 82; not browser-exercised (standing blocker).

- 2026-09-03: Wired the Backend's new `Piece.presentation` hint ("Opens as: Auto / Score + reference recording / Play-along mix", set from the Rehearsal Tracks edit panel). Threaded `presentation` through `RemotePieceMeta` / `LibraryEntryOut` / `resolve/+server.ts` (both authed and guest branches) and `buildRemotePiece`. `piece/[id]/+page.svelte` gained `seededPresentation()`: on a first-ever open of a piece carrying the hint, and only when the piece actually has the panes it needs (PDF + reference recording, or a player), it seeds `viewMode`/`audioSource` accordingly; any viewer who has opened the piece before (a persisted settings blob exists) gets the unchanged pane-shape default and `bootstrap()` restores their own pick. `bootstrap()` itself untouched. 5 en+es keys (`groups_presentation_*`, `groups_invalid_presentation`). `check` 0 errors, vitest 79, `build` clean; not browser-exercised (standing blocker).

- 2026-09-02: Responsibilities selected-date panel declutter (reported live: "two Cancel buttons, two delete options, Duplicate does nothing"). The event-state toggle now reads "Cancel date" / "Reinstate date" (new `groups_cancel_date`; `groups_reinstate` reworded) so it stops colliding with the delete-confirm's "Cancel". Delete `ConfirmButton` moved to its own `.delete-row` below the Edit/Lock/Cancel row (its expanded "Delete this date?" prompt had been wrapping into that row and reading as duplicate buttons). "Duplicate next week" now `await tick()` + `scrollIntoView`s the prefilled Add-date form, which renders at the top of the tab, off-screen from where the button lives. Also linked the upcoming-dates strip to the selected-date panel visually: the active chip gets an `inset` accent ring + a downward caret (`::after` diamond) pointing into the roster below, and the panel's card gets a 3px accent top border + accent "Selected date" label, all keyed off `var(--accent)`. The strip itself switched from a wrapping `auto-fill` grid to a single horizontal-scroll flex row (`overflow-x: auto`, fixed 10rem chips, `scroll-snap`), so it stays one row tall however many dates exist. Strip + selected-date roster are now one `.card` (was two): `ResponsibilityDateCard` gained a `flush` prop that drops its own card chrome for embedding. Inside that card the selected date's roster sits in its own accent-outlined, faintly accent-tinted box, and the active chip has a solid accent caret pointing down into it, so chip + roster read as one connected shape (robust under the horizontal scroll — no position math). Dropped the now-redundant "Selected date" eyebrow + whole-date status badge from that box (the outlined box + caret already say "selected", per-role badges + the chip's fill count already say coverage); removed `dateStatusLabel` and the `responsibilities_{selected_heading,badge_empty,badge_needs_people,badge_covered}` keys. Selected-date admin action row slimmed to Edit / Cancel date / Duplicate next week: the standalone delete `ConfirmButton` is gone (delete is already in the Edit panel via `EditableCard`'s built-in confirm-then-delete), and the Lock/Unlock toggle is gone (`groups_{lock,unlock}` keys deleted; `d.locked` still renders on the chip/card and still gates signup, just no longer toggleable from this tab).

- 2026-09-02: Responsibilities dates: resolve the `datetime-local` field to a UTC ISO string on the client (`datetimeLocalToIso` in `dates.ts`, applied in `use:enhance` via a new `EditableCard` `beforeSubmit` hook) instead of in the form action, which runs on Cloudflare's UTC clock and shifted a 7 PM rehearsal to 12:00 for viewers behind UTC (caught live). Also added a ‹ / › week stepper to the quick-add panel (walks the group's weekly slot forward/back, floored at the next occurrence) and an inline delete on the selected date. en+es `responsibilities_quick_add_{prev,next}_week`.

- 2026-09-02: **Cleanup round 2: god-files** (no behaviour change; git `d85eb0c`..`d92054d`, detail there and in the now-deleted root `CLEANUP.md`). Round 1 was duplication-focused; round 2 targeted single-responsibility and file size via helper/action extractions (`score/scoreTreatments.ts`, `player/mixMath.ts` + `player/persistence.ts`, the repo's first custom Svelte action `$lib/actions/pinchZoom.ts`), stateful `.svelte.ts` composables (`player/annotations.svelte.ts`, the `components/pdf/` markup controller), the backend `library.py` → `library/` package split, and (this session) `groups/[id]/+page.server.ts` → per-tab `actions/*.ts` and `groups/[id]/+page.svelte` (2070 → 158 lines) → `tabs/*.svelte`. Markup verified identical against the pre-split files. Deferred: player transport/mix composables, `db/models/` split, further `ResponsibilitiesTab` breakup. `check`/`build` clean, vitest 63; not browser-exercised (standing blocker).

- 2026-09-02: **Pre-push cleanup pass** (no behaviour change). Deleted the throwaway F14 engine spike (`src/lib/spike/musicXmlEdit.ts` + the `/spike/f14-editor` route, which had been shipping to production unguarded); collapsed `resolve/+server.ts`'s two identical `GET /groups` calls into one `resolveOwningGroupRole()`; extracted `Disclosure.svelte` and `$lib/components/score/osmd.ts` for chrome / OSMD-option duplication F20 had introduced. `check` 0 errors, `build` clean, vitest 107.

- 2026-09-02: **F20 built: "Piece Notes"** (frontend for Backend B16, which had shipped backend-only). `PieceNotesPanel.svelte` disclosure with two sections: **From the director** (group-wide, admin-authored via B16's `rehearsal-notes`, members read-only) and **My notes** (per-member private). The personal source is stored as a B5 `Annotation` at the reserved sentinel position `-1` (no new Backend work, and it syncs), so `piece/[id]`'s `loadAnnotations` now filters `positionWholeNotes >= 0` to keep those off the score. Shown on the piece page and in a lazy disclosure on each Rehearsal Tracks card; director section self-hides on 403/404. Same-day iPad follow-ups: Tracks-card controls gated on `mode === 'admin'`, player panel collapsed by default with a capped scroll body, responsive note grid, `pn-`-prefixed classes. Needs a human real-browser pass against a local Backend (B16 not yet deployed).

- 2026-08-31 – 09-01: **In-app notation editor + OMR seam/page review (F14–F19) — designed and built this stretch, later pulled off `main`.** ~25 log entries condensed here. The editor route (`/piece/[id]/edit`), `editableScore.ts`, `EditorScoreView.svelte`, `reviewPages.ts`, the OMR job-alert header (`OmrJobAlerts.svelte` / `omrJobs.svelte.ts` / `/omr` proxies), the Playwright `e2e/` harness, and the throwaway F14 engine spike were all developed on `feat/generate-track-from-pdf`: F14 editor + spike (correction-only OSMD editor on a MusicXML-DOM model) → F15 seam review → F16 working-draft save/publish loop (+ Backend B17) → editor playhead-desync fix + the e2e harness → F17 measures / range-clef mode → F18 undo/redo → F19 page-by-page draft review (+ Backend B18) → code-review fixes. All of it was then deleted from `main` as unverified WIP. That work now lives on the `omr-editor` branch with its own plan (`OMR_EDITOR_PLAN.md`, milestones E1–E10) and its own log; full detail there and in that branch's git history. The dormant Backend OMR code stayed on `main`, UI-unreachable.

- 2026-09-01: Added `.mxl` (compressed MusicXML) upload + playback support. New `$lib/musicxml/mxl.ts` (`isMxl` / `extractMusicXmlText`, backed by `fflate`) follows `META-INF/container.xml` to the rootfile, normalizes the path, strips a BOM, decodes a UTF-16 inner document; wired into `remotePiece.ts`'s `loadRemoteMusicFile` (a corrupt ZIP surfaces as the existing "Malformed MusicXML" failure), `FileSlot.svelte`, and the `groups/[id]` track upload picker. Mirrors the Backend's `app/omr/pipeline.py` handling. vitest +12 (`mxl.test.ts`).

- 2026-09-01: Responsibilities tab: whole-date coverage meter + restructure (no milestone number; built alongside the editor stretch, recorded after the fact). New `coverageTotals(roles)` in `groupCards.ts` rolls per-role needed/active counts into `{ active, needed, openSlots, filledFraction, status }` (`empty`/`underfilled`/`covered`/`overfilled`, no lending of surplus); new `CoverageMeter.svelte` renders the bar. The tab now shows upcoming dates as a compact strip (chip + meter per date) with only the selected date expanded, plus admin quick-adds (New role-set / Add-date / "Duplicate next week" / "Next rehearsal" prefilled from the group's weekly slot). en+es `responsibilities_*`; vitest +6; `check`/`build` clean. Needs the human's confirmation the reconstructed intent is right, and a real-browser pass.
- 2026-08-30: Found and fixed a real bug live-testing F13: `getPieceByTitle()` (F10) was preferred *unconditionally* over a real Backend piece's own content in all three places it is used (the personal library, the group Tracks tab, the guest join page), so a real admin-uploaded track sharing a title with a bundled fixture (e.g. "Lacrymosa") always played the bundled asset and silently ignored the admin's own music/PDF/YouTube link. Fixed to fall back to the bundled match only when the real piece has neither `has_music` nor `has_pdf` of its own, which is `getPieceByTitle()`'s original intent (a working Practice button for a track with nothing wired up yet).
- 2026-08-30: `piece/[id]`'s back button now does a real `history.back()` when there is history, landing where the human actually came from (a specific group's Tracks tab, its scroll position, admin vs. member view). The old destination-guessing logic stays as the fallback for a direct open / fresh tab / deep link.
- 2026-08-30: Brought `/settings/more` in line with every other screen: same `AppHeader`/`BottomNav` chrome instead of its own bare `<main>` + hand-rolled breadcrumb, and the same guest-via-join-code handling as `/settings`. Dropped the redundant breadcrumb text and, at the human's request, the "How Divisi works" section (`more_how_it_works` key deleted).
- 2026-08-30: F13 polish at the human's follow-up after trying it live: the "Audio source" section moved directly under View and now always renders in PDF view whenever the piece has any audio at all, with the missing source shown as a `disabled` picker button instead of the whole section disappearing.
- 2026-08-29: Built F11 (PDF markup: freehand pen + stamps), additive alongside F4's annotations per the human's explicit follow-up. Used a portable Node install already on the Windows machine to get real `npm run check`/`build` verification for the first time this session (0 errors both), which caught two real reactivity bugs (`activeStrokePage`/`recentMarkIds` needed `$state`) before they shipped. Deployed to the isolated Cloudflare preview Worker; drawing won't save/load there until the Backend deploys F11's endpoints.
- 2026-08-29: Built F4's real annotation UI (create/view/edit/delete/share/unshare, rendered as score markers via OSMD's multi-cursor support; see F4's "Expanded" note). Added one small Backend endpoint along the way (`GET /annotations/{id}/shares`). Confirmed `check`/`build`-clean in the F11 entry above once real Node tooling was found; originally shipped hand-reviewed only.
- 2026-08-29: Built F10 (locked down the bundled piece registry), the human's direct follow-up after F9 (see F10's section for the mechanism). `check` 0 errors / `build` clean.
- 2026-08-29: Built F9 (graceful error handling app-wide; see F9's section). Verified live via a real kill-Backend/restart-Backend cycle in both locales.
- 2026-08-29: Built F8 (Spanish localization; see F8's section). Not deployed; local-only, not clicked through in a real browser. Layered on top of the same-day guest-piece-upload fix below.
- 2026-08-29: Fixed a real F5 gap: real Backend pieces were completely unreachable as a guest: the guest listing filter, `piece/[id]`'s guest branch, and both file/pdf proxy routes all assumed a member session. Fixed all four and threaded the join code through `remotePiece.ts`; verified live via Playwright and curl against production, deployed straight to production.
- 2026-08-28: Built and deployed F7 (Weekly Notes tab + guest sign-in banner) to production, with `SettingsDrawer.svelte`'s "Change password" section against the Backend's `PUT /auth/me/password`. Stood up an isolated Cloudflare Workers preview for the human to review first. Live Playwright pass (human away, explicitly authorized) caught two real bugs no amount of `check`/code-reading would have; see F7's section.
- 2026-08-29: Added a regular weekly rehearsal schedule (F6's "Expanded" note) after the human reported responsibility-date times not storing properly; the Backend round trip checked out exactly right via curl, so this builds the requested "Next rehearsal" quick-fill rather than chasing a bug that didn't reproduce.
- 2026-08-29: Built F5's expanded scope (real piece uploads) on a Windows machine with no browser/Playwright: see F5's "Expanded" note for what stays unverified. Not deployed; local-only, on top of a fresh `git clone` (two `"`-quoted fixture PDFs couldn't check out on Windows, harmless here).
- 2026-08-28: Deployed a round of live-testing fixes: Settings-drawer inline "Edit name" + click-to-confirm "Delete account"; admin default-tempo control + `?defaultTempo=` on practice links; several `ScoreView`/`PdfView` rendering bugs (current-note accent landing on VexFlow wrapper `<g>`s not leaf shapes, cursor-follow scrolling the wrong ancestor, a concurrent `page.render()` race in `PdfView`, a reload layout race); sticky zoom controls; a mobile-Safari `font-size: 16px` fix for the iOS zoom-on-input-focus trigger. Verified live by the human (project convention), not Playwright.
- 2026-08-28: **Morning summary**: overnight, unsupervised, per explicit direction. Shipped the Frontend half of Backend B14 to production (register-twice, forgot/reset-password pages, oauth-callback route, conditional OAuth buttons). Repo cleanup: this file gained the "UI/UX conventions" and "iOS app" reference sections, condensed from three now-deleted root docs. Also fixed a real `ScoreView` zoom-loses-scroll-position bug (now measures the viewport's vertical-center as a fraction of content height across `osmd.render()`); flagged `groups/[id]/+page.svelte` (1000+ lines) for modularization and left "cursor following isn't quite right" alone for lack of specifics.
- 2026-08-28: Deployed F6 plus everything added to it from live testing (settings-as-a-drawer, member role management, responsibility edit/delete, group description, Home's "Upcoming responsibilities"). Chased a real bug live: "saving page settings reset all the checkmarks" was a one-way `checked={...}` binding with no `bind:`, fixed by driving the form from real local `$state`.
- 2026-08-28: Built F6 (group page settings + Responsibilities) to catch the Frontend up on Backend B12/B13. Fixed a real gap B12 introduced: `/groups/[id]` and `/home` both called member-facing routes unconditionally, which now 403 a non-admin once their group's admin disables that page; both now treat a 403 there as "hide this tab" rather than failing the whole load.
- 2026-08-28: Rewrote F5 after the human questioned its premise directly ("I don't think we need a better renderer do you?"; see F5's section). Deleted `src/lib/api/manifest.ts` / `src/lib/server/manifest.ts` (built for the abandoned stems design, never committed, unreferenced).
*2026-08-27 condensed 2026-08-30 — the F1-prototype day, ~30 granular entries folded into the summary below. Full detail is in git history.*

- 2026-08-27: **Project started** as a product pivot: the iOS app is paused in favor of this web app. Chose SvelteKit + shareable join-link guest access; drafted the milestone skeleton, detailed F1–F5, added Backend B6/B7. Reprioritized mid-day to prove playback + notation frontend-only first: collapsed the old F2/F3/F4 into one new F1, demoted old F1 (guest access) to F2.
- 2026-08-27: **F1 built and approved** as MVP-done. SvelteKit scaffold; `MIDIParser`/`MusicXMLConverter` ported to TS; WASM FluidSynth via vendored `<script>` tags; `playbackMidiBuilder.ts` after finding the dev fixtures put every track on channel 0. Key fixes: `AudioWorkletNodeSynthesizer` on a dedicated thread to stop synth glitches during OSMD re-renders; synth output routed through a real `<audio>` element (the only way iOS grants background/lock-screen playback); a document-wide tempo pre-scan (only one part's MusicXML carries `<sound tempo>`); cursor-flicker / solo-mode cursor-scaling fixes; click-to-seek via OSMD hit-testing.
- 2026-08-27: Added a MusicXML importer for "The Challenge of Thor" (its MIDI export has no usable track structure); extracted the shared voice-part heuristic so both parsers use one implementation. Wired lyrics to the score (`attachLyrics()`); switched Lacrymosa to the MusicXML importer to keep its 341 lyric events.
- 2026-08-27: Upgraded the mixer/visual model from fixed Full/Highlighted/Solo to presets + per-track Off/Muted/Active; accompaniment shown as one simplified bass-clef cue staff; same-onset notes grouped into MusicXML chords (independent overlapping rhythms still need multi-voice, see Backlog).
- 2026-08-27: Forced a PDF-viewer rewrite: mobile Safari's iframe PDF viewer has no toolbar or pinch-zoom at all; replaced it with `PdfView.svelte` on `pdfjs-dist` matching the score view's zoom UX, and added pinch-to-zoom to `ScoreView` too.
- 2026-08-27: **F3 built** (app-shell UI from `UX_WIREFRAME.md`, all screens as real routes against fixture data), then **F2** (guest listing, scope narrowed, Backend CORS added), then **F4** (login + groups/home/library wired to the real Backend). UX pass: `AppHeader.svelte`, `BottomNav` → Home | Library | Groups, the admin route merged into a Member/Admin toggle, `/groups/new` flow. Real bug fixed via curl: the guest-settings endpoint wasn't a true partial patch.
- 2026-08-27: **Live production bug**: `divisi.maripi.net` 500'd on every Backend route because the deployed build had `PUBLIC_API_BASE_URL=http://localhost:8000` baked in from a local `.env` (the bundled-demo player had masked it with zero Backend calls). Added check-only CI (`frontend-ci.yml`); deploys stay manual; the URL fix is a manual build-time step, tracked in Backlog.
