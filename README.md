# Divisi

An iOS app for choir practice: play a SATB MIDI file, follow your voice part
as a scrolling piano-roll, and pop it out into Picture-in-Picture so you can
practice while your phone does something else.

Architecture and reused patterns are inspired by
[LyricsPiP](../karaoke) — the `PiPController` / `PiPSettingsStore` /
sync-engine shape carries over, with MIDI playback and parsed
note/lyric events standing in for Spotify + LRCLIB.

See `plan.md` for the milestone-by-milestone build plan.

## Structure

- `App/` — SwiftUI app entry point, views, assets
- `DivisiKit/` — MIDI parsing, playback, sync engine, PiP plumbing

## Building

```
xcodegen generate
xcodebuild -project Divisi.xcodeproj -scheme Divisi -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```
