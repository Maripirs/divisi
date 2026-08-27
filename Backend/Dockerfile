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

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
