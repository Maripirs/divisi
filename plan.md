# Project Plan: Divisi

**Current milestone:** M4

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

**Acceptance criteria:**
- [ ] Starting playback renders real engraved notation (via OpenSheetMusicDisplay) for the selected voice part, with a MuseScore-style cursor moving in sync with playback position
- [ ] Pause/resume/seek reflected within ~1s
- [ ] Human confirms the moving-notation view actually reads as useful for practice, before PiP work is invested in

**Tasks — Claude:**
- [x] Build a MIDI→MusicXML converter: quantize `ParsedMIDI` notes to a fixed rhythmic grid (derived from the file's tempo/time-signature) and emit MusicXML for one voice part at a time
- [x] Embed OpenSheetMusicDisplay in a `WKWebView` (mirroring the [massimobio Swift/WKWebView example](https://github.com/massimobio/OpenSheetMusicDisplay-Swift-Example)) to render the generated MusicXML
- [x] Build `DivisiSyncEngine` (`@MainActor`, `ObservableObject`): each playback poll tick, map `currentPositionMs` to the corresponding OSMD cursor step and drive it via a JS bridge
- [x] Render lyric text alongside/below the score when present for the current time
- [x] Handle pause/resume/seek/no-file-loaded states in the sync engine from the start (LyricsPiP's own backlog flagged this as skipped for the Spotify case)

**Tasks — Human:**
- [ ] Try it against a real MIDI file end-to-end; sign off that the moving-notation view is actually useful before moving on

### M5 — Basic SwiftUI shell [ ]

**Acceptance criteria:**
- [ ] End-to-end in-app flow works: import a MIDI file, pick a voice part, play, watch the roll, pause/seek

**Tasks — Claude:**
- [ ] `ContentView`: MIDI file import (`fileImporter`/`UIDocumentPickerViewController`), voice-part picker (S/A/T/B), play/pause/seek controls wired to `DivisiPlaybackService` + `DivisiSyncEngine` + the in-app roll view
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

- Pitch feedback (mic input + pitch detection against the reference part)
- Printed sheet music → MIDI conversion (OMR), likely by shelling out to an existing open-source engine (Audiveris, oemer) rather than building recognition from scratch
  - Post-OMR correction UI (fix misassigned voice parts, wrong pitches, mistimed notes before the file is used for practice) — evaluate MIDIKit's `MIDIKitSMF` (editable Swift event/track model) vs. raw AudioToolbox `MusicSequence` (insert/delete events + `MusicSequenceFileCreate` to write back) for the edit+export layer

## Log

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
