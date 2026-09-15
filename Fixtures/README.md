# Fixtures

Shared test/demo assets for both apps. `Backend/fixtures/` is a near-copy of
this directory baked into the backend Docker image so `resolve_source_path` can
serve bundled pieces without a persistent disk (see `Backend/plan.md` B11); it
additionally carries `SFCC/` (see below), while this copy carries the
`soundfont/` used by `play.sh`.

## Synthetic MIDI (for the parsers)

`generate.py` (`pip install mido`) writes two small SATB fixtures —
`requiem-satb-plain.mid`, `requiem-satb-accompanied.mid` — approximating the opening of Mozart's Requiem,
K.626 Introitus (D minor, Adagio, 8 bars, tracks named
`Soprano`/`Alto`/`Tenor`/`Bass`; the accompanied one adds an `Organ` pad track
to check non-vocal tracks aren't misread as a voice part).

**Accuracy note:** a harmonically plausible chorale reduction reconstructed from
memory — correct key/tempo/text underlay and i–iv–V–i / VI–iv–V7–i shape — not a
verified transcription. Enough to exercise note/track/lyric handling; not
performance material.

These exercise the iOS `MIDIParser`, the Frontend's `src/lib/midi/parser.ts`,
and the Backend's `app/rendering/` port. `play.sh` auditions them via
`fluidsynth` + the `soundfont/` GM soundfont.

## Bundled demo pieces

Real score exports used as demo/bundled repertoire:

- `The_Challenge_of_Thor_Elgar.*` (mid / musicxml / pdf) — the
  worked example of the no-auth direct-URL path.
- `SFCC/`: only `Coleridge-Taylor_Proserpine_A4.*` and
  `The_Challenge_of_Thor_Elgar.*` remain bundled here; the rest of the
  San Francisco City Chorus repertoire (Der Abend, Les djinns, Eglamore,
  The Fay's Song) moved to being real Backend `Piece` records gated by
  group membership instead (see `Frontend/src/lib/pieces/registry.ts`).
  Coleridge-Taylor stays for its OMR-testing history; Challenge of Thor
  stays as the direct-URL worked example above.

Lacrymosa's demo files (`.pdf`, `.musicxml`) live under
`Frontend/static/fixtures/demo/` instead, not here; the bundled `.mid` and
`.mxl` that used to sit alongside them were unused (the Frontend loads the
MusicXML) and have been removed.
