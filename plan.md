# Project Plan: Divisi

**Current milestone:** M3

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

### M3 — MIDI playback engine [~]

**Acceptance criteria:**
- [ ] MIDI file plays audibly at correct tempo (simulator or device)
- [ ] Play/pause/seek work and reported position stays accurate
- [ ] Backgrounding the app during playback doesn't stop audio (device test)

**Tasks — Claude:**
- [ ] Build `DivisiPlaybackService` wrapping `AVAudioSequencer` + `AVAudioEngine` (default GM sampler for MVP), exposing play/pause/seek and a polled `currentPositionMs`, shaped like `SpotifyNowPlayingService`
- [ ] Configure `AVAudioSession` (`.playback` category, background audio) — this app generates its own sound, unlike LyricsPiP's `.mixWithOthers`

**Tasks — Human:**
- [ ] Verify playback and background audio survive backgrounding on a real device

### M4 — In-app follow-along (sync engine + on-screen piano-roll) [ ]

**Acceptance criteria:**
- [ ] Starting playback shows the piano-roll live on-screen, updating smoothly with correct notes highlighted at correct times
- [ ] Pause/resume/seek reflected within ~1s
- [ ] Human confirms the scrolling roll actually reads as useful for practice, before PiP work is invested in

**Tasks — Claude:**
- [ ] Build `DivisiSyncEngine` (`@MainActor`, `ObservableObject`): each playback poll tick, compute the current time window of notes per voice part from parsed MIDI data
- [ ] Build an in-app SwiftUI view (Canvas-based) rendering the piano-roll — lanes per voice part, note bars, playhead — using layout logic that will later back the PiP renderer directly, not a rewrite
- [ ] Render lyric text below the roll when present for the current time
- [ ] Handle pause/resume/seek/no-file-loaded states in the sync engine from the start (LyricsPiP's own backlog flagged this as skipped for the Spotify case)

**Tasks — Human:**
- [ ] Try it against a real MIDI file end-to-end; sign off that the on-screen roll is actually useful before moving on

### M5 — Basic SwiftUI shell [ ]

**Acceptance criteria:**
- [ ] End-to-end in-app flow works: import a MIDI file, pick a voice part, play, watch the roll, pause/seek

**Tasks — Claude:**
- [ ] `ContentView`: MIDI file import (`fileImporter`/`UIDocumentPickerViewController`), voice-part picker (S/A/T/B), play/pause/seek controls wired to `DivisiPlaybackService` + `DivisiSyncEngine` + the in-app roll view
- [ ] Basic visual settings (colors/sizing) — simple version, not the full ported `PiPSettingsStore` yet

**Tasks — Human:**
- [ ] Provide real MIDI files and practice-test the in-app flow end to end

### M6 — PiP piano-roll renderer (port to CVPixelBuffer) [ ]

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

- Real engraved staff notation rendering (clefs/beams/ties) as an alternative/upgrade to the piano-roll view
- Pitch feedback (mic input + pitch detection against the reference part)
- Printed sheet music → MIDI conversion (OMR), likely by shelling out to an existing open-source engine (Audiveris, oemer) rather than building recognition from scratch

## Log

- 2026-08-26: M2 approved. Moving to M3 (playback engine).
- 2026-08-26: M2 parser built and verified against all three fixtures (note counts/timing/pitches match generate.py's source exactly; lyrics parse when present, empty when absent; Organ track correctly excluded). Pivoted off the plan's originally-named `AVAudioSequencer`/`AVMusicTrack.enumerateEvents` approach to AudioToolbox's `MusicSequence`/`MusicEventIterator` C API after discovering `AVMIDIMetaEvent` doesn't expose readable payload bytes in the current SDK — only `.type`. Also added SMF format 0/1 detection and more tolerant track-name matching (numbering, punctuation, divisi splits) ahead of getting real files, per the user's expectation that real-world MIDI exports will vary more than the synthetic fixtures.
- 2026-08-26: Added M2 dev fixtures — 3 synthetic MIDI files under `Fixtures/` (plain SATB, SATB+lyrics, SATB+accompaniment track), approximating the opening of Mozart's Requiem's "Requiem aeternam" chorus. Generated via `Fixtures/generate.py` (mido) rather than sourced from a choral archive — most free MIDI/choral archive sites (CPDL, 8notes, MuseScore, smallchurchmusic) blocked automated fetching or required accounts. Pitches are a from-memory approximation, not a verified transcription; see `Fixtures/README.md` for the caveat.
- 2026-08-26: M1 approved — same team confirmed, bundle ID/signing team left as-is. Moving to M2.
- 2026-08-26: M1 scaffold built — xcodegen spec, App/ + empty DivisiKit/, xcodegen+xcodebuild verified green, app launches showing the placeholder screen (screenshotted in simulator). Bundle ID (`com.maripaz.divisi`) and dev team (`WZWT86647J`) carried over from LyricsPiP as defaults — human task to confirm/adjust these still open.
- 2026-08-26: Project started. Inspired by LyricsPiP (~/projects/karaoke) — reusing the PiPController/PiPVisualSettings/PiPSettingsStore pattern and the overall SyncEngine shape (poll position → derive current → push frame), swapping Spotify+LRCLIB for MIDI playback + parsed note/lyric events.
- 2026-08-26: Plan expanded to full task/criteria detail across all 7 MVP milestones in one pass.
- 2026-08-26: Reordered milestones — PiP (renderer port + PiPController) pushed to M6/M7, after an in-app (on-screen, non-PiP) follow-along is validated in M4/M5. Reasoning: prove the core practice loop before taking on PiP's CVPixelBuffer/AVPictureInPictureController plumbing.
