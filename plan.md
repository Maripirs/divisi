# Project Plan: Divisi (iOS app) — PAUSED

**Paused 2026-08-27**, backlogged in favor of a web player (see `Frontend/plan.md`) — the human decided the earliest useful version of Divisi is a website where choir members join as guests (no login needed except to save annotations), not a native app. This plan is kept as-is for reference/possible revival, not being actively worked. See the root-level product decision logged below and in `Frontend/plan.md`'s own log.

**Current milestone:** M4 (frozen mid-milestone — see log)

## Milestones

### M1 — Project scaffold [x]

**Acceptance criteria:**
- [x] `xcodegen generate && xcodebuild -project Divisi.xcodeproj -scheme Divisi -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build` succeeds
- [x] App launches in the simulator showing a placeholder screen

**Tasks — Claude:**
- [x] Write `project.yml` (xcodegen spec) mirroring LyricsPiP: iOS app target, `App/` + `DivisiKit/` split, background modes for audio (PiP-related capabilities deferred to M7)
- [x] Add minimal `App/` (app entry point + placeholder `ContentView`) and empty `DivisiKit/`
- [x] Add `.gitignore` (standard Xcode/Swift) and a README stub describing the project
- [x] Run `xcodegen generate`, confirm the empty scaffold builds
- [x] Initial commit

**Tasks — Human:**
- [x] Confirm/set the bundle identifier and signing team in `project.yml` (tied to your Apple Developer account)

### M2 — MIDI parsing (notes + lyric events) [x]

**Acceptance criteria:**
- [x] Given a fixture MIDI file, parsed note count/timing spot-checks correctly against the source for a sample measure
- [x] Lyric events parse correctly when present, and parsing degrades gracefully (empty array, no crash) when absent

**Tasks — Claude:**
- [x] Define `MIDINote` / `MIDILyricEvent` models (pitch, start/duration in ms, voice part)
- [x] Write `MIDIParser` — pivoted from the planned `AVAudioSequencer`/`AVMusicTrack.enumerateEvents` to AudioToolbox's `MusicSequence`/`MusicEventIterator` C API: `AVMIDIMetaEvent` in the current SDK only exposes `.type`, not the payload bytes, so lyric/track-name text can't actually be read back through it. Same underlying engine, one layer down.
- [x] Map tracks to voice parts: track-name meta-events (tolerant of numbering/punctuation/divisi splits), fall back to mean-pitch ranking (S/A/T/B high→low) when names are ambiguous or absent
- [x] Add 1–2 sample/public-domain SATB MIDI fixtures to the repo for dev use

**Tasks — Human:**
- [ ] Supply a few real choir MIDI files (from your practice library) as test fixtures
- [ ] Spot-check the track→voice-part mapping against a file where you know the real SATB order

### M3 — MIDI playback engine [x]

**Acceptance criteria:**
- [x] MIDI file plays audibly at correct tempo (simulator or device)
- [x] Play/pause/seek work and reported position stays accurate
- [x] Backgrounding the app during playback doesn't stop audio (device test)

**Tasks — Claude:**
- [x] Build `DivisiPlaybackService` wrapping `AVAudioSequencer` + `AVAudioEngine` (default GM sampler for MVP), exposing play/pause/seek and a polled `currentPositionMs`, shaped like `SpotifyNowPlayingService`
- [x] Configure `AVAudioSession` (`.playback` category, background audio) — this app generates its own sound, unlike LyricsPiP's `.mixWithOthers`

**Tasks — Human:**
- [x] Verify playback and background audio survive backgrounding on a real device

### M4 — In-app follow-along (sync engine + moving staff-notation cursor) [ ]

**Pivoted from a piano-roll to real engraved notation** (was backlog "Real engraved staff notation" — promoted here after the human decided a MuseScore-style moving cursor over actual sheet music was the real goal, not a DAW-style piano-roll). Rendering via [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) (MIT, VexFlow-based, has a `Cursor` API built for exactly this) in a `WKWebView`, rather than hand-rolling an engraving engine.

**Scope expanded mid-milestone** (before human sign-off) to cover the score-view interactions needed for it to actually read as useful for practice: multiple display modes, tap-to-seek, and scrolling. See the new acceptance criteria/tasks below.

**Acceptance criteria:**
- [ ] Starting playback renders real engraved notation (via OpenSheetMusicDisplay) for the selected voice part, with a MuseScore-style cursor moving in sync with playback position
- [ ] Pause/resume/seek reflected within ~1s
- [ ] Score view offers three display modes, switchable at any time: all parts flat (full SATB score, no emphasis), one part highlighted (full score, chosen voice visually emphasized), and solo (only the chosen voice's staff)
- [ ] Switching voice part or display mode changes only what's shown — it never restarts, reloads, or repositions the audio. Audio always plays the full mix (all parts); the picker only controls what the score view follows/highlights
- [ ] The score view scrolls, so pieces longer than one screen-width are viewable, without score taps changing playback position
- [ ] The score can zoom in/out from the app UI
- [ ] Selecting a voice part shows a volume-balance slider, live-adjustable during playback, running from quieter-than-the-rest through even to louder-than-the-rest (for learning a part vs. practicing against the full mix)
- [ ] Human confirms the moving-notation view actually reads as useful for practice, before PiP work is invested in

**Tasks — Claude:**
- [x] Build a MIDI→MusicXML converter: quantize `ParsedMIDI` notes to a fixed rhythmic grid (derived from the file's tempo/time-signature) and emit MusicXML for one voice part at a time
- [x] Embed OpenSheetMusicDisplay in a `WKWebView` (mirroring the [massimobio Swift/WKWebView example](https://github.com/massimobio/OpenSheetMusicDisplay-Swift-Example)) to render the generated MusicXML
- [x] Build `DivisiSyncEngine` (`@MainActor`, `ObservableObject`): each playback poll tick, map `currentPositionMs` to the corresponding OSMD cursor step and drive it via a JS bridge
- [x] Render lyric text alongside/below the score when present for the current time
- [x] Handle pause/resume/seek/no-file-loaded states in the sync engine from the start (LyricsPiP's own backlog flagged this as skipped for the Spotify case)
- [x] Fix: `DivisiSyncEngine.load` currently reloads `DivisiPlaybackService` (restarting audio from position 0) every time the voice-part picker changes, since it was written for the one-part-at-a-time smoke test. Split it into a file load (parse + start playback, called once per file) and a display-only voice-part/view-mode switch (re-converts/re-renders the score, never touches playback)
- [x] Extend `MusicXMLConverter` to emit all four voice parts as a multi-part score (one `<part>` per voice, all padded to the same shared measure count so they align vertically), alongside the existing single-part output — needed for the flat and highlighted modes
- [x] Add the view-mode picker (flat / highlighted / solo) to the shell; drive which OSMD rendering is shown and, for "highlighted", how the selected part's noteheads are tinted (check OSMD's per-part/voice coloring options vs. custom CSS/JS)
- [x] Disable tap-to-seek for the current practice view after it proved too easy to disrupt scrolling/part switching
- [ ] Add an explicit seek control (transport scrubber/slider) — tap-to-seek was disabled above with nothing put in its place, so there is currently no way to seek/scrub at all
- [x] Enable scrolling in the `WKWebView` (currently `scrollView.isScrollEnabled = false`, set for the single-line MVP smoke test) and confirm OSMD's layout scrolls correctly at in-app size
- [ ] Add zoom in/out controls for the score — built but confirmed non-functional (tapping the buttons produces no visual change); needs real debugging, not just a build/type-check
- [x] Give `DivisiPlaybackService` a per-voice-part volume knob: route each MIDI track to its own mixer input (one `AVAudioUnitSampler`/mixer channel per track, or per-track gain if one shared sampler can't do it) instead of all tracks sharing one sampler node as today, using `MIDIParser`'s existing track→voice-part mapping to know which track is which. `AVAudioMixerNode.outputVolume` per input is the likely mechanism
- [x] Wire the balance slider to that API, scoped to the currently-selected voice part (the other three parts move together as "the rest")

**Tasks — Human:**
- [ ] Try it against a real MIDI file end-to-end; sign off that the moving-notation view is actually useful before moving on

### M5 — Basic SwiftUI shell [ ]

**Acceptance criteria:**
- [ ] End-to-end in-app flow works: import a MIDI file, pick a voice part, play, watch the roll, pause/seek

**Tasks — Claude:**
- [ ] `ContentView`: MIDI file import (`fileImporter`/`UIDocumentPickerViewController`), voice-part picker (S/A/T/B), play/pause/seek controls wired to `DivisiPlaybackService` + `DivisiSyncEngine` + the in-app roll view
- [ ] Add `.playscore` import support: treat the file as a ZIP package, extract embedded MusicXML for notation, embedded MIDI for playback, and use the metadata/PDF only as optional supporting data. On iOS this needs either a ZIP reader dependency or a small package-reader implementation; the desktop extraction script proves the format path first.
- [ ] Basic visual settings (colors/sizing) — simple version, not the full ported `PiPSettingsStore` yet

**Tasks — Human:**
- [ ] Provide real MIDI files and practice-test the in-app flow end to end

### M6 — PiP score renderer (port to CVPixelBuffer) [ ]

**Note:** originally planned as a straight port of the piano-roll's layout math (M4 was Canvas-based then). Since M4 pivoted to OSMD rendering in a `WKWebView`, and a `WKWebView` can't stream frames to a `CVPixelBuffer` at real-time rates, this milestone needs its own rendering answer for PiP — most likely a native re-render of the same quantized note data (from the M4 MusicXML converter), not a port of OSMD itself. Revisit the approach when M5 is done.

**Acceptance criteria:**
- [ ] A static single-frame render (given a fake playback position) lays out correctly — verify by dumping a frame to PNG for inspection
- [ ] Legible at real PiP window size on device

**Tasks — Claude:**
- [ ] Port the in-app piano-roll's layout logic into a `CVPixelBufferPool`-based `DivisiPianoRollRenderer`, mirroring `PiPTextRenderer`'s approach — reuse the same layout math so PiP output matches the in-app view
- [ ] Apply visual settings (colors/sizing) to the new renderer

**Tasks — Human:**
- [ ] Visual sign-off: confirm the rendered PiP frame reads clearly at actual PiP size

### M7 — Port PiPController + settings store, wire PiP into the shell [ ]

**Acceptance criteria:**
- [ ] PiP window starts from a button tap and shows the piano-roll renderer live, matching in-app behavior
- [ ] Confirmed working on a physical device

**Tasks — Claude:**
- [ ] Copy `PiPController`, `PiPVisualSettings`/`PiPSettingsStore`, `PiPHostView` into `DivisiKit`; rename types, strip lyric-specific bits, wire to the M6 renderer
- [ ] Confirm the live/unbounded `AVPictureInPictureSampleBufferPlaybackDelegate` time-range trick still works unchanged
- [ ] Wire `DivisiSyncEngine` to also push frames to `PiPController` (pushFrame/animate) alongside the in-app view
- [ ] Add "Start Practice + Enter PiP" button to the shell; port full `SettingsView`

**Tasks — Human:**
- [ ] Enable Background Modes (Audio, AirPlay, PiP) capability in Xcode signing settings
- [ ] Confirm PiP starts and stays alive on a real device (simulator PiP is unreliable)

## Backlog

- **Superseded 2026-08-27** by the product pivot to a web player (see Log) — a website is reachable from Android (and everywhere else) without a separate native port, so this item's motivation is largely moot. Left here for the reasoning, not as live backlog.
- Android port, if iOS proves out. Two pieces are already portable as-is: OpenSheetMusicDisplay runs unchanged in Android's `WebView` (same JS/HTML bundle), and MusicXML is the shared interchange format between parsing and rendering — Android just needs its own MusicXML producer to reuse the same rendering layer. `AVAudioEngine`/`AVAudioSequencer` (playback), `AudioToolbox`'s `MusicSequence` (MIDI parsing), the SwiftUI shell, and PiP are NOT portable and will need real per-platform implementations regardless (PiP especially — genuinely different OS APIs, always a double build). Decided against adopting Kotlin Multiplatform or a cross-platform framework (React Native/Flutter) now, before any Android code exists — that's speculative infra, and a cross-platform framework would fight the native audio-timing/PiP work already invested. **Standing constraint on future iOS work**: keep the pure-algorithm pieces (MIDI-parsing rules, quantization/note-decomposition math in `MusicXMLConverter`, the poll→derive→cursor-index math in `DivisiSyncEngine`) free of Foundation/UIKit-specific types where the logic itself doesn't need them — plain data in, plain data/strings out. Costs nothing now; turns a future Kotlin port into translation rather than redesign. Revisit KMP-vs-duplicate only once Android work actually starts.
- Pitch feedback (mic input + pitch detection against the reference part)
- Printed sheet music → MIDI conversion (OMR), likely by shelling out to an existing open-source engine (Audiveris, oemer) rather than building recognition from scratch
  - Post-OMR correction UI (fix misassigned voice parts, wrong pitches, mistimed notes before the file is used for practice) — evaluate MIDIKit's `MIDIKitSMF` (editable Swift event/track model) vs. raw AudioToolbox `MusicSequence` (insert/delete events + `MusicSequenceFileCreate` to write back) for the edit+export layer

## Log

- 2026-08-27: **Product pivot — this iOS app is paused/backlogged.** The human reframed priorities: the earliest useful version of Divisi is a website, not a native app — choir members join a group's practice tracks as unauthenticated guests (login only needed to save annotations), and the top priority is a genuinely accurate, easy-to-use synced player (explicitly benchmarked against PlayScore, whose UI and audio/visual sync the human finds lacking) plus customizable practice tracks (per-part balance) playable in the background. A website also sidesteps a real technical pain point this app hit repeatedly: OSMD is a JS library that had to be wrapped in a `WKWebView` bridge on iOS (source of the cursor-sync and zoom bugs logged above) — on a real website it runs natively with direct access to the audio clock. New work continues in `Frontend/plan.md`; this app's MIDI-parsing/MusicXML-quantization logic and design carries over conceptually (see that plan's log) even though the Swift code itself doesn't run on web.
- 2026-08-27: Reconciled the M4 checklist against reality after hands-on testing found two tasks checked off that don't actually work: zoom in/out (tapping the buttons produces no visible change — reproduced 3x via scripted taps, not a one-off) and tap-to-seek's replacement (disabling tap-to-seek was completed, but the "explicit transport controls" it was meant to hand off to were never built, so there is currently no way to seek/scrub in the app at all). Unmarked both; M4 is back to in-progress rather than Claude-tasks-complete. Root cause of the false-done state: the ChatGPT session that built these checked them off after only `node --check` + a stripped Swift type-check (per its own log), no real build or interaction; a following Claude Code pass verified the real build/render but didn't exercise every control before treating the checklist as trustworthy. Per the human's request, holding off on fixing either bug right now to replan first.
- 2026-08-26: Verified the ChatGPT-authored M4 changes (display-mode picker, tap-to-seek build-then-disable, scrolling, zoom, per-part balance/mixer rework) in a real Xcode environment, since that session's own log flagged it couldn't run `xcodebuild`/simulator and only checked `node --check` + a stripped-down Swift type-check. `xcodebuild` for the actual scheme/simulator destination: **BUILD SUCCEEDED**, no errors. Installed and launched on iPhone 17 Pro simulator: the real Lacrymosa fixture loads, Highlighted mode correctly renders all 4 SATB staves (with the vocal tenor clef's octave marking) with soprano's noteheads tinted blue and the cursor sitting on beat 1, zoom in/out buttons and the balance slider are present and render correctly. Didn't get a reliable scripted tap on Play via AppleScript/System Events to confirm live cursor motion during this pass (UI-automation flakiness, not a suspected code issue) — play/pause/poll wiring itself is unchanged from already-verified M3/M4 mechanics, so this is low-risk, but real playback is still worth the human's own tap before sign-off.
- 2026-08-26: Investigated `Fixtures/The_Challenge_of_Thor_Elgar-S2.playscore`. It is a ZIP-based PlayScore package containing `doc.xml` (MusicXML), `doc.mid` (MIDI), `doc.json` metadata, and a 15-page PDF. Added `scripts/extract_playscore.py` and extracted ordinary fixture files: `The_Challenge_of_Thor_Elgar.musicxml`, `.mid`, `.playscore.json`, and `.pdf`. The MusicXML has five parts: the first four are vocal-looking staves ordered high to low, and the fifth is dense accompaniment. The embedded MIDI is format 1 but only one track with many channels, so MusicXML should be the source of truth for notation/part identity.
- 2026-08-26: Adjusted M4 UX after device testing feedback: the score is now the dominant area of the screen, tap-to-seek is disabled (`tapToSeekEnabled = false`) so scrolling/tapping the sheet no longer unexpectedly changes playback, OSMD's automatic follow-scroll is off, and the shell has zoom-out/zoom-in controls backed by `OSMDController.setZoom`. The smoke test now loads the Lacrymosa MIDI fixture (`Mozart_Lacrymosa_from_Requiem_SATB_with_piano.mid`), copied into `DivisiKit/Resources` and added to the Xcode project resources. Also deferred building/loading the multi-sampler audio graph until `DivisiPlaybackService.load` so the app can reach its first screen before soundfont allocation. Verification: JS syntax check passes; Swift type-check passes with the preview macro stripped into a temporary file.
- 2026-08-26: Finished the remaining M4 implementation tasks in the smoke-test shell: `ContentView` now has flat/highlighted/solo display mode switching, keeps voice/display changes display-only, passes the selected display mode into `DivisiSyncEngine.loadFile`, and exposes a live part-balance slider. `OSMDWebView` now allows scrolling and reports score taps back to Swift as OSMD whole-note timestamps, which `DivisiSyncEngine` converts back to milliseconds and seeks immediately. `DivisiPlaybackService` now routes parser-mapped SATB tracks through per-part sampler/mixer channels, keeps unmapped/accompaniment tracks on a backing channel, and applies a selected-part-vs-rest balance live during playback. Parser output now carries `trackVoiceParts` so playback uses the same track mapping as notation/lyrics. Verification: JS extracted from the OSMD host page passes `node --check`; direct Swift type-check passes when the preview-only macro is stripped into a temporary file; full `xcodebuild` still cannot complete in this environment because local CoreSimulator/asset-catalog tooling reports no available simulator runtimes before packaging finishes.
- 2026-08-26: Extended `MusicXMLConverter` with `convertAllParts`, emitting a 4-`<part>` SATB score for the flat/highlighted display modes. Shared per-measure body-emission logic with the existing single-part `convert()` via a refactor (no behavior change to the single-part path). Parts are padded to a shared measure count so barlines align — including parts with zero source notes, which get full rest-only measures rather than being dropped, so every part remains visible in full-score modes regardless of what a given file actually uses. Verified with a standalone `swiftc` harness (kept the code fully Foundation-only, no UIKit — consistent with the Android-portability note added above) against a synthetic file with uneven per-part note counts: all 4 parts came out at equal measure counts. Existing single-part `convert()` output unchanged (checked in the same run).
- 2026-08-26: Fixed the voice-part-switch-restarts-audio bug: `DivisiSyncEngine.load` split into `loadFile` (parse + start playback, once per file) and `setVoicePart` (re-converts/re-renders the score only, re-syncs the cursor to the current playback position, never touches playback). `ContentView`'s smoke test updated to call `setVoicePart` from the picker's `onChange` instead of reloading the fixture. Verified with a full simulator build (`xcodebuild` green); stale SourceKit "cannot find in scope" errors on the edited files were just index lag, not real.
- 2026-08-26: M4 scope expanded again — a per-voice-part volume-balance slider (louder/same/quieter than the rest), live-adjustable during playback. Requires reworking `DivisiPlaybackService` off its current single-shared-sampler design (all MIDI tracks currently point at one `AVAudioUnitSampler`) to one mixer input per track, using `MIDIParser`'s track→voice-part mapping to know which input is which part.
- 2026-08-26: M4 scope expanded before human sign-off, based on trying the smoke test: added three score display modes (flat/highlighted/solo), tap-a-note-to-seek, and scrolling as new acceptance criteria. Also caught a design flaw to fix — `DivisiSyncEngine.load` currently reloads/restarts `DivisiPlaybackService` whenever the voice-part picker changes; per the human, switching the picker must only change what's displayed, never what's playing or its position (audio is always the full mix).
- 2026-08-26: M4 Claude tasks complete — OSMD embedded in a `WKWebView` (vendored `opensheetmusicdisplay.min.js`, local `index.html` host page, JS↔Swift bridge via `WKScriptMessageHandler`/`evaluateJavaScript`), `DivisiSyncEngine` wired to `DivisiPlaybackService` polling + the MusicXML converter's `noteStartMs` array (binary search → cursor index, immediate update on seek), lyric text derived the same way, and a `State` enum (`noFileLoaded`/`ready`/`noNotesForVoicePart`/`error`) covers the sync engine's states from the start. Verified visually on the simulator against `requiem-satb-plain.mid`: engraved notation renders correctly (clef/key/time sig, notes) with the cursor sitting on the first note. Two bugs found and fixed along the way: (1) XcodeGen/Xcode flattens `Resources/osmd/`'s subfolder into the bundle root rather than preserving it, so the HTML/JS lookup and the `<script src>` path both had to assume no subdirectory; (2) `WKWebView.evaluateJavaScript` can't marshal a Promise back across the bridge, so calling the `async` `divisiLoadScore` always reported a spurious "unsupported result type" error even on success — fixed by treating the JS-posted "ready"/"error" message as the authoritative signal and special-casing that one error code. ContentView's M3 smoke test replaced with an M4 equivalent (voice-part picker + score view + lyric + play/pause). Live cursor-advances-during-playback and the two human tasks (real end-to-end MIDI file, usefulness sign-off) still open.
- 2026-08-26: M4 replanned mid-flight — pivoted from a Canvas piano-roll to real engraved notation (OpenSheetMusicDisplay in a `WKWebView`, MuseScore-style moving cursor), per the human's preference for actual sheet music over a DAW-style roll. Backlog's "real engraved staff notation" item promoted into M4. Flagged a downstream consequence for M6: WKWebView can't stream to a `CVPixelBuffer` for PiP, so that milestone will need its own native rendering approach later.
- 2026-08-26: M3 approved. Moving to M4 (in-app follow-along sync engine + piano-roll).
- 2026-08-26: M3 device test passed — plays on a physical iPhone (device already had a valid signing cert for the WZWT86647J team), and audio survives backgrounding. All acceptance criteria met.
- 2026-08-26: M3 built — DivisiPlaybackService verified: position-tracking mechanics via a standalone macOS harness, audible playback confirmed by human on the iPhone 17 Pro simulator (temporary smoke-test button in ContentView). Two of three acceptance criteria met; backgrounding-survives-on-device still needs the human's real-device test.
- 2026-08-26: M2 approved. Moving to M3 (playback engine).
- 2026-08-26: M2 parser built and verified against all three fixtures (note counts/timing/pitches match generate.py's source exactly; lyrics parse when present, empty when absent; Organ track correctly excluded). Pivoted off the plan's originally-named `AVAudioSequencer`/`AVMusicTrack.enumerateEvents` approach to AudioToolbox's `MusicSequence`/`MusicEventIterator` C API after discovering `AVMIDIMetaEvent` doesn't expose readable payload bytes in the current SDK — only `.type`. Also added SMF format 0/1 detection and more tolerant track-name matching (numbering, punctuation, divisi splits) ahead of getting real files, per the user's expectation that real-world MIDI exports will vary more than the synthetic fixtures.
- 2026-08-26: Added M2 dev fixtures — 3 synthetic MIDI files under `Fixtures/` (plain SATB, SATB+lyrics, SATB+accompaniment track), approximating the opening of Mozart's Requiem's "Requiem aeternam" chorus. Generated via `Fixtures/generate.py` (mido) rather than sourced from a choral archive — most free MIDI/choral archive sites (CPDL, 8notes, MuseScore, smallchurchmusic) blocked automated fetching or required accounts. Pitches are a from-memory approximation, not a verified transcription; see `Fixtures/README.md` for the caveat.
- 2026-08-26: M1 approved — same team confirmed, bundle ID/signing team left as-is. Moving to M2.
- 2026-08-26: M1 scaffold built — xcodegen spec, App/ + empty DivisiKit/, xcodegen+xcodebuild verified green, app launches showing the placeholder screen (screenshotted in simulator). Bundle ID (`com.maripaz.divisi`) and dev team (`WZWT86647J`) carried over from LyricsPiP as defaults — human task to confirm/adjust these still open.
- 2026-08-26: Project started. Inspired by LyricsPiP (~/projects/karaoke) — reusing the PiPController/PiPVisualSettings/PiPSettingsStore pattern and the overall SyncEngine shape (poll position → derive current → push frame), swapping Spotify+LRCLIB for MIDI playback + parsed note/lyric events.
- 2026-08-26: Plan expanded to full task/criteria detail across all 7 MVP milestones in one pass.
- 2026-08-26: Reordered milestones — PiP (renderer port + PiPController) pushed to M6/M7, after an in-app (on-screen, non-PiP) follow-along is validated in M4/M5. Reasoning: prove the core practice loop before taking on PiP's CVPixelBuffer/AVPictureInPictureController plumbing.
