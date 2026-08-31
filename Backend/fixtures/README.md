# Backend fixtures

Near-copy of the repo-root `Fixtures/` directory, committed here so it is baked
into the backend Docker image — `resolve_source_path` serves any `file_path`
starting with `fixtures/` from here, giving bundled/demo pieces a durable home
despite Render's ephemeral disk (see `../plan.md` B11).

Contents:

- `generate.py` + synthetic SATB MIDI (`requiem-satb-*.mid`) — dev fixtures for
  the parsers; see the root `Fixtures/README.md` for the accuracy caveat.
- `Mozart_Lacrymosa_from_Requiem_SATB_with_piano.*`,
  `The_Challenge_of_Thor_Elgar.*` — public/worked-example demo pieces.
- `SFCC/` — San Francisco City Chorus repertoire, served only to authenticated
  members and valid guests (the Frontend dropped its public copies in F10).

Keep in sync with the root `Fixtures/` when adding bundled pieces.
