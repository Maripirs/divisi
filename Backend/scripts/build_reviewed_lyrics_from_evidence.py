"""Build a checked lyric manifest from OCR proposals and visual corrections.

The visual override uses ``|`` between syllables of a word, for example
``moun|tain,``. Reviewed onset changes include or exclude exact absolute
score offsets. This command refuses remaining uncertainty or count drift.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from music21 import converter

from app.lyrics.aligned import select_lyric_onsets
from app.lyrics.inject import _match_parts_to_voices
from apply_reviewed_lyrics import BACKEND, _apply_score_repairs

VOICES = ("soprano", "alto", "tenor", "bass")


def _syllables(line: str) -> list[dict[str, str]]:
    result = []
    for word in line.split():
        parts = word.split("|")
        for index, text in enumerate(parts):
            if not text:
                raise ValueError(f"Empty syllable in {line!r}")
            syllabic = ("single" if len(parts) == 1 else
                        "begin" if index == 0 else
                        "end" if index == len(parts) - 1 else "middle")
            result.append({"text": text, "syllabic": syllabic})
    return result


def build(config_path: Path, reconciled_path: Path, visual_path: Path,
          onsets_path: Path, output: Path) -> dict:
    config = json.loads(config_path.read_text())
    visual = json.loads(visual_path.read_text())
    actions = json.loads(onsets_path.read_text())
    reconciled = json.loads(reconciled_path.read_text())
    source = BACKEND / config["source_musicxml"]
    pdf = BACKEND / config["source_pdf"]
    score = converter.parse(str(source))
    _apply_score_repairs(score, config.get("score_repairs", []))
    parts = _match_parts_to_voices(score)
    used_visual, used_actions = set(), set()
    segments = []
    for system in reconciled["systems"]:
        page, index = system["page"], system["system"]
        start, end = system["measure_start"], system["measure_end"]
        proposals = {entry["voice"]: entry for entry in system["voices"]}
        if set(proposals) != set(VOICES):
            raise ValueError(f"Page {page} system {index} lacks SATB proposals")
        voices = []
        for voice in VOICES:
            key = f"{page}:{index}:{voice}"
            proposal = proposals[voice]
            if key in visual:
                syllables = _syllables(visual[key])
                used_visual.add(key)
            else:
                if proposal.get("uncertainty"):
                    raise ValueError(f"Unreviewed uncertainty at {key}: {proposal['uncertainty']}")
                syllables = proposal["syllables"]
            selected = [round(item.offset, 6) for item in select_lyric_onsets(parts[voice], start, end)]
            entry = {"voice": voice, "syllables": syllables}
            if key in actions:
                action = actions[key]
                include = {float(value) for value in action.get("include", [])}
                exclude = {float(value) for value in action.get("exclude", [])}
                if not exclude <= set(selected):
                    raise ValueError(f"Excluded offset was not selected at {key}: {exclude - set(selected)}")
                available = {round(float(note.getOffsetInHierarchy(parts[voice])), 6)
                             for note in parts[voice].recurse().notes
                             if note.measureNumber is not None and start <= note.measureNumber <= end}
                if not include <= available:
                    raise ValueError(f"Included offset has no note attack at {key}: {include - available}")
                reviewed = sorted((set(selected) - exclude) | include)
                entry["onset_offsets"] = reviewed
                used_actions.add(key)
            else:
                reviewed = selected
            if len(syllables) != len(reviewed):
                raise ValueError(f"Page {page} system {index} {voice}: "
                                 f"{len(syllables)} syllables for {len(reviewed)} onsets")
            voices.append(entry)
        segments.append({"page": page, "system": index, "measure_start": start,
                         "measure_end": end, "voices": voices})
    if used_visual != set(visual) or used_actions != set(actions):
        raise ValueError(f"Unused review keys: {(set(visual) - used_visual) | (set(actions) - used_actions)}")
    manifest = {key: value for key, value in config.items() if key != "source_pdf"}
    manifest["source_musicxml_sha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest["source_pdf_sha256"] = hashlib.sha256(pdf.read_bytes()).hexdigest()
    manifest["segments"] = segments
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("reconciled", type=Path)
    parser.add_argument("visual_overrides", type=Path)
    parser.add_argument("onset_overrides", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = build(args.config, args.reconciled, args.visual_overrides,
                     args.onset_overrides, args.output)
    print(f"Built {len(manifest['segments'])} reviewed systems")
