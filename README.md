# Divisi

Practice tooling for choirs: play a SATB score as synchronized audio + engraved
notation, follow your own voice part, mark up the sheet music, and share
practice tracks with a group via a join link (no login needed to listen).

**This is a web project.** A native iOS app was the original form of Divisi,
paused/backlogged as of 2026-08-27 and removed from this tree on 2026-09-14
(its Swift code was the reference the web ports were derived from); see the
`pre-cleanup-audit-20260914` tag if the source itself is ever needed again.

## Structure

- `Frontend/` — **SvelteKit web app** (the product). Client-side MIDI parsing +
  in-browser synthesis, OpenSheetMusicDisplay notation with a playback-synced
  cursor, PDF markup, groups/homework/responsibilities, guest join links.
  Deployed to Cloudflare Workers at **https://divisi.maripi.net**. See
  `Frontend/README.md`.
- `Backend/` — **FastAPI service**: accounts, groups, piece versioning +
  distribution, annotations, homework, responsibilities, guest access, and a
  MIDI→audio/MusicXML rendering pipeline. Deployed on Render at
  **https://divisi.onrender.com**. An OMR (scanned-PDF → MusicXML) pipeline is
  scaffolded but backlogged. See `Backend/README.md`.
- `Fixtures/` — synthetic SATB MIDI test fixtures shared by the Frontend and
  Backend (`generate.py`, mido). `Backend/fixtures/` is a committed copy baked
  into the backend image.

## Working in this repo

Each app has its own README with setup/run instructions. Current state and
open work are tracked in the root `PLAN.md`.
