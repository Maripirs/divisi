# Divisi

Practice tooling for choirs: play a SATB score as synchronized audio + engraved
notation, follow your own voice part, mark up the sheet music, and share
practice tracks with a group via a join link (no login needed to listen).

**This is primarily a web project.** A native iOS app was the original form of
Divisi; it is paused/backlogged as of 2026-08-27. The pure-algorithm parts of
its Swift code (`DivisiKit/`) live on as the reference the web ports were
derived from — see `Frontend/plan.md`'s "iOS app" section for that history.

## Structure

- `Frontend/` — **SvelteKit web app** (the product). Client-side MIDI parsing +
  in-browser synthesis, OpenSheetMusicDisplay notation with a playback-synced
  cursor, PDF markup, groups/homework/responsibilities, guest join links.
  Deployed to Cloudflare Workers at **https://divisi.maripi.net**. See
  `Frontend/README.md` and `Frontend/plan.md`.
- `Backend/` — **FastAPI service**: accounts, groups, piece versioning +
  distribution, annotations, homework, responsibilities, guest access, and a
  MIDI→audio/MusicXML rendering pipeline. Deployed on Render at
  **https://divisi.onrender.com**. An OMR (scanned-PDF → MusicXML) pipeline is
  scaffolded but backlogged. See `Backend/README.md` and `Backend/plan.md`.
- `Fixtures/` — synthetic SATB MIDI test fixtures shared by both apps
  (`generate.py`, mido). `Backend/fixtures/` is a committed copy baked into the
  backend image.
- `DivisiKit/`, `App/`, `Divisi.xcodeproj`, `project.yml` — the paused iOS app.

## Working in this repo

Each app has its own README with setup/run instructions and its own `plan.md`
tracking milestones and backlog.
