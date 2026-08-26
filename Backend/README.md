# Divisi Backend

FastAPI service for two things (see `plan.md` for the full milestone breakdown):

1. **OMR** — convert scanned sheet-music PDFs to MIDI/MusicXML via Audiveris/oemer.
2. **Accounts + sync** — individual and group (e.g. choir) accounts, groups distributing
   piece versions to members, private per-user annotations with optional sharing.

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
