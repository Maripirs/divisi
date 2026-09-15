#!/usr/bin/env bash
# Simple MIDI player for the Divisi test fixtures (or any .mid file).
# Usage: ./play.sh requiem-satb-plain.mid
#        ./play.sh                          # plays both fixtures in turn
set -euo pipefail
cd "$(dirname "$0")"

SOUNDFONT="soundfont/TimGM6mb.sf2"

if ! command -v fluidsynth >/dev/null; then
  echo "fluidsynth not found — install it with: brew install fluid-synth" >&2
  exit 1
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=(requiem-satb-plain.mid requiem-satb-accompanied.mid)
fi

for f in "${FILES[@]}"; do
  echo "▶ playing $f"
  fluidsynth -a coreaudio -i "$SOUNDFONT" "$f"
done
