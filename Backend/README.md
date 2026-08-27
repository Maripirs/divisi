# Divisi Backend

FastAPI service for two things (see `plan.md` for the full milestone breakdown):

1. **OMR** — convert scanned sheet-music PDFs to MIDI/MusicXML via Audiveris/oemer.
2. **Accounts + sync** — individual and group (e.g. choir) accounts, groups distributing
   piece versions to members, private per-user annotations with optional sharing.
3. **Rendering** — a `PieceVersion`'s MIDI file into per-voice-part audio stems (via
   FluidSynth) plus multi-part MusicXML, cached per version (see `plan.md` B7).
4. **Guest access** — a group's `join_code` resolves (no login) to its distributed
   pieces and their rendered stems/MusicXML, via `/guest/*` (see `plan.md` B6).

Rendering shells out to the `fluidsynth` binary (not just the `mido` Python package) —
install it locally with `brew install fluid-synth` (macOS) or `apt install fluidsynth`
(Debian/Ubuntu); the Docker image installs it automatically.

## Local dev

```bash
cp .env.example .env          # adjust if needed
docker compose up --build     # starts postgres + api on :8000
curl localhost:8000/health    # {"status": "ok"}
```

Without Docker, against a local Postgres:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

## Migrations

```bash
alembic revision --autogenerate -m "message"
alembic upgrade head
```
