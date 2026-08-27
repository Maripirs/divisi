FROM python:3.11-slim

# fluidsynth: shells out from app/rendering/synth.py to render MIDI stems
# (B7) — not a Python dependency, needs the actual binary on PATH.
RUN apt-get update && apt-get install -y --no-install-recommends fluidsynth \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY Backend/pyproject.toml ./
COPY Backend/app ./app
COPY Backend/alembic.ini ./

RUN pip install --no-cache-dir .

# Read-only, version-controlled piece source files (see B11's plan.md log
# and app/core/config.py's `fixtures_dir` doc comment) — copied from the
# repo root, one level up from Backend/, which is why the build context
# had to move to the repo root (render.yaml's `dockerContext`).
COPY Fixtures ./fixtures

EXPOSE 8000

# Run pending migrations before serving — keeps deploy platforms that don't
# support a separate pre-deploy-command step (e.g. Render's free tier)
# working with a single container command. $PORT is honored when the host
# assigns one dynamically (Render); falls back to 8000 for local/compose use.
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
