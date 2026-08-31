# Fixtures

Shared test/demo assets for both apps. `Backend/fixtures/` is a near-copy of
this directory baked into the backend Docker image so `resolve_source_path` can
serve bundled pieces without a persistent disk (see `Backend/plan.md` B11); it
additionally carries `SFCC/` (see below), while this copy carries the
`soundfont/` used by `play.sh`.

## Synthetic MIDI (for the parsers)

`generate.py` (`pip install mido`) writes three small SATB fixtures —
`requiem-satb-plain.mid`, `requiem-satb-lyrics.mid`,
`requiem-satb-accompanied.mid` — approximating the opening of Mozart's Requiem,
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

- `Mozart_Lacrymosa_from_Requiem_SATB_with_piano.mid` / `.mxl` — kept public
  (not owned by any real group).
- `The_Challenge_of_Thor_Elgar.*` (mid / musicxml / pdf / playscore) — the
  worked example of the no-auth direct-URL path.
- `SFCC/` — San Francisco City Chorus repertoire (Brahms, Coleridge-Taylor,
  Fauré, Gardiner, Massenet, …). Access-gated: the Frontend removed these from
  its public `static/` dir in F10; the backend keeps this copy to serve them
  only to members/valid guests.
