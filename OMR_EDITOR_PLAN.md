# Project Plan: Divisi OMR + Notation Editor

This plan owns the scanned-PDF → MusicXML (OMR) pipeline and the in-app notation-correction editor built on top of it. It was split out of `Backend/plan.md` and `Frontend/plan.md` on 2026-09-01 so those two plans stay focused on core product work; milestones here are prefixed `E`. The work spans both halves of the stack: the backend (`app/omr/`, the `/omr/*` routes, Alembic migrations) and the frontend (`/piece/[id]/edit`, `EditorScoreView`, `EditableScore`). The E1..E10 order below follows build and dependency order, so backend and frontend milestones interleave.

## Milestone map

| New | From | Title | Status |
|---|---|---|---|
| E1 | B8 | OMR pipeline | ✅ Done (verified end-to-end on macOS) |
| E2 | F14 | In-app notation editor for a track's music | 🚧 In progress — edit/save/export loop done 2026-08-31 (route, editable model, editing surface, MusicXML export, save-as-draft, unsaved guard, entry points, i18n). **Reopened 2026-08-31** for in-editor playback — full transport (play/stop, seek, tempo, per-part mix), playback cursor + follow-scroll, note-preview-on-select, full-screen player-style shell: **all Claude tasks done 2026-08-31**, pending the human real-browser pass + acceptance-criteria sign-off. Playhead reworked + desync fixed 2026-09-01, now with a Playwright e2e regression test (`Frontend/e2e/`) — that pass caught and fixed a per-frame `osmd.render()` stall. |
| E3 | B16 | Paged OMR pipeline | ⏳ Claude tasks done (full suite 181 green); human hasn't run a real multi-page scan through it. Migration `d2f8a6c4e1b9` not yet on production — reaches prod only via merge to `main` (its parent `c1f7a4d2e8b6` is already on prod + `main` as of 2026-08-31) |
| E4 | F15 | Review a segmented OMR result in the editor | ⏳ Built, `check`/`build`-clean, vitest 58 green. **Review UX superseded by E10** (page-by-page); seam-onset mapping + markers are kept and reused there |
| E5 | B17 | Working-draft slot + per-page OMR progress & re-run (backend) | ⏳ Claude tasks done (202 green); human hasn't run a real multi-page scan + re-run through it. Migration `e7b1c9d3a2f4` not on production — reaches prod only via merge to `main` |
| E6 | F16 | Working-draft slot: labelled editing, seam-fill, per-page progress & re-run (frontend) | ⏳ Claude tasks done, `check`/`build`-clean, vitest 67 green. Working-draft slot / save / publish / re-run / insert-bars all kept; the seam-first **review flow is reorganised by E10**. Still needs E5 deployed |
| E7 | F17 | Editor "Measures" mode: select a bar range, change its clef | ⏳ Claude tasks done + first live-test round fixed (bar selection, highlight geometry, clef-row label), `check` 0 errors, vitest 76, e2e 6 green (new `editor-measures.spec.ts`); still wants a human confirm |
| E8 | F18 | Editor undo / redo | ⏳ Claude tasks done — snapshot stack, toolbar buttons, Cmd/Ctrl+Z / Shift+Z / Ctrl+Y, dirty-state tracked back to last save; `check` 0 errors, vitest 89 (+6 `editHistory`), `build` clean; needs a real-browser pass |
| E9 | B18 | Per-page measure offsets in the paged report (backend) | ✅ Built 2026-09-01 (`pytest` 205 green); no migration, report-shape only. Feeds E10 |
| E10 | F19 | Page-by-page review of a generated draft (frontend) | ⏳ Claude tasks done 2026-09-01, `check`/`build`-clean, vitest 103 green; needs the full real-browser pass (replaces E4's + E6's pending passes). Supersedes the E4/E6 review UX. Reworked 2026-09-01 to a strict in-order one-page-at-a-time review bar (no tab stepper / chip rail) with the score pane locked + dimmed to the current page and trimmed editor chrome during review; model unchanged. Still needs the real-browser pass |

### E1 — OMR pipeline (formerly B8)

**Acceptance criteria:**
- [x] Uploading a scanned sheet-music PDF produces a job id; polling it eventually returns MusicXML/MIDI output for a real test PDF

**Tasks — Claude:**
- [x] `app/omr/audiveris.py` (subprocess wrapper), `app/omr/oemer.py` (subprocess wrapper — wraps the CLI, not a direct import; oemer has no other stable entry point), `pipeline.py` (chooses/chains engine, normalizes to MusicXML)
- [x] Background-task job tracking (DB row: pending/running/done/failed + result path)
- [x] `/omr/jobs` POST (upload) + `/omr/jobs/{id}` GET (status/result) endpoints
- [x] Follow-up: `POST /omr/jobs/{id}/import` turns a `done` job's result into a real `Piece`/`PieceVersion`
- [x] Follow-up (2026-08-31): `GET /omr/jobs` lists the caller's own jobs (newest first, +piece/group context) for the Frontend's "your generation finished" header alert
- [x] `audiveris.py` now passes `-constant org.audiveris.omr.Main.sheetStepTimeOut=<audiveris_step_timeout_seconds>` (default 1800s) — Audiveris's own 120s-per-step default is too tight for real scores, not a sandbox artifact (see log below)

**Tasks — Human:**
- [x] Supply a real scanned sheet-music PDF to test the pipeline end-to-end — used `fixtures/SFCC/Coleridge-Taylor_Proserpine_A4.pdf` (real 4-part choral score, not a toy image)
- [x] Install Audiveris locally — GitHub release `.dmg` (bundles its own JRE, no separate JDK needed); recipe in `Backend/README.md`'s "OMR engines" section

**Verified 2026-08-31 (macOS, arm64):** Both engines installed and run end-to-end against the real fixture above (see log entry below for the full debugging trail — sandbox CPU/IO throttling, the 120s timeout, missing Tesseract language data, and two real bugs in oemer 0.1.8 itself). Audiveris correctly recovers the piece's 4-part (SATB) structure and OCR's its lyrics/title/composer; oemer's output flattens every staff into one part with notes stacked as chords and captures no lyrics at all (it has no OCR step) — confirms `pipeline.py`'s existing engine priority (Audiveris primary, oemer a last-resort single-page fallback) is the right call, not just a paper design.

### E2 — In-app notation editor for a track's music (formerly F14)

Requested 2026-08-31. E1 (OMR) can now generate a track's music
straight from its scanned PDF, but the output is rough (wrong accidentals,
stray/missing notes, off rhythms) and today the only way to fix it is to
download the file, edit it in desktop MuseScore/Finale, and re-upload. This
milestone puts an editor *in the app* so an admin opens it on a track's
music file, corrects the notation, and saves the result as a new draft
version — no round trip through another program. The human chose a full
in-app editor over the lighter options (external download/re-upload
round-trip; embedding a third-party web editor like Flat.io/Soundslice)
when asked.

**Engine decision (2026-08-31, from the spike): path 1 — correction-only
editor on OSMD, with a MusicXML-DOM editable model.** The spike
(`/spike/f14-editor`, `src/lib/spike/musicXmlEdit.ts` — throwaway, delete
once the real editor lands) proved the whole loop against the bundled
`SFCC/The_Challenge_of_Thor_Elgar.musicxml` fixture in a real browser:
click a notehead → OSMD `GraphicSheet.GetNearestNote` → resolve to a
`<note>` in a parsed XML `Document` (by part id + staff + absolute
whole-note onset, walked from `<divisions>`/`<backup>`/`<forward>`) →
mutate that element (transpose ±1 semitone rewriting
`<step>`/`<alter>`/`<octave>` + syncing `<accidental>`; delete = convert
to `<rest>` of the same `<duration>` so nothing downstream shifts) →
`osmd.load(serializedXml)` + `osmd.render()`. Verovio was not prototyped:
the OSMD loop cleared every bar path 1 needs, and Verovio would add a
~2 MB WASM payload to a page choir members open on phones, plus a
MusicXML↔MEI round-trip that risks dropping the PDF-carry-forward and
any data OMR emitted that we don't model. Findings that shape the build:

- **OSMD stays a pure view.** The editable model is the XML `Document`
  itself (mutate in place, re-serialize), *not* `$lib/musicxml/parser.ts`
  (read-only, no serializer) and *not* OSMD's internal `Sheet` graph
  (no edit API). Mutating the DOM leaves every element we don't touch
  (layout hints, unmodelled OMR output, the structure) exactly as-is —
  which is the whole point for "clean up an OMR result".
- **Click → note identity needs part-awareness.** OSMD numbers staves
  globally across the score; MusicXML `<staff>` is per-part. Map via
  `sourceNote.ParentStaffEntry.ParentStaff.ParentInstrument.IdString`
  (the MusicXML part id) + the in-instrument staff index + onset. A
  naive staff-number match picks a note in the wrong part.
- **Full re-render per edit is the main perf cost** — ~1.2 s on a
  3,751-note orchestral reduction; an OMR page (tens–low-hundreds of
  notes) will be far quicker, but debounce rapid edits and keep the
  "updating…" affordance `ScoreView` already uses. OSMD has no partial
  re-render.
- **Rough edges to finish in the real editor:** re-highlighting the
  edited note after re-render (the spike falls back to parking OSMD's
  playback cursor on it); chord handling on delete (spike only promotes
  the next chord member when the anchor note goes); accidental spelling
  on transpose is a fixed sharp/flat table, no key-aware respelling;
  duration edits (in path 1's set) not yet prototyped — straightforward
  DOM-wise but they shift following onsets, so they need the same
  measure-timing care `deleteToRest` took.

For the record, the paths that were on the table, cheapest first:
1. **Correction-only editor on our own render** — click a note, nudge its
   pitch/duration, delete it, fix a clef/key/accidental; no engraving, no
   adding measures from scratch. Built on OSMD (or Verovio for finer
   coordinate control) + our parsers as the model. Covers ~all of the
   "clean up an OMR result" use case with the least new surface.
2. **Adopt an editing library** (e.g. a Verovio-based editor toolkit, or
   an OSS fork of one) and wrap it. More capability, more integration and
   licensing risk, larger bundle on a page choir members open on phones.
3. **General-purpose editor from scratch** — full note entry, layout,
   parts. Its own multi-month effort; almost certainly out of scope here.

The spike (done 2026-08-31) picked path 1; everything below assumes it.

**Save path:** the editor exports MusicXML and POSTs it to the existing
`POST /library/pieces/{piece_id}/versions` (music-file slot), which already
creates a `draft` version with `source: modification` and carries the
PDF slot forward — the same endpoint Frontend F5's edit panel and E1's OMR
auto-import use. No new Backend endpoint needed for a first cut. The
current web player synthesizes client-side and sniffs MIDI-vs-MusicXML by
magic bytes, so a MusicXML version plays without the Backend B7 render pipeline
(which only renders MIDI sources — a known gap tracked in Backlog).

**Entry points:** an "Edit music" action in the group Tracks tab's admin
edit panel (`groups/[id]`, next to Replace/Delete), and on the piece page
for a user viewing their own/admin track. Opens a new `ssr: false` route,
e.g. `/piece/[id]/edit`, mirroring the player route's client-only setup.
Gated to the piece's review authority (group admin, or the owner for a
personal piece) — the same `require_piece_access` check the upload path
already enforces server-side.

**Acceptance criteria:**
- [x] The spike's engine decision is written into this section, with the
      reason, before any editor code lands (done 2026-08-31)
- [ ] An admin can open the editor on a track that has a music file, from
      both the group Tracks edit panel and the piece page; a member with no
      edit rights on that track never sees the entry point, and the route
      itself 403s/redirects them if reached directly
- [ ] The editor loads the track's current music file and renders it as
      editable notation (for a MIDI-source track, via the existing
      MIDI→MusicXML conversion; for a MusicXML-source track, directly)
- [ ] Within the agreed scope (path 1: at minimum change a note's pitch,
      change its duration, delete a note, and fix key/clef/accidental) the
      admin can make an edit and see it reflected in the rendered notation
- [ ] Playing back inside the editor reflects the edits (reuses the
      client-side synth path — `MidiPlayer` + `parseMusicXmlFile` — not a
      separate engine). The editor carries a full transport: play/stop, a
      seek scrubber with elapsed/total time, a tempo control, and a
      per-part (SATB + accompaniment) mix, in the same visual language as
      the practice player's bottom bar
- [ ] A playback cursor tracks the audio position across the score while
      playing, with follow-scroll and a "scroll to cursor" control; it
      does not fight the click-to-select marker (selection marker is
      suppressed while playing, restored on stop)
- [ ] Editing the score while it is loaded for playback is handled
      sanely: the old audio keeps playing, a hint says the edits aren't
      audible yet, and the next play/seek reloads from the edited model
- [ ] Selecting a note (click or arrow-key nav) and changing a note's
      pitch both sound that note through the same synth, so a correction
      can be heard, not just seen
- [ ] The editor is a focused, full-screen surface with its own chrome
      (back / title / Save, no `AppHeader`/`BottomNav`), matching the
      practice player's shell; designed desktop-first for this pass
- [ ] Saving POSTs the edited MusicXML as a new `draft` version on that
      piece; the existing PDF slot is preserved; the new draft then flows
      through the normal submit/approve/distribute review workflow
      unchanged
- [ ] Leaving the editor with unsaved edits warns before discarding them
- [ ] The edited version is what the player loads afterward (once it's the
      latest / approved version, per the existing version-resolution rules)
- [x] `npm run check` / `npm run build` both clean (2026-08-31, plus the
      55-test vitest suite green)
- [x] New `messages/en.json` + `es.json` keys for every editor-facing
      string (2026-08-31; the placeholder `piece_editor_coming_soon` removed)

**Tasks — Claude:**
- [x] **Spike:** prototype the minimal "click a note, change its pitch,
      re-render" loop (done 2026-08-31, `/spike/f14-editor` +
      `src/lib/spike/musicXmlEdit.ts`). OSMD cleared path 1; Verovio not
      prototyped (bundle + MEI round-trip not worth it once OSMD worked).
      Decision + findings recorded above.
- [x] Editor route (`/piece/[id]/edit`, `ssr: false`) + server `load`
      that resolves the piece and enforces edit access (done 2026-08-31).
      Unlike the player route (whose `load` stays instant for shared-link
      cold-start first paint), this route's `load` hits the Backend:
      resolves the piece via `/library/pieces`, then grants for a personal
      piece's owner (JWT `sub` vs `owner_id`) or an `admin` of the owning
      group (`/groups` `role`) — the same rule the Backend's
      `_require_review_authority` enforces on save. `denied`/`notFound`/
      `unreachable` all render as cards; the placeholder editor body only
      mounts for `granted`.
- [x] Load + parse the track's music file into an editable model (task 2,
      2026-08-31 — `$lib/musicxml/loadEditableScore.ts` sniffs MIDI/MusicXML,
      MIDI through `convertAllParts` first, `.mxl` rejected)
- [x] Editing surface for the path-1 operation set (pitch, duration,
      delete, key/clef/accidental), with keyboard + click interaction
      (tasks 3 / 3b / 3c, 2026-08-31)
- [x] MusicXML export from the edited model (2026-08-31 —
      `EditableScore.exportMusicXml()`: `serialize()` plus the XML
      declaration and a partwise DOCTYPE; 2 unit tests)
- [x] Save action → `POST /library/pieces/[id]/versions` with the exported
      file; success returns to the piece page on the new draft (2026-08-31 —
      new `piece/[id]/edit/save/+server.ts`; draft only, no auto
      submit/approve/distribute, per the plan's review-flow note)
- [x] Unsaved-changes guard on navigation away (2026-08-31 —
      `beforeNavigate` `confirm()` for in-app nav + a `beforeunload`
      listener for tab close / hard reload, both keyed off `dirty`)
- [x] "Edit music" entry points in `groups/[id]` Tracks edit panel and the
      piece page, admin/owner-gated (2026-08-31 — Tracks panel link shown
      when `track.has_music`; piece page link in the practice-setup drawer,
      gated by a new `canEditMusic` flag `resolve/+server.ts` computes with
      the same owner/admin rule as the editor route's `load`)
- [x] `messages/en.json` + `es.json` keys (2026-08-31)
- [x] `npm run check` / `npm run build` clean (2026-08-31)

**Tasks — Claude (reopened 2026-08-31 — in-editor playback + note preview + full-screen shell):**

Desktop-first for this pass; a mobile layout for the toolbars/mix panel is
a follow-up (the three toolbar rows already eat ~40% of a phone screen).
Audio path is settled: `EditableScore.serialize()` → `parseMusicXmlFile()`
(`src/lib/musicxml/parser.ts`, already returns `ParsedMIDI` with SATB +
accompaniment buckets) → `MidiPlayer` (`src/lib/audio/player.ts`, the same
FluidSynth engine the player route uses).

- [x] **Shell:** editor page → full-screen player-style chrome (committed
      2026-08-31 `fe2cc95`: `.editor-shell` column, player-lifted `.top-bar`,
      pinned toolbars, `fill` prop on `EditorScoreView`, centered
      `.status-card` states).
- [x] **Working score → audio.** (2026-08-31) `currentParsedAudio()` memoizes
      `parseMusicXmlFile(workingXml)` on the exact string it parsed; an edit
      invalidates it but re-parse only happens on the next play/seek. A parse
      failure keeps the last good parse and renders the transport disabled
      with `piece_editor_transport_parse_error`.
- [x] **`MidiPlayer` lifecycle in the editor.** (2026-08-31) `ensurePlayer()`
      lazy-creates on first Play (reentrancy-guarded; will also cover note
      preview); `destroy()` in `onDestroy`; RAF `tick()` mirrors
      `positionMs`/`isPlaying` off the player, same shape as the player route.
      `MidiPlayer.create()` failure → `audioUnavailable` → disabled transport
      with `piece_editor_transport_unavailable`.
- [x] **Transport bar.** (2026-08-31) `.transport-bar` in the shell:
      play/stop toggle, `--fill` seek scrubber, `formatTime` elapsed/total —
      markup/styles lifted from the player's bottom bar.
- [x] **Tempo control.** (2026-08-31) Compact `−  [readout]  +` stepper in
      the transport row (not the mix panel), `describeTempo` readout,
      `player.setTempo`, `MIN/MAX_TEMPO_BPM` clamp. Survives an audio reload.
- [x] **Per-part mix panel.** (2026-08-31) Right-hand `.mix-panel` drawer
      toggled from a top-bar button; parts discovered from `ParsedMIDI.parts`
      on first load; per-part 0..1 volume sliders + "Reset to even".
      **Deviation:** no `everyone/minusMe/mostlyMe` presets — those key off a
      "your part" (`VoicePart`) focus the editor has no concept of; plain
      per-part sliders + an even reset is the right scope for a
      correction tool. `mixVolumes` persists across a reload.
- [x] **Playback cursor in `EditorScoreView`.** (2026-08-31) New optional
      `playbackWholeNotes` prop. One shared OSMD cursor: `placeCursor()`
      drives it from the audio position while playing (cheap `walkCursorTo`,
      only `reset()`s on a backward seek — same shape as `ScoreView`), and
      falls back to `parkSelectionCursor()` on stop, so the selection marker
      is suppressed during playback and restored after. Follow-scroll ported
      and simplified (here `.score-container` is itself the scroller, no
      ancestor walk): recenters on every new system via
      `cursorElement.style.top`, nudges horizontally otherwise; a
      wheel/touchmove disengages it; `scrollCursorIntoView()` (exported)
      re-engages. "Scroll to cursor" button in the transport row.
- [x] **Playhead desync fixed + reworked.** (2026-09-01) The 2026-08-31
      cursor above lagged / moved "per measure" / drifted on a repeat-heavy
      PDF-sourced piece. `playbackWholeNotes` → `playheadWholeNotes` + new
      `isPlaying` prop; the playhead is now its own cursor (index 1), shown
      whenever audio exists (playing *or* paused) so it's always draggable;
      selection marker is cursor 0. Three OSMD fixes: `SkipInvisibleNotes =
      false` on both cursors re-asserted per render (stop on every note);
      `EngravingRules.CursorIgnoreRepetitions = true` (walk linearly like
      `parseMusicXmlFile`, no back-jump at end-repeats); show/hide/style/
      follow-scroll gated to edges, not every frame. New `onSeekTo` prop +
      `handleSeekTo` in `edit/+page.svelte`: drag the bar to reposition,
      click empty staff space to seek + play. A per-frame `osmd.render()`
      stall found by the new e2e test (`$effect` transitive dep tracking
      re-subscribing the zoom/theme + seam effects to `playheadWholeNotes`)
      fixed with `untrack()`. See the 2026-09-01 Log entry + `Frontend/e2e/`.
- [x] **Edit-during-playback.** (2026-08-31) Covered by the audio-pipeline
      commit: an edit only re-serializes `workingXml` (the synth keeps
      playing untouched), `audioStale` derives true, the transport shows the
      hint, and `syncAudioToModel()` on the next play/seek reloads preserving
      the play state and clamping the resume point to the (possibly shorter)
      new duration.
- [x] **Note preview.** (2026-08-31) `MidiPlayer.previewNote(midi, ms=700)`
      on a reserved channel (15, clear of the mixer buckets + percussion):
      lazily sets a piano program + full volume on it, releases any note
      still sounding, `midiNoteOn`, schedules `midiNoteOff`. Resumes the
      audio graph from the caller's gesture like `play()` does; re-armed
      after a `load()` (`resetPlayer` wipes channel state). Editor: immediate
      on click-select and after `transpose`/`setAccidental`; 140 ms trailing
      debounce on ArrowLeft/Right nav (a held key plays only the note you
      land on). Not on duration/key/clef edits.
- [x] **i18n** (2026-08-31) — new keys `piece_editor_transport_unavailable`
      / `piece_editor_transport_parse_error` / `piece_editor_audio_stale` /
      `piece_editor_mix_panel` / `piece_editor_close_mix` /
      `piece_editor_reset_mix` / `piece_editor_mix_after_play` /
      `piece_editor_part_volume` in `en.json` + `es.json`; reused the
      player's `piece_play` / `piece_pause` / `piece_seek` /
      `piece_scroll_to_cursor` / `piece_tempo` / `piece_increase_tempo` /
      `piece_decrease_tempo`. `check` / `build` / 55-test vitest suite green.

**Tasks — Human:**
- [ ] Confirm the spike's engine choice before the build proceeds
- [ ] In a real browser: open the editor on a real OMR-generated track,
      make each kind of edit, save, and confirm the new draft plays back
      with the corrections and moves through review normally
- [ ] In a real browser (desktop): play the working score inside the
      editor — transport, seek, tempo, per-part mix, follow cursor — make
      an edit mid-playback, and confirm note-preview-on-select sounds
      right. *(Playhead-vs-audio sync + drag-to-seek now have an automated
      Playwright test — `Frontend/e2e/editor-playhead.spec.ts`, run with
      `E2E_PIECE_ID=<id> npm run test:e2e`; this human pass still covers
      tempo / mix / note-preview / edit-mid-playback.)*

### E3 — Paged OMR pipeline (formerly B16)

E1's `run_omr` hands Audiveris a multi-page PDF as one "book". Audiveris exports
*nothing* for the whole book if a single page crashes a step (a RHYTHMS-step
NullPointerException is the common one), so one bad page on a 21-page choral scan
= zero output. This milestone ports the paged approach proven in the standalone
`omr-local` tool: split the PDF into one-page PDFs, transcribe each independently,
then merge only the page joins that are *obvious* (same part count, matched
top-to-bottom, measures renumbered end-to-end). A run of such pages becomes one
**segment**; a join that isn't obvious (part count changed, a page failed, a page
had no measures) ends the segment and starts a new one, recording why. A
*provisional* whole-score merge is always written too (short parts rest-padded)
so downstream always has a draft — it's the one that auto-imports as the draft
`PieceVersion`, exactly as E1 does today.

Feeds E4 (below) — the editor overlays a marker at each unresolved
boundary so an admin fixes the seams there instead of in MuseScore.

**Decisions:**
- Paged mode is the default for any PDF with >1 page (`omr_paged_multipage`,
  default on). A 1-page input, and the case where Audiveris isn't installed, both
  fall back to E1's single-run `run_omr` (which can still try oemer). Paged mode
  itself is Audiveris-only — oemer is first-page-only, so paged+oemer is moot.
- `OmrJobStatus` is unchanged. A needs-review job is still `done` with a pending
  draft; it carries an extra `needs_review` boolean + a stored `paged-report.json`.
- Cross-page ties / slurs / directions are lost at every join, obvious or not —
  same limitation the standalone tool documents.

**Acceptance criteria:**
- [x] A multi-page PDF where one page crashes Audiveris still yields a MusicXML +
      MIDI draft from the pages that succeeded, instead of the whole job failing
- [x] Consecutive pages with the same part count merge into one segment with
      end-to-end measure numbers; a part-count change or a failed page starts a
      new segment and the boundary records the reason
- [x] `needs_review` is true iff the pages did not all land in one segment; the
      provisional `score.musicxml` is written regardless
- [x] `GET /omr/jobs/{id}/paged-report` returns the segment/boundary/per-page
      breakdown; `GET /omr/jobs/{id}/segments/{n}/{kind}` serves a segment's
      MusicXML/MIDI and rejects `../` path traversal
- [x] The auto-imported draft `PieceVersion` is the provisional whole-score merge
- [x] `pytest` green (new `test_omr_paged.py` + `test_omr_api.py` additions;
      full suite 181 passing 2026-08-31)

**Tasks — Claude:**
- [x] `app/omr/paged.py` ported from `omr-local/omr_local/paged.py` — `split_pages`,
      per-page engine run, `_segment_pages`, `merge_musicxml` (rest-pad + renumber),
      `run_omr_paged`; adapted to `get_settings()` and the 2-arg engine signature.
      Report gains a `boundary_measure` per segment (the E4 seam anchor).
- [x] `app/omr/_subprocess.py` (`run_logged` + `log_tail`) — tee engine output to
      `<dir>/<engine>.log`; reworked `audiveris.py`/`oemer.py` onto it so a bad page
      leaves a `pages/pNN/audiveris.log` trail; tail the log into `OmrEngineError`.
- [x] `OmrJob` columns `paged` / `needs_review` / `paged_report_path` + migration
      `d2f8a6c4e1b9` (Postgres only — an earlier migration already uses PG-only DDL).
- [x] `run_omr_job`: multi-page ⇒ `run_omr_paged` (falls back to `run_omr` on
      `OmrEngineUnavailable`); persists the paged fields; draft import unchanged.
- [x] `omr.py` routes + schema: `paged`/`needs_review`/`report_url` on `OmrJobOut`,
      `needs_review` on the list item, `GET .../paged-report` (rewrites segment file
      paths to URLs) + `.../segments/{n}/{kind}` (traversal-guarded `FileResponse`).
- [x] `latest_omr_job` in `library`'s `LibraryEntryOmrJobOut` gains `needs_review` / `paged`.
- [x] `config.py`: `omr_paged_multipage` (default true), `oemer_dpi` (promoted from
      the hardcoded 300 in `oemer._rasterize_first_page`).
- [x] Tests: `test_omr_paged.py` (7: segmenting, merge padding/renumber, boundary
      measures, run_omr_paged shapes) + `test_omr_api.py` (5: paged job ⇒ `done` +
      `needs_review`, report route URL rewrite, segment download, traversal 404,
      non-paged job 404s the report route).

**Tasks — Human:**
- [ ] With Audiveris installed, run a real multi-page choral scan (`fixtures/SFCC/`
      no longer has one bundled — supply any multi-page scan) through the paged
      path (upload via `POST /omr/jobs`, or call `run_omr_paged` directly) and
      confirm the `pages/`, `segments/`, `paged-report.json` layout and a sane
      `needs_review` + `boundary_measure`s.
- [ ] Get migration `d2f8a6c4e1b9` onto production by **merging this branch to
      `main`** (the Render deploy then runs it). Do NOT `alembic upgrade` it from
      a local checkout against the prod `.env` — see the 2026-08-31 Log entry for
      why that breaks `main`'s deploy. `c1f7a4d2e8b6` (its parent) is already on
      both prod and `main` as of 2026-08-31.

### E4 — Review a segmented OMR result in the editor (formerly F15)

E3 adds paged OMR: a multi-page scan is transcribed page-by-page and the
*obvious* page joins are merged into segments, leaving the non-obvious joins (part
count changed, a page failed) as **unresolved boundaries**. The job still
auto-imports one provisional whole-score merge as the draft, plus a stored
`paged-report.json`. This milestone surfaces that: the group Tracks review block
tells the admin the draft was stitched from N sections, and the E2 editor
overlays a marker at each unresolved boundary so they fix the seam right there
with the existing correction tools instead of round-tripping through MuseScore.

**Decisions:**
- Seam markers are a pure overlay in `EditorScoreView` — never written into the
  MusicXML, so a saved draft is clean. Each seam is anchored by mapping the
  report's merged-measure number to an onset (whole notes) via `EditableScore`,
  reusing the playback cursor's coordinate system.
- The backend's boundary "reasons" are English prose; shown as-is for a first
  cut. Localizing those strings is Backlog.
- No multi-segment stitching UI (load each segment separately, join/reorder by
  hand) — the provisional merge + seam markers cover the review need with far
  less surface. That heavier option stays on the table if seam-fixing proves
  insufficient.

**Acceptance criteria:**
- [x] On a group track whose latest OMR job needs review, the Tracks admin panel
      shows a "stitched from pages, some joins unclear" note and the "Edit music"
      link becomes "Review seams in editor" — alongside the existing Use it / Discard
- [~] Opening the editor on such a track draws a labelled marker at each
      unresolved boundary, at the correct measure, in both themes and after
      re-render / zoom (built; pixel placement needs a real-browser check)
- [x] A "Next seam" control cycles through the boundaries with a readout of which
      one and why; suppressed-while-playing selection-cursor behaviour is unchanged
- [x] Editing at a seam and saving produces a normal draft version whose
      MusicXML contains no marker markup (markers are overlay DOM only)
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 58 green (new
      `measureOnset` tests)

**Tasks — Claude:**
- [x] `backendTypes.ts`: `needs_review` on `OmrJobListItem`, `needs_review`/`paged`
      on `latest_omr_job`, a `PagedReport` type.
- [x] `omr/jobs/[id]/paged-report/+server.ts` proxy route (mirrors
      `omr/jobs/+server.ts`; 401 when logged out rather than an empty body).
- [x] `groups/[id]` review block: the needs-review note + the "Review seams in
      editor" relabel of the Edit-music link; new i18n keys (`groups_generate_*`).
      Per-segment download `<details>` deferred — not needed once the editor
      handles the seams.
- [x] `editableScore.ts`: `measureOnset(measureNumber)` + 3 unit tests.
- [x] `piece/[id]/edit/+page.server.ts`: returns `pagedReportJobId` when the
      piece's latest OMR job is paged + needs review.
- [x] `piece/[id]/edit/+page.svelte`: fetches the report, derives the seam list
      from the live model (keyed on `workingXml` so onsets track edits), passes
      `seamMarkers` down, adds the "Next seam" control + readout; new i18n keys.
- [x] `EditorScoreView.svelte`: `seams` prop; `measureSeams()` walks the shared
      cursor to each seam onset right after `render()` (and on zoom/theme/`seams`
      change), records content-space px, draws absolutely-positioned `.seam-mark`
      overlays inside `.score-container`; `placeCursor()` always runs after to
      restore the selection/playback cursor.

**Tasks — Human:**
- [ ] In a real browser: run a real multi-page choral scan through Generate from
      PDF, open the review, confirm the seam markers land where the joins
      actually are, fix one, save, and confirm the draft is clean and plays.

### E5 — Working-draft slot + per-page OMR progress & re-run (formerly B17)

Pairs with E6 (below). Designed with the human 2026-08-31 to
make generate-from-PDF → in-app edit → publish one coherent loop instead of a
pile of unrelated `draft` rows.

**Model:**
- **Working draft** = the single open `draft` / `source: modification`
  `PieceVersion` on a piece (today's `pending_generated_version_id` is almost
  this — E5 makes it *the* concept and enforces "at most one open").
- The **live** version is unchanged: a group piece's latest `distributed`, a
  personal piece's latest. Never mutated in place.

**Decisions:**
- Copy-on-edit clones the live version's `file_path` + `pdf_file_path` by
  content-copy (`save_file(load_file(...))`, as `_import_draft_version` already
  does for the MIDI) so the draft's files outlive anything the live version does.
- Generate-from-PDF replaces an existing open working draft: the old one is
  `reject`ed (status → `rejected`, history kept) before the new import.
- `POST /library/versions/{id}/publish` is a convenience wrapper over the
  existing submit → approve → (distribute) endpoints, same authority checks — no
  new state machine. Personal piece = submit + approve, no distribute. Takes
  `{ seams_resolved: bool }`; `false` → 409. The Backend can't inspect the
  editor's seam state — it records the ack on the version and trusts E6's gate.
- Per-page progress is best-effort: `pages_done` bumped + committed after each
  page in `run_omr_paged`. No new status value.
- Per-page re-run reuses the split PDF still on disk under
  `omr_jobs/{id}/pages/page-NN.pdf`: re-run the one page, re-run `_segment_pages`
  + the merges, rewrite `score.musicxml` / `score.mid` / `paged-report.json` and
  `OmrJob.needs_review`, and return the re-run page's own normalized MusicXML
  (+ measure count, + whether it still failed) for E6 to splice. It does **not**
  re-import the draft — the editor owns the working model at that point.

**Acceptance criteria:**
- [x] `POST /library/pieces/{id}/working-draft` returns the existing open working
      draft, or creates one cloning the live version's music + PDF; review
      authority required; idempotent (second call returns the same version).
- [x] `PUT /library/versions/{id}/file` replaces a `draft` version's music file
      in place (creator or review authority); refuses a non-draft.
- [x] `POST /library/versions/{id}/publish` with `seams_resolved: true` takes a
      working draft to `approved` and (group piece) distributes it; `false` or a
      non-working-draft → 409; not review authority → 403.
- [x] Generate-from-PDF on a piece that already has an open working draft rejects
      the old one and imports the new — never two open at once.
- [x] `OmrJobOut` + the list item carry `pages_done` / `pages_total`; they climb
      while a paged job runs. (TestClient runs the bg task synchronously so the
      suite only sees the final `pages_done == pages_total`; the per-page commit
      is covered by `test_on_page_done_fires_once_per_page`.)
- [x] `POST /omr/jobs/{id}/pages/{n}/rerun` re-transcribes page n, rewrites the
      report + provisional merge + `needs_review`, and returns
      `{ ok, still_failed, measure_count, page_musicxml_url }`; 404 for a
      non-paged job or an out-of-range page; traversal-safe.
- [x] `pytest` green (202 passed — new working-draft, publish, rerun, progress
      tests).

**Tasks — Claude:**
- [x] `services/pieces.py`: `working_draft(piece_id, db)` (the lookup, renamed /
      widened from `pending_generated_version_id`),
      `get_or_create_working_draft(piece, user, db)` (clone live files),
      `publish_version(version, user, db)` (wraps submit / approve / distribute).
      Also `live_version` + `replace_version_file`. `pending_generated_version_id`
      kept as a thin wrapper over `working_draft`.
- [x] `_import_draft_version` (`app/jobs/omr_jobs.py`): reject an existing open
      working draft before adding the new one.
- [x] `app/api/routes/library.py`: `POST /library/pieces/{id}/working-draft`,
      `PUT /library/versions/{id}/file`, `POST /library/versions/{id}/publish`
      (`{ seams_resolved }`). Schemas `WorkingDraftOut` / `VersionPublishRequest`
      in `app/api/schemas/library.py`.
- [x] `OmrJob.pages_done` / `pages_total` (nullable ints) + migration
      `e7b1c9d3a2f4` (chained off `d2f8a6c4e1b9`; also adds
      `piece_versions.seams_resolved_ack`). `run_omr_paged` takes an optional
      `on_page_done(done, total)` callback; `run_omr_job` passes one that bumps +
      commits the job row per page.
- [x] `app/omr/paged.py`: factored the per-page loop (`_transcribe_page` +
      `_finalize_paged_run`) so `rerun_page(output_dir, page_no, engine)` re-runs
      one page from the on-disk split PDF and rebuilds segments + merges +
      `paged-report.json`. Each page's normalized XML lands at a deterministic
      `pages/pNN/page.musicxml` so a re-run can reload the others.
- [x] `app/api/routes/omr.py`: `POST /omr/jobs/{id}/pages/{n}/rerun` (job owner;
      calls `rerun_page`, updates `OmrJob.needs_review`, returns the E6 shape) +
      `GET /omr/jobs/{id}/pages/{n}/musicxml` (serves the re-run page's XML,
      traversal-guarded like `.../segments/{n}/{kind}`).
- [x] Schemas: `pages_done` / `pages_total` on `OmrJobOut` +
      `LibraryEntryOmrJobOut` + `OmrJobListItemOut`; `OmrPageRerunOut`.
- [x] Tests: `test_library_working_draft.py` (get-or-create idempotency, clone
      contents, publish happy / 409 / 403, generate replaces),
      `test_omr_paged.py` / `test_omr_api.py` additions (progress counters,
      rerun recovers / still-fails / out-of-range, route wiring + page-XML serve).

**Tasks — Human:**
- [ ] After E6: run a real multi-page scan, re-run a page via the API, confirm
      `paged-report.json` + `score.musicxml` are rewritten and `needs_review`
      flips when the last bad page is recovered.
- [ ] Migration reaches prod only by merge to `main` (same rule as
      `d2f8a6c4e1b9` — see the 2026-08-31 outage Log entry).

### E6 — Working-draft slot: labelled editing, seam-fill, per-page progress & re-run (formerly F16)

Builds on E2 (the editor) and E4 (seam markers). Designing the
generate → edit → publish loop with the human (2026-08-31) surfaced three gaps:

1. The editor always loads the piece's *live* version (`/piece/[id]/file`) and
   every save spawns a fresh `draft` row, so generate-from-PDF and hand edits
   don't chain and there's no single "work in progress" to point at.
2. A failed OMR page leaves only a zero-width seam — nowhere to type the missing
   bars.
3. Nothing tells the editor which version it's showing (live vs draft), and
   nothing gates promoting a rough draft to live.

Pairs with E5 (above) (working-draft slot endpoints, per-page progress
counters, per-page re-run).

**Model (agreed with the human 2026-08-31):**
- **One working-draft slot per track** = at most one open `draft` /
  `source: modification` `PieceVersion` per piece (E5 formalizes
  `pending_generated_version_id` into this). The **live** version (a group's
  `distributed`, a personal library's latest) is never edited in place.
- "Edit music" opens the working draft if one exists, else clones the live
  version into a fresh one (copy-on-edit, server-side —
  `POST /library/pieces/{id}/working-draft`). Generate-from-PDF writes into the
  same slot, replacing (rejecting) any unpublished working draft that's there.
- Save updates the working draft's file in place
  (`PUT /library/versions/{id}/file`), no new row per save; it stays `draft`.
- **Publish** ("Publish as live version") lives in the editor, runs
  submit → approve → distribute in one E5 call, and is disabled until every
  seam is marked resolved.

**Decisions:**
- Per-seam "resolved" state is client-only, `localStorage` keyed on
  `jobId + before_page`, same overlay-only philosophy as E4's markers — nothing
  new persisted server-side just for review bookkeeping. The publish call carries
  a single `seams_resolved: true` acknowledgement the Backend records but can't
  itself verify.
- Failed-page seams (reason starts "page N failed") get the fill affordance;
  part-count-change seams keep E4's review-and-clear only (no missing bars
  there).
- Inserted fill bars are real `<measure>`s of full-measure rests across every
  part, not a marker — the user overwrites the rests. New `EditableScore`
  measure-level ops (`insertMeasures` / `deleteMeasure`), the first structural
  edits in that model.
- Generation stays one job / one click. Per-page *progress* is display-only
  (E5's `pages_done`/`pages_total`); per-page *re-run* is an editor action on a
  failed-page seam that splices the re-run page's MusicXML into the working model
  client-side so the user's other edits survive.
- Auto-handoff into the editor is the existing `OmrJobAlerts` completion alert
  gaining a "Review generated draft" link — not a forced navigation.

**Acceptance criteria:**
- [x] Opening "Edit music" on a track with no working draft clones the live
      version; the header badges "Live version" (pristine copy) → "Working draft —
      not yet live" once edited. A second open reuses the same draft (no
      stacking). *(E5 `get_or_create_working_draft`; needs the browser pass.)*
- [x] Editing, leaving, then re-opening shows the same in-progress draft, not the
      live version; the live player is unchanged until Publish. *(save is now
      `PUT .../file` in place; publish is the only thing that touches live.)*
- [x] Generate-from-PDF into a track that already has a working draft replaces it
      (E5 `_import_draft_version` rejects the old one); the Tracks panel links to
      the editor for the new draft.
- [x] A failed-page seam: "Next seam" opens the PDF pane at that page
      (`scrollToPage`); an "insert N bars" control adds N full-measure-rest bars
      at the seam onset across every part (`EditableScore.insertMeasures`);
      measures renumber; the saved MusicXML has only real bars.
- [x] "Re-run this page" on a failed-page seam splices the re-run result into the
      working model at the seam onset (`spliceMeasuresFromXml`) without discarding
      other edits; the seam is marked resolved by hand once it looks right.
- [x] "Publish as live version" is disabled until every seam shows resolved;
      publishing runs E5 submit→approve→distribute and leaves the editor, so the
      next load starts a fresh copy-on-edit.
- [x] Tracks tab shows "page X of Y" while a paged generate job runs; the header
      alert links a finished single job straight to `/piece/[id]/edit`.
- [x] `npm run check` (0 errors) / `npm run build` clean; vitest 67 green (+14
      `insertMeasures` / `deleteMeasure` / `spliceMeasuresFromXml`).

**Tasks — Claude:**
- [x] `backendTypes.ts`: `PieceVersionOut` / `WorkingDraftOut` / `OmrPageRerunOut`;
      `pages_done`/`pages_total` on the OMR job shapes.
- [x] `piece/[id]/edit/+page.server.ts`: resolve the working draft via E5's
      create-or-get; return `workingDraftId` + `forkedFromLive` alongside the
      existing access / `pagedReportJobId` fields.
- [x] `piece/[id]/edit/save/+server.ts`: `PUT /library/versions/{id}/file` on the
      working draft (client sends the version id) instead of `POST .../versions`.
- [x] New `piece/[id]/edit/publish/+server.ts` proxy → E5
      `POST /library/versions/{id}/publish` `{ seams_resolved: true }`. Also new
      `piece/[id]/edit/file` (stream a version's music by id), and
      `omr/jobs/[id]/pages/[n]/rerun` + `.../musicxml` proxies.
- [x] `editableScore.ts`: `insertMeasures` / `deleteMeasure` /
      `spliceMeasuresFromXml` (the splice was needed for "Re-run this page") —
      full-measure-rest bars carry the prevailing divisions/time, every part kept
      the same length, `<measure number>` re-sequenced 1..N, out-of-range /
      empty-a-part refused. Unit tests.
- [x] `piece/[id]/edit/+page.svelte`: load the working-draft file; header badge;
      "Publish as live version" gated on all-seams-resolved (flushes unsaved
      edits first, then leaves); per-seam "Mark resolved / Reopen" toggle
      (localStorage keyed on job + `before_page`); failed-page seam → auto-open
      PDF pane + `scrollToPage`, "insert N bars" input, "Re-run this page" button
      (rerun proxy → fetch page MusicXML → `spliceMeasuresFromXml`). Save stays in
      the editor now (no nav) with a "Saved" notice.
- [x] `PdfView.svelte`: `scrollToPage(n)` export.
- [x] `EditorScoreView.svelte`: verified — `measureSeams()` re-derives from
      `seam.onsetWholeNotes` on every re-engrave and when `seams` changes, so
      markers track an insert / delete / splice. No change.
- [x] `groups/[id]/+page.svelte`: draft-ready block → "Open working draft in
      editor" link + "Discard working draft"; "page X of Y" readout while the
      paged job runs; the redundant edit-music-row is hidden while a draft is
      pending. `promoteGeneratedVersion` server action left in place but unused
      (superseded by the editor's Publish).
- [x] `OmrJobAlerts.svelte`: a finished single generate job links to
      `/piece/[id]/edit`; multi-job / failed still point at the Tracks tab.
- [x] en + es i18n keys (badges, publish, per-seam + re-run, page progress).

**Tasks — Human:**
- [ ] Full real-browser pass: generate from a multi-page PDF (watch the page
      counter), land in the editor on the working draft, fill a failed page from
      the side-by-side PDF, re-run another page, mark all seams resolved, Publish,
      confirm the live track now plays the corrected music and re-opening the
      editor starts a clean copy.

### E7 — Editor "Measures" mode: select a bar range, change its clef (formerly F17)

At the human's request: the editor was one flat surface (click a note, edits pin
to its measure) with no way to act on a span of bars. Added an explicit
**Notes / Measures** mode toggle rather than a hidden gesture — a visible
affordance, no keyboard-map collision with the note-level arrows, and a home for
the bar-scoped ops that already exist on the model with no UI
(`insertMeasures`/`deleteMeasure`/`spliceMeasuresFromXml`) and for time-signature
editing later. Time signature itself was considered and **deferred** here — it
needs note re-barring with ties.

**Tasks — Claude (done 2026-09-01):**
- [x] `EditableScore.setClefRange(partId, staff, start, end, spec)` — writes the
      clef at the range start, strips any other explicit `<clef>` for that staff
      inside the range, and re-asserts the pre-range clef at `end+1` so later
      bars are visually unchanged (skipped when that bar has its own clef, the
      restore equals `spec`, or the range hits the end). No-op / out-of-range /
      unknown-part all return `false` without mutating. Refactor:
      `applyClefToMeasure` + `clefInEffectAt` extracted and shared with `setClef`
      / `clefAt`. New readers `clefAtMeasure`, `measureCount`, `partName`.
      +13 vitest (jsdom).
- [x] `EditorScoreView`: `measureMode` + `measureBand` props; in measure mode a
      click anywhere in a bar is a select (never a click-to-seek) and carries the
      Shift key; a translucent `.measure-band` overlay per system row, boxes read
      off `GraphicSheet.MeasureList` (same sheet-unit → px factor as the click
      hit-testing), recomputed on re-engrave / zoom / theme / band change.
- [x] `edit/+page.svelte`: `editMode` + `measureSel` ({partId, staff, anchor,
      start, end}); Notes/Measures segmented control as the first toolbar row;
      note-level rows hidden in measure mode; the clef row is shared (dispatches
      to `applyClef` or `applyClefRange`, active pip from `clefAtMeasure`).
      Click / Shift-click builds the range; keyboard: ←/→ move the bar, Shift+←/→
      extend from the anchor, Esc back to Notes. Status line + footer hint adapt.
- [x] en + es i18n (`piece_editor_mode_*`, `piece_editor_measure*_selected`,
      `piece_editor_measures_hint`, `piece_editor_clef_range_refused`,
      `piece_editor_clef_for_selection` / `_for_note`, `piece_editor_staff_n`).
- [x] **Live-test round 1 fixes (2026-09-01):**
  - Bar selection no longer goes through `EditableScore.findByOnset` — that
    resolver misfires badly on a part that's tacet at the click's onset (a
    choral intro: every click resolved to the same bar 11, so the range never
    grew and clef edits landed in the wrong place, reading as "treble/bass
    swapped"). `EditorScoreView` now reads the 1-based `measureNumber` straight
    off OSMD's graphical note (`parentStaffEntry.parentMeasure`) and passes it
    in the pick; the page uses `measureNumber - 1` directly.
  - Highlight geometry: a bar's own bbox height collapses to ~1 unit for a
    rest-only measure, so the band was a 10px sliver. Now uses
    `ParentStaffLine.StaffHeight` for height, tints only the target staff (not
    the whole part), one rect per system row a wrapped range crosses, +0.7-unit
    padding, solid accent border.
  - `applyClefRange` gives `measureSel` a fresh identity after a successful
    edit so `selectedMeasureClef` / `measureBand` re-derive (score is mutated
    in place).
  - Clef row got a leading label (`Clef for the selected bars:` /
    `Clef from this bar on:`) so it's clear what the presets act on; the status
    line names the staff for a multi-staff part.
- [x] `editor-measures.spec.ts` (4 tests): range select via click + Shift-click,
      clef-range write + prior-clef restore + active pip, note toolbars hidden
      in Measures mode + Escape returns.
- [x] **Live-test round 2 (2026-09-01):** clef readout on a multi-staff part
      (piano) showed the wrong staff's clef. `clefInEffectAt` /
      `applyClefToMeasure` / `explicitClefsForStaff` now share one
      `clefForStaffIn(attr, staff)`: a numbered `<clef>` matched by `number`,
      else unnumbered `<clef>`s read positionally (1st -> staff 1, 2nd -> staff
      2) — the old code returned nothing or the staff-1 clef when OMR output
      omitted `number` on a 2-staff part. `handlePickNote` pins a single-staff
      part (every SATB voice) to staff 1 and clamps a multi-staff part's staff
      to `score.staffCount(partId)`. +1 vitest (`TWO_STAVES_UNNUMBERED`).
      `check` 0 errors, vitest 77.
      Blocked: the test piece's working draft is corrupt (won't parse —
      pre-existing, not E7; discard + regenerate to retest the e2e).

**Tasks — Human:**
- [ ] Real-browser confirm: toggle Measures, click a bar + Shift-click a later
      one, apply Bass, confirm bars in range switch and the bar after keeps its
      clef, Save + reload to confirm it persisted, toggle back to Notes.

### E8 — Editor undo / redo (formerly F18)

At the human's request. The editor had no undo — a wrong transpose / delete /
duration / clef edit could only be fixed by hand or by reloading and losing
everything. Cheap to add because every edit already funnels through `applyEdit` /
`applyStructuralEdit` / `applyClefRange` and each ends by re-serializing the whole
model into `workingXml`, so a snapshot of every state already exists; undo just
keeps a stack of those strings and rebuilds an `EditableScore` from the previous
one. No command log, no inverse ops.

**Mechanism:**
- New `$lib/musicxml/editHistory.ts` — `EditHistory`: bounded undo stack + mirror
  redo stack of `workingXml` strings (`record` / `undo(current)` / `redo(current)`
  / `reset`, cap 60, oldest falls off). Plain class, no runes, so it unit-tests
  under the existing node vitest config.
- `edit/+page.svelte`: the three apply functions snapshot `workingXml` *before*
  mutating and `record()` it only once the mutation reports success (a refused
  no-op edit records nothing). `undoEdit` / `redoEdit` pop a snapshot,
  `new EditableScore(xml)` it (snapshots are always clean `serialize()` output —
  never MIDI/`.mxl`, so no loader needed), swap it in, clear the selection (indices
  don't survive a structural undo), and re-render via the existing `xml` prop.
- Dirty tracking: new `savedXml` = the serialized state as of the last load /
  save; `dirty` is now `workingXml !== savedXml` everywhere it was set, so undoing
  all the way back to the saved state clears the unsaved-nav guard instead of
  leaving the editor falsely dirty.
- Toolbar: an Undo / Redo group as the second row (under Notes/Measures, shown in
  both modes), disabled when the matching stack is empty or mid-render/save.
  Keyboard in `handleKeydown` (both modes, before the mode split): Cmd/Ctrl+Z
  undo, Cmd/Ctrl+Shift+Z or Ctrl+Y redo.
- `canUndo` / `canRedo` / `dirty` added to `window.__divisiEditorProbe()` for a
  future e2e test.

**Tasks — Claude (done 2026-09-01):**
- [x] `editHistory.ts` + `editHistory.test.ts` (6 vitest: empty, undo→redo
      round-trip, record clears redo, cap drops oldest, reset).
- [x] `edit/+page.svelte` wiring (snapshots, `undoEdit`/`redoEdit`/`restoreSnapshot`,
      `savedXml` dirty tracking, keyboard, toolbar row, probe fields).
- [x] en + es i18n (`piece_editor_history_label`, `piece_editor_undo`,
      `piece_editor_redo`).
- [x] `check` 0 errors, vitest 89 green, `build` clean.

**Tasks — Human:**
- [ ] Real-browser confirm: make several edits (transpose, delete, duration,
      clef, insert bars), Undo/Redo through them by button and by keyboard,
      confirm the score and the dirty state track correctly and Save still works;
      undo back past the last Save and confirm the unsaved-changes prompt goes away.

### E9 — Per-page measure offsets in the paged report (formerly B18)

Feeds E10 (below) (page-by-page review of a generated draft).
E10's editor needs to map each source page to its measure range in the
provisional whole-score merge, to scroll + highlight that range while the admin
approves the page. The report already has segments → page lists and a
`boundary_measure` per segment, but nothing per *page*, so the frontend would
otherwise have to fetch all N `pages/pNN/page.musicxml` and count `<measure>`s.

**Decisions:**
- Report-shape change only — no new column, no migration. `paged-report.json` is
  rewritten by `rerun_page` already, so a re-run keeps the offsets current.
- Offsets are into the **provisional whole-score merge** (`score.musicxml`), the
  same coordinate system as `boundary_measure`, so E10 can reconcile the two.
- A failed page contributes 0 measures and gets `measure_count: 0` with
  `start_measure` pointing at where it *would* begin (so "insert N bars" in E10
  has an anchor).

**Acceptance criteria:**
- [x] `GET /omr/jobs/{id}/paged-report` returns `start_measure` (1-based) and
      `measure_count` on every entry of `pages[]`; they tile the merge with no
      gaps or overlaps and `sum(measure_count) == <measures in score.musicxml>`.
- [x] A failed page has `measure_count: 0` and a `start_measure` equal to the
      next real page's `start_measure`.
- [x] `rerun_page` rewrites the offsets when a recovered page changes measure
      counts downstream.
- [x] `pytest` green (new assertions in `test_omr_paged.py` / `test_omr_api.py`).

**Tasks — Claude:**
- [x] `app/omr/paged.py`: `merge_musicxml` now returns a third value,
      `per_page_measures` (page number -> bars it contributed to that merge;
      `sum ==` the merged score's measure count). `_finalize_paged_run` feeds
      the *whole-score* merge's map to a new `_assign_page_offsets`, which walks
      `report.pages` in order setting `start_measure` / `measure_count` on every
      `PageResult` (failed pages included — count 0, `start_measure` inherits
      the running offset so it equals the next real page's). `rerun_page` goes
      through `_finalize_paged_run`, so offsets are rewritten on a re-run.
- [x] `PagedReport.as_dict()`'s `pages[]` entries emit the two fields;
      `PageResult` gained `start_measure` / `measure_count`. The paged-report
      route returns the dict as-is, so no `app/api/schemas/omr.py` change was
      needed (that route has no pydantic model — it rewrites segment paths to
      URLs dynamically); the shape is documented on `PageResult` / `as_dict`.
- [x] Tests: `test_omr_paged.py` — `merge_musicxml` per-page-count return,
      offsets tile the provisional merge + sum to its measure count,
      failed-page zero-count at the next page's start, `rerun_page` rewrites
      downstream offsets (on disk too). `test_omr_api.py` — the stub report
      carries the fields and the route passes them through.

**Tasks — Human:**
- [ ] None beyond E10's end-to-end pass (no migration, no deploy gate).

### E10 — Page-by-page review of a generated draft (formerly F19)

Redesign of the generate → review → publish loop, agreed with the human
2026-09-01. E4/E6 drop the admin into the merged whole-score draft facing
scattered seam markers, and never prompt a look at the *interior* of a segment:
if pages 3–8 merged into one segment, pages 4–7 get no review at all. E10
replaces that with a deliberate progression — approve each page against its PDF
source, **then** resolve the joins between them — so "have I checked everything?"
has an answer.

**Model:**
- The editor gains a **Review** panel, on by default when the working draft came
  from a paged OMR run that needs review (`data.pagedReportJobId` is set). Three
  steps: **Pages → Seams → Publish**. A single-run / non-paged generate has no
  pages and no seams — the panel stays off and the editor opens exactly as today.
- **Stepper over the existing continuous score**, not a paginated view (decided
  with the human 2026-09-01): one editable `EditableScore` as now. Selecting page
  K scrolls the reference PDF pane (`PdfView.scrollToPage`) and scrolls +
  highlights K's measure range in the score, via a new full-system `pageBand`
  overlay sibling to E7's single-staff `measureBand`. **Panel placement**
  (decided with the human 2026-09-01): the transport bar's bottom, replacing
  E4/E6's `.seam-bar` row — not a left dock pane or a top strip.
- **Pages step:** a rail of pages 1..N, each `✓ approved / ⚠ review / ✗ failed /
  – untouched` (seeded from the paged report's per-page ok/error). Page-scoped
  toolbar: **Approve page** (advances to the next `–`), **Re-run page**, **Insert
  N bars** (failed pages only — moved here from E6's seam step). A per-segment
  **Approve pages X–Y** bulk action for a clean run.
- **Seams step:** locked until every page is approved (or explicitly skipped).
  This is E4/E6's seam review with the failed-page-fill removed — a failed page
  is now a first-class stop in the Pages step, not a zero-width marker. Each seam
  still shows the two pages it joins, the reason and the join bar, with Mark
  resolved / Reopen (E6's `localStorage` per-seam state is unchanged).
- **Publish:** gated on all-pages-approved **and** all-seams-resolved. The ack
  the Backend records widens from `{ seams_resolved: true }` to
  `{ pages_reviewed: true, seams_resolved: true }`.

**Decisions:**
- Page-approved state is client-only `localStorage`, keyed `jobId:page` — same
  philosophy as E6's per-seam resolved state. No new server bookkeeping beyond
  widening the publish ack; the Backend can't verify a page any more than it can
  verify a seam, and trusts the E10 gate.
- Approval is an honour-system "I looked" ack, exactly like a resolved seam.
- Re-running a page or inserting bars into it clears that page's approval and
  reopens any seam that touches it — the content moved.
- A failed page can't be approved until a re-run succeeds or bars are hand-filled;
  "skip for now" is allowed but blocks Publish.
- **Supersedes the E4/E6 review UX.** Their pending human real-browser passes
  fold into E10's — not worth verifying a flow that's being replaced. The
  underlying machinery (seam-onset mapping, working-draft slot, save/publish,
  re-run, insert-bars, measure-band) is all kept.

**Paired backend change — E9** (above): `PagedReport.pages[]` gains
`start_measure` / `measure_count` (each page's position in the provisional
whole-score merge) so the frontend can map page → measure range without fetching
all N page XMLs and counting bars.

**Acceptance criteria:**
- [x] Opening the editor on a paged working draft that needs review shows the
      Review panel at the Pages step; a non-paged draft opens with no panel.
- [x] Selecting a page scrolls the PDF pane to that page and highlights the
      page's measure range in the score; the highlight survives re-render / zoom
      / theme change (same recompute triggers as E7's `measureBand`).
- [x] Approving a page advances to the next untouched one; the rail reflects
      `✓ / – / ⚠ / ✗`; a per-segment bulk approve marks the whole run at once.
- [x] A failed page offers Re-run and Insert N bars; approving it is refused
      until it's recovered or filled; a re-run clears a prior approval and
      reopens a touching seam.
- [x] The Seams step is locked until every page is approved; once unlocked it
      cycles the joins with the E4 readout and Mark resolved / Reopen.
- [x] Publish is disabled until every page is approved and every seam resolved;
      publishing sends `{ pages_reviewed: true, seams_resolved: true }` and
      leaves the editor.
- [x] `npm run check` 0 errors, `npm run build` clean, vitest green (103).

**Tasks — Claude:**
- [x] `backendTypes.ts`: `start_measure` / `measure_count` on
      `PagedReport.pages[]`; `pages_reviewed` on the publish request shape.
- [x] Page-range mapping: new pure `$lib/musicxml/reviewPages.ts` (`mapReport` /
      `pageStatus` / `seamPages`, +11 vitest) turns the report into page →
      `{ startMeasure, measureCount }`; `edit/+page.svelte`'s `reviewPages`
      re-derives each page's live 0-based measure range + onset off the current
      model on every `workingXml` change, same pattern as the E4 seam mapping,
      so an insert / splice shifting later pages stays correct.
- [x] `edit/+page.svelte`: the Review panel + a Pages / Seams / Publish stepper
      state machine; the page rail; per-page approve + skip + per-segment bulk
      approve (`localStorage` `divisi:pagesReviewed`, keyed `jobId:page`);
      re-run / insert-bars retargeted from the seam onset to the selected review
      page, clearing its approval and any seam touching it on success; Seams step
      locked until every page is approved-or-skipped, Publish gated on
      all-approved + all-seams-resolved.
- [x] `EditorScoreView.svelte`: new `pageBand` prop — a full-system tint (every
      part, not just E7's one staff) for the focused page's bar range, same
      `GraphicSheet.MeasureList` geometry and recompute triggers as
      `measureBand`.
- [x] `edit/publish/+server.ts`: ack body carries `pages_reviewed: true` (the
      Backend's `VersionPublishRequest` ignores unknown fields by default —
      recording it server-side is an out-of-scope Backend follow-up, no B-number
      yet).
- [x] Relabelled the entry points so their copy names the page-by-page pass:
      `OmrJobAlerts`'s done-job alert, and the `groups/[id]` Tracks-panel
      review link/hint/needs-review copy. Both already deep-linked to the
      editor, so no routing change.
- [x] en + es i18n (step labels, page-rail statuses, approve / skip / bulk
      approve, the publish-gate readout and blocked reason); reused the
      existing `piece_editor_seam_*` keys for the Seams step and the fill/re-run
      controls rather than duplicating them.
- [x] `check` 0 errors / `build` clean / vitest 103 green.

**Tasks — Human:**
- [ ] Full real-browser pass, replacing E4's and E6's pending passes: generate
      from a real multi-page choral scan, step through every page against the
      PDF, approve the clean ones and bulk-approve a segment, recover a failed
      page by re-run and by hand-fill, then resolve the seams and Publish;
      confirm the live track plays the corrected music and re-opening the editor
      starts a clean copy.

**Strict page-by-page rework (2026-09-01, with the human):** the tabbed stepper
+ N-chip page rail + controls row was three stacked rows of chrome over the
score. Replaced with one compact `.review-bar` in the transport bar:
`‹ Prev | Page K of N, <status> | [Approve]/[Skip] | Next ›` plus text links to
move between the pages, seams and publish phases. Prev/Next walk the pages in
order (clamped), the score pane stays a continuous render but locks to the
current page (its band scrolls to the top via a new
`EditorScoreView.scrollPageIntoView()`, and two `.page-dim` veils recede
everything outside it), and while review is active the editor's own toolbars
collapse to the Notes/Measures + Undo/Redo groups with the per-mode edit rows
behind an `[Edit]` disclosure, so the score + PDF panes get the height. The E10
model (`reviewPages.ts`, E9 offsets, `localStorage` state, every
approve/skip/re-run/insert handler, `pageBand` geometry) is unchanged.

## Backlog

- Real job queue (Celery/RQ) if background-task OMR processing proves too slow/blocking
- **Mid-piece tempo changes drift the editor playhead.** `parseMusicXmlFile` (drives the editor's audio) bakes each `<sound tempo>` into note `startMs` but returns a single `tempoBPM`, and the editor converts the transport position to a musical onset with that one factor (`msPerWholeNote`). On a piece with tempo changes the playhead cursor gradually leads/lags the sound. The 2026-09-01 e2e test tolerates up to one whole note and does not assert this. Fix is either a piecewise ms→onset map from the parser or a tempo-map the editor can walk.

## Log

- 2026-09-01: **Split the OMR + notation-editor work into this plan.** Moved B8 (OMR pipeline), B16 (paged OMR), B17 (working-draft slot + per-page progress and re-run), and B18 (per-page measure offsets) out of `Backend/plan.md`, and F14 (in-app notation editor), F15 (segmented-OMR review), F16 (working-draft slot, frontend), F17 (editor "Measures" mode), F18 (editor undo/redo), and F19 (page-by-page draft review) out of `Frontend/plan.md`, into this one file. Renumbered E1..E10 in build and dependency order (B8→E1, F14→E2, B16→E3, F15→E4, B17→E5, F16→E6, F17→E7, F18→E8, B18→E9, F19→E10); cross-references between the moved sections were rewritten to the E numbers. The section bodies are otherwise verbatim. The OMR/editor-only Backlog items came along (real job queue for OMR; editor playhead tempo drift); the historical Log entries stayed in the two source plans, so the 2026-08-31 production-outage entry that E3 and E5 cite (a feature-branch migration must never run against prod) still lives in `Backend/plan.md`. This is merge-prep for landing `feat/generate-track-from-pdf` on `main`: pulling OMR's B16/B17/B18 out also clears the numbering collision with `main`'s own committed B16 ("Piece rehearsal notes").
