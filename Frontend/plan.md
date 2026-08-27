# Project Plan: Divisi Frontend (web player)

Separate from `Backend/plan.md` (the API/data model this talks to) and the root
`plan.md` (the native iOS app — **paused/backlogged** as of 2026-08-27 in favor of
this web player; see its Log). Milestones prefixed `F` to avoid clashing with the
Backend's `B`-prefixed and the iOS app's `M`-prefixed milestones.

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

**Current milestone:** F1

## Milestones

### F1 — Standalone playback + notation prototype [ ]

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
- [ ] Given a bundled fixture MIDI file, the app parses it client-side (voice-part assignment, tempo/time-sig — porting the iOS `MIDIParser` heuristic) and plays it back audibly, all SATB parts + any accompaniment synthesized in-browser
- [ ] All parts start in sample-accurate sync and stay in sync for the full piece length — no audible drift by the end
- [ ] Play/pause/seek are immediate and accurate, driven off `AudioContext.currentTime` — no polled position readout in the critical path
- [ ] Real engraved notation (OSMD) renders with a moving cursor tracking that same clock, no perceptible lag
- [ ] Flat/highlighted/solo display modes (full SATB no emphasis / full SATB with chosen part tinted / chosen part only), switchable without ever restarting or repositioning audio
- [ ] The score scrolls for pieces longer than one screen, and genuinely zooms in/out (verified by hand in a real browser — the iOS zoom bug was exactly an unverified assumption like this)
- [ ] A balance slider per SATB part adjusts that part's volume live during playback, from quieter-than-the-rest through even to louder-than-the-rest
- [ ] Audio keeps playing when the browser tab is backgrounded or the phone screen locks
- [ ] Human confirms it reads as more accurate/pleasant than PlayScore on the same piece, before any Backend/account wiring is invested

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
- [ ] Try it end-to-end and compare directly against PlayScore on the same piece; sign off before Backend wiring starts

### F2 — Guest access to real pieces via the Backend [ ]

**Depends on Backend B6** (join code + public guest endpoints) **and B7**
(MIDI→audio+notation rendering pipeline) — neither exists yet. Swaps F1's bundled
fixture for a real group's actual distributed pieces, reached via a shareable join
link, still no login required.

**Acceptance criteria:**
- [ ] Visiting a valid join-code URL shows that group's distributed pieces, with no login
- [ ] An invalid/unknown join code shows a clear "not found" state, not a crash
- [ ] F1's player works against a real distributed piece's server-rendered stems + MusicXML exactly as it did against the bundled fixture

**Tasks — Claude:**
- [ ] Join-code route: fetch the group + its distributed pieces from the Backend B6 endpoint, render a list
- [ ] Wire F1's player to Backend B7's manifest endpoint (stems + MusicXML + tempo metadata) instead of the bundled fixture
- [ ] Empty/error states: invalid code, group with zero distributed pieces yet
- [ ] Decide stems-vs-in-browser-synthesis for production now that F1 has proven the UX (see F1's note) — revisit the audio pipeline if stems win

### F3 — Login + annotations [ ]

**Depends on** Backend's already-built B2 (auth) and B5 (annotations) — no new
backend work expected here, just wiring the frontend to existing endpoints. The only
feature gated behind an account; everything else stays guest-accessible.

**Acceptance criteria:**
- [ ] A guest can register/log in without losing their place in the piece they were viewing
- [ ] A logged-in user can add an annotation at a position in the score; it's private by default and shareable with a specific peer, matching Backend B5's semantics
- [ ] Browsing, playback, and customization remain fully guest-accessible — login is opt-in, never a gate

**Tasks — Claude:**
- [ ] Login/register UI against Backend B2's endpoints; store the session via an httpOnly cookie through a SvelteKit server route (not `localStorage`, to keep the token off the page's JS)
- [ ] Annotation UI: create/view at a score position, reusing the same whole-notes-timestamp position already used for the cursor; respects B5's private-by-default + explicit-share model
- [ ] Share/unshare UI against B5's existing endpoints

## Backlog

- Persist per-piece balance/mute/display-mode settings in `localStorage` once there's a real piece id to key them on (folded out of the old standalone F4 draft — do it in F2 once pieces have server-side ids, not in F1 against a hardcoded fixture)
- Preserve fully independent polyphonic notation in the player-generated MusicXML. Same-onset notes now render as MusicXML chords, including the collapsed accompaniment staff, but truly independent overlapping rhythms on one staff still need a multi-voice representation rather than the current single-timeline simplification.

## Log

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
