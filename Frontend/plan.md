# Project Plan: Divisi Frontend (web player)

Separate from `Backend/plan.md` (the API/data model this talks to) and the native
iOS app — **paused/backlogged** as of 2026-08-27 in favor of this web player; see
the condensed "iOS app" section below. Milestones prefixed `F` to avoid clashing
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
all — before spending any effort connecting it to real groups or logins. If the
playback+notation experience isn't genuinely better than PlayScore, nothing else
matters yet.

**Stack:** SvelteKit — lean/compiles-away runtime, good fit for a UI that's mostly
live audio/animation state (sliders, moving cursor) rather than a big component
tree; small bundle matters for a page choir members open on their phones.

**Current milestone:** F5 (wire the player to real Backend-rendered pieces), inserted ahead of F4's remaining annotation work at the human's direction, started 2026-08-27. F2, F3, and F4 all still pending human review.

## UI/UX conventions

Condensed 2026-08-28 from the now-deleted `UX_WIREFRAME.md` (repo cleanup —
its screen mockups were one-time input already built and covered by the Log
below; these are the *standing rules* worth keeping as a reference for
future UI work, since several log entries above and below still cite them
by name).

**Navigation and brand:**
- Divisi is persistent app chrome (top-left `AppHeader` brand), never a
  repeated centered page title
- Global account/settings access lives top-right as the gear button
  (`Settings`) — currently a drawer, see F6's Settings-drawer work below
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

### F1 — Standalone playback + notation prototype [x]

No backend, no accounts — everything driven from a bundled MIDI fixture file (reuse
one of the iOS app's `Fixtures/*.mid`), so the core "is this actually accurate and
pleasant to use" bet gets proven before any wiring work. This merges what were
separately-drafted F2/F3/F4 milestones, since without a backend gating them there's
no real reason to split them yet.

Audio approach for *this milestone only*: client-side MIDI parsing + in-browser
synthesis via the Web Audio API (a WASM soundfont synth, same GM-soundfont concept
as iOS) — not the server-rendered stems originally planned for production (see
Backend `B7`). That was the right call for accuracy at scale, but it requires a
backend, which this milestone deliberately has none of. Revisit stems vs.
in-browser synthesis once this prototype proves the UX out; the sync-accuracy
mechanism (everything scheduled off one `AudioContext` clock) works the same either
way, so nothing here is wasted if the answer changes later.

**Acceptance criteria:**
- [x] Given a bundled fixture MIDI file, the app parses it client-side (voice-part assignment, tempo/time-sig — porting the iOS `MIDIParser` heuristic) and plays it back audibly, all SATB parts + any accompaniment synthesized in-browser
- [x] All parts start in sample-accurate sync and stay in sync for the full piece length — no audible drift by the end
- [x] Play/pause/seek are immediate and accurate, driven off `AudioContext.currentTime` — no polled position readout in the critical path
- [x] Real engraved notation (OSMD) renders with a moving cursor tracking that same clock, no perceptible lag
- [x] Flat/highlighted/solo display modes (full SATB no emphasis / full SATB with chosen part tinted / chosen part only), switchable without ever restarting or repositioning audio
- [x] The score scrolls for pieces longer than one screen, and genuinely zooms in/out (verified by hand in a real browser — the iOS zoom bug was exactly an unverified assumption like this)
- [x] A balance slider per SATB part adjusts that part's volume live during playback, from quieter-than-the-rest through even to louder-than-the-rest
- [x] Audio keeps playing when the browser tab is backgrounded or the phone screen locks — confirmed on a real phone after routing playback through a real `<audio>` element (see log)
- [x] Human confirms it reads as more accurate/pleasant than PlayScore on the same piece, before any Backend/account wiring is invested

**Tasks — Claude:**
- [x] Scaffold SvelteKit project under `Frontend/`
- [x] Port MIDI parsing to TS (`src/lib/midi/parser.ts`, using the `midi-file` npm package rather than hand-rolled byte parsing) — replicates the iOS `MIDIParser`'s track→voice-part heuristic; verified against all 4 real `Fixtures/*.mid` files (note counts/timing/voice-part assignment match)
- [x] Port `MusicXMLConverter`'s quantization/tie/measure-splitting logic to TS (`src/lib/midi/musicXmlConverter.ts`) — verified against the same fixtures (multi-part measure counts equal, highlight coloring correct)
- [x] Client-side synthesis: `js-synthesizer` (WASM FluidSynth) + the same `TimGM6mb.sf2` soundfont the iOS app used
- [x] Web Audio API player (`src/lib/audio/player.ts`) — **architecture changed from the original plan**: instead of one `GainNode` per part, the whole piece is fed to a single FluidSynth player instance (more accurate — sample-scheduled by the synth itself, not hand-timed), and live per-part balance is a MIDI CC7 (channel-volume) message sent to that part's channel. Channel numbers are assigned by a new `playbackMidiBuilder.ts` (0=S/1=A/2=T/3=B) rather than trusting the source file's own channels — needed because the project's own synthetic dev fixtures put every track on channel 0, which would've made per-channel volume control impossible to target; verified via a round-trip (parse → rebuild → re-parse) test against all fixtures. Play/pause/seek read `AudioContext.currentTime` directly, no polling.
- [x] Embed OSMD directly (npm package, no bridge layer needed) in `ScoreView.svelte`, drive the cursor off the shared clock via `requestAnimationFrame` — required disabling SSR for this route (`+page.ts`'s `export const ssr = false`) and dynamically `import()`ing OSMD inside `onMount`, since it's a CJS/DOM-only package that can't be statically imported under SvelteKit's SSR
- [x] Flat/highlighted/solo display-mode picker, wired to the already-ported converter
- [x] Media Session API integration for background/lock-screen playback controls (basic play/pause + metadata)
- [x] Scrolling/zoom: normal page scroll already shows a full multi-system score; added dedicated −/%/+ zoom controls to `ScoreView.svelte` (0.5×–2×, cursor re-shown correctly after each re-render) — verified with Playwright that zoom changes reflow the score (viewBox narrows/height grows as expected)
- [x] `Frontend/README.md` with local-run instructions
- [x] Visual polish pass: replaced the bare-functional layout with a designed one (card shell, light/dark design tokens via `prefers-color-scheme`, segmented pickers, circular play/pause button, filled seek scrubber, collapsible "Mix" balance panel with qualitative +/−% labels) — styling only, no functional changes
- [x] `Piece` registry (`src/lib/pieces/{types,registry}.ts`): a `{id, title, composer, load()}` contract so a library/picker screen (frontend/ui-shell branch) can list pieces without caring which parser produced them
- [x] MusicXML importer (`src/lib/musicxml/parser.ts`) for pieces whose only clean source is a score export — see log for why "The Challenge of Thor" needed this instead of a MIDI-parser fix

**Tasks — Human:**
- [x] Try it end-to-end and compare directly against PlayScore on the same piece; sign off before Backend wiring starts

### F2 — Guest access to real pieces via the Backend [~]

**Depends on Backend B6** (join code + public guest endpoints — built). Swaps F1's
bundled fixture for a real group's actual distributed pieces, reached via a
shareable join link, still no login required. **Scope narrowed 2026-08-27 at the
human's direction**: this milestone now covers only the join-code listing route.
Wiring F1's player itself to the Backend (B7's rendered stems, replacing the
bundled fixture) is backlogged separately — see Backlog.

**Scope extended 2026-08-27** alongside F4: guests now also see a group's homework
(when the admin has opted into that via Backend B10), and a group with an optional
guest password prompts for it. Still no login, and still nothing a guest does writes
anything — every guest call is a plain `GET` against `/guest/*`.

**Acceptance criteria:**
- [x] Visiting a valid join-code URL shows that group's distributed pieces, with no login
- [x] An invalid/unknown join code shows a clear "not found" state, not a crash
- [x] A password-protected group prompts for the password and retries, rather than showing a raw error
- [x] Homework only appears in the guest view for groups that opted into `guest_homework_visible`
- [ ] Human confirms the join flow (including a password-protected group) in a real browser before this is considered done

**Tasks — Claude (added 2026-08-27):**
- [x] `$lib/api/guest.ts`: `listGuestHomework`, password param threaded through `resolveJoinCode`
- [x] `/join/[code]`: password-prompt state on 401, tabbed Homework/Rehearsal Tracks view (Homework tab only rendered when the guest homework call succeeds, i.e. the group opted in)

**Tasks — Claude:**
- [x] Backend: add CORS middleware (`app/main.py`/`app/core/config.py`, `cors_origins` setting) — no cross-origin allowance existed at all before this, so the browser couldn't call the guest API from the Frontend dev origin
- [x] Frontend: `PUBLIC_API_BASE_URL` env var (`.env.example` + local `.env`), `src/lib/api/guest.ts` (typed client for `GET /guest/{code}`, distinguishing a not-found code from other API errors)
- [x] Routes: `/join` (code-entry form) and `/join/[code]` (resolves the code server-side via a `+page.ts` load, renders the group's distributed piece titles or the not-found/server-error/empty states)
- [x] Wired `/groups`' dead "Join a group with a code" button (previously linked to `/`) to `/join`
- [x] Verified against a real local Backend (`docker-compose up postgres` + `alembic upgrade head` + `uvicorn`): registered a user, created a group, uploaded/approved/distributed a piece, confirmed the join code resolves correctly via the running Frontend dev server (SSR fetch, real network call — not mocked) for both a valid code and an unknown one; test data cleaned up after

**Tasks — Human:**
- [ ] Look over `/join` and `/join/[code]` in a real browser before this is considered done

### F3 — App-shell UI screens (fixture data) [?]

Inserted ahead of the old F3 (renumbered F4) at the human's direction: build every
screen from `UX_WIREFRAME.md` other than the already-approved practice player, as
real routes against local fixture data — same "prove the UI before wiring a
backend milestone that hasn't been scoped for these screens yet" call F1 made for
the player. Started from a low-fidelity wireframe artifact covering all ten
screens, reviewed by the human, before any code was written.

**Acceptance criteria:**
- [x] Every UX_WIREFRAME.md screen besides the practice player has a real route, styled with the same design tokens as the rest of the app (`app.css`), reachable via the bottom nav / in-page links, not just a direct URL
- [x] All new routes read from local fixture data only (`lib/fixtures/appData.ts`) — no Backend calls added, consistent with F2 not being wired yet
- [x] `npm run check` and `npm run build` both clean
- [ ] Human confirms the screens read as intended in a real browser, light and dark

**Tasks — Claude:**
- [x] Recolored the flat-black `divisi-logo` source into a CSS-mask asset (`lib/assets/divisi-logo-mask.png`, alpha = inverted source luminance) painted via `background-color: var(--accent)` in a new `Logo.svelte`, so it tracks the live accent token (theme swap, future custom palettes) instead of a color baked into the raster
- [x] `lib/fixtures/appData.ts`: Groups/Homework/Members/Annotations/Settings fixture data
- [x] `lib/styles/shell.css`: shared card/button/tab/list/field/bottom-nav classes for the new screens, built on the existing `app.css` tokens rather than one-off per-route styling
- [x] Routes: `/welcome`, `/home`, `/groups`, `/groups/[id]` (tabbed Homework / Rehearsal Tracks / Members / Info), `/groups/[id]/homework/[hwId]`, `/groups/[id]/admin`, `/groups/[id]/admin/new-homework`, `/settings`
- [x] `AnnotationModal.svelte`: reusable add-annotation sheet (position, note, visibility), wired from Homework Detail's "My annotations" resource — deliberately not wired into the practice player itself, since that screen was signed off as-is this session
- [x] `BottomNav.svelte` shared across Home/Library/Groups/Me; linked in from the pre-existing `/` and `/sfcc` pages so the new screens are reachable from the app, not only by typing a URL

**Tasks — Human:**
- [ ] Look over the new screens in a real browser (light + dark) and flag anything to change before this becomes the real navigation

### F4 — Login + wire groups/home/library to the real Backend [~]

**Scope expanded 2026-08-27** at the human's direction, beyond the original "login +
annotations": also replaces F3's fixture data (`lib/fixtures/appData.ts`) with real
Backend calls for groups, membership/info, homework (new Backend B9, added alongside
this), and "my library" listings. Depends on Backend B2 (auth, already built) and the
new B9 (homework, started alongside this).

**Explicitly still out of scope** (flagged, not silently dropped): actually
*practicing* a real Backend-sourced piece. The player (`/piece/[id]`) only knows how
to load pieces from the bundled `lib/pieces/registry.ts` (parses a local MIDI/
MusicXML file client-side) — a real Backend `Piece` is an uploaded file meant to be
played back via B7's server-rendered stems, a different loading path entirely. That
wiring is the pre-existing Backlog item below ("Wire F1's player to the Backend"),
unchanged by this milestone. Real Backend pieces now show up for real in group/
library listings (title + review status), just without a working Practice button yet.
Home's "Continue practice" card also stays on its existing bundled-demo behavior — no
backend concept for "last opened piece" exists, and building one wasn't in scope for
this milestone (see Backlog).

**Acceptance criteria:**
- [x] A guest can register/log in without losing their place — a `redirectTo` carried through `/login` (from wherever a protected page bounced them) lands them back there, not just at `/home`
- [x] Session stored via an httpOnly cookie through a SvelteKit server route, not `localStorage`
- [x] `/groups`, `/groups/[id]` (Members/Info/Rehearsal Tracks tabs), `/groups/[id]/admin`, and `/home`'s "My groups"/"Due soon" sections read real data from the Backend, not `lib/fixtures/appData.ts`
- [x] Homework tab, homework detail, and "+ Add homework" read/write real data via Backend B9
- [x] The root library (`/`) shows each group's real distributed pieces (title + review status) alongside the existing bundled demo pieces
- [x] Browsing, playback, and customization of the existing bundled/demo pieces remain fully guest-accessible — login is opt-in, never a gate
- [ ] A logged-in user can add an annotation at a position in the score; it's private by default and shareable with a specific peer, matching Backend B5's semantics
- [ ] Human confirms login, group browsing, and homework in a real browser

**Tasks — Claude:**
- [x] Login/register UI (new `/login` route) against Backend B2's endpoints; session via an httpOnly cookie set by a SvelteKit server route (not `localStorage`, to keep the token off the page's JS), read in `hooks.server.ts` for every authenticated `load`
- [x] `src/lib/server/backend.ts`: authenticated server-side fetch helper (attaches the session cookie's token as `Authorization: Bearer`), used from each rewired route's `+page.server.ts`
- [x] Rewire `/groups`, `/groups/[id]`, `/groups/[id]/admin`, `/home`'s groups/due-soon sections off real `/groups` / `/groups/{id}/members` calls
- [x] Rewire Homework tab, homework detail, and "+ Add homework" off the new Backend B9 endpoints
- [x] Rewire `/`'s per-group sections off real `/library/pieces`, filtered to that group, shown read-only (title + status, no Practice/PDF action) until the backlogged player-to-Backend wiring lands
- [x] `/settings`: real logged-in user (name/email) and a real logout (clears the session cookie)
- [ ] Annotation UI: create/view at a score position, reusing the same whole-notes-timestamp position already used for the cursor; respects B5's private-by-default + explicit-share model
- [ ] Share/unshare UI against B5's existing endpoints

### F5 — Wire the player to real Backend pieces (client-side, same pipeline as the bundled demo) [~]

**Rewritten 2026-08-28, replacing the original stems/manifest design below**, after
the human questioned the premise directly: do we actually need a "better" (server-
rendered) player at all? Tracing why B7 (server-rendered stems) existed in the first
place — F1's own log says it was for "accuracy at scale," an assumption that the
in-browser soundfont synth wouldn't sound good enough for production. That premise
was never retested: F1 shipped and was approved specifically *because* the in-browser
synth already sounds good. So the real gap isn't rendering quality — it's that the
already-working client-side player (parse → `ParsedMIDI` → `MidiPlayer` → `ScoreView`)
only knows how to load a bundled static file, never anything from the Backend.

**New scope:** teach the existing player to fetch a real piece's raw source file
(MIDI or MusicXML, whichever it actually is) from the Backend and run it through the
exact same parse/synth/render pipeline already used for every bundled piece — no new
audio engine, no stems, no manifest, no `StemPlayer`. `MidiPlayer`, `ScoreView`, the
mixer/display-mode UI, and per-piece `localStorage` persistence all stay completely
untouched; only *where the bytes come from* changes. B7's rendering pipeline isn't
deleted (it's built, tested, harmless sitting unused) — just no longer something the
Frontend wires up to. Same human direction as before on guest parity: a guest's
experience should be identical to a member's, and guest preferences already never
reach the Backend (confirmed — `playerDefaults.ts` is `localStorage`-only for
everyone, nothing to special-case).

**Small Backend addition needed** (not yet built): a raw-file endpoint, mirroring the
existing manifest endpoints' access gates but skipping `is_midi_file`/rendering
entirely — `GET /library/versions/{id}/file` (authenticated, same
`_require_piece_access` gate as the manifest route) and `GET
/guest/{join_code}/pieces/{piece_id}/file` (guest, same gating as the guest manifest
route) — both just `FileResponse(resolve_source_path(version.file_path))`. Much
smaller than B7's manifest/render-cache machinery.

**Frontend shape:** a new `Piece` implementation (alongside the bundled registry's
static entries) whose `load()` fetches that raw-file URL instead of a bundled static
asset, sniffs MIDI vs. MusicXML by magic bytes (`MThd` → MIDI, else treat as UTF-8
MusicXML text — no new metadata needed from the Backend for this), and calls the
same `parseMidiFile`/`parseMusicXmlFile` either way. Needs `Piece`/`PieceSummary`
(`src/lib/pieces/types.ts`) widened slightly: `pdfUrl` becomes optional (a real
Backend piece has no PDF concept in the data model at all) and `collection` gains a
case for these. Auth handling differs by caller, same as everywhere else in this
app: the guest path fetches straight from the Backend's public origin (CORS already
proven working); the authenticated path goes through a new same-origin proxy route
(`/piece/[id]/file/+server.ts`) that attaches `locals.token` server-side, so the
session token never has to reach client JS.

**Explicitly out of scope, unchanged from the original plan:** live tempo control
isn't affected either way — it was never actually blocked on this, since the
in-browser synth (not a pre-rendered stem) is what's driving playback regardless of
where the source file came from.

**Acceptance criteria:**
- [ ] A logged-in group member can open a real Backend-distributed piece from `/groups/[id]`'s Rehearsal Tracks tab or `/`'s per-group section and hear it play, in sync, for the whole piece's length — same accuracy bar as the bundled demo, because it's the same player
- [ ] The same piece's notation renders with a moving cursor, using the existing `musicXmlConverter`/`ScoreView` path unchanged
- [ ] The existing per-part balance/mute controls, display modes, and tempo slider all work against a real Backend piece exactly like they do against the bundled demo — no piece-source-specific UI branching visible to the user
- [ ] A guest who joined via `/join/[code]` can open and fully practice any of that group's distributed pieces the same way, with no login — including a password-protected group's pieces, once the password's already been accepted
- [ ] A real Backend piece whose title happens to match a bundled registry entry (the existing `getPieceByTitle()` path) still resolves to the bundled asset, not a redundant Backend fetch — no behavior change for that case
- [ ] `npm run check` and `npm run build` both clean
- [ ] Human confirms a real distributed piece sounds and looks right, played both as a logged-in member and as a guest via a join code

**Tasks — Claude:**
- [ ] Backend: `GET /library/versions/{id}/file` and `GET /guest/{join_code}/pieces/{piece_id}/file` — raw source file, same access gates as the existing manifest routes, no rendering
- [ ] `src/lib/pieces/types.ts`: widen `pdfUrl` to optional, extend `collection` for a real-Backend-piece case
- [ ] New `Piece` factory (e.g. `src/lib/pieces/remotePiece.ts`) whose `load()` fetches raw bytes from a given URL, sniffs MIDI (`MThd` magic bytes) vs. MusicXML, and parses with the existing `parseMidiFile`/`parseMusicXmlFile` — no new audio/rendering code at all
- [ ] `/piece/[id]/file/+server.ts` (new): authenticated proxy — attaches `locals.token`, forwards to the Backend's versions/file route, streams the response back
- [ ] `/piece/[id]/+page.server.ts` (new): resolves whether `data.id` is a bundled registry id (unchanged path) or a real Backend piece belonging to one of the user's groups (via the existing `/library/pieces` listing, already used elsewhere) — if the latter and no bundled title match, constructs a remote `Piece` pointed at the new proxy route
- [ ] New guest route `/join/[code]/piece/[id]`: resolves a remote `Piece` from the guest raw-file endpoint directly (client-side fetch, no proxy needed — no auth to protect); reuses the existing player UI rather than duplicating it (share the component; the guest load just produces the same `Piece`-shaped data the existing route already consumes)
- [ ] Wire real "Play" links: `/groups/[id]`'s Rehearsal Tracks tab and `/`'s per-group sections point a real Backend piece at `/piece/[id]` instead of "Practice not wired up yet"; `/join/[code]`'s Rehearsal Tracks tab gets a real per-piece link to `/join/[code]/piece/[id]`
- [ ] Verify against the real live Backend (`divisi.onrender.com`, not mocked): open a real distributed piece with a MIDI source (e.g. one of the two `Fixtures/*.mid`-backed pieces) both as the owning member and as a guest via its join code

**Tasks — Human:**
- [ ] Listen to a real distributed piece played through this path (both as a member and as a guest) and confirm it sounds right — should be indistinguishable from the bundled demo, since it's the exact same player

**Expanded 2026-08-29 (real piece uploads — MIDI/MusicXML + PDF + reference audio),
built on a Windows machine with no browser/Playwright available in that
environment** — everything below is `npm run check`/`build`-verified and
Backend-curl-verified end to end, but the actual in-app interaction (upload
form, player/PDF toggle, YouTube embed) has **not** been clicked through by
a human or Playwright yet. Treat this expansion's own acceptance criteria
as unverified until someone actually does that.

- [x] `src/lib/pieces/types.ts`: `pdfUrl`/`load` both optional now, `collection` gained `'group'`, added `youtubeUrl`
- [x] `src/lib/pieces/remotePiece.ts`: builds a `Piece` from Backend metadata — `pdfUrl` only when `has_pdf`, `load` only when `has_music`
- [x] `/piece/[id]/file/+server.ts` and `.../pdf/+server.ts`: authenticated proxies, resolve the piece's current version via `/library/pieces` first
- [x] `/piece/[id]/+page.server.ts`: resolves bundled-registry vs. real Backend piece via `/library/pieces`; returns `remote: null` (falls back to bundled-only, unchanged) for a guest with no session, since this route is also reached via join-code links with no `locals.token`
- [x] `/piece/[id]/+page.svelte`: player/PDF panes and the View-mode toggle are now conditional on `hasPlayer`/`hasPdfPane` — a piece with just one of the two skips the toggle and shows that view directly; a stored `viewMode` from before can no longer select a pane the current piece doesn't have. YouTube embed (`<details>` disclosure, not gated behind the toggle) shows whenever `youtubeUrl` is set.
- [x] `/groups/[id]/+page.svelte` + `+page.server.ts`: admin-only click-to-reveal upload form (Name/Author/Music file/PDF/Default tempo/YouTube) on the Tracks tab, `uploadTrack` action posts multipart directly (not through `backendFetch`, which force-sets a JSON `Content-Type`) and chains submit→approve→distribute; a track's Practice link now works for any track with `has_music`/`has_pdf`, not just ones title-matching a bundled fixture
- [ ] Guest-side wiring for genuinely-new real pieces (PDF/music-file/YouTube via join code) — deliberately **not** built this pass; the Backend's guest file/pdf routes exist and are tested, but `/join/[code]` still only resolves pieces via the old bundled-title-match path, same as before this expansion
- [ ] A human (or Playwright) actually clicking through: upload a track, open it as a member, confirm the right view(s) show for music-only/PDF-only/both, confirm the YouTube embed renders, confirm a PDF-only piece has no dead Practice Setup menu
- Storage stays local-disk this pass (see `Backend/plan.md`'s Backlog) — same already-documented ephemeral-disk limitation as every other upload, not a new regression

### F6 — Group page settings + Responsibilities [?]

**Backend-driven, independent of F5's in-progress work above** (different concern —
group/admin surface, not the player) — the Backend's B12 (per-page group settings,
replacing the old single `guest_homework_visible` flag) and B13 (Responsibilities:
admin-run volunteer signup sheets) shipped with no Frontend wiring at all. Brings
both over.

**Acceptance criteria:**
- [x] Group admin's Settings tab shows all 5 pages (Homework, Rehearsal Tracks,
  Members, About, Responsibilities) with independent enabled/audience
  (members-only vs. everyone) controls, replacing the old single "show homework to
  guests" checkbox
- [x] A member whose group has a page disabled just doesn't see that tab, instead of
  the whole group page (or Home, which aggregates homework across groups) failing —
  a real gap B12 introduced (its member-facing routes now 403 a non-admin once a
  page's disabled, and neither `/groups/[id]` nor `/home` was written expecting
  that)
- [x] A group's Responsibilities tab lets a member see upcoming dates with per-role
  coverage and sign up/remove their own signup (blocked once a date's locked or
  canceled); an admin can additionally create schedules + roles, add dates,
  lock/cancel dates, and assign/remove any member's signup
- [x] Guests (via `/join/[code]`) see a read-only Responsibilities tab (coverage
  only, no names) when a group's admin opted it into `audience: everyone` — same
  shape as the existing guest Homework tab
- [x] `npm run check` and `npm run build` both clean

**Tasks — Claude:**
- [x] `backendTypes.ts`: dropped `GroupOut.guest_homework_visible` (Backend removed
  the column); added `GroupPage`/`PageAudience`/`GroupPageSettingOut` and the
  `Responsibility*` types
- [x] `$lib/api/guest.ts`: `listGuestResponsibilityDates()`, same
  "404 means not exposed to guests" convention as `listGuestHomework`
- [x] `/groups/[id]/+page.server.ts`: `fetchPageOrDisabled()` wraps the
  homework/members/responsibilities fetches so a disabled page just hides its tab;
  admin-only fetch of `page-settings` + `responsibilities/schedules`; new actions
  `updatePageSettings`, `createResponsibilitySchedule`, `addResponsibilityDate`,
  `updateResponsibilityDate` (lock/cancel), `signUpResponsibility`,
  `removeResponsibilitySignup`; `updateGuestSettings` narrowed to just the password
  now that visibility lives in `updatePageSettings`
- [x] `/groups/[id]/+page.svelte`: 5th "Responsibilities" tab (member + admin
  views); admin Settings tab's page-visibility grid; tab bar now filters to what's
  actually visible per `data.*Enabled`
- [x] `/home/+page.server.ts`: same disabled-page guard as the group page, since it
  independently fetches each group's homework
- [x] `/join/[code]/+page.ts` + `+page.svelte`: guest Responsibilities tab
  (read-only coverage, no sign-up action — the guest route returns no signup
  identities)
- [x] Ad hoc fixes from live look at the group page: Rehearsal Tracks now uses the
  same circle-play icon button as the personal Library instead of a text "Practice"
  button, and hides version status from members (admin-only); the personal Library
  now hides tracks with no practice file wired up instead of listing them as a dead
  "not wired up" card, matching the group page's own member-view behavior

**Tasks — Human:**
- [ ] Look at the built pages (page-settings grid, Responsibilities tab as member/
  admin/guest) and confirm the UI reads right — no live-app walkthrough done this
  pass, `npm run check`/`build` only

**Expanded 2026-08-29 (regular rehearsal schedule):** admin-editable "Regular
rehearsals" card on the Info/About tab (day + `<input type="time">`, e.g.
"Wednesdays at 7:00 PM"), shown read-only to members/guests in the same
tab's info card. The Responsibilities "Add a date"/"Edit date" forms gain a
"Use next rehearsal" button that computes the next upcoming occurrence
entirely client-side (against the browser's own local clock — no timezone
round trip, matching how the existing `datetime-local` inputs already
behave) and fills the date field with it. New `?/updateRehearsalSchedule`
action. `npm run check` (0 errors, same warning pattern the file's other
`*Draft` seed-from-prop `$state`s already trigger)/`build` both clean; the
weekday math itself verified with a standalone script covering "today is
the day, time hasn't passed", "today is the day, time already passed"
(correctly rolls to next week), and two different target weekdays — not
clicked through in an actual browser (same no-browser-on-Windows
limitation as F5's expansion above).

- [ ] Human: confirm the "Use next rehearsal" button and the About-tab
  editor actually look/behave right in a real browser

### F7 — Weekly Notes tab + guest sign-in banner [?]

Two asks direct from the human: (1) a 6th group page, "Weekly Notes" — dated
bulletin entries (title/body/"week of" date) admins post, members read, with
full history rather than one running note; (2) a dismissible banner on
`/join/[code]` nudging anonymous guests to sign in. Weekly Notes reuses B12's
per-page `enabled`/`audience` machinery exactly (see F6) — same default
(members-only, admin can open to guests), same guest-route "404 means not
exposed" convention.

**Acceptance criteria:**
- [x] Group admin can post/edit/delete dated notes from a new "Weekly Notes"
  tab; members see them read-only, newest first
- [x] The new page shows up in the admin Settings page-visibility grid
  alongside the other 5, independently enabled/audience-controlled
- [x] Guests (`/join/[code]`) see a read-only Weekly Notes tab only when the
  admin opted it into `audience: everyone`
- [x] `/join/[code]` shows a dismissible banner (guests only) pointing at
  `/login?redirectTo=/join/{code}`; dismissal doesn't persist (guests aren't
  tracked, so it reappears each visit, per the human's explicit call)
- [x] `npm run check`/`build` clean; verified live via Playwright (human was
  away from their computer and explicitly authorized it for this session —
  not this project's default, see memory)

**Tasks — Claude:**
- [x] Backend: `WeeklyNote` model + migration (chains off `a7e2c9f4b3d8`,
  seeds a `weekly_notes` `GroupPageSettings` row per existing group);
  `GroupPage.weekly_notes` added to `DEFAULT_AUDIENCE`; new
  `app/api/routes/weekly_notes.py` (create/list/edit/delete, mirrors
  `homework.py` + `groups.py`'s `update_description` full-replace shape for
  the PUT homework never needed); guest route on `guest.py`. 120/120
  `pytest`; `alembic upgrade head`/`downgrade -1`/`upgrade head` clean
  against the real Postgres container; a live curl round trip against the
  running local Backend (create → member 403 → list → guest 404-by-default →
  guest visible after toggle → edit → delete).
- [x] Frontend: `backendTypes.ts`/`$lib/api/guest.ts` gained `WeeklyNoteOut`/
  `GuestWeeklyNote`; `/groups/[id]/+page.server.ts` + `+page.svelte`: 6th tab,
  three new actions, `PAGE_LABELS`/`PAGE_ORDER` extended; `/join/[code]`:
  guest tab + the sign-in banner (no new component — `.card.card--highlight`,
  matching the codebase's existing inline-`$state` convention over
  componentizing one-off UI).
- [x] Two real bugs caught live via Playwright, not just `npm run check`
  (neither would have been caught by type-checking or a code read):
  1. **Page-visibility toggles visually "reset" after saving, for real this
     time.** A prior session (see this file's own 2026-08-28 log entry
     below) found and fixed *one* real cause (`bind:` vs a one-way
     `checked={...}`) but a second, independent cause was still live in
     production: SvelteKit's `use:enhance` default `update()` behavior
     calls the native `form.reset()` on every successful submit — harmless
     for a "type something, submit, clear it" form, but wrong for this one,
     which stays visible after saving. A native reset snaps every
     checkbox/select back to its bare-markup default (unchecked / first
     option) without going through Svelte's own reactivity (`bind:` never
     fires, so `pageSettingsDraft` itself — and the actually-saved data —
     was never wrong, only the display). Confirmed via the Backend's own
     `GET /page-settings` mid-repro: real data was correct throughout, this
     was 100% a display bug. Fixed with `update({ reset: false })`.
  2. **`note_date` displayed a day early.** `formatDate` converts to local
     time; `note_date` is a date-only value with no time-of-day meaning,
     round-tripped as UTC midnight — any timezone behind UTC rolled the
     display back a calendar day (a Sept 1 note showed "Aug 31"). New
     `formatNoteDate` pins the display to UTC (`Intl`'s `timeZone: 'UTC'`
     option) instead.
- [x] Local dev fix, unrelated to the feature itself but blocking testing
  it: `Frontend/.env`'s `PUBLIC_API_BASE_URL` was `http://localhost:8000`
  while the locally-running Backend `uvicorn` is HTTPS-only
  (`.certs/dev-*.pem`) — the dev frontend genuinely couldn't reach the
  Backend at all. Fixed to `https://localhost:8000`.

## Backlog

- **Modularize `groups/[id]/+page.svelte`** — well over 1,000 lines now, one component covering Homework/Tracks/Members/Responsibilities/Info tabs plus the admin Settings tab. Identified during 2026-08-28's overnight repo cleanup as the obvious Frontend equivalent to the Backend's `schemas.py` split, deliberately *not* attempted the same night: splitting live `$state`/reactive bindings in a file that had just been through hours of active live-testing, with no Playwright and no one awake to visually verify a refactor, is a real regression risk for a session that can't check its own work. A natural split: one child component per tab (`ResponsibilitiesTab.svelte`, `MembersTab.svelte`, ...), each taking its slice of `data` as props and its own local edit/confirm state, with the parent keeping just tab selection + `mode`. Do this with the human able to click through it right after.
- Track "last opened piece" server-side, to power a real Home "Continue practice" card (currently fixture/bundled-demo-only, unaddressed by F4's real-data wiring).
- Admin default tempo (group Tracks tab → `player/[id]`'s "Reset to default") only rides along on the group Tracks tab's and personal Library's practice links so far — the guest join page's practice link doesn't carry `?defaultTempo=` yet since `GuestPieceOut` doesn't expose `default_tempo_bpm`.
- Admin's Assignments/Tracks tabs have no edit/delete UI yet (Backend supports `DELETE /homework/{id}`; there's no equivalent for tracks). Not attempted this session — stayed scoped to navigation/structure, not new CRUD surface.
- `/groups/new`'s form only asks for a name — the original wireframe's Create Group Flow also mocked up a description and a default-sections checklist, but the Backend's `GroupCreate` schema has no fields for either yet.
- Preserve fully independent polyphonic notation in the player-generated MusicXML. Same-onset notes now render as MusicXML chords, including the collapsed accompaniment staff, but truly independent overlapping rhythms on one staff still need a multi-voice representation rather than the current single-timeline simplification.
- Live tempo control for F5's stem-backed pieces (F5 leaves it out — see that milestone's note on why it's a real time-stretching problem, not a rate multiplier like the MIDI-synth player has).
- **Fix the live production Backend URL** (see 2026-08-27 Log entry below): the deployed `divisi-frontend` Worker was built with `PUBLIC_API_BASE_URL=http://localhost:8000` baked in (confirmed via a live 500 on `/join/[code]`) — a human step, deploying is staying manual at the human's direction (2026-08-27). Once the real Backend URL exists (`backend/deploy` branch/worktree, still in progress), redeploy with `PUBLIC_API_BASE_URL=<real-backend-url> npm run build && npx wrangler deploy` instead of a plain `npm run build`, so it's never silently sourced from whatever a local `.env` happens to hold.

## iOS app (paused 2026-08-27, moved here from root `plan.md`)

Condensed 2026-08-28 during repo cleanup — the root-level `plan.md` (the
native Swift/SwiftUI app this project pivoted away from, see the "Why a
website first" note above) was deleted since it's a fully separate,
already-frozen sub-project whose only forward-looking content was the
portability constraint below; the day-by-day build log stays in git
history if anyone ever needs it.

**What existed:** M1 (Xcode/xcodegen scaffold) → M2 (MIDI parsing via
AudioToolbox's `MusicSequence`/`MusicEventIterator`, not
`AVAudioSequencer` — `AVMIDIMetaEvent` couldn't expose lyric/track-name
payload bytes) → M3 (playback via `AVAudioSequencer`/`AVAudioEngine`,
verified surviving backgrounding on a real device) → M4 (in-app
follow-along: OpenSheetMusicDisplay in a `WKWebView`, flat/highlighted/
solo display modes, per-part balance mixing — frozen mid-milestone with
zoom controls and seek/scrub both confirmed broken, never fixed) — M5
through M7 (SwiftUI shell, PiP piano-roll renderer, PiP controller) were
never started. The MIDI-parsing heuristics and `MusicXMLConverter`
quantization math carried over conceptually into this Frontend's own
`$lib/midi`/`$lib/musicxml` — same problem, rewritten in TypeScript.

**Standing constraint, if iOS work ever resumes:** keep pure-algorithm
Swift (MIDI-parsing rules, `MusicXMLConverter`'s quantization math,
`DivisiSyncEngine`'s poll→cursor-index math) free of Foundation/UIKit
types where the logic itself doesn't need them — plain data in, plain
data/strings out. Costs nothing now; turns a future Android port into
translation rather than redesign. No Kotlin Multiplatform or cross-platform
framework (React Native/Flutter) until Android work actually starts —
speculative infra otherwise, and would fight native audio-timing/PiP work
already invested. (Also recorded in this session's own persistent memory,
`divisi-android-portability.md`.)

**Fixture provenance:** the `Fixtures/*.mid` files (still used by this
Frontend and the Backend) are synthetic, generated via `Fixtures/generate.py`
(mido) approximating the opening of Mozart's Requiem's "Requiem aeternam"
— not a verified transcription, sourced this way because CPDL/8notes/
MuseScore/smallchurchmusic all blocked automated fetching or required
accounts.

## Log

- 2026-08-29: Fixed a real gap in the Windows session's F5/piece-uploads work (see the merged-in Log entry below and `Backend/plan.md`'s matching one) — asked to deploy the Frontend and click through it for real via Playwright, since the Windows session had no browser available on their end. Real Backend pieces (uploaded via the new group Tracks-tab form) worked cleanly for a logged-in member but were **completely unreachable as a guest**, a real regression against F5's own acceptance criteria ("a guest... can open and fully practice any of that group's distributed pieces the same way, with no login"): `join/[code]/+page.svelte`'s `visiblePieces` filter only ever matched bundled fixture titles (never `has_music`/`has_pdf`, which didn't exist on `GuestPiece` at all yet); `piece/[id]/+page.server.ts`'s own comment said a guest explicitly falls back to `remote: null`; both `file`/`pdf` proxy routes unconditionally attached `locals.token` (`undefined` for a guest → guaranteed 401 against the Backend even if the listing/routing gaps above were fixed). Backend's guest file/pdf routes themselves were already built and correct — just nothing on the Frontend ever reached them. Fixed all four: widened the guest listing filter (same `has_music||has_pdf` pattern already used on the member Tracks tab), gave `piece/[id]/+page.server.ts` a real guest branch (resolves through the guest group listing via `?code=` instead of the authenticated `/library/pieces` lookup), branched both proxy routes on `locals.token` presence (proxying to the Backend's guest routes when absent), and threaded the join code through `remotePiece.ts`'s proxy URLs so a guest's file/pdf requests carry it. `npm run check`/`build` clean. Verified live via Playwright against the real local dev server + Postgres: full upload flow (music+PDF+YouTube link, music-only, PDF-only) as admin, then the same three pieces opened by a completely anonymous guest via join code — real MIDI parses and plays, real PDF renders, matching the member experience exactly, zero JS errors throughout. Also confirmed live on production (`divisi.maripi.net`) with a real curl round trip through the actual proxy routes. Test data cleaned up from both local and production Postgres after. Deployed straight to production myself rather than waiting on the human's own planned Backend push — see `Backend/plan.md`'s matching entry for why.
- 2026-08-28: Deployed F7 to production (`divisi.maripi.net`, real `wrangler deploy`, confirmed live via a real curl round trip against `/join/9CJM7VRU` — banner text present, Weekly Notes correctly hidden by default for that group) and built `SettingsDrawer.svelte`'s "Change password" section — current password + new password (typed-twice client-side match check, same pattern as `/login`'s register form), posts to a new `/settings?/changePassword` action wired to the Backend's `PUT /auth/me/password` (see `Backend/plan.md`'s matching log entry). Same inline-edit/collapse-on-success shape as "Edit name" right above it in the same section — collapses back to a summary row on success, so (unlike the group page's page-visibility toggles) `use:enhance`'s default native `form.reset()` is harmless here, nothing needs to survive it. Also stood up an isolated Cloudflare Workers preview (`divisi-frontend-preview.mariapazmaluenda-564.workers.dev`, separate Worker name/config from the real `divisi-frontend`, no custom domain — zero risk to production routing) so the human could look at F7 before it went live; production Backend's `CORS_ORIGINS` briefly gained that preview origin to make it reachable at all, since Cloudflare Workers' `fetch` enforces CORS during SSR unlike plain Node. `npm run check`/`build` clean throughout; the whole password-change flow verified live via Playwright (mismatch blocks submit, old password 401s after a real change, new one logs in) — the human was away from their computer this entire session and explicitly authorized using it (see memory: a per-instance exception, not a changed default).
- 2026-08-28: Built F7 (Weekly Notes tab + guest sign-in banner), the human's live requests this session. Full detail in the milestone's own section above — reuses B12's page-settings machinery exactly (see F6), Backend+Frontend both done, real E2E curl round trip on the Backend side. Verified live in a real browser via Playwright — the human was away from their computer and explicitly said to go ahead and use it for this session (not this project's usual convention; noted in memory as a per-instance exception, not a changed default). That live pass caught two real bugs no amount of `npm run check`/code reading would have: the page-visibility toggles' "resets after saving" report turned out to have a second, independent cause beyond the one a prior session already fixed (SvelteKit's `use:enhance` default `update()` calls a native `form.reset()`, wrong for a form that stays visible after saving — `pageSettingsDraft` state and the actual saved data were never wrong, only the display); and `note_date` displaying a day early in any UTC-behind timezone (local-time formatting on a value with no time-of-day meaning). Both fixed and reverified live. Also fixed a local-dev-only blocker found along the way: `Frontend/.env`'s `PUBLIC_API_BASE_URL` pointed at plain `http://localhost:8000` while the locally-running Backend is HTTPS-only, so the dev Frontend couldn't reach it at all — retargeted to `https://localhost:8000`. `npm run check`/`build` clean throughout. All Playwright-created test data deleted from the local dev DB afterward.
- 2026-08-29: Added a regular weekly rehearsal schedule to groups (F6's "Expanded 2026-08-29" note above), at the human's request after they reported responsibility-date times "not getting stored or reflecting properly" — the Backend round trip checked out exactly right via a live curl test (see `Backend/plan.md`'s matching log entry), so this builds the requested fix (a "Next rehearsal" quick-fill anchored to a group-level day+time) rather than chasing a storage bug that didn't reproduce. `npm run check`/`build` clean; date math verified via a standalone script, not a real browser. Same session as, and pushed together with, the piece-uploads work below.
- 2026-08-29: Built F5's expanded scope (real piece uploads — MIDI/MusicXML + PDF + reference audio; original F5 was music-file-only) on a Windows machine with **no browser/Playwright available in that environment** — see F5's "Expanded 2026-08-29" note above for the full change list and, critically, what's still unverified because of that (the actual upload form / player-PDF-toggle / YouTube-embed interaction has not been clicked through by anyone yet, only `npm run check`/`build` clean + the Backend side curl-verified). Backend side (same session, see `Backend/plan.md`'s matching log entry) fully built and curl-verified first. `npm run check` (0 errors, same 7 pre-existing warnings) and `npm run build` both clean. Deliberately left for a human or a Playwright-capable session: actually opening the upload form and confirming a music-only/PDF-only/both piece each show the right view, and that a group member — not just the admin who uploaded it — can practice one. Not deployed; local-only, on top of a fresh `git clone` of this repo (two `"`-quoted fixture PDFs couldn't check out on Windows — OS filename restriction, not a repo problem, harmless for this work).
- 2026-08-28: Deploying tonight's batch to production, closing out `HANDOFF.md`'s two open bugs (now deleted) plus a round of live-testing fixes on top. Account: Settings drawer gained inline "Edit" name and a "Delete account" click-to-confirm (now living directly under Log out, small/underlined/not bold, rather than up in the Account section where it read as easy to miss), both posting to a new `src/routes/settings/+page.server.ts`. Tempo defaults: the group Tracks admin UI can now set a piece's default tempo (`PUT /library/pieces/{id}/default-tempo`), and the practice link carries `?defaultTempo=` through to the player, which seeds its starting tempo and shows "Reset to default". `ScoreView.svelte`'s two HANDOFF bugs: (1) the current-note accent color was landing on VexFlow's wrapping `<g>` groups instead of the actual painted leaf shapes inside them (confirmed live: noteheads/flags/accidentals/dots stayed unpainted while stems — whose own getter already drilled to the leaf — worked) — `paintableLeaves()` now drills into every one of them (noteheads, stems, flags, and the shared modifiers group covering accidentals/dots/articulations). (2) cursor-follow was scrolling `.score-container`, which only actually scrolls horizontally — vertical scroll lives on an ancestor (`.score-area`) — rewritten to walk up to whichever ancestor actually scrolls per axis, and to recenter on every new system (via OSMD's own scroll-independent `cursorElement.style.top`, constant within a system) rather than only once the cursor visually left the viewport, per the human's live-testing ask. Also fixed while testing: zoom controls now `position: sticky` so they stay anchored at the top instead of scrolling away with the score; `PdfView` retries its layout-dependent base-scale calc a few animation frames if the container's width isn't ready yet (a reload-specific race — fast enough, e.g. served from cache, to run before the page's own layout settles, unlike a plain navigation's slower fetch); and a real concurrent-render bug where zoom/resize/load could all trigger `page.render()` on the same canvas at once — pdf.js throws on that, silently aborting everything after whichever page was mid-render ("only the first page shows and stays that way") — fixed by tracking and cancelling any in-flight `RenderTask` per canvas before starting a new one, rather than just the existing after-the-fact `renderToken` check (which only ever runs between pages, not during one). Global: added a mobile-only `app.css` rule forcing text-entry fields to `font-size: 16px` — the actual iOS Safari zoom-on-focus trigger, so this covers every current and future component's inputs in one place instead of per-component. `/settings/more` copy rewritten to the human's supplied text (about/creating-a-group sections, "Built by Maripi" as the portfolio link itself rather than a separate line). `npm run check`/`build` clean throughout; `ScoreView`/`PdfView` fixes verified live by the human (not Playwright, per this project's own convention), not just statically reasoned from the OSMD/pdf.js bundle source.
- **2026-08-28, morning summary (read this first):** overnight, unsupervised, per explicit direction before bed. Frontend half of B14 (register now requires the password twice, new `/forgot-password` + `/reset-password` pages, `/login/oauth-callback`, conditional OAuth buttons) is live in production — see `Backend/plan.md`'s matching morning-summary entry for the fuller picture and what needs you specifically (an env var, an email provider, OAuth credentials). Repo cleanup: this file gained a "UI/UX conventions" reference section and an "iOS app (paused)" section, both condensed from three now-deleted root-level docs so nothing was actually lost. Two things flagged for you rather than acted on: `ScoreView`'s zoom-loses-scroll-position bug got a real fix (see below), but "cursor following is not quite working" had no specifics to safely act on — needs a repro next session; and `groups/[id]/+page.svelte` (1000+ lines, 6 tabs in one component) is a real modularization candidate, deliberately not attempted blind overnight with no way to visually verify a live-`$state` refactor — see Backlog.
- 2026-08-28: Frontend half of Backend B14 (account security), working autonomously overnight per the human's direction before bed. `/login`'s register mode now requires the password twice (client-side match check disables the submit button; the `register` action re-checks server-side too, since the Backend's `UserCreate` only ever takes one password field). New `/forgot-password` (email → generic "check your email" response either way) and `/reset-password?token=...` (new password + confirm, redirects to `/login?reset=1` on success) pages. New `/login/oauth-callback`: moves the JWT the Backend's OAuth callback redirects back with into the same httpOnly session cookie `/login` itself sets — `/login`'s own load now fetches `GET /auth/oauth/providers` and only renders a "Continue with Google/Apple" button when that provider is actually configured (neither is, tonight, so neither shows — verified, not just assumed). Also, separate from B14 entirely: the human flagged the player's zoom losing their scroll position ("zoom level should stay anchored, not get lost when scrolling") — `ScoreView`'s zoom re-render now measures the viewport's vertical-center position as a fraction of content height before `osmd.render()` and restores it after, so zooming keeps roughly the same music in view instead of jumping back near the top. Their other note ("cursor following is not quite working as I would like") had no specifics to act on — left alone rather than guessing at changes to code with a real history of cursor-sync bugs (see F1's log); needs a repro/more detail next session. `npm run check`/`build` clean; the full forgot/reset-password round trip verified for real through the actual running dev server's form actions (not just curl-to-Backend), including the password-mismatch and oauth-callback-with-no-token paths.
- 2026-08-28: Deployed F6 (plus everything added to it from live testing tonight — settings-as-a-drawer, member role management/remove-with-confirm, responsibility edit/delete, group description, home-group pinning removed, Home's "Upcoming responsibilities") to production. Chased down one real bug live: "saving page settings reset all the checkmarks" turned out to be a one-way `checked={...}`/`selected={...}` binding with no `bind:` — a re-render mid-submit (e.g. `savingPageSettings` flipping) reapplied the stale value straight from `data`, discarding whatever had just been clicked before the form's `FormData` was captured; fixed by making the page-settings form driven by real local `$state`. Root-caused an earlier "group gives me a 404" report to something unrelated to this session's code at all: the local dev Backend had been running since before this session's B12/B13 routes existed, with no `--reload`, so `/groups/{id}/responsibilities/dates` genuinely didn't exist on the running process; separately, no local Postgres was up at all (the project's own `docker compose` Postgres, not started this session) — both fixed by restarting the Backend with `--reload` and starting its Postgres container (an existing, 2-day-old data volume, not a fresh one). Deploy: committed to `frontend/guest-mode-polish` (two commits, Backend + Frontend), pushed to `main` and `backend/deploy` (Render auto-deploys on commit — see `Backend/plan.md`'s matching log entry for the migration verification), then `PUBLIC_API_BASE_URL=https://divisi.onrender.com npm run build && npx wrangler deploy` — deliberately not relying on the local `.env` (left pointed at `localhost:8000` for continued local dev, per this session's earlier "let's test it locally" call), confirmed the real URL was actually baked into the built output (`grep`, not just trusting the env var was picked up) before deploying. Verified live end-to-end against the real production `divisi.maripi.net` → `divisi.onrender.com`: `/join/9CJM7VRU` (the real San Francisco City Chorus group) returns 200 and renders the real group name. `npm run check`/`build` both clean throughout.
- 2026-08-28: Added and built F6 (group page settings + Responsibilities), at the human's direction to catch the Frontend up on the Backend's B12/B13, which shipped backend-only. Along the way, fixed a real correctness gap B12 introduced that nothing had caught yet: `/groups/[id]` and `/home` both called member-facing routes (`/groups/{id}/homework`, `/groups/{id}/members`) unconditionally, but those now 403 a non-admin member once their group's admin disables that page — previously impossible, since no such per-page disable existed before B12. Both routes now treat a 403 there as "hide this tab"/"no homework from this group" instead of failing the whole load. Two small ad hoc fixes landed alongside from the human's live look at the in-progress group page: Rehearsal Tracks' member view now uses the same circle-play icon button as the personal Library (was a text "Practice" link) and hides version status (admin-only info); the personal Library now hides tracks with no practice file wired up entirely instead of listing them as a dead-end card, matching the group page's own member-view behavior. `npm run check` (0 errors) and `npm run build` both clean. Not verified against a running app this pass (see memory — asked the human to look instead of using Playwright).
- 2026-08-28: Rewrote F5 after the human questioned its premise directly ("I don't think we need a better renderer do you?"). The original design (B7 server-rendered stems, a new `StemPlayer` audio engine) was built on F1's own assumption that in-browser synthesis wouldn't be "accurate at scale" — an assumption never actually retested, since F1 shipped and was approved specifically because the in-browser synth already sounded good. New scope: teach the existing bundled-demo player to load a real Backend piece's raw MIDI/MusicXML file instead of a static asset, reusing `MidiPlayer`/`ScoreView`/the mixer UI completely unchanged — no stems, no manifest, no new audio engine. Needs one small new Backend endpoint (raw file, not a render) rather than B7's manifest/render-cache machinery. Deleted `src/lib/api/manifest.ts`/`src/lib/server/manifest.ts` (built for the old design in the previous session, never committed, nothing referenced them) rather than leaving dead code for an abandoned approach sitting in the tree. B7 itself isn't touched/removed — still built and harmless, just no longer something the Frontend wires up to.
- 2026-08-27: Investigated the human's "how do we make the good demo experience a robust build" question and found a real, live production bug: `divisi.maripi.net` (the actual Cloudflare Workers deployment) 500s on `/join/[code]` and, almost certainly, every other Backend-touching route (login, groups, homework) — confirmed live with `curl`. Root cause: the deployed build was produced with whatever was in the deploying machine's local, gitignored `.env` at the time (`PUBLIC_API_BASE_URL=http://localhost:8000`), which is obviously unreachable from Cloudflare's network. The bundled-demo player reads as "working" in production purely because it makes zero Backend calls (bundled MIDI/MusicXML as static assets) — it was never actually exercising the broken path, which is exactly why this went unnoticed. First pass added a `deploy` job (`wrangler deploy` on merge to `main`) alongside CI checks, but the human then said deploys should stay manual — dropped that job entirely rather than leave an auto-deploy path nobody wants sitting in the repo. Landed instead: `.github/workflows/frontend-ci.yml` (repo root, since Backend/Frontend/App share one repo) — one check-only `build` job (`npm run check` + `npm run build`) on every push/PR touching `Frontend/**`, needing zero secrets (falls back to a placeholder `PUBLIC_API_BASE_URL` since this job never deploys anything). The actual production fix is still a pending manual step — build with `PUBLIC_API_BASE_URL=<real-backend-url>` set explicitly before `wrangler deploy`, once `backend/deploy` (a separate, already-in-progress worktree/branch — Render + Neon) produces a real URL; tracked in Backlog. Deliberately did not touch Backend deploy itself.
- 2026-08-27: UX pass following `UX_WIREFRAME.md`'s "Implementation Direction For Claude" (navigation/brand/naming/redundancy rules), at the human's direction. New `AppHeader.svelte` (Divisi brand top-left + Settings gear top-right, page title below) replaces the ad hoc per-route headers on Home/Library/Groups/Settings and the new merged group page; `BottomNav` dropped "Me" down to Home | Library | Groups, its contents (account, defaults, logout) already lived under `/settings`. Merged `/groups/[id]/admin` into `/groups/[id]` itself as a `Viewing as Member / Switch to Admin` toggle (`mode` state, `?view=admin` deep-linkable) — per the wireframe's "admin mode should be a view of the group, not a separate destination"; one shared load feeds both instead of two near-duplicate `+page.server.ts`s. Default view on open is Member even for an admin (the human's call on the doc's own open question). Admin mode's Members tab gained a real "Invite member" form (Backend's `POST /groups/{id}/members` existed but was never wired to any UI before this). `/groups/[id]/admin` now just redirects to `?view=admin` for old links. Built the previously-missing "create a group" flow (`/groups/new`, name only — Backend's `GroupCreate` has no description/default-sections fields yet, noted in Backlog) with a one-time "created" banner (join code + quick links) on landing back on the group page, closing the backlog item from F4's log. Home's quick actions no longer show "Join group" once the user already belongs to one (redundancy rule). Player's Practice Setup drawer (`/piece/[id]`) relabeled from "Settings" to "Practice Setup" throughout (aria-labels, heading) and its display-mode picker to the wireframe's singer-facing labels (Everyone / My part / My part + others), leaving the underlying `DisplayMode` values and player logic untouched — pure text. `npm run check` (0 errors) and `npm run build` both clean throughout. No Playwright verification this session (see memory — asked the human to look instead); dev server left running.
- 2026-08-27: Two follow-up UI trims from the human's live look at the above pass. Removed `PieceLibrary.svelte`'s separate "PDF" button — the player already has its own PDF-vs-score view toggle, so it was a redundant second entry point to the same file; card actions are now just "Player". Removed the Theme picker from the player's Practice Setup drawer — theme is account-wide (Settings already has a "Default theme" picker backed by the same `$lib/theme` store), not a per-piece setting, so having it in both places duplicated a control rather than scoping it. Neither change touches the underlying theme store or PDF viewer, just where their controls are surfaced.
- 2026-08-27 (Backend, ad hoc): Created the real San Francisco City Chorus group in the local dev Backend (the human's own account as admin), then distributed 6 of the 7 bundled/registry pieces to it as real approved+distributed rehearsal tracks (all but Lacrymosa, per the human's request) — done by calling the same `Piece`/`PieceVersion`/`Distribution` model code the API's upload→submit→approve→distribute flow uses, directly against the running local Postgres (no HTTP round trip, since neither the human's nor a service login/password was available). Also added `getPieceByTitle()` to `lib/pieces/registry.ts` so a Backend track whose title matches one of these bundled pieces gets a real working Practice button in both the group page's Rehearsal Tracks tab and `/`'s per-group library sections (via `PieceLibrary`), instead of the generic "not wired up" note — narrower than the full "wire the player to the Backend" backlog item (still bundled-fixture playback, not the Backend's own uploaded file), but closes the visible gap for tracks that happen to already exist as bundled pieces.
- 2026-08-27: F4 built (login + wire groups/home/library to the Backend), plus F2's guest view extended in the same session — see `Backend/plan.md`'s B9/B10 log entries for the paired Backend work (Homework model, guest password + homework-visibility toggle). Auth infra: `hooks.server.ts` reads the `divisi_session` httpOnly cookie into `locals.token`; root `+layout.server.ts` resolves it to a real user once per navigation via `/auth/me`, self-healing (clears the cookie) on a 401; `/login` (register/login tabs, `$app/forms` actions) sets the cookie server-side and redirects to a `redirectTo` carried from whichever protected page bounced the visitor there (guarded against open-redirect — only same-site paths honored); `/logout` is a POST-only route. `$lib/server/backend.ts`/`backendTypes.ts`: authenticated fetch helper + shared DTO types for every rewired route. Rewired `/groups`, `/groups/[id]` (Homework/Rehearsal Tracks/Members/Info tabs), `/groups/[id]/admin` (+ new "New homework" form, a real POST), `/groups/[id]/homework/[hwId]`, `/home` (My groups + Due soon, aggregated across all the user's groups), and `/`'s per-group library sections — all off real Backend data instead of `lib/fixtures/appData.ts`. Real Backend-sourced pieces show up in listings (title + review status) but have no working Practice button yet — that's the pre-existing "wire the player to the Backend" backlog item, unchanged and explicitly out of scope here; homework detail and group tracks screens say so rather than silently omitting the piece. `/settings` now shows the real logged-in user and a real logout. Root `/` and the bundled/demo player stay fully guest-accessible with no login gate, per this milestone's own acceptance criteria. Mid-session, extended scope twice at the human's direction: (1) a "choir guest mode" richer view — `/join/[code]` (F2) now has Homework/Rehearsal Tracks tabs, sourced only from the public `/guest/*` routes, still zero login and zero writes; (2) a per-group guest password + a `guest_homework_visible` opt-in toggle (Backend B10), surfaced as a password-prompt state on `/join/[code]` and a "Guest access" settings form on `/groups/[id]/admin` (partial-patch semantics — toggling homework visibility doesn't require re-entering/clearing the password, since the API never lets it read the current one back to resend). Found and fixed one real bug via live testing (not just `pytest`): the guest-settings endpoint's first version required both fields on every call, which would have silently forced admins to always resend a password to change anything else — caught by a curl smoke test against the real running Backend, not the unit tests (which happened to always send both fields), fixed by making it a true partial patch (`model_fields_set`). Verified end-to-end against the real local Backend + a real (non-Playwright, per this project's own convention) `curl`-driven session: register → login (cookie set, confirmed via `Set-Cookie` header) → real group/homework data on `/home`/`/groups`/`/groups/[id]` → new-homework form POST lands in the Backend and re-renders → guest-settings partial-patch round-tripped correctly live → guest join flow password-gates correctly (401 without/right password 200) and homework tab only appears once opted in → uploaded/distributed a real piece and confirmed it renders in both the group's Rehearsal Tracks tab and `/`'s library → logout clears the session and protected pages redirect again → `redirectTo` round-trips a deep link through login and back. `npm run check` (0 errors) and `npm run build` both clean throughout. Annotation UI (this milestone's other original task, from Backend B5) not started this session — milestone stays `[~]`, not `[?]`, until that's done too. No "create a group" UI exists anywhere in the app (pre-existing gap, not introduced here) — noted as a real backlog item since it now blocks a brand-new user from doing anything but joining via someone else's code.
- 2026-08-27: Started F2, scope narrowed to guest access/listing only at the human's direction — the player-to-stems wiring (F2's other original task) is backlogged instead (see Backlog for why: it's a real audio-architecture change, not a drop-in data swap). Backend had no CORS middleware at all, so added `CORSMiddleware` + a `cors_origins` setting (`Backend/app/main.py`/`app/core/config.py`) before the browser could call it cross-origin. Built `src/lib/api/guest.ts` (typed client for B6's `GET /guest/{code}`), `/join` (code entry) and `/join/[code]` (server-loaded via `+page.ts`, shows the group's distributed piece titles, or a not-found/server-error/empty state), and pointed `/groups`' previously-dead "Join a group with a code" button (it linked to `/`) at `/join`. Verified against a real running local Backend, not mocked: started `docker-compose up postgres` + `alembic upgrade head` + `uvicorn` locally, drove the full admin flow via curl (register → login → create group → upload/submit/approve/distribute a piece) to get a real join code, then confirmed the already-running Frontend dev server resolved it correctly (real SSR network call) — both the valid-code and unknown-code paths render as intended. Test data cleaned from the local dev DB afterward. `npm run check` and `npm run build` both clean. Left the local Backend (`uvicorn`, port 8000) and Frontend (`vite dev`, port 5173) running for the human to look at directly.
- 2026-08-27: Two small follow-ups from the human's first pass over F3. (1) Hid annotations app-wide per the human's request, rather than deleting them: removed Home's "Recent annotations" card, Homework Detail's "My annotations" resource + its `AnnotationModal` trigger, Settings' "Privacy" section, and the onboarding step on `/welcome` that promised the feature — `AnnotationModal.svelte` and the `Annotation`/`RECENT_ANNOTATIONS`/`annotationSharingDefault` fixture data are untouched and still exported, just unreferenced from any route, so this is a quick revert whenever annotations actually ship (F4). (2) Added a "Log out" button to `/settings` (the bottom-nav "Me" screen) — no real session exists yet (login isn't wired until F4), so for now it just navigates to `/welcome`; added a `.btn-danger` class to `lib/styles/shell.css` for it, the first destructive-styled action in the new UI shell. Also fixed a real bug the human caught: the new `BottomNav`/`PieceLibrary` inline `<svg>` icons had no explicit `width`/`height` attributes, so they'd briefly render at the browser's ~300px SVG fallback size before their scoped CSS applied — most noticeable on the Home icon's roof-shaped path, which blown up like that reads as a big arrow. Fixed by sizing every icon `<svg>` directly rather than relying on CSS alone (left the practice player's own icons untouched — same pattern, but that screen was signed off as-is). Also swapped `favicon.svg` off the default SvelteKit scaffold logo: now two accent-recolored raster variants of `divisi-logo` (light `#4f46e5` / dark `#818cf8`, matching `app.css`'s tokens) swapped via `prefers-color-scheme` inside the SVG — a static favicon can't read the page's live CSS custom properties the way `Logo.svelte`'s CSS-mask trick does, so this bakes both variants instead of computing one. `npm run check` and `npm run build` clean throughout.
- 2026-08-27: Fixed the Library page per the human's first-look feedback on F3: the redesigned `/` had piled three plain stacked text links ("SFCC pieces"/"Go to Home"/"Welcome screen") under the piece grid, on top of the new bottom nav — read as redundant. Answered UX_WIREFRAME.md's own open question ("should personal and group pieces live in one library with filters, or separate spaces?") by folding everything into one page: `/` now renders a "Personal" section (the old demo grid) followed by one section per real group from `lib/fixtures/appData.ts`'s `GROUPS`, each showing that group's actual shared pieces (or an explicit empty state) with an "Open group" link through to `/groups/[id]`. Deleted the standalone `/sfcc` route entirely, since its whole content was now a second copy of the SFCC section on `/` — the same list living at two URLs was exactly the redundancy being fixed, not a separate issue. `/welcome` is intentionally no longer linked from the library — it's a first-run/onboarding screen, not steady-state nav, matching real product intent; still reachable directly. `npm run check` and `npm run build` both clean.
- 2026-08-27: Built out the app-shell UI (new F3, inserted ahead of login/annotations) after the human confirmed the already-built practice player needed no changes. First produced a low-fidelity wireframe artifact covering all ten screens from `UX_WIREFRAME.md` (phone-frame mockups, grouped by flow, with the real `divisi-logo` embedded) for the human to review before writing any app code — confirmed as the right call given how much of the product model (Personal vs. Groups, homework-as-task-wrapper-not-new-media-type, annotation sharing states) only existed in prose before this. Recolored that logo from its flat black source into a CSS-mask asset (`lib/assets/divisi-logo-mask.png`) so it paints through `var(--accent)` and repaints live on theme swap, rather than a color baked into the PNG — used in both the wireframe artifact and the app's new `Logo.svelte`. Then built every remaining screen as a real route against new local fixture data (`lib/fixtures/appData.ts`) rather than wiring the Backend now, matching F1's own "prove the UI before wiring a backend milestone" precedent — the human explicitly chose this over jumping ahead to real Backend integration when asked. New shared pieces: `lib/styles/shell.css` (card/button/tab/list/field/bottom-nav classes reused across every new route, built on `app.css`'s existing tokens), `BottomNav.svelte`, `AnnotationModal.svelte` (a reusable add-annotation sheet, wired from Homework Detail only — deliberately left out of the practice player itself). Routes added: `/welcome`, `/home`, `/groups`, `/groups/[id]` (tabbed Homework/Rehearsal Tracks/Members/Info — Rehearsal Tracks reuses the existing `PieceLibrary` component), `/groups/[id]/homework/[hwId]`, `/groups/[id]/admin`, `/groups/[id]/admin/new-homework`; linked in from the pre-existing `/` and `/sfcc` pages so the new screens are actually reachable in the app, not just directly-URLed. `npm run check` and `npm run build` both clean. No Playwright verification this session (see memory — ask the human to look instead); milestone marked `[?]` pending that review.
- 2026-08-27: Score-view gesture/nav polish, plus a PDF-viewer rewrite forced by a real mobile limitation. Added two-finger pinch-to-zoom to `ScoreView.svelte`, driving the same `zoom` state as the existing +/− buttons; native pinch-zoom disabled only on the score's own container (`touch-action: pan-x pan-y`) so it can't scale the app's fixed top/bottom bars. Added a "bring me to cursor" button by the scrubber that scrolls the cursor into view and engages OSMD's own native `FollowCursor`/`cursor.follow` mechanism (cheap property flips, no custom scroll-loop needed) so the view keeps tracking playback until the human scrolls/drags manually, at which point it disengages. Every zoom level (score and, later, PDF) now persists per piece alongside the other settings. Fixed a mobile-Safari-only rubber-band bug where overscrolling past the score bounced the whole page past the fixed shell, briefly revealing space below the anchored bars (`overscroll-behavior: contain`/`none`). Then hit a real platform wall on the PDF side: mobile Safari's `<iframe>`-embedded PDF viewer turned out to be a stripped-down build with no toolbar and no pinch-zoom at all — confirmed not fixable from outside the iframe, since it's the browser's own native plugin. Replaced the iframe entirely with a new `PdfView.svelte` built on `pdfjs-dist`, rendering each page onto its own `<canvas>` with the exact same zoom UX as the score view (matching +/− buttons, matching pinch gesture, matching persisted zoom-per-piece). Along the way: fixed a sizing bug where the page wrapper's fixed width meant a zoomed-in (wider) canvas overflowed visually without ever growing the container's scrollable area, so horizontal scroll silently did nothing (`width: max-content` floored at 100%, not a plain block div); and added `touch-action: manipulation` globally to `<button>` elements to stop accidental double-tap-zoom on controls — confirmed this isn't an accessibility regression, since pinch-zoom stays available everywhere for anyone who needs it, `manipulation` only removes double-tap-zoom specifically on tappable buttons. Also fixed two related regressions surfaced by the PDF-vs-player view toggle: switching back to Player looked blank because OSMD's `autoResize` only recalculates on a real `window` resize event (not a ResizeObserver), so it never noticed regaining a real width after being `display: none` — fixed by dispatching a synthetic resize event on switch-back; and that redraw (like any real window resize) turned out to silently revert the cursor to OSMD's bare default, since OSMD's own resize handling redraws on an internal ~200ms debounce without ever calling back into our custom cursor styling/muted-staff repaint — fixed with our own slightly-longer-than-200ms debounced reapply in `ScoreView.svelte`, which now also covers genuine window/orientation resizes, a latent bug that almost certainly predated this session. `npm run check` and `npm run build` both clean throughout.
- 2026-08-27: Closed the other open backlog item: migrated `player.ts` off `js-synthesizer`'s plain `Synthesizer` (main-thread `ScriptProcessorNode`) to its `AudioWorkletNodeSynthesizer` variant (dedicated audio-rendering thread), the real fix for the class of glitch where heavy main-thread work (e.g. a display-mode-triggered OSMD re-render) could stall the synth callback audibly. `MidiPlayer.create()` now registers the worklet processor into the `AudioContext`'s own AudioWorklet global scope via `audioContext.audioWorklet.addModule(...)` (`libfluidsynth-2.4.6.js` then `js-synthesizer.worklet.js`, copied from `node_modules/js-synthesizer/dist/` into `static/vendor/` alongside the existing main-thread bundle) before constructing `new window.JSSynth.AudioWorkletNodeSynthesizer()` and calling `createAudioNode(context)` — one arg now, not `(context, frameCount)`, since the worklet's render quantum isn't caller-tunable. Everything downstream (`loadSFont`/`resetPlayer`/`addSMFDataToPlayer`/`playPlayer`/`seekPlayer`/`midiControl`/`setPlayerTempo`) kept its exact call shape, matching the feasibility check already recorded here. `npm run check` and `npm run build` both clean; the worklet vendor file confirmed present in the built client output. Done in an isolated git worktree (`../divisi-audioworklet`, branch `frontend/f1-audioworklet`) rather than the main working copy, since another session had uncommitted changes sitting there at the time — human verified the result by ear against a real dev server before this was committed.
- 2026-08-27: F1 approved and closed; moved to F2. The last open acceptance criterion (backgrounded/lock-screen audio) failed when the human actually tested it on a real phone — playback stopped the moment the tab was backgrounded, the expected iOS Safari behavior for plain Web Audio API output, since iOS only grants continued background execution to genuine `HTMLMediaElement` playback (Media Session API controls alone don't grant that, they just attach to media the OS already considers "playing"). Fixed in `player.ts` by rerouting the synth's output: `createAudioNode` now connects to a `MediaStreamAudioDestinationNode` instead of `context.destination`, and that stream feeds a real `<audio>` element (created once in `MidiPlayer.create()`, appended hidden to `document.body`) which is what actually reaches the speakers. `play()` calls `audioEl.play()` and `context.resume()` together before any other `await`, so the `<audio>` element's play() call still originates from the same user tap iOS's autoplay gate requires — calling it after an earlier await breaks that gesture chain. `pause()`/`stop()`/`destroy()` updated to mirror state on the audio element too. Confirmed on a real phone: playback continues with the screen locked. `npm run check` clean. With that, every F1 acceptance criterion is confirmed — human approved F1 as MVP-done.
- 2026-08-27: Settings/player polish pass, plus two real bugfixes found along the way; human then signed off F1 as MVP-done. Added a PDF-vs-player view toggle to the settings drawer (both panes now stay permanently mounted once first shown, switching only via CSS visibility — an earlier `{#if}`-swap version tore down OSMD's whole SVG tree and re-fetched the PDF on every toggle, stalling the main thread long enough to audibly glitch the synth, since `js-synthesizer` runs its callback on a `ScriptProcessorNode`, not an AudioWorklet). Replaced the tempo slider with a +/− stepper, and extended per-piece `localStorage` persistence (keyed `divisi:settings:<id>`) to every user-adjustable setting — tempo, voice focus, display mode, per-part visual states, balance, and view mode — so they survive a refresh instead of resetting to soprano/solo every time. Added Space (play/pause) and ←/→ (seek one measure, computed from the piece's real time signature) as global keyboard shortcuts. Found and fixed a real MusicXML tempo-parsing bug while chasing a "tempo sounds off" report: `readPart()` seeded each part's own note-timing tempo from a hardcoded 120 BPM default, only updated if *that part's own* XML stream carried a `<sound tempo>` direction — since real exports put the tempo marking on one part only (confirmed by checking all 7 fixtures: Lacrymosa has it on soprano only, the other 6 SFCC pieces have none at all), every other part was silently timing its notes off the wrong default, racing ahead of or lagging the correctly-timed part. Fixed by seeding every part from one document-wide tempo pre-scan, matching how the MIDI parser already handles it globally. Added a `tempoOverrideBPM` mechanism in `registry.ts` for the 6 pieces with zero tempo data in their MusicXML at all (nothing to parse — the human supplies the real value by ear/PDF); Thor set to 104 BPM, five more pieces still pending a value from the human. Also chased a cursor-rendering report through two iterations: first found a `scaleY(1.75)` transform meant to give the playback cursor a "couple pixels over" overhang instead scaled proportionally to whatever height OSMD's cursor was covering, ballooning badly once flat/highlighted mode made it span multiple staves; the first fix (additive top/height math read from the cursor `<img>` element) introduced a worse bug — reading `.height` back returned the CSS-styled value the fix had itself just set rather than OSMD's native attribute, so the cursor grew a little taller every single animation frame during playback. Settled on the simplest correct fix per the human's own suggestion: only apply the scale-up when exactly one staff is visible (solo mode), and leave OSMD's native geometry completely untouched otherwise — no manual geometry math at all. `npm run check` clean throughout; no Playwright verification this session (see memory: too token-expensive for this kind of check, ask the human to look instead). Per the human's sign-off ("quite happy with the player right now for MVP"), marked F1 pending review — every acceptance criterion confirmed except backgrounded/lock-screen playback, which is wired via the Media Session API but has never been independently confirmed on a real device.
- 2026-08-27: Cleaned up a tangled git state from the parallel-worktree period: `backend/b6-guest-access` (the checked-out branch at the time) had accumulated a full round of uncommitted Frontend work (library/SFCC reorg, chord-grouping fixes) on top of it, while a `frontend/ui-shell` worktree had been removed without ever committing its own work, leaving only a stray `divisi-ui-shell-unmerged.patch` at the repo root that no longer applied cleanly against the moved-on code. Committed the uncommitted work, fast-forward-merged into `main` (verified all of `frontend/f1-player`/`frontend/ui-shell`/`frontend/musicxml-importer`/`backend/b7-rendering-pipeline`'s content was already superseded before deleting them), then hand-recovered the one substantive thing the patch had that wasn't anywhere else — a live tempo control — since the patch's other hunks (an old pre-restructuring `+page.svelte`, a stale `musicXmlConverter.ts`) were dead weight. `MidiPlayer.setTempo(bpm)` drives FluidSynth's own tempo scaling (`Constants.PlayerSetTempoType.ExternalBpm`) rather than reloading the SMF, re-anchoring the position clock so musical position stays continuous across a live change; wired to a new Tempo slider (40–240 BPM) in the settings drawer. Repo is now just `main`, no other branches or worktrees.
- 2026-08-27: Wired lyrics all the way through to the rendered score. Both parsers had already been extracting `MIDILyricEvent`s into `ParsedMIDI.lyrics` since the MusicXML-importer work, but `musicXmlConverter.ts` never consumed them. `attachLyrics()` pairs each lyric event to its note by nearest onset timestamp (tolerant of a few ms of jitter from tick-to-ms rounding), then the lyric rides through quantization/chord-grouping/tie-splitting as a field alongside pitches, emitted as a standard MusicXML `<lyric>` that OSMD renders natively — one syllable per chord (not per stacked pitch) and only on the first fragment of a tied group. Verified with a synthetic script (no bundled fixture had lyric data yet) covering a divisi chord case. Investigated getting "The Challenge of Thor" real lyrics from its PDF at the human's prompt: the PDF's text layer genuinely has the words, but they're interleaved with notation glyphs in no positionally-recoverable order without real per-glyph coordinate matching against noteheads — parked as not worth it for one piece. Then the human pointed out Lacrymosa's source MuseScore project shows lyrics, which led to finding `Fixtures/mozart-lacrymosa-from-requiem-satb-with-piano.mxl` already sitting in `Fixtures/` — its MIDI export had dropped the lyrics but its MusicXML export (decompressed to a plain `.musicxml` fixture) kept all 341 lyric events. Swapped the registry entry to load Lacrymosa via the MusicXML importer instead of the MIDI parser (same `ParsedMIDI` shape, so playback/converter/player are unaffected; the unused `.mid` was left in place rather than deleted). Verified against the real running dev server with Playwright: full soprano line ("Lacrymosa, dies illa, qua resurget ex favilla, judicandus homo reus...") renders under the staff, transport/duration intact. Thor still has no digitized lyrics anywhere (MIDI, MusicXML, and PlayScore capture all lack them) — would need either a fresh MusicXML export with lyrics or the harder PDF-glyph-matching approach above.
- 2026-08-27: Continued the fixture/library/player push after the first F1 commit. Extracted newly supplied PlayScore packages into useful public fixtures and reorganized static assets into `static/fixtures/demo/` (Mozart Requiem demo) and `static/fixtures/SFCC/` (SFCC PDFs + MusicXML exports). The library now gives each piece separate `Player` and `PDF` actions; `/` shows demos only, and `/sfcc` shows the SFCC pieces. "The Frost Myth" is kept as PDF/MusicXML in the fixture folder but is not yet connected to the player because its exported structure does not map cleanly into the current SATB + collapsed-accompaniment player model.
- 2026-08-27: Upgraded the mixer/visual model from fixed Full score/Highlighted/Solo-only behavior to presets plus per-track custom visualization. Every mixer row has a lightbulb cycling `Off` / `Muted` / `Active`; Full score, Highlighted, and Solo are now presets over that state, while manual changes become Custom. Muted staff treatment was made robust by repainting rendered OSMD staff bands (notes, rests, clefs, symbols, and especially staff lines) rather than relying only on MusicXML note colors. The score and app themes now share the same small accent palette, with light/dark/system theme selection and a purple vertical cursor matching the play button.
- 2026-08-27: Added accompaniment visualization while keeping accompaniment collapsed to one mixer item. The parser still collects non-SATB/multi-staff material into `backingNotes`, playback still uses the full collapsed backing bucket, and the score can now show `Accomp.` via the same lightbulb state as the voices. Current implementation renders it as one simplified bass-clef cue staff by taking one low note per backing onset; this is readable for practice context but is not a faithful grand-staff piano engraving. This is also where the current player limitation is explicit: the generated player MusicXML does not yet represent multiple simultaneous notes on one staff/track as chords.
- 2026-08-27: Fixed same-onset stacked-note display in the generated player notation. `musicXmlConverter.ts` now groups notes that quantize to the same start unit into MusicXML chords using `<chord/>`, and the accompaniment visual path feeds all collapsed `backingNotes` into that grouping instead of reducing each onset to a single bass cue note. This means piano/accompaniment hits and divisi notes that begin together can render as stacked notes. Still open: independent overlapping rhythms that start at different times on the same staff need real multi-voice MusicXML, not just chord grouping.
- 2026-08-27: Deployment was started, then stopped at the human's request. A private/free Sites project target was created and `Frontend/.openai/hosting.json` was added with its `project_id`, but no version was saved or deployed. Attempted installation of the Cloudflare adapter was interrupted before it changed `package.json` or `package-lock.json`. Current blocker for free Sites deployment: the app is plain SvelteKit with adapter-auto output, while Sites packaging expects a Cloudflare-worker-compatible `dist/server/index.js` bundle; finish by adding the proper adapter/build shape only if the human resumes deployment.
- 2026-08-27: Landed the MusicXML importer (`src/lib/musicxml/parser.ts`) that "The Challenge of Thor" needed. Its MIDI export puts every part + accompaniment on one track split across 12 channels with no track names — even after generalizing the channel-splitting that currently only fires for SMF format 0, the mean-pitch fallback would still see 12 unnamed candidates for 4 remaining voice parts and refuse to guess (by design — see `assignVoiceParts`'s ambiguity check). Its MusicXML export has real per-part structure instead (5 `<part>`s: P1–P4 single-staff, P5 `<staves>2</staves>`), even though the part *names* are equally useless ("Part 1".."Part 5", `print-object="no"`). Excluding multi-staff parts (a grand staff is never a single vocal line) before the same name-then-mean-pitch heuristic turns that into a clean 4-candidates-for-4-parts match. Extracted the heuristic itself (`assignVoiceParts` and its helpers) out of `midi/parser.ts` into `notation/voicePartAssignment.ts` so both parsers share one implementation rather than risking drift between two copies. New parser returns the exact same `ParsedMIDI` shape the MIDI parser does — `playbackMidiBuilder`, `musicXmlConverter`, and everything else downstream work unchanged; verified by calling all three (`convert`, `convertAllParts`, `buildPlaybackMidi`) against the parsed piece with no errors. Correctness verified two ways: per-part output note counts match a hand-computed expectation from the raw XML exactly (raw `<note>` count minus rests minus tie-stops, per part: 253/265/282/280 for S/A/T/B, all exact), and voice-part ranges come out correctly ordered high→low (soprano 61–81, alto 53–76, tenor 47–69, bass 41–63). Wired into `lib/pieces/registry.ts`, replacing its placeholder. Work done in the `divisi-musicxml-importer` git worktree (branch `frontend/musicxml-importer`, off `frontend/f1-player`) — see that branch's history for the commit; a parallel `divisi-ui-shell` worktree (branch `frontend/ui-shell`) is doing the routes/library/player-shell restructuring in a second session.
- 2026-08-27: Split Frontend work into git worktrees so the MusicXML importer and the UI restructuring (library screen, full-bleed player layout, anchored transport bar, expandable settings menu) could proceed in parallel without file conflicts. Landed the shared contract first: `src/lib/pieces/{types,registry}.ts` — a `Piece` (`id`/`title`/`composer`/`load()`) interface plus a static registry, so the UI side can build the library/player screens against real piece summaries without depending on which parser backs a given piece. Also committed all prior uncommitted Frontend work to a new `frontend/f1-player` branch off `main` (previously sitting untracked on `backend/b6-guest-access`, mixed in with unrelated iOS changes), and separately committed that branch's own dangling iOS diff (M4: display modes, mixer rework, scrolling, zoom — already narrated in the root `plan.md`'s log but never committed).
- 2026-08-27: Redesigned the F1 UI from the bare-functional smoke-test layout to a real designed one, per the human's request after confirming the player itself works. New global `src/app.css` (design tokens, light/dark via `prefers-color-scheme`, shared range-input skin); `+page.svelte` rebuilt around a card shell — circular play/pause button with SVG icons, a filled/gradient seek scrubber, pill-style segmented pickers for voice part and display mode, and a collapsible "Mix" panel showing each part's balance as a qualitative `+N%`/`Even`/`-N%` label instead of a bare slider. `ScoreView.svelte`'s zoom controls and score container restyled to match. Purely visual — no changes to player/sync logic. Verified with a Playwright smoke run against the real dev server at both a phone-width (420px) and desktop viewport, light and dark `prefers-color-scheme`: page loads with no console errors, Play toggles to Pause and audio position advances, voice-part and display-mode pickers switch live, full-score mode renders all 4 SATB staves with the cursor visible. `npm run check` clean.
- 2026-08-27: Added click-to-seek per human request — clicking a note in `ScoreView.svelte` now seeks playback there. Converts the click's screen-pixel offset within the score container into OSMD's internal coordinate space (`10 * Zoom` px per unit — OSMD's own documented hit-testing conversion, `unitInPixels`; confirmed empirically that `Zoom` alone accounts for `autoResize`'s container-fit scaling too, since it's the same value driving the rendered viewBox), hit-tests via `GraphicSheet.GetNearestNote`, and reports the matched note's `getAbsoluteTimestamp().RealValue` (the same whole-notes unit the cursor already uses) up to the parent via a new `onNoteClick` prop — `ScoreView` never seeks itself, staying consistent with `positionWholeNotes` being parent-owned. `+page.svelte` wires it to the existing `seek()`. Verified with Playwright: clicking well into the first system jumped playback from 0:00 to 0:14, actual audio position (not just display).
- 2026-08-27: Fixed a cursor-flicker bug the human caught while trying the dev build (green OSMD cursor jumping back to the start then snapping forward, repeatedly). Root cause: `setCursorTimestamp` in `ScoreView.svelte` stepped the cursor forward with `next()` until its timestamp reached-or-passed the playback target, which routinely overshoots (OSMD's cursor lands on discrete note onsets, not arbitrary times) — next `requestAnimationFrame` tick, the still-behind target read as "target < current cursor time" and triggered a full `cursor.reset()` to the start, every frame, for as long as target sat inside that overshot gap. Fixed by backing off an overshooting step with `cursor.previous()` so the cursor always lands on the last note at-or-before target. Verified via Playwright: sampled the cursor DOM element's position over 4s of real playback, confirmed monotonic advancement with no backward jumps. Also moved the play/pause button and scrubber above the part/display-mode pickers per human feedback (transport controls belong at the top, not buried below the pickers).
- 2026-08-27: Finished F1's remaining Claude tasks — zoom controls (−/%/+, 0.5×–2×) added to `ScoreView.svelte`, driven by OSMD's `Zoom` property with a re-render + explicit `cursor.show()` afterward (OSMD rebuilds the whole graphical sheet, including the cursor element, on `render()`, so the cursor doesn't survive a zoom change on its own). Verified via a headless-Chromium (Playwright) run: zoom buttons change the rendered `viewBox` (narrows/grows in the expected direction) and reflow the score into more/taller systems; the outer SVG's pixel width staying fixed is expected (`autoResize` fills the container) and isn't a bug. Rewrote `Frontend/README.md` (was still the `sv create` scaffold default) with real project docs — requirements, dev/build/check commands, project layout, known gaps. `npm run check` clean. Only the Human task (try it end-to-end vs. PlayScore) remains before F1 is done.
- 2026-08-27: Built and verified a working F1 prototype end-to-end. `npx sv create` scaffold (SvelteKit, TS, minimal template); ported `MIDIParser`/`MusicXMLConverter` to TS (`src/lib/midi/`), verified against all 4 real `Fixtures/*.mid` files including the actual Mozart Lacrymosa piece. Audio: `js-synthesizer` (WASM FluidSynth) loaded via vendored `<script>` tags (its CJS/WASM glue isn't bundler-friendly per its own docs) rather than npm-imported; discovered mid-build that this project's synthetic dev fixtures put every MIDI track on channel 0 (would break per-part volume, which needs distinct channels), so added `playbackMidiBuilder.ts` to rebuild a fresh MIDI blob from already-parsed notes with deterministic channel assignment (0=S/1=A/2=T/3=B) — verified via a parse→rebuild→re-parse round trip. Player drives position off `AudioContext.currentTime` directly, no polling; per-part balance is a live MIDI CC7 message, not a `GainNode` (architecture change from the original plan — see F1's task list). `ScoreView.svelte` embeds OSMD directly; needed `export const ssr = false` on this route plus a dynamic `import()` inside `onMount`, since OSMD is a CJS/DOM-only package SvelteKit's SSR can't statically import. Verified with a headless-Chromium (Playwright) run against the real dev server: page loads with no JS errors, clicking Play advances both the position readout and the button state, full multi-system score renders correctly in Solo mode with the cursor on the first note. Zoom controls and `Frontend/README.md` still open; flat/highlighted modes and background/lock-screen audio are implemented but not yet independently re-verified this pass (flat/highlighted reuse already-verified conversion logic; background audio needs a real device, same as the Human task below). Dev server left running at `localhost:5173` for the human to look at directly.
- 2026-08-27: Reprioritized per the human: prove out playback+notation entirely frontend-only first, no Backend or account wiring, before connecting anything real. Collapsed the old F2/F3/F4 drafts (audio playback, notation sync, per-voice customization) into a single new F1 that works against a bundled fixture MIDI file using in-browser MIDI synthesis instead of the originally-planned server-rendered stems (stems still the production plan — see F1's note and Backend B7 — but that needs a backend, which this milestone deliberately doesn't have). Old F1 (guest access) demoted to F2, now also picking up "wire the real Backend once it exists." Old F5 (login+annotations) renumbered to F3, unchanged. Backend B6/B7 stay as planned in `Backend/plan.md`; nothing there changes, this is purely a Frontend sequencing call.
- 2026-08-27: Detailed F2–F5 (pre-reprioritization). F2 (Web Audio API player, stems mixed live via `GainNode`s, one shared `AudioContext` clock) and F3 (OSMD embedded directly, no bridge, cursor driven off that same clock) needed a new Backend milestone to feed them — added B7 (MIDI→audio+notation rendering pipeline) to `Backend/plan.md`, porting the iOS app's proven `MIDIParser`/`MusicXMLConverter` design server-side. F4 (balance/mute) built on F2's per-stem gain nodes. F5 (login+annotations) needs no new backend work — B2/B5 already cover it, just needs frontend wiring.
- 2026-08-27: Detailed F1 (scaffold + guest access) with real acceptance criteria/tasks, after two decisions with the human: stack is SvelteKit, and guest access works via a shareable join link/code (no public group directory). F1 needs a Backend addition that didn't exist at all — a join code on `Group` plus public unauthenticated endpoints — added as `Backend/plan.md`'s new B6 (renumbering the old B6/OMR to B7, since guest access is now the more urgent piece). F2–F5 still name-only.
- 2026-08-27: Project started as part of a product pivot — Divisi's iOS app (root
  `plan.md`) paused/backlogged in favor of this web player. Drafted milestone-name-only
  skeleton per the human's stated priorities (guest access, accurate synced player,
  customizable background-listenable tracks, login only for annotations). Framework
  choice, audio architecture (stems vs. in-browser synthesis), and guest-access
  mechanism (join link/code vs. open listing) are all still open — to be resolved
  while detailing F1/F2.
