"""Compare two OCR reads with score note counts, saving review proposals.

Misaki sees each printed system independently. Its answer is evidence for
visual review, never an automatically approved transcription. The output
is saved after every system so a run can resume safely.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

from music21 import converter

from app.lyrics.aligned import select_lyric_onsets
from app.lyrics.groq_client import _call_misaki, _extract_json
from app.lyrics.inject import _match_parts_to_voices

VOICES = ("soprano", "alto", "tenor", "bass")
PROMPT = """You are comparing two imperfect OCR readings of the same printed choral score system.
The printed lyrics are the authority. Use repeated phrases in this song and neighboring systems to
repair obvious OCR omissions, and keep each voice in its own line. The score's sung-note counts
are a check, but an optical-music-recognition score can itself be wrong. Do not add a filler syllable
merely to meet a count. A dash between syllables is notation, not a sung syllable. A hyphenated word
such as com-in' has two syllables; hal-le-lu-jah has four. A melisma carries one syllable over
multiple notes. Remove dynamics, page text, and music symbols. Return JSON only, with a voices
array containing exactly four entries. Each entry has voice, syllables (objects with text and
syllabic: single/begin/middle/end), and uncertainty (a short string, empty if none). State any
line where the printed text cannot be inferred from the two OCR reads. Do not silently omit words."""


def _systems(path: Path) -> dict[tuple[int, int], dict]:
    data = json.loads(path.read_text())
    if "systems" in data:
        return {(s["page"], s["system"]): s for s in data["systems"]}
    return {(p["page"], s["index"]): s for p in data["pages"] for s in p["systems"]}


def reconcile(
    music: Path, bounds_path: Path, lanes_a: Path, lanes_b: Path,
    proposals_a: Path, proposals_b: Path, output: Path, model: str,
) -> dict:
    os.environ["MISAKI_LYRICS_MODEL"] = model
    inputs = {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (music, bounds_path, lanes_a, lanes_b, proposals_a, proposals_b)
    }
    score = converter.parse(str(music))
    parts = _match_parts_to_voices(score)
    bounds = json.loads(bounds_path.read_text())
    sources = [_systems(p) for p in (lanes_a, lanes_b, proposals_a, proposals_b)]
    result = {"model": model, "input_sha256": inputs, "systems": []}
    if output.exists():
        result = json.loads(output.read_text())
        if result["model"] != model:
            raise ValueError("Saved reconciliation uses another model")
        if result.get("input_sha256") != inputs:
            raise ValueError("Saved reconciliation uses different input files")
    done = {(s["page"], s["system"]) for s in result["systems"]}
    for position, bound in enumerate(bounds):
        key = bound["page"], bound["system"]
        if key in done:
            continue
        if any(key not in source for source in sources):
            raise ValueError(f"Missing OCR or classification evidence for system {key}")
        read_a, read_b, prop_a, prop_b = (source[key] for source in sources)
        target = {voice: len(select_lyric_onsets(parts[voice], bound["measure_start"], bound["measure_end"]))
                  for voice in VOICES}
        def proposed(system: dict, voice: str) -> list[dict]:
            return next((v["syllables"] for v in system.get("voices", []) if v["voice"] == voice), [])
        rows = []
        for voice in VOICES:
            rows.append({
                "voice": voice,
                "score_onsets": target[voice],
                "ocr_2x": read_a.get("voices", {}).get(voice, ""),
                "ocr_3x": read_b.get("voices", {}).get(voice, ""),
                "first_classification": proposed(prop_a, voice),
                "second_classification": proposed(prop_b, voice),
            })
        payload = {
            "measure_start": bound["measure_start"],
            "measure_end": bound["measure_end"],
            "voices": rows,
        }
        for label, neighbor in (("before", bounds[position - 1] if position else None),
                                ("after", bounds[position + 1] if position + 1 < len(bounds) else None)):
            if neighbor is not None:
                neighbor_key = neighbor["page"], neighbor["system"]
                payload[label] = {
                    "measure_start": neighbor["measure_start"],
                    "measure_end": neighbor["measure_end"],
                    "voices": sources[0][neighbor_key]["voices"],
                }
        response = _call_misaki({
            "model": model, "temperature": 0.1,
            "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        })
        if response.status_code != 200:
            raise RuntimeError(f"Misaki returned {response.status_code}: {response.text[:200]}")
        content = (response.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
        parsed = _extract_json(content)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("voices"), list):
            raise ValueError(f"Could not parse system {key} reconciliation")
        for entry in parsed["voices"]:
            if entry.get("voice") not in VOICES or not isinstance(entry.get("syllables"), list):
                raise ValueError(f"Invalid voice in system {key}")
        result["systems"].append({**bound, "score_onsets": target, "voices": parsed["voices"]})
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        time.sleep(2)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("musicxml", type=Path)
    parser.add_argument("bounds", type=Path)
    parser.add_argument("lanes_2x", type=Path)
    parser.add_argument("lanes_3x", type=Path)
    parser.add_argument("proposals_2x", type=Path)
    parser.add_argument("proposals_3x", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    result = reconcile(args.musicxml, args.bounds, args.lanes_2x, args.lanes_3x,
                       args.proposals_2x, args.proposals_3x, args.output, args.model)
    print(f"Reconciled {len(result['systems'])} systems")
