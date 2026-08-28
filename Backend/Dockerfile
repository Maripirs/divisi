FROM python:3.11-slim

# fluidsynth: shells out from app/rendering/synth.py to render MIDI stems
# (B7) — not a Python dependency, needs the actual binary on PATH.
RUN apt-get update && apt-get install -y --no-install-recommends fluidsynth \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./

RUN pip install --no-cache-dir .

# Read-only, version-controlled piece source files (see B11's plan.md log
# and app/core/config.py's `fixtures_dir` doc comment) — a copy of the
# repo-root Fixtures/ committed under Backend/fixtures/ specifically so
# this stays reachable from the build context as actually configured on
# Render (rootDir=Backend — moving the context to the repo root turned
# out to need a dashboard change the render.yaml Blueprint doesn't
# control here, so this avoids that entirely).
COPY fixtures ./fixtures

EXPOSE 8000

# Run pending migrations before serving — keeps deploy platforms that don't
# support a separate pre-deploy-command step (e.g. Render's free tier)
# working with a single container command. $PORT is honored when the host
# assigns one dynamically (Render); falls back to 8000 for local/compose use.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
